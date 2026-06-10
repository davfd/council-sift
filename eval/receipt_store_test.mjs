#!/usr/bin/env node
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeReceiptFiles, readReceiptManifest } from '../council/receipt_store.mjs';

const dir = mkdtempSync(join(tmpdir(), 'csift-receipts-'));
try {
  const r1 = { finding_id: 'F-test-001', receipt_sha256: 'a'.repeat(64), created_at: '2026-06-05T00:00:00.000Z', disposition: 'COUNCIL_VERIFIED' };
  const r2 = { finding_id: 'F-test-001', receipt_sha256: 'b'.repeat(64), created_at: '2026-06-05T00:01:00.000Z', disposition: 'COUNCIL_VERIFIED' };

  const w1 = writeReceiptFiles(dir, r1);
  if (w1.file !== 'F-test-001-aaaaaaaaaaaa.json') throw new Error(`unexpected file for r1: ${w1.file}`);
  if (!existsSync(join(dir, w1.file))) throw new Error('hash-addressed r1 receipt missing');
  if (existsSync(join(dir, 'F-test-001.json'))) throw new Error('legacy overwrite-prone receipt filename was written');

  const w2 = writeReceiptFiles(dir, r2);
  if (w2.file !== 'F-test-001-bbbbbbbbbbbb.json') throw new Error(`unexpected file for r2: ${w2.file}`);
  if (!existsSync(join(dir, w1.file)) || !existsSync(join(dir, w2.file))) throw new Error('append-only receipt history not preserved');

  const manifest = readReceiptManifest(dir);
  const latest = manifest.latest_by_finding['F-test-001'];
  if (!latest || latest.receipt_sha256 !== r2.receipt_sha256 || latest.file !== w2.file) {
    throw new Error('manifest did not point to latest receipt hash');
  }

  const before = readFileSync(join(dir, w1.file), 'utf8');
  writeReceiptFiles(dir, r1);
  const after = readFileSync(join(dir, w1.file), 'utf8');
  if (before !== after) throw new Error('existing hash-addressed receipt was overwritten');

  console.log('receipt_store_test PASS');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
