#!/usr/bin/env node
/**
 * blind_rescore.mjs — rescore the persisted independent blind findings against the current frozen detector.
 *
 * This is not a fresh attacker generation run; it is a detector-regression gate over the previously
 * generated blind corpus in accuracy-report/blind_findings.jsonl. Use it when the Claude attacker is
 * unavailable, and keep eval/blind_redteam.mjs as the full live generation protocol.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { runSeats } from '../council/seats.mjs';

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16);
const FINDINGS = resolve('accuracy-report/blind_findings.jsonl');
if (!existsSync(FINDINGS)) {
  console.error('No accuracy-report/blind_findings.jsonl to rescore. Run eval/blind_redteam.mjs first.');
  process.exit(1);
}
const rows = readFileSync(FINDINGS, 'utf8').trim().split(/\n/).filter(Boolean).map(JSON.parse);
if (!rows.length) {
  console.error('blind_findings.jsonl is empty; refusing vacuous rescore.');
  process.exit(1);
}

function conf(items) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const f of items) {
    const truth = f.ground_truth?.label;
    if (f.floor_caught && truth === 'unsupported') tp++;
    else if (f.floor_caught && truth === 'supported') fp++;
    else if (!f.floor_caught && truth === 'unsupported') fn++;
    else if (!f.floor_caught && truth === 'supported') tn++;
  }
  return { tp, fp, fn, tn, recall: tp + fn ? tp / (tp + fn) : 1, precision: tp + fp ? tp / (tp + fp) : 1 };
}

const rescored = rows.map((f) => {
  const p = resolve('eval/corpus', `${f.file}.txt`);
  const output = existsSync(p) ? readFileSync(p, 'utf8') : (f.output || '');
  const finding = { observation: f.observation, interpretation: f.interpretation, cited_tokens: f.cited_tokens, evidence_tool: f.tool, output };
  const { seats, caught } = runSeats(finding);
  const first = seats.find((s) => s.verdict !== 'SUPPORTED');
  return { ...f, output: undefined, floor_caught: caught, floor_seat: caught ? (first?.seat || '?') : null,
    floor_reason: first?.reasoning || null };
});

const floor = conf(rescored);
const byClass = {};
for (const f of rescored.filter((x) => x.ground_truth?.label === 'unsupported')) {
  const k = f.ground_truth.class || 'NONE';
  (byClass[k] ??= { n: 0, caught: 0 });
  byClass[k].n++;
  if (f.floor_caught) byClass[k].caught++;
}
const fps = rescored.filter((f) => f.ground_truth?.label === 'supported' && f.floor_caught);
const fns = rescored.filter((f) => f.ground_truth?.label === 'unsupported' && !f.floor_caught);

const report = {
  mode: 'stored_blind_corpus_rescore',
  note: 'Rescores the previously generated independent blind corpus against the current detector; not a fresh attacker generation run.',
  detector_frozen: true,
  detector_sha256: { seats: sha(resolve('council/seats.mjs')), skeptic: sha(resolve('council/llm_skeptic.mjs')) },
  source: { findings: FINDINGS, total: rescored.length, supported: rescored.filter((f) => f.ground_truth?.label === 'supported').length,
    unsupported: rescored.filter((f) => f.ground_truth?.label === 'unsupported').length },
  floor, floor_by_class: byClass,
  false_positives: fps.map((f) => ({ by: f.floor_seat, cited_tokens: f.cited_tokens, interpretation: f.interpretation, reason: f.floor_reason, note: f.ground_truth.note })),
  false_negatives: fns.map((f) => ({ class: f.ground_truth.class, interpretation: f.interpretation, note: f.ground_truth.note })),
};
writeFileSync(resolve('accuracy-report/blind_rescore_report.json'), JSON.stringify(report, null, 2));
console.log(`stored blind rescore: recall=${floor.recall.toFixed(3)} precision=${floor.precision.toFixed(3)} (TP${floor.tp} FP${floor.fp} FN${floor.fn} TN${floor.tn})`);
console.log('by class: ' + Object.entries(byClass).map(([k, v]) => `${k} ${v.caught}/${v.n}`).join(' · '));
console.log(`false positives: ${fps.length}`);
for (const f of fps) console.log(`  FP by=${f.floor_seat} ${String(f.interpretation).slice(0, 120)}`);
console.log('persisted: accuracy-report/blind_rescore_report.json');
if (floor.recall < 0.6712328767123288 || fps.length > 3) {
  console.error('FAIL — stored blind corpus regressed beyond baseline floor recall/FP guard.');
  process.exit(1);
}
console.log('PASS — stored blind corpus meets baseline floor recall and FP guard.');
