#!/usr/bin/env node
/**
 * ablation.mjs — Council-OFF vs Council-ON on a labeled finding set.
 *
 * The headline proof: how many UNSUPPORTED (hallucinated) findings reach "human review"
 * with the Council OFF vs ON — same analyst output, one variable (the Council).
 * Also reports the Citation seat's precision/recall against ground truth.
 *
 * Writes accuracy-report/ablation_report.json + ablation_report.md (quick sanity report).
 *
 * Run:  node eval/ablation.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSeats } from '../council/seats.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const dataset = JSON.parse(readFileSync(resolve(__dir, 'findings_dataset.json'), 'utf8'));
const findings = dataset.findings;

let tp = 0, fp = 0, fn = 0, tn = 0;
const rows = [];
for (const f of findings) {
  const { seats, caught } = runSeats(f);
  const refuter = seats.find((s) => ['UNSUPPORTED', 'CONTRADICTED', 'MISREAD_TOOL'].includes(s.verdict));
  const predicted = caught ? 'unsupported' : 'supported';
  const truth = f.truth;
  if (predicted === 'unsupported' && truth === 'unsupported') tp++;
  else if (predicted === 'unsupported' && truth === 'supported') fp++;
  else if (predicted === 'supported' && truth === 'unsupported') fn++;
  else tn++;
  rows.push({ id: f.id, truth, council_verdict: refuter ? refuter.verdict : 'SUPPORTED', caught,
    reasoning: refuter ? `${refuter.seat}: ${refuter.reasoning}` : 'all seats supported' });
}

const totalUnsupported = findings.filter((f) => f.truth === 'unsupported').length;
const passthroughOFF = totalUnsupported;          // Council OFF: nothing is checked → all reach review
const passthroughON = fn;                         // Council ON: only the ones the seat MISSED reach review
const precision = tp + fp ? tp / (tp + fp) : 1;
const recall = tp + fn ? tp / (tp + fn) : 1;

const report = {
  generated_for: 'SANS FIND EVIL! — Council-SIFT Accuracy Report',
  dataset_size: findings.length,
  unsupported_in_dataset: totalUnsupported,
  unsupported_claim_passthrough: { council_off: passthroughOFF, council_on: passthroughON },
  council_panel: { true_positive: tp, false_positive: fp, false_negative: fn, true_negative: tn, precision, recall },
  per_finding: rows,
  honest_notes: [
    'Four deterministic seats: Citation (every cited token must be in the tool output), Tool-semantics (no over-reading a tool — e.g. psscan/pslist cannot establish C2; Shimcache != execution), Contradiction (timestomp: $SI vs $FN), Inference (no attribution/intent/causation/unjustified-certainty leap from a single artifact).',
    'Remaining gap: a subtle semantic misinterpretation that matches none of the deterministic rules would still pass. That residue is what the AGENTIC council mode (council/run_agentic.mjs — OpenClaw/LLM seats grounded in these same primitives) is for; it is counted honestly here as not-caught, never as caught.',
    'cited_tokens are analyst-declared; regex auto-extraction is the weaker fallback for free-text claims.',
    'These numbers are on a small hand-crafted set and are NOT generalizable until run against the official dataset and real images.',
  ],
};

mkdirSync(resolve(__dir, '..', 'accuracy-report'), { recursive: true });
writeFileSync(resolve(__dir, '..', 'accuracy-report', 'ablation_report.json'), JSON.stringify(report, null, 2));

const md = `# Council-SIFT — Accuracy Report

Ablation on a labeled finding set (${findings.length} findings, ${totalUnsupported} planted unsupported).
Same analyst output; the only variable is the Council.

## Headline: unsupported-claim pass-through to "human review"

| | Unsupported findings reaching review |
|---|---|
| **Council OFF** | ${passthroughOFF} / ${totalUnsupported} |
| **Council ON**  | ${passthroughON} / ${totalUnsupported} |

## Council panel (Citation + Tool-semantics + Contradiction + Inference) vs ground truth

| metric | value |
|---|---|
| precision | ${precision.toFixed(3)} |
| recall | ${recall.toFixed(3)} |
| true positives (caught hallucinations) | ${tp} |
| false positives (good findings wrongly flagged) | ${fp} |
| false negatives (missed hallucinations) | ${fn} |

## Per-finding

| finding | truth | council verdict | caught? |
|---|---|---|---|
${rows.map((r) => `| ${r.id} | ${r.truth} | ${r.council_verdict} | ${r.caught ? 'yes' : 'no'} |`).join('\n')}

## Honest limitations (honesty valued over perfection)

${report.honest_notes.map((n) => `- ${n}`).join('\n')}
`;
writeFileSync(resolve(__dir, '..', 'accuracy-report', 'ablation_report.md'), md);

console.log(`Council OFF → ${passthroughOFF}/${totalUnsupported} unsupported reach review`);
console.log(`Council ON  → ${passthroughON}/${totalUnsupported} unsupported reach review`);
console.log(`Council panel: precision=${precision.toFixed(3)} recall=${recall.toFixed(3)} (TP=${tp} FP=${fp} FN=${fn} TN=${tn})`);
console.log('wrote accuracy-report/ablation_report.{json,md}');
