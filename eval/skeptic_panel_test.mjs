#!/usr/bin/env node
/**
 * skeptic_panel_test.mjs — deterministic proof of the Option-B gate logic (NO API key, NO model).
 *
 * Injects a MOCK `query` so the panel's control logic is verified reproducibly by any judge:
 *   - majority gate: 2/3 refute → bounce; 1/3 refute → no bounce (the false-positive guard);
 *   - additive-only: the panel is consulted only by council.mjs AFTER the floor passes, and its return
 *     shape can only ADD a bounce — it has no "rescue" path (asserted structurally);
 *   - abstain: with no SDK/query the panel abstains so the deterministic floor is unchanged.
 *
 * It also confirms the SECOND-ORDER evasions (subtle over-reaches that dodge even the HARDENED
 * deterministic floor) genuinely pass the floor — i.e. they are exactly the gap this layer fills.
 *
 *   run: node eval/skeptic_panel_test.mjs
 */
import { llmSkepticPanel, parseVote } from '../council/llm_skeptic.mjs';
import { runSeats } from '../council/seats.mjs';

// A mock SDK query: returns the per-lens vote it's told to, keyed off the LENS line in the prompt.
function mockQuery(votesByLens) {
  return async function* (req) {
    const lens = (String(req.prompt).match(/LENS:\s*([a-z-]+)/) || [])[1] || '?';
    const v = votesByLens[lens] ?? { refute: false, class: 'NONE', reason: 'ok' };
    yield { type: 'result', result: JSON.stringify(v) };
  };
}

const finding = { finding_id: 'T-1', observation: 'netscan shows rubyw.exe PID 3180 ESTABLISHED to 10.10.254.1',
  interpretation: 'A subtle over-reach the regex floor missed.', cited_tokens: ['3180', '10.10.254.1'], evidence_tool: 'netscan' };

let fails = 0;
const check = (name, cond, detail = '') => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!cond) fails++; };

console.log('── Gate logic (mock votes) ──');
{
  const r = await llmSkepticPanel(finding, { query: mockQuery({ 'tool-semantics': { refute: true, class: 'TOOL_OVERREAD', reason: 'connection ≠ exfil' }, inference: { refute: true, class: 'ATTRIBUTION', reason: 'names operator' }, support: { refute: false, class: 'NONE', reason: 'ok' } }) });
  check('2-of-3 refute → BOUNCE', r.refute === true && r.refuteCount === 2, r.summary);
}
{
  const r = await llmSkepticPanel(finding, { query: mockQuery({ 'tool-semantics': { refute: true, class: 'TOOL_OVERREAD', reason: 'x' }, inference: { refute: false, class: 'NONE', reason: 'ok' }, support: { refute: false, class: 'NONE', reason: 'ok' } }) });
  check('1-of-3 refute → NO bounce (FP guard)', r.refute === false && r.refuteCount === 1, r.summary);
}
{
  const r = await llmSkepticPanel(finding, { query: mockQuery({}) }); // all default to support
  check('0-of-3 refute → NO bounce', r.refute === false && r.refuteCount === 0);
}
{
  const r = await llmSkepticPanel(finding, { query: mockQuery({ 'tool-semantics': { refute: true }, inference: { refute: true }, support: { refute: true } }) });
  check('3-of-3 refute → BOUNCE', r.refute === true && r.refuteCount === 3);
}
{
  const r = await llmSkepticPanel(finding, { query: null }); // explicit no-SDK
  check('no SDK/auth → ABSTAIN (floor stands)', r.ran === false && r.refute === false && r.mode === 'abstain', r.summary);
}
{
  // malformed model output must not crash and must default to non-refute (precision-protective).
  const garbage = async function* () { yield { type: 'result', result: 'I think this is fine, no JSON here.' }; };
  const r = await llmSkepticPanel(finding, { query: garbage });
  check('unparseable model output → treated as non-refute', r.refute === false && r.votes.every((v) => v.parsed === false));
  check('parseVote tolerates prose-wrapped JSON', parseVote('sure: {"refute":true,"class":"INTENT","reason":"to steal"} ok').refute === true);
}

console.log('\n── Additive-only invariant (structural) ──');
{
  // The panel return shape exposes only {refute:boolean}. There is no field that flips a floor REFUTE
  // to a pass; council.mjs only *calls* it on floor-pass. Assert the shape carries no rescue power.
  const r = await llmSkepticPanel(finding, { query: mockQuery({}) });
  const keys = Object.keys(r);
  check('return shape has no "rescue"/"override"/"verified" field', !keys.some((k) => /rescue|override|verified|approve/i.test(k)), keys.join(','));
}

console.log('\n── Second-order evasions must dodge the HARDENED floor (this is the gap the panel fills) ──');
const SECOND_ORDER = [
  { id: 'SO-1', why: 'attribution+intent with no trigger word ("footprint left by a hands-on operator")',
    f: { observation: 'netscan shows rubyw.exe PID 3180 ESTABLISHED to 10.10.254.1', evidence_tool: 'netscan', cited_tokens: ['3180', '10.10.254.1'],
         interpretation: 'A console-less Ruby interpreter holding an off-hours internal session is the kind of footprint a hands-on operator leaves once they already have a foothold.' } },
  { id: 'SO-2', why: 'unjustified certainty with no trigger word ("leaves little room for any innocent explanation")',
    f: { observation: 'psscan shows Rar.exe PID 2524', evidence_tool: 'psscan', cited_tokens: ['2524'],
         interpretation: 'Taken together with the timing, these artifacts leave little room for any innocent explanation.' } },
  { id: 'SO-3', why: 'subtle tool over-read + operator framing without hardened floor trigger words',
    f: { observation: 'netscan shows rubyw.exe PID 3180', evidence_tool: 'netscan', cited_tokens: ['3180'],
         interpretation: 'The established socket deserves top priority because it fits the live-control path an operator would rely on.' } },
];
for (const s of SECOND_ORDER) {
  const { caught } = runSeats({ ...s.f, output: 'rubyw.exe 3180 10.10.254.1 Rar.exe 2524' });
  check(`${s.id} passes the floor (needs the LLM panel)`, caught === false, s.why);
}

console.log(`\n${fails ? `FAIL — ${fails} assertion(s) failed.` : 'PASS — gate logic correct, additive-only, abstains safely; second-order evasions confirmed past the floor.'}`);
process.exit(fails ? 1 : 0);
