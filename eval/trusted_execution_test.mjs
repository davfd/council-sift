#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  boundedEvidenceExcerpt,
  buildTrustedExecutionRecord,
  resolveFindingEvidence,
  verifyExecutionRecord,
} from '../council/trusted_execution.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertThrows(fn, re, label) {
  try { fn(); } catch (e) {
    const msg = String(e?.message || e);
    if (!re.test(msg)) throw new Error(`${label}: wrong error: ${msg}`);
    return;
  }
  throw new Error(`${label}: expected throw`);
}

const sha = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');

const output = [
  'Offset(P)          Name          PID   PPID',
  '0x9abc            Rar.exe       2524  6352',
  '0xdef0            svchost.exe   14592 772',
  '0xaaaa            reg.exe       1100  772',
].join('\n') + '\n';

const record = buildTrustedExecutionRecord({
  case: 'SRL-MEM',
  artifact: '/tmp/srlmem/base-file-memory.img',
  locator: 'windows.psscan:PID=2524',
  tool: 'vol3',
  command: 'vol -q -f /tmp/srlmem/base-file-memory.img windows.psscan',
  output,
  exit_code: 0,
  wrapper: '/home/exor/council-sift/bin/sift',
  captured_at: '2026-06-05T00:00:00.000Z',
});

assert(record.provenance_tier === 'TRUSTED_EXECUTION', 'record must be TRUSTED_EXECUTION');
assert(record.execution_id.startsWith('TE-SRL-MEM-'), `unexpected execution_id: ${record.execution_id}`);
assert(record.output_sha256 === sha(output), 'output sha must match real stdout');
assert(record.command_sha256 === sha(record.command), 'command sha must bind exact command');
assert(record.record_sha256 && /^[a-f0-9]{64}$/.test(record.record_sha256), 'record sha missing');
assert(record.bounded_excerpt.excerpt.includes('Rar.exe'), 'bounded excerpt must include cited-like evidence line');
assert(verifyExecutionRecord(record).ok === true, 'fresh record must verify');
assert(verifyExecutionRecord({ ...record, output: output + 'tamper\n' }).ok === false, 'tampered output must fail verification');

const noisy = Array.from({ length: 160 }, (_, i) => `noise-${String(i).padStart(3, '0')}`).join('\n')
  + '\nRar.exe PID 2524 parent 6352\n'
  + Array.from({ length: 160 }, (_, i) => `tail-${String(i).padStart(3, '0')}`).join('\n')
  + '\nsvchost.exe PID 14592 parent 772\n';
const excerpt = boundedEvidenceExcerpt(noisy, ['Rar.exe', '14592'], { maxChars: 360, contextLines: 1 });
assert(excerpt.excerpt.length <= 360, `excerpt over budget: ${excerpt.excerpt.length}`);
assert(excerpt.excerpt.includes('Rar.exe PID 2524'), 'excerpt should include cited Rar.exe line');
assert(excerpt.excerpt.includes('svchost.exe PID 14592'), 'excerpt should include cited PID line');
assert(!excerpt.excerpt.includes('noise-000\nnoise-001\nnoise-002\nnoise-003'), 'excerpt should not leak full output');
assert(excerpt.output_sha256 === sha(noisy), 'excerpt metadata must still bind full output hash');

assertThrows(
  () => resolveFindingEvidence({
    case: 'SRL-MEM', artifact: record.artifact, locator: record.locator, tool: record.tool,
    command: record.command, output,
  }),
  /caller-supplied output refused/i,
  'caller-supplied output gate',
);

assertThrows(
  () => resolveFindingEvidence({
    case: 'SRL-MEM', artifact: record.artifact, locator: record.locator, tool: record.tool,
    command: record.command, output, provenance_tier: 'STORED_OUTPUT_ONLY',
  }),
  /STORED_OUTPUT_ONLY.*historical receipts only/i,
  'stored-output-only self-assertion gate',
);

const resolved = resolveFindingEvidence({
  case: 'SRL-MEM',
  observation: 'vol3 windows.psscan shows Rar.exe PID 2524',
  interpretation: 'Rar.exe is a staging indicator; exfiltration is not established from psscan alone',
  confidence: 'MEDIUM',
  cited_tokens: ['Rar.exe', '2524'],
  execution_record: record,
});
assert(resolved.provenance_tier === 'TRUSTED_EXECUTION', 'resolved finding must inherit trusted tier');
assert(resolved.output === output, 'resolved finding must use captured output, not caller text');
assert(resolved.execution_id === record.execution_id, 'resolved finding must carry execution id');
assert(resolved.execution_record_sha256 === record.record_sha256, 'resolved finding must carry execution record hash');
assert(resolved.evidence_excerpt?.excerpt.includes('Rar.exe'), 'resolved finding must carry bounded evidence excerpt');

assertThrows(
  () => resolveFindingEvidence({
    case: 'SRL-MEM', command: 'different command', execution_record: record,
  }),
  /does not match trusted execution record/i,
  'mismatched caller metadata gate',
);

const temp = mkdtempSync(join(tmpdir(), 'csift-capture-integration-'));
try {
  const wrapper = join(temp, 'mock-sift.sh');
  writeFileSync(wrapper, '#!/usr/bin/env bash\nprintf "MOCK_WRAPPER_COMMAND=%s\\nRar.exe 2524\\n" "$1"\n', { mode: 0o755 });
  const capture = spawnSync('node', ['bridge/csift.mjs', 'capture'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, CSIFT_SIFT_WRAPPER: wrapper, CSIFT_EXECUTIONS_DIR: temp },
    input: JSON.stringify({
      case: 'T4-CAPTURE',
      artifact: '/tmp/mock.img',
      locator: 'mock:line=2',
      tool: 'mock-sift',
      command: 'mock forensic command --safe',
      cited_tokens: ['Rar.exe', '2524'],
    }),
    encoding: 'utf8',
  });
  assert(capture.status === 0, `csift capture integration failed: ${capture.stderr || capture.stdout}`);
  const summary = JSON.parse(capture.stdout);
  assert(summary.provenance_tier === 'TRUSTED_EXECUTION', 'capture summary must be trusted execution');
  const recordPath = join(temp, summary.execution_ref.replace(/^council\/executions\//, ''));
  const captured = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert(verifyExecutionRecord(captured).ok === true, 'CLI capture record must verify');
  assert(captured.output.includes('MOCK_WRAPPER_COMMAND=mock forensic command --safe'), 'capture must execute wrapper with command as argv');
  assert(captured.bounded_excerpt.excerpt.includes('Rar.exe 2524'), 'capture record must carry bounded cited excerpt');
  assert(statSync(join(temp, 'manifest.json')).size > 0, 'capture must write manifest');
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log('trusted_execution_test PASS');
