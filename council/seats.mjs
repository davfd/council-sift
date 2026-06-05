/**
 * seats.mjs — Council-SIFT forensic verifier seats (shared by the live loop and the ablation).
 *
 * Five deterministic refutation seats plus Synthesis (OpenClaw/LLM agent narration layers on top via run_agentic.mjs):
 *   Citation       — every evidence token a claim CITES must appear in the tool output.
 *   Tool-semantics — the tool output is not over-read (psscan!=C2, shimcache!=execution, netscan!=exfil).
 *   Contradiction  — a disproving artifact (e.g. $SI vs $FN timestomp) is surfaced.
 *   Inference      — the interpretation does not over-reach (attribution/intent/causation/certainty).
 *   Scope          — one artifact is not stretched into environment-wide/all-host impact.
 *   Synthesis      — aggregate seat verdicts → disposition.
 *
 * Soundness notes (hardened with the regression probe, eval/adversarial_evasions.mjs):
 *   - Citation uses TOKEN-BOUNDARY matching, not raw substring: a fabricated token that only appears
 *     embedded inside a larger real token (PID "459" inside "14592"; "host.exe" inside "svchost.exe")
 *     is correctly reported ABSENT.
 *   - Tool-semantics / Inference vocabularies are broadened beyond the obvious trigger words, and the
 *     tool-semantics exemption is clause-local and negation/disclaimer-only: a soft epistemic hedge like
 *     "appears to have exfiltrated" does not excuse an affirmative over-read.
 */

// Characters that form one contiguous identifier / path-segment / IP / hash / PID token.
// Deliberately EXCLUDES separators ('/', '\\', ':', '-', whitespace) so a cited token that legitimately
// abuts a separator still resolves — a basename after a path sep ("…/svchost.exe"), or a TSK inode in
// the "<inode>-<type>-<id>" fls format ("2524-128-1") — while an embedded fragment does not.
const IDENT_CHARS = 'A-Za-z0-9._';
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Token-boundary presence test: the token must appear NOT flanked by identifier characters, so it is a
// standalone token rather than a coincidental substring of a larger one.
function tokenPresent(haystack, norm) {
  if (!norm) return false;
  try {
    const re = new RegExp(`(?<![${IDENT_CHARS}])${escapeRe(norm)}(?![${IDENT_CHARS}])`);
    return re.test(haystack);
  } catch {
    // Fail closed to a stricter check if the token can't form a valid regex.
    return false;
  }
}

// Regex auto-extraction of checkable evidence tokens.
// - Observation extraction is a fallback only when the analyst omits cited_tokens.
// - Locator strings identify where evidence came from; they are not automatically required to appear in
//   tool output, because case paths and host/IP labels often live outside the forensic output itself.
function evidenceTokens(text) {
  const tokens = new Set();
  const evidenceText = String(text || '');
  for (const m of evidenceText.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)) tokens.add(m[0]);          // IPv4
  for (const m of evidenceText.matchAll(/\b[a-fA-F0-9]{32,64}\b/g)) tokens.add(m[0].toLowerCase());  // md5/sha
  for (const m of evidenceText.matchAll(/PID[=\s:]*(\d+)/gi)) tokens.add(m[1]);                       // PIDs
  for (const m of evidenceText.matchAll(/[A-Za-z]:\\[^\s",;]+/g)) tokens.add(m[0].toLowerCase());     // Windows paths
  return tokens;
}

function claimPids(text) {
  const pids = new Set();
  for (const m of String(text || '').matchAll(/\bPID[=\s:]*(\d+)\b/gi)) pids.add(m[1]);
  return [...pids];
}

function claimProcessNames(text) {
  const names = new Set();
  for (const m of String(text || '').matchAll(/\b[A-Za-z0-9_.-]+\.exe\b/gi)) names.add(m[0].toLowerCase());
  return [...names];
}

function claimPidProcessPairs(text) {
  const pairs = [];
  const s = String(text || '');
  // Intentionally pair ownership phrases, not arbitrary relationship prose.
  // Catch direct claims like "Rar.exe PID 2524", "Rar.exe has PID 2524", "PID 2524 maps to Rar.exe".
  // Do NOT cross a broader sentence like "cmd.exe PID 137496 ... PPID 139776 maps to explorer.exe";
  // that expresses parentage/relationship, not that explorer.exe owns PID 137496.
  const nameThenPid = /\b([A-Za-z0-9_.-]+\.exe)\b(?:'s)?(?:\s+process)?\s*(?:[,()]\s*)?(?:(?:has|owns|is|maps\s+to|corresponds\s+to|with|assigned\s+to)\s+(?:the\s+)?)?\b(?:PID|process\s+ID)(?:\s+is)?[=\s:]*(\d+)\b/gi;
  const pidThenName = /\b(?:PID|process\s+ID)(?:\s+is)?[=\s:]*(\d+)\b\s*(?:[,()]\s*|(?:belongs\s+to|maps\s+to|corresponds\s+to|is\s+assigned\s+to|assigned\s+to|is|owned\s+by|for|of|associated\s+with)\s+(?:the\s+)?)\b([A-Za-z0-9_.-]+\.exe)\b/gi;
  for (const m of s.matchAll(nameThenPid)) pairs.push({ name: m[1].toLowerCase(), pid: m[2] });
  for (const m of s.matchAll(pidThenName)) pairs.push({ name: m[2].toLowerCase(), pid: m[1] });
  const seen = new Set();
  return pairs.filter((p) => {
    const k = `${p.pid}\u0000${p.name}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function linesWithToken(output, token) {
  const norm = String(token || '').toLowerCase();
  return String(output || '').split(/\r?\n/).filter((line) => tokenPresent(line.toLowerCase(), norm));
}

function pidProcessMismatch(finding, cited) {
  const tool = `${finding.evidence_tool || finding.tool || ''}`;
  if (!/psscan|pslist|cmdline/i.test(tool)) return null;
  const claimText = `${finding.observation || ''}; ${finding.interpretation || ''}`;
  const pairs = claimPidProcessPairs(claimText);
  if (!pairs.length) return null;
  for (const { pid, name } of pairs) {
    const rows = linesWithToken(finding.output || '', pid);
    if (!rows.length) continue; // citation seat handles absent PIDs
    const sameRow = rows.some((row) => tokenPresent(row.toLowerCase(), name));
    const nameAppearsSomewhere = tokenPresent(String(finding.output || '').toLowerCase(), name);
    if (nameAppearsSomewhere && !sameRow) {
      const rowNames = [...new Set(rows.flatMap((row) => claimProcessNames(row)))].join(', ') || '(no process name parsed)';
      return { pid, claimed: name, actual: rowNames };
    }
  }
  return null;
}

function interpretationClaimTokens(interpretation = '') {
  const tokens = new Set();
  const text = String(interpretation || '');
  const addIfAffirmative = (m) => {
    const token = m[0];
    // Do not split on periods here: IPv4 addresses contain periods. Use a local window so
    // "No connection to 185... is established" is exempt, while "sent data to 185..." is checked.
    const start = Math.max(0, m.index - 90);
    const end = Math.min(text.length, m.index + token.length + 90);
    const local = text.slice(start, end);
    if (!NEGATION_HEDGE.test(local)) tokens.add(token.toLowerCase());
  };
  for (const m of text.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)) addIfAffirmative(m);              // claimed IPs
  for (const m of text.matchAll(/\b[a-fA-F0-9]{32,64}\b/g)) addIfAffirmative(m);                    // claimed hashes
  return tokens;
}

export function citedTokens(observation, locator, interpretation = '', includeEvidenceFallback = true) {
  const tokens = new Set();
  void locator; // locators are provenance pointers, not evidence text to be proven inside tool output
  if (includeEvidenceFallback) {
    for (const tok of evidenceTokens(observation || '')) tokens.add(tok);
  }
  for (const tok of interpretationClaimTokens(interpretation)) tokens.add(tok);
  return [...tokens];
}

// Citation seat — deterministic: does every cited token appear in the tool output AS A TOKEN?
export function citationSeat(finding) {
  const out = (finding.output || '').toLowerCase().replace(/\\\\/g, '\\');
  const rawExplicit = Array.isArray(finding.cited_tokens) ? finding.cited_tokens : [];
  const explicit = rawExplicit
    .filter((tok) => tok !== null && tok !== undefined && String(tok).trim())
    .map((tok) => String(tok));
  const auto = citedTokens(
    finding.observation,
    finding.evidence_locator || '',
    finding.interpretation || '',
    explicit.length === 0,
  );
  const cited = [...new Set([...explicit, ...auto])];
  if (cited.length === 0) {
    return { seat: 'seat:citation', lens: 'does every cited token resolve in the evidence?', verdict: 'UNSUPPORTED',
      reasoning: 'No verifiable evidence tokens supplied or auto-extracted; analyst must cite at least one concrete evidence token before the Council can verify the claim.', evidence_checked: [] };
  }
  const checked = cited.map((tok) => {
    const norm = String(tok).toLowerCase().replace(/\\\\/g, '\\');
    return { token: tok, present: tokenPresent(out, norm) };
  });
  const missing = checked.filter((c) => !c.present).map((c) => c.token);
  const mismatch = missing.length === 0 ? pidProcessMismatch(finding, cited) : null;
  const verdict = missing.length === 0 && !mismatch ? 'SUPPORTED' : 'UNSUPPORTED';
  const reasoning = missing.length > 0
    ? `Cited token(s) NOT present in the tool output as a standalone token (hallucinated/unsupported): ${missing.join(', ')}.`
    : mismatch
      ? `PID/process-name mismatch: PID ${mismatch.pid} is on output row for ${mismatch.actual}, but the claim names ${mismatch.claimed}.`
      : `All ${checked.length} cited evidence token(s) resolve in the tool output.`;
  return { seat: 'seat:citation', lens: 'does every cited token resolve in the evidence?', verdict, reasoning, evidence_checked: checked };
}

// Synthesis seat — aggregate verdicts → disposition.
export function synthesisSeat(seatVerdicts) {
  const refuting = seatVerdicts.filter((v) => ['UNSUPPORTED', 'CONTRADICTED', 'MISREAD_TOOL'].includes(v.verdict));
  const disposition = refuting.length === 0 ? 'COUNCIL_VERIFIED' : 'BOUNCE_FOR_CORRECTION';
  const reasoning = refuting.length === 0
    ? 'All seats SUPPORTED; finding earns a Council Receipt.'
    : `${refuting.length} seat(s) refuted (${refuting.map((r) => r.seat.replace('seat:', '')).join(', ')}); bounce to analyst for self-correction.`;
  return { seat: 'seat:synthesis', lens: 'adjudicate seat verdicts', verdict: disposition, reasoning };
}

// Split an interpretation into clauses so a hedge is judged LOCAL to the over-read it excuses.
function splitClauses(text) {
  return String(text)
    .split(/;|\.(?:\s+|$)|\bhowever\b|\b(?:al)?though\b|\bbut\b|\byet\b|—|--|,\s*(?:though|while|whereas)\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
}
// Tool-semantics seat — catches over-reading a tool: right tokens, wrong conclusion *for that tool*.
const TOOL_SEMANTIC_RULES = [
  { tool: /shimcache|appcompat/i,
    bad: /\bexecut|\bran\b|\bwas run\b|\bwere run\b|\bis run\b|\blaunch|\bstarted\b|\binvoked\b/i,
    why: 'Shimcache/AppCompatCache records presence + path, not execution (Win8+ entries are unordered and do not prove the program ran); corroborate with Prefetch/EVTX.' },
  { tool: /psscan|pslist/i,
    bad: /\bc2\b|c&c|command.?and.?control|network connection|\bbeacon|exfiltrat|phoned?\s*home|call(?:ed|s)?\s*(?:home|back)|callback|reach(?:ed|es|ing)?\s*out|connect(?:ed|s|ion)?\s*to|communicat(?:e|ed|ing)\s+with|contact(?:ed|ing)?|reporting\s+to|staged.+(?:drop|server|location|point)|siphon|smuggl|\btransmit/i,
    why: 'A process listing (psscan/pslist) cannot establish network activity; netscan/netstat is required to claim C2, beaconing, callback, communication with a remote peer, or exfiltration.' },
  { tool: /netscan|netstat/i,
    bad: /\bc2\b|c&c|command.?and.?control|\bexfiltrat|\bbeacon|phoned?\s*home|call(?:ed|s)?\s*(?:home|back)|callback|siphon|smuggl|\bstole\b|\bstolen\b|data\s*(?:theft|exfil)|sent\s*(?:out|off)|leaked?\s*(?:data|out)|\btransmit|(?:files?|data|archive|payload|documents?)\s+(?:were\s+|was\s+)?(?:transferred|sent|forwarded|moved|uploaded|dispatched)\b|\b(?:transferred|sent|forwarded|moved|uploaded|dispatched)\s+(?:files?|data|archive|payload|documents?)\b/i,
    why: 'netscan shows that a socket/connection exists, not that files or data were transferred/exfiltrated/stolen or that the peer is C2; internal/loopback (RFC1918/127.x) addresses cannot be an external C2.' },
  { tool: /amcache/i, bad: /\bexecut|\bran\b|\bwas run\b/i,
    why: 'Amcache indicates presence/first-seen, not confirmed execution; corroborate with Prefetch/EVTX.' },
];
export function toolSemanticsSeat(finding) {
  const hay = `${finding.observation || ''} ${finding.evidence_tool || finding.tool || ''} ${finding.evidence_locator || finding.locator || ''}`;
  const interp = finding.interpretation || '';
  const clauses = splitClauses(interp);
  for (const r of TOOL_SEMANTIC_RULES) {
    if (!r.tool.test(hay)) continue;
    // Flag only an AFFIRMATIVE over-read: a clause that asserts the bad reading WITHOUT a local negation/disclaimer.
    const offending = clauses.find((c) => r.bad.test(c) && !NEGATION_HEDGE.test(c));
    if (offending) {
      return { seat: 'seat:tool-semantics', lens: 'is the tool output read correctly?', verdict: 'MISREAD_TOOL',
        reasoning: `${r.why} Offending clause: "${offending.slice(0, 140)}".` };
    }
  }
  return { seat: 'seat:tool-semantics', lens: 'is the tool output read correctly?', verdict: 'SUPPORTED', reasoning: 'No known tool-output misread detected.' };
}

// Contradiction seat — is there a disproving artifact? (MVP: timestomp — $SI vs $FN disagreement)
function privateIpv4(ip) {
  const parts = String(ip || '').split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}

function ipv4s(text) {
  return [...new Set([...String(text || '').matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)].map((m) => m[0]))];
}

function externalIpContradiction(finding) {
  const cited = Array.isArray(finding.cited_tokens) ? finding.cited_tokens.join(' ') : '';
  const ips = ipv4s(`${finding.output || ''} ${finding.observation || ''} ${finding.interpretation || ''} ${cited}`).filter(privateIpv4);
  if (!ips.length) return null;
  for (const clause of splitClauses(finding.interpretation || '')) {
    for (const ip of ips) {
      if (!clause.includes(ip)) continue;
      if (!/\b(?:external|public|internet|outside|remote\s+internet)\b/i.test(clause)) continue;
      if (/\b(?:internal|private|rfc1918|loopback)\b/i.test(clause)) continue;
      if (/\b(?:not|cannot|can't|could not|couldn't|isn't|is not|are not|aren't)\b.{0,50}\b(?:external|public|internet|outside)\b/i.test(clause)) continue;
      return { ip, clause };
    }
  }
  return null;
}

export function contradictionSeat(finding) {
  const out = finding.output || '';
  const si = out.match(/\$SI[^\n]*?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)/i);
  const fn = out.match(/\$FN[^\n]*?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)/i);
  const claimsCreation = /\b(created|creation|first[ -]?seen|installed|dropped on)\b/i.test(finding.interpretation || '');
  if (si && fn && si[1] !== fn[1] && claimsCreation) {
    return { seat: 'seat:contradiction', lens: 'is there an artifact that disproves this?', verdict: 'CONTRADICTED',
      reasoning: `Timestomp: $SI time (${si[1]}) contradicts $FN time (${fn[1]}); the claim treats the forgeable $SI creation time as authoritative.` };
  }
  const ipContradiction = externalIpContradiction(finding);
  if (ipContradiction) {
    return { seat: 'seat:contradiction', lens: 'is there an artifact that disproves this?', verdict: 'CONTRADICTED',
      reasoning: `RFC1918/private IP contradiction: ${ipContradiction.ip} is not an external/public internet address, but the claim says "${ipContradiction.clause.slice(0, 140)}".` };
  }
  return { seat: 'seat:contradiction', lens: 'is there an artifact that disproves this?', verdict: 'SUPPORTED', reasoning: 'No contradicting artifact found in the evidence.' };
}

// Inference seat — does the interpretation over-reach what a single artifact can support?
// Catches attribution / intent / causation / unjustified-certainty leaps (right evidence, wrong leap).
const INFERENCE_OVERREACH = [
  { kind: 'ATTRIBUTION',
    re: /\bAPT[-\s]?\d+\b|\bFIN[-\s]?\d+\b|\bUNC[-\s]?\d+\b|\bthe attacker\b|\bthreat actor\b|\badversary\b|\bnation.?state\b|\bstate.?sponsored\b|\bhallmarks?\b|\btradecraft\b|\bsignature of\b|\battribut\w*\b|\bsophisticated (?:actor|group|adversary|threat)\b|\b(?:lazarus|sandworm|fancy bear|cozy bear|wizard spider|carbanak|equation group)\b/i,
    why: 'attribution to a specific actor cannot be established from one artifact — corroborate with intel + multiple artifacts.' },
  { kind: 'INTENT',
    re: /\bdeliberately\b|\bintentionally\b|\bin order to\b|\bto evade\b|\bto exfiltrate\b|\bwith the intent\b|\bfor the purpose of\b|\bso as to\b|\baim(?:ed|s)? to\b|\bmeant to\b|\bdesigned to\b|\bintended to\b|\bwith the goal\b|\bin an attempt to\b|\bto (?:steal|hide|conceal|cover|persist|escalate|maintain access)\b/i,
    why: 'intent is not provable from a forensic artifact alone (what happened ≠ why).' },
  { kind: 'CAUSATION',
    re: /\bcaused\b|\bresulted in\b|\bled to\b|\bbecause of this\b|\btriggered\b|\bgave (?:the )?attacker\b|\benabled the\b|\bas a result\b|\bbrought about\b|\bin response to\b|\bdue to\b|\bcaused by\b|\bentry vector\b|\binitial access\b|\bpivot(?:ing|ed)? laterally\b|\bcreated\b.{0,80}\b(?:same\s+user-profile\s+provisioning\s+event|single operation|initial account setup)\b|\bsingle operation\b.{0,80}\bprovisioning event\b/i,
    why: 'causation asserted from correlation — the artifact shows state, not cause.' },
  { kind: 'CERTAINTY',
    re: /\bproves?\b|\bdefinitively\b|\bconfirms? that\b|\bestablishes? that\b|\bbeyond (?:any )?doubt\b|\bwithout doubt\b|\bunambiguously\b|\bconclusively\b|\birrefutabl\w*\b|\bclearly (?:shows?|indicates?|demonstrates?|proves?)\b|\bguarantee/i,
    why: 'unjustified certainty — a single artifact rarely proves a conclusion outright.' },
];
// Inference uses a STRICTER, negation-only hedge than tool-semantics: an explicit disclaimer
// ("attribution is NOT established", "does not prove", "cannot conclude") exempts the clause, but a
// soft epistemic softener ("consistent with APT29", "may be a nation-state") does NOT — naming an
// actor/intent even tentatively from one artifact is still an over-reach.
const NEGATION_HEDGE = /\b(?:is|are|was|were|be|been|being)\s+not\s+(?:established|proven|confirmed|supported|shown|observed|seen|present|available|enough)\b|\b(?:does|do|did)\s+not\s+(?:prove|establish|confirm|support|show|demonstrate)\b|\b(?:cannot|can't|could not|couldn't)\s+(?:conclude|establish|prove|confirm|support|show|call|determine|say|infer|be)\b|\bunable to\s+(?:conclude|establish|prove|confirm|support|show|determine|infer|say)\b|\bnot\s+(?:established|proven|confirmed|supported|shown|observed|seen|present|available|enough)\b|\bno\s+(?:connection|exfiltration|c2|network activity|network traffic|data transfer)\s+(?:was|is|has been|can be|could be|to\b|with)\b|\b(?:is|are|was|were|remains?)\s+(?:unconfirmed|unproven|insufficient)\b|\b(?:cannot|can't|could not|couldn't|not yet|have not|has not)\s+(?:determine|determining|determined)\s+whether\b|\b(?:needed?|required?|necessary|not\s+possible|impossible|unclear|uncertain|difficult|hard|unable)\s+to\s+determine\s+whether\b|\b(?:needed?|required?|necessary)\b.{0,80}\bbefore\s+inferr?ing\s+whether\b|\bwarrants?\b.{0,80}\b(?:correlation|analysis|investigation|review|triage)\b.{0,80}\bto\s+determine\s+whether\b/i;
export function inferenceSeat(finding) {
  const interp = (finding.interpretation || '').trim();
  if (!interp) return { seat: 'seat:inference', lens: 'does the observation support the interpretation?', verdict: 'SUPPORTED', reasoning: 'No interpretation to evaluate.' };
  const clauses = splitClauses(interp);
  for (const r of INFERENCE_OVERREACH) {
    const offending = clauses.find((c) => r.re.test(c) && !NEGATION_HEDGE.test(c));
    if (offending) {
      return { seat: 'seat:inference', lens: 'does the observation support the interpretation?', verdict: 'UNSUPPORTED',
        reasoning: `Inference overreach (${r.kind}): ${r.why} Offending clause: "${offending.slice(0, 140)}".` };
    }
  }
  return { seat: 'seat:inference', lens: 'does the observation support the interpretation?', verdict: 'SUPPORTED', reasoning: 'Interpretation stays within what the cited artifact supports.' };
}

const SCOPE_OVERREACH = /\b(?:all|every)\s+(?:hosts?|systems?|machines?|workstations?|servers?|endpoints?|assets?)\b|\benvironment[- ]wide\b|\borganization[- ]wide\b|\benterprise[- ]wide\b|\bacross\s+(?:the\s+)?(?:organization|enterprise|environment|domain|network)\b|\bentire\s+(?:network|environment|domain|organization|enterprise)\b/i;
const SCOPE_NEGATION = /\b(?:no|not|without|cannot|can't|could not|couldn't)\b.{0,80}\b(?:scope|all\s+hosts?|environment[- ]wide|organization[- ]wide|enterprise[- ]wide|entire\s+(?:network|environment|domain|organization|enterprise))\b.{0,80}\b(?:established|shown|supported|claimed|available|present|proven|confirmed)?\b/i;

export function scopeSeat(finding) {
  const interp = (finding.interpretation || '').trim();
  if (!interp) return { seat: 'seat:scope', lens: 'does the artifact support the claimed scope?', verdict: 'SUPPORTED', reasoning: 'No interpretation to evaluate for scope.' };
  const clauses = splitClauses(interp);
  const offending = clauses.find((c) => SCOPE_OVERREACH.test(c) && !NEGATION_HEDGE.test(c) && !SCOPE_NEGATION.test(c));
  if (offending) {
    return { seat: 'seat:scope', lens: 'does the artifact support the claimed scope?', verdict: 'UNSUPPORTED',
      reasoning: `Scope overreach: one cited artifact/tool output cannot establish environment-wide/all-host/organization-wide impact. Offending clause: "${offending.slice(0, 140)}".` };
  }
  return { seat: 'seat:scope', lens: 'does the artifact support the claimed scope?', verdict: 'SUPPORTED', reasoning: 'No environment-wide/all-host scope overreach detected.' };
}

// Run the full seat panel + synthesis. `caught` = any seat refuted (bounce for self-correction).
export function runSeats(finding) {
  const seats = [citationSeat(finding), toolSemanticsSeat(finding), contradictionSeat(finding), inferenceSeat(finding), scopeSeat(finding)];
  const synth = synthesisSeat(seats);
  return { seats, synth, caught: synth.verdict === 'BOUNCE_FOR_CORRECTION' };
}
