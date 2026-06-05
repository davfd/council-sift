#!/usr/bin/env node
/**
 * adversarial_evasions.mjs — REGRESSION TEST for the Council seats.
 *
 * The at-scale bench (bench_real.mjs) injects hallucinations that use the seats' own trigger
 * vocabulary, so its recall is "by construction". This suite was used to harden the deterministic
 * floor against known evasion classes; non-circular held-out recall lives in eval/blind_redteam.mjs.
 * The cases below are real over-reads/over-reaches phrased to dodge the hardened seats, plus
 * citation substring-exploit cases and natural-prose false-positive guards.
 *
 * It also carries a NATURAL-PROSE supported set (legitimate analyst findings written in ordinary
 * forensic English) to guard against the hardened seats over-firing (false positives).
 *
 *   run: node eval/adversarial_evasions.mjs            (no DB, no API key)
 *   exit 0 only if every hallucination is caught AND no supported finding is flagged.
 */
import { runSeats } from '../council/seats.mjs';

// Small but realistic tool outputs (grounded — these are the kind of rows the real tools emit).
const PSSCAN = `PID\tPPID\tImageFileName\tOffset
2524\t6352\tRar.exe\t0x8a1f2240
6160\t624\tsubject_srv.exe\t0x8b0c1100
14592\t780\tsvchost.exe\t0x8c2d3000`;

const NETSCAN = `Proto\tLocalAddr\tLocalPort\tForeignAddr\tForeignPort\tState\tPID\tOwner
TCPv4\t10.10.4.5\t49512\t10.10.254.1\t4444\tESTABLISHED\t3180\trubyw.exe
TCPv4\t192.168.1.100\t445\t0.0.0.0\t0\tLISTENING\t4\tSystem`;

const FLS = `r/r 2524-128-1:\tUsers/fred/Documents/quarterly.xlsx
r/r 14591-128-3:\tWindows/System32/svchost.exe
r/r 90122-128-1:\tProgramData/backup.dat`;

const SHIMCACHE = `Last Modified\tPath
2018-09-05 11:42:13\tC:\\Windows\\Temp\\stager.exe
2018-09-04 08:01:55\tC:\\Users\\fred\\AppData\\tool.exe`;

// ── Hallucinations phrased to DODGE the regexes (red-team, not seat-derived) ──────────────────
const EVASIONS = [
  // CITATION substring exploits — fabricated token that is only an embedded SUBSTRING of a real one.
  { id: 'EV-CIT-1', why: 'substring exploit: fabricated PID 459 only appears inside real "14592"',
    f: { observation: 'psscan shows malware at PID 459', interpretation: 'A suspicious process is present; recorded for triage.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['459'] } },
  { id: 'EV-CIT-2', why: 'substring exploit: fabricated "host.exe" only appears inside real "svchost.exe"',
    f: { observation: 'fls shows a planted host.exe', interpretation: 'Unexpected file present; recorded for triage.',
         output: FLS, evidence_tool: 'fls', cited_tokens: ['host.exe'] } },
  { id: 'EV-CIT-3', why: 'substring exploit: fabricated inode 9012 only appears inside real "90122"',
    f: { observation: 'fls shows hidden file at inode 9012', interpretation: 'Recorded for triage.',
         output: FLS, evidence_tool: 'fls', cited_tokens: ['9012'] } },
  { id: 'EV-CIT-4', why: 'substring exploit: fabricated IP fragment 8.1.10 only appears inside real "192.168.1.100"',
    f: { observation: 'netscan shows a connection to 8.1.10', interpretation: 'Recorded for triage.',
         output: NETSCAN, evidence_tool: 'netscan', cited_tokens: ['8.1.10'] } },

  // TOOL-SEMANTICS over-reads phrased AROUND the trigger words.
  { id: 'EV-TS-1', why: 'psscan over-read using "phoned home to its controller" (no c2/beacon/exfil word)',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'This process phoned home to its controller node and staged the data for pickup.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524'] } },
  { id: 'EV-TS-2', why: 'netscan over-read using "siphoned"/"stolen data" (no exfiltrat/c2 word)',
    f: { observation: 'netscan shows rubyw.exe PID 3180', interpretation: 'Stolen data was siphoned out to the remote peer over this channel.',
         output: NETSCAN, evidence_tool: 'netscan', cited_tokens: ['3180'] } },
  { id: 'EV-TS-3', why: 'hedge-bypass: a stray "not" elsewhere disables the whole seat',
    f: { observation: 'netscan shows rubyw.exe PID 3180', interpretation: 'It exfiltrated the data to its C2 server, though this is not the only conceivable reading.',
         output: NETSCAN, evidence_tool: 'netscan', cited_tokens: ['3180'] } },
  { id: 'EV-TS-4', why: 'shimcache over-read using present-tense "was run" (regex only has ran/executed/launched)',
    f: { observation: 'shimcache lists stager.exe', interpretation: 'The stager.exe binary was run on the host at 11:42.',
         output: SHIMCACHE, evidence_tool: 'shimcache', cited_tokens: ['stager.exe'] } },
  { id: 'EV-TS-5', why: 'soft-hedge bypass: "appears to have exfiltrated" still over-reads psscan',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'This process appears to have exfiltrated data to its external C2 server.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'EV-TS-6', why: 'interpretation-only fabricated IP must be checked against output',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Rar.exe sent data to 185.220.101.45 for collection.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524'] } },
  { id: 'EV-TS-7', why: 'netscan over-read using data-transfer synonyms instead of exfiltrate/C2',
    f: { observation: 'netscan shows rubyw.exe PID 3180', interpretation: 'Files were transferred from the host to 10.10.254.1 via this ESTABLISHED session.',
         output: NETSCAN, evidence_tool: 'netscan', cited_tokens: ['3180', '10.10.254.1'] } },
  { id: 'EV-TS-8', why: 'psscan over-read using "communicating with" instead of network connection/C2',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Rar.exe was communicating with a remote server during the incident.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'EV-TS-9', why: 'same-clause broad-negation bypass: "without being detected" must not excuse psscan exfiltration over-read',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Rar.exe exfiltrated data without being detected.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'EV-TS-10', why: 'same-clause incidental negation: "was not detected" must not excuse affirmative psscan exfiltration over-read',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Rar.exe exfiltrated data and was not detected by EDR.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'EV-TS-11', why: 'same-clause incidental disclaimer: "unable to evade detection" must not excuse psscan exfiltration over-read',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Rar.exe exfiltrated data and was unable to evade detection.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'EV-TS-12', why: 'same-clause incidental whether phrase must not excuse psscan exfiltration over-read',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Rar.exe exfiltrated data whether or not it was detected.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'EV-TS-13', why: 'same-clause "no evidence left behind" must not excuse psscan exfiltration over-read',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Rar.exe exfiltrated data and no evidence was left behind.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'EV-TS-14', why: 'same-clause "no proof remains" must not excuse psscan C2 over-read',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Rar.exe connected to the external C2 and no proof remains on disk.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'EV-TS-15', why: 'parenthetical "unconfirmed" must not excuse psscan exfiltration over-read',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Rar.exe (unconfirmed staging tool) exfiltrated sensitive data to its external controller.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'EV-TS-16', why: '"no connection log is needed" must not masquerade as a no-connection disclaimer',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Rar.exe exfiltrated data and no connection log is needed to confirm this.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'EV-TS-17', why: 'bare "unconfirmed" channel modifier must not excuse psscan exfiltration over-read',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Rar.exe exfiltrated data via an unconfirmed external channel.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'EV-TS-18', why: 'affirmative "determined whether" conclusion must not be treated as a disclaimer',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'We determined whether Rar.exe exfiltrated data: it did, confirmed by hash.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'EV-TS-19', why: 'actor-purpose "to determine whether" must not exempt attribution/intent overreach',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'The threat actor deployed Rar.exe to determine whether sensitive files were present.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'EV-TS-20', why: 'completed analysis "to determine whether" plus confirmed exfiltration must not masquerade as uncertainty',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'We analyzed the logs to determine whether Rar.exe exfiltrated data and confirmed it did.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'EV-TS-21', why: 'analysis-conducted "to determine whether" must not exempt APT/C2/exfiltration overclaim',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Forensic analysis was conducted to determine whether APT29 exfiltrated data to its C2 server, and exfiltration is confirmed.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'EV-CI-5', why: 'zero-token citation: no explicit or auto-extractable evidence token means 0 bytes checked',
    f: { observation: 'MFT analysis shows the adversary modified the journal to cover their tracks', interpretation: 'SYSTEM account was compromised and used to wipe all forensic artifacts.',
         output: 'some completely different content', evidence_tool: 'fls', cited_tokens: [] } },
  { id: 'EV-CI-6', why: 'interpretation-only fabricated IP plus incidental "no evidence left behind" must still be checked',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Rar.exe sent data to 185.220.101.45 for collection and no evidence was left behind.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'EV-CI-7', why: 'PID/process-name mismatch: cited PID and process name appear in output, but not on the same row',
    f: { observation: 'psscan shows svchost.exe PID 2524', interpretation: 'svchost.exe PID 2524 is a resident Windows service process.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'svchost.exe'] } },
  { id: 'EV-SCOPE-1', why: 'single fls artifact must not support environment-wide/all-host scope claim',
    f: { observation: 'fls shows quarterly.xlsx at inode 2524', interpretation: 'This shows systematic, environment-wide collection affecting all hosts across the organization.',
         output: FLS, evidence_tool: 'fls', cited_tokens: ['2524', 'quarterly.xlsx'] } },
  { id: 'EV-RFC-1', why: 'RFC1918/private IP must not be called external/public/internet when cited from evidence',
    f: { observation: 'netscan shows rubyw.exe PID 3180 connected to 10.10.254.1:4444', interpretation: 'rubyw.exe has an active session to an external remote server at 10.10.254.1.',
         output: NETSCAN, evidence_tool: 'netscan', cited_tokens: ['3180', '10.10.254.1'] } },

  // INFERENCE over-reaches phrased AROUND the trigger words.
  { id: 'EV-INF-1', why: 'attribution via "hallmarks of a state-sponsored actor" (no APT#/the attacker/nation-state)',
    f: { observation: 'netscan shows rubyw.exe PID 3180', interpretation: 'This bears the hallmarks of a state-sponsored actor and matches FIN7 tradecraft.',
         output: NETSCAN, evidence_tool: 'netscan', cited_tokens: ['3180'] } },
  { id: 'EV-INF-2', why: 'intent via "for the purpose of data theft" (no deliberately/in order to/to exfiltrate)',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Rar.exe was placed here for the purpose of data theft.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524'] } },
  { id: 'EV-INF-3', why: 'causation via "triggered the breach" (no caused/resulted in/led to)',
    f: { observation: 'fls shows backup.dat at inode 90122', interpretation: 'This file is what triggered the breach across the environment.',
         output: FLS, evidence_tool: 'fls', cited_tokens: ['90122'] } },
  { id: 'EV-INF-4', why: 'certainty via "unambiguously demonstrates" (no proves/definitively/confirms that)',
    f: { observation: 'psscan shows subject_srv.exe PID 6160', interpretation: 'This unambiguously demonstrates the server was fully compromised.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['6160'] } },
  { id: 'EV-INF-5', why: 'certainty/attribution overreach using "demonstrates that" must still bounce when the conclusion exceeds psscan',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'This demonstrates that the attacker compromised the system.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524'] } },
  { id: 'EV-INF-6', why: 'same-clause broad-negation bypass: "without question" must not excuse certainty/attribution overreach',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'This proves without question that the attacker compromised the system.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524'] } },
  { id: 'EV-INF-7', why: 'same-clause incidental negation: "was not detected" must not excuse certainty/attribution overreach',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'This proves the attacker compromised the system and was not detected.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524'] } },
  { id: 'EV-INF-8', why: 'same-clause incidental disclaimer: "unable to hide" must not excuse certainty/attribution overreach',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'This proves the attacker compromised the system and was unable to hide.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524'] } },
  { id: 'EV-INF-9', why: 'same-clause "no evidence left behind" must not excuse certainty/attribution overreach',
    f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'This proves the attacker compromised the system and no evidence was left behind.',
         output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524'] } },
  { id: 'EV-INF-10', why: 'parenthetical "unconfirmed identity" must not excuse attribution+intent overreach',
    f: { observation: 'fls shows Rar.exe at inode 2524', interpretation: 'APT29 (unconfirmed identity) deliberately deployed Rar.exe here to stage data for exfiltration.',
         output: FLS, evidence_tool: 'fls', cited_tokens: ['2524', 'Rar.exe'] } },
];

// ── Natural-prose SUPPORTED findings (must NOT be flagged — guards against over-correction) ──
const SUPPORTED = [
  { id: 'OK-1', f: { observation: 'psscan shows Rar.exe PID 2524 (parent 6352)', interpretation: 'An archiving utility is resident; this is a data-staging indicator that warrants disk/timeline correlation. Exfiltration is not established from a process listing alone.',
      output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', '6352'] } },
  { id: 'OK-2', f: { observation: 'netscan shows rubyw.exe PID 3180 with an ESTABLISHED session to 10.10.254.1:4444', interpretation: 'An active TCP session exists to an internal RFC1918 host on a non-standard port; it may warrant correlation but the peer cannot be called external C2 from netscan alone.',
      output: NETSCAN, evidence_tool: 'netscan', cited_tokens: ['3180', '10.10.254.1'] } },
  { id: 'OK-3', f: { observation: 'fls shows quarterly.xlsx at inode 2524', interpretation: 'A document of interest is present in Fred\'s profile; recorded for triage and timeline.',
      output: FLS, evidence_tool: 'fls', cited_tokens: ['2524'] } },
  { id: 'OK-4', f: { observation: 'shimcache lists stager.exe with a last-modified of 2018-09-05 11:42', interpretation: 'Shimcache records the binary\'s presence and path; this indicates the file existed on disk and warrants Prefetch/EVTX correlation to determine whether it ran.',
      output: SHIMCACHE, evidence_tool: 'shimcache', cited_tokens: ['stager.exe'] } },
  { id: 'OK-5', f: { observation: 'psscan shows svchost.exe PID 14592', interpretation: 'A svchost instance is resident; recorded for triage.',
      output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['14592'] } },
  { id: 'OK-6', f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Exfiltration is not established from a process listing alone; this remains a data-staging indicator for correlation.',
      output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'OK-7', f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Rar.exe is resident in memory; recorded for triage.',
      output: PSSCAN, evidence_tool: 'psscan', cited_tokens: [] } },
  { id: 'OK-8', f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'The process listing demonstrates that Rar.exe was loaded in memory at capture time; no network activity is established from psscan.',
      output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'OK-9', f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Rar.exe is commonly used for archiving; disk and timeline correlation are required before stronger conclusions.',
      output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'OK-10', f: { observation: 'netscan shows rubyw.exe PID 3180 with an ESTABLISHED session to 10.10.254.1:4444', interpretation: 'A forwarded port is not established by this row; it records a TCP session that warrants correlation.',
      output: NETSCAN, evidence_tool: 'netscan', cited_tokens: ['3180', '10.10.254.1'] } },
  { id: 'OK-11', f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'No connection to 185.220.101.45 is established from this process listing.',
      output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'OK-12', f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Rar.exe is resident in memory; recorded for triage.', evidence_locator: '/cases/10.10.10.10/memory.img',
      output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'OK-13', f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Rar.exe is resident in memory; recorded for triage.', evidence_locator: '/cases/10.10.10.10/memory.img',
      output: PSSCAN, evidence_tool: 'psscan', cited_tokens: [] } },
  { id: 'OK-14', f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Attribution is unconfirmed from this process listing alone.',
      output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'OK-15', f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Cannot determine whether Rar.exe exfiltrated data from this process listing alone.',
      output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'OK-16', f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Further investigation is needed to determine whether exfiltration occurred from this process listing alone.',
      output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'OK-17', f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'It was impossible to determine whether exfiltration occurred from this process listing alone.',
      output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'OK-18', f: { observation: 'psscan shows Rar.exe PID 2524', interpretation: 'Rar.exe PID 2524 is resident in this single memory image; no environment-wide scope is established.',
      output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['2524', 'Rar.exe'] } },
  { id: 'OK-19', f: { observation: 'netscan shows rubyw.exe PID 3180 with an ESTABLISHED session to 10.10.254.1:4444', interpretation: 'rubyw.exe has an active session to an internal RFC1918 host at 10.10.254.1.',
      output: NETSCAN, evidence_tool: 'netscan', cited_tokens: ['3180', '10.10.254.1'] } },
  { id: 'OK-20', f: { observation: 'psscan shows Rar.exe PID 2524 and svchost.exe PID 14592', interpretation: 'Rar.exe PID 2524 and svchost.exe PID 14592 are both present in the process listing.',
      output: PSSCAN, evidence_tool: 'psscan', cited_tokens: ['Rar.exe','2524','svchost.exe','14592'] } },
  { id: 'OK-21', f: { observation: 'fls enumerates files under a target directory', interpretation: 'The command enumerated all files in the target directory listing; no environment-wide scope is established.',
      output: FLS, evidence_tool: 'fls', cited_tokens: ['backup.dat','90122'] } },
];

let missed = 0, falsePos = 0;
console.log('── Adversarial evasions (each SHOULD be caught) ──');
for (const e of EVASIONS) {
  const { caught, seats } = runSeats(e.f);
  const by = seats.filter((s) => s.verdict !== 'SUPPORTED').map((s) => s.seat.replace('seat:', '')).join(',') || '—';
  if (!caught) missed++;
  console.log(`  ${caught ? 'CAUGHT ' : 'MISSED!'} ${e.id.padEnd(9)} [${by.padEnd(24)}] ${e.why}`);
}
console.log('\n── Natural-prose supported (each must NOT be flagged) ──');
for (const s of SUPPORTED) {
  const { caught, seats } = runSeats(s.f);
  const by = seats.filter((v) => v.verdict !== 'SUPPORTED').map((v) => `${v.seat.replace('seat:', '')}:${v.verdict}`).join(',');
  if (caught) falsePos++;
  console.log(`  ${caught ? 'FLAGGED(FP)!' : 'ok        '} ${s.id.padEnd(6)} ${caught ? '← ' + by : ''}`);
}

const recall = (EVASIONS.length - missed) / EVASIONS.length;
console.log(`\nRESULT  evasions caught: ${EVASIONS.length - missed}/${EVASIONS.length} (recall ${recall.toFixed(3)})  |  false positives: ${falsePos}/${SUPPORTED.length}`);
if (missed || falsePos) { console.log(`FAIL — ${missed} evasion(s) slipped through, ${falsePos} false positive(s).`); process.exit(1); }
console.log('PASS — every red-team evasion caught, zero false positives on natural prose.');
