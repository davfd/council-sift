#!/usr/bin/env node
/**
 * adversarial_evasions.mjs — HELD-OUT, non-circular recall probe for the Council seats.
 *
 * The at-scale bench (bench_real.mjs) injects hallucinations that use the seats' own trigger
 * vocabulary, so its recall is "by construction". THIS suite is the opposite: every hallucination
 * is a real over-read/over-reach phrased *specifically to dodge* the current regexes — the wording
 * was chosen by a red-teamer, not derived from the seats. Plus citation substring-exploit cases.
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
