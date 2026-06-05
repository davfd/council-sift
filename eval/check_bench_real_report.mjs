#!/usr/bin/env node
/**
 * CI drift guard for the at-scale bench_real report.
 * Fails if the report is absent, malformed, or if the headline controlled-regression
 * metrics silently drift away from the audited FIND EVIL submission snapshot.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const reportPath = resolve('accuracy-report', 'bench_real_report.json');
const report = JSON.parse(readFileSync(reportPath, 'utf8'));

const EXPECTED = {
  corpus_artifacts: 36,
  total_findings: 185,
  unsupported_findings: 85,
  council_off_passthrough: 85,
  council_on_passthrough: 0,
  precision: 1,
  recall: 1,
  true_positive: 85,
  false_positive: 0,
  false_negative: 0,
  true_negative: 100,
};

const actual = {
  corpus_artifacts: report.corpus_artifacts,
  total_findings: report.total_findings,
  unsupported_findings: report.unsupported_findings,
  council_off_passthrough: report.unsupported_claim_passthrough?.council_off,
  council_on_passthrough: report.unsupported_claim_passthrough?.council_on,
  precision: report.metrics?.precision,
  recall: report.metrics?.recall,
  true_positive: report.metrics?.true_positive,
  false_positive: report.metrics?.false_positive,
  false_negative: report.metrics?.false_negative,
  true_negative: report.metrics?.true_negative,
};

const failures = Object.entries(EXPECTED)
  .filter(([key, expected]) => actual[key] !== expected)
  .map(([key, expected]) => `${key}: expected ${expected}, got ${actual[key]}`);

if (failures.length) {
  console.error(`bench_real_report metric drift:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('bench_real_report guard PASS — headline metrics match audited snapshot');
