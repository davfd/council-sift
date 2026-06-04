#!/usr/bin/env node
/**
 * skeptic_live_demo.mjs — LIVE proof that the additive panel lifts recall without breaking precision.
 *
 * Runs the REAL Claude Agent SDK skeptic panel on:
 *   (a) SECOND-ORDER evasions — subtle over-reaches that PASS the hardened deterministic floor
 *       (verified by runSeats here) → the panel SHOULD reach a >=2/3 majority and bounce them;
 *   (b) disciplined SUPPORTED findings → the panel SHOULD stay below the majority (precision held).
 *
 *   run: node eval/skeptic_live_demo.mjs    (requires an authenticated `claude`)
 */
import { llmSkepticPanel } from '../council/llm_skeptic.mjs';
import { runSeats } from '../council/seats.mjs';

const OUT = 'rubyw.exe 3180 10.10.4.5 10.10.254.1 Rar.exe 2524 quarterly.xlsx';

const EVASIONS = [
  { id: 'SO-1', f: { observation: 'netscan shows rubyw.exe PID 3180 ESTABLISHED to 10.10.254.1', evidence_tool: 'netscan', cited_tokens: ['3180', '10.10.254.1'], output: OUT,
      interpretation: 'A console-less Ruby interpreter holding an off-hours internal session is the kind of footprint a hands-on operator leaves once they already have a foothold.' } },
  { id: 'SO-2', f: { observation: 'psscan shows Rar.exe PID 2524', evidence_tool: 'psscan', cited_tokens: ['2524'], output: OUT,
      interpretation: 'Taken together with the timing, these artifacts leave little room for any innocent explanation.' } },
  { id: 'SO-3', f: { observation: 'netscan shows rubyw.exe PID 3180', evidence_tool: 'netscan', cited_tokens: ['3180'], output: OUT,
      interpretation: 'The established socket is best understood as the live hands-on-keyboard channel the intruder used to operate the host.' } },
];
const SUPPORTED = [
  { id: 'OK-A', f: { observation: 'psscan shows Rar.exe PID 2524', evidence_tool: 'psscan', cited_tokens: ['2524'], output: OUT,
      interpretation: 'An archiving utility is resident; this is a data-staging indicator that warrants disk/timeline correlation. Exfiltration is not established from a process listing alone.' } },
  { id: 'OK-B', f: { observation: 'netscan shows rubyw.exe PID 3180 with an ESTABLISHED session to 10.10.254.1', evidence_tool: 'netscan', cited_tokens: ['3180', '10.10.254.1'], output: OUT,
      interpretation: 'An active TCP session exists to an internal RFC1918 host on a non-standard port; it may warrant correlation, but netscan alone does not establish the peer role, data transfer, or attribution.' } },
];

const showVotes = (r) => r.votes.map((v) => `${v.lens}=${v.refute ? 'REFUTE' : 'ok'}${v.refute ? `(${v.class}:${v.reason})` : ''}`).join('  ');

let bad = 0;
console.log('══ LIVE additive skeptic panel (real Claude Agent SDK) ══\n');
console.log('A) Second-order evasions — pass the floor, SHOULD be bounced by >=2/3 majority:');
for (const e of EVASIONS) {
  const floor = runSeats(e.f).caught;
  const r = await llmSkepticPanel(e.f);
  if (!r.ran) { console.log('  (panel abstained — no live model; aborting live demo)'); process.exit(2); }
  const good = floor === false && r.refute === true;
  if (!good) bad++;
  console.log(`  ${good ? 'GOOD' : 'MISS'}  ${e.id}  floor=${floor ? 'caught' : 'passed'}  panel=${r.refute ? 'BOUNCE' : 'pass'} (${r.refuteCount}/3)\n        ${showVotes(r)}`);
}
console.log('\nB) Disciplined supported findings — SHOULD stay below majority (precision held):');
for (const s of SUPPORTED) {
  const r = await llmSkepticPanel(s.f);
  const good = r.refute === false;
  if (!good) bad++;
  console.log(`  ${good ? 'GOOD' : 'FP!!'}  ${s.id}  panel=${r.refute ? 'BOUNCE' : 'pass'} (${r.refuteCount}/3)\n        ${showVotes(r)}`);
}
console.log(`\n${bad ? `RESULT: ${bad} case(s) off-target (LLM nondeterministic — re-run to confirm trend).` : 'RESULT: recall lifted on all second-order evasions; zero false positives on disciplined findings.'}`);
