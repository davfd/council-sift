import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SAFE_ID = /^[A-Za-z0-9_.:-]+$/;
const MANIFEST = 'manifest.json';

function assertSafePart(value, label) {
  const s = String(value || '');
  if (!SAFE_ID.test(s) || s.includes('..') || s.includes('/') || s.includes('\\')) {
    throw new Error(`unsafe ${label}: ${s}`);
  }
  return s;
}

export function receiptFilename(receipt) {
  const findingId = assertSafePart(receipt.finding_id, 'finding_id');
  const hash = assertSafePart(receipt.receipt_sha256, 'receipt_sha256');
  if (!/^[a-fA-F0-9]{12,64}$/.test(hash)) throw new Error(`invalid receipt_sha256: ${hash}`);
  return `${findingId}-${hash.slice(0, 12).toLowerCase()}.json`;
}

export function readReceiptManifest(dir) {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, MANIFEST), 'utf8'));
    return {
      version: parsed.version || 1,
      latest_by_finding: parsed.latest_by_finding || {},
      rerun_status_by_finding: parsed.rerun_status_by_finding || {},
    };
  } catch {
    return { version: 1, latest_by_finding: {}, rerun_status_by_finding: {} };
  }
}

export function writeReceiptManifest(dir, manifest) {
  mkdirSync(dir, { recursive: true });
  const body = JSON.stringify({
    version: 1,
    latest_by_finding: manifest.latest_by_finding || {},
    rerun_status_by_finding: manifest.rerun_status_by_finding || {},
  }, null, 2) + '\n';
  const path = join(dir, MANIFEST);
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, body, { flag: 'wx' });
  renameSync(tmp, path);
}

export function writeReceiptFiles(dir, receipt) {
  mkdirSync(dir, { recursive: true });
  const file = receiptFilename(receipt);
  const path = join(dir, file);
  const body = JSON.stringify(receipt, null, 2) + '\n';
  try {
    writeFileSync(path, body, { flag: 'wx' });
  } catch (e) {
    if (e?.code !== 'EEXIST') throw e;
    const existing = readFileSync(path, 'utf8');
    if (existing !== body) throw new Error(`hash-addressed receipt collision for ${file}`);
  }
  const manifest = readReceiptManifest(dir);
  manifest.latest_by_finding[receipt.finding_id] = {
    file,
    receipt_sha256: receipt.receipt_sha256,
    created_at: receipt.created_at || null,
    rerun_status: receipt.rerun_status || null,
  };
  if (receipt.rerun_status) {
    manifest.rerun_status_by_finding[receipt.finding_id] = {
      status: receipt.rerun_status,
      note: receipt.rerun_status_note || null,
      file,
    };
  }
  writeReceiptManifest(dir, manifest);
  return { file, path, manifest };
}
