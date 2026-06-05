/**
 * llm_skeptic.mjs — Option B: the ADDITIVE LLM skeptic panel.
 *
 * The deterministic seats (seats.mjs) are the reproducible precision floor: they are measured at FP=0
 * on the injected-class regression supported set, with blind-red-team precision reported separately.
 * Their recall is bounded by enumerable vocabulary (see eval/adversarial_evasions.mjs). This panel lifts
 * recall on phrasings no regex will ever enumerate — while remaining additive-only:
 *
 *   1. ADDITIVE-ONLY. The panel runs ONLY on findings the deterministic floor already PASSED. It can
 *      turn a pass into a bounce; it can NEVER turn a deterministic refute into a pass (it is never
 *      consulted on a refuted finding). The LLM cannot rescue a hallucination the floor caught.
 *   2. MAJORITY-GATED. A bounce requires >= ceil(n/2) [floor(n/2)+1] independent skeptics, each on a
 *      DISTINCT lens, to refute. One trigger-happy LLM cannot reject a real finding by itself; panel
 *      FP/recall is measured separately from the deterministic floor.
 *   3. ABSTAIN WITHOUT AUTH. With no Claude Agent SDK / auth, the panel ABSTAINS (ran=false): the
 *      deterministic floor stands unchanged, so the reproducible baseline is identical.
 *
 * `query` is injectable so the gate logic is testable deterministically (eval/skeptic_panel_test.mjs)
 * without a live model.
 */
import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

export async function loadSdkQuery() {
  try {
    const req = createRequire(resolve(__dir, '../claw-memory-core/package.json'));
    const sdkPath = req.resolve('@anthropic-ai/claude-agent-sdk');
    const mod = await import(sdkPath);
    return mod.query || (mod.default && mod.default.query) || null;
  } catch { return null; }
}

// Three independent, DISTINCT lenses — diversity catches failure modes redundancy can't.
export const SKEPTIC_LENSES = [
  { name: 'tool-semantics', focus: 'Does the interpretation claim something THIS tool cannot show? A process listing is not network activity; a socket/connection is not exfiltration or C2; file presence is not execution; an internal/RFC1918/loopback peer is not an external C2.' },
  { name: 'inference', focus: 'Does the interpretation leap to ATTRIBUTION (naming or characterising an actor), INTENT (why it was done), CAUSATION, or unjustified CERTAINTY that a single artifact cannot support — even when phrased softly ("consistent with", "bears the hallmarks of", "the kind of thing X does")?' },
  { name: 'support', focus: 'Do the cited tokens actually support THIS specific, full claim — or is the claim materially broader or stronger than the artifact shows (scope creep beyond what was observed)?' },
];

const SYSTEM = `You are an adversarial verifier seat on a DFIR (digital forensics & incident response) Council. A forensic analyst drafted a finding from REAL tool output. The mechanical checks have already PASSED — your job is to catch a SUBTLE over-reach they missed, strictly on your assigned lens.

Discipline (this protects against wrongly rejecting real findings):
- Refute ONLY if you can name a concrete, specific over-reach and quote the offending phrase.
- A finding that is appropriately hedged, or that stays within what the artifact shows, is SUPPORTED.
- When uncertain, return refute=false. A finding is innocent until a specific over-reach is shown.
- Do NOT refute merely because more corroboration is always possible, or because the finding is incomplete. Only refute an actual over-claim.

Respond with ONLY a single-line JSON object, nothing else:
{"refute": true|false, "class": "TOOL_OVERREAD|ATTRIBUTION|INTENT|CAUSATION|CERTAINTY|SCOPE|NONE", "reason": "<= 30 words, quote the offending phrase"}`;

function buildPrompt(finding, lens) {
  return `LENS: ${lens.name} — ${lens.focus}

FINDING ${finding.finding_id || '(draft)'}
observation: ${finding.observation}
interpretation: ${finding.interpretation || '(none)'}
tool: ${finding.evidence_tool || finding.tool || '(?)'} | locator: ${finding.evidence_locator || finding.locator || '(?)'}
cited_tokens: ${JSON.stringify(finding.cited_tokens || [])}

Apply ONLY your lens. Output the JSON verdict only.`;
}

export function parseVote(text) {
  if (!text) return { refute: false, class: 'NONE', reason: 'no output', parsed: false };
  const m = String(text).match(/\{[\s\S]*?\}/);
  if (!m) return { refute: false, class: 'NONE', reason: 'unparseable', parsed: false };
  try {
    const o = JSON.parse(m[0]);
    return { refute: o.refute === true, class: String(o.class || 'NONE'), reason: String(o.reason || ''), parsed: true };
  } catch { return { refute: false, class: 'NONE', reason: 'bad json', parsed: false }; }
}

async function runOne(query, finding, lens) {
  let text = '';
  for await (const ev of query({
    prompt: buildPrompt(finding, lens),
    options: {
      systemPrompt: SYSTEM, maxTurns: 1, allowedTools: [], settingSources: [],
      pathToClaudeCodeExecutable: process.env.CLAUDE_CLI_PATH || join(process.env.HOME || '', '.local/bin/claude'),
    },
  })) {
    if (ev?.type === 'assistant' && ev.message?.content) {
      for (const c of ev.message.content) if (c?.type === 'text' && c.text) text += c.text;
    } else if (ev?.type === 'result' && typeof ev.result === 'string') text = ev.result;
  }
  return { lens: lens.name, ...parseVote(text), raw: String(text).trim().slice(0, 200) };
}

/**
 * Run the additive skeptic panel on a finding the deterministic floor PASSED.
 * @param {object} finding
 * @param {object} [opts]
 * @param {Function|null} [opts.query] injectable SDK query (mock in tests). If undefined, auto-loads the SDK.
 * @param {Array}   [opts.lenses]
 * @param {number}  [opts.threshold] votes required to bounce (default floor(n/2)+1 = 2 of 3)
 * @returns {{ran,mode,threshold,votes,refuteCount,refute,summary}}
 */
export async function llmSkepticPanel(finding, opts = {}) {
  const lenses = opts.lenses || SKEPTIC_LENSES;
  const threshold = opts.threshold || Math.floor(lenses.length / 2) + 1;
  const query = opts.query !== undefined ? opts.query : await loadSdkQuery();
  if (!query) {
    return { ran: false, mode: 'abstain', threshold, votes: [], refuteCount: 0, refute: false,
      summary: 'LLM skeptic panel unavailable (no Claude Agent SDK / auth) — deterministic floor stands.' };
  }
  const votes = [];
  for (const lens of lenses) {
    try { votes.push(await runOne(query, finding, lens)); }
    catch (e) { votes.push({ lens: lens.name, refute: false, class: 'NONE', reason: 'seat error: ' + String(e?.message || e).slice(0, 80), parsed: false }); }
  }
  const refuters = votes.filter((v) => v.refute);
  const refute = refuters.length >= threshold;          // ADDITIVE: true only adds a bounce; it never rescues.
  const summary = refute
    ? `LLM skeptic MAJORITY (${refuters.length}/${lenses.length} ≥ ${threshold}) refutes: ${refuters.map((v) => `${v.class} — ${v.reason}`).join(' | ')}`
    : `LLM skeptic panel: ${refuters.length}/${lenses.length} refute (< ${threshold} threshold) — insufficient to override the floor's PASS.`;
  return { ran: true, mode: 'LLM', threshold, votes, refuteCount: refuters.length, refute, summary };
}
