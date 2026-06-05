import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';

const SAFE_CASE = /^[A-Za-z0-9._-]{1,128}$/;
const SAFE_FILE = /^[A-Za-z0-9._:-]+\.json$/;
const MANIFEST = 'manifest.json';

export const TRUSTED_EXECUTION = 'TRUSTED_EXECUTION';
export const STORED_OUTPUT_ONLY = 'STORED_OUTPUT_ONLY';

export const sha = (s) => createHash('sha256').update(String(s ?? ''), 'utf8').digest('hex');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

function assertNonEmpty(value, label) {
  const s = String(value ?? '');
  if (!s.trim()) throw new Error(`missing required field: ${label}`);
  return s;
}

function assertSafeCase(caseId) {
  const s = assertNonEmpty(caseId, 'case');
  if (!SAFE_CASE.test(s)) throw new Error(`unsafe case id: ${s}`);
  return s;
}

function matchLine(line, tokens) {
  const hay = String(line);
  return tokens.some((t) => t && hay.includes(t));
}

function compactToBudget(text, maxChars) {
  if (text.length <= maxChars) return text;
  if (maxChars <= 32) return text.slice(0, maxChars);
  return `${text.slice(0, maxChars - 32)}\n[... excerpt truncated ...]`;
}

export function boundedEvidenceExcerpt(output, citedTokens = [], opts = {}) {
  const out = String(output ?? '');
  const maxChars = Number(opts.maxChars ?? 4000);
  const contextLines = Number(opts.contextLines ?? 1);
  const tokens = (Array.isArray(citedTokens) ? citedTokens : [])
    .map((t) => String(t || '').trim())
    .filter(Boolean);
  const lines = out.split(/\r?\n/);
  const ranges = [];
  if (tokens.length) {
    for (let i = 0; i < lines.length; i++) {
      if (matchLine(lines[i], tokens)) {
        ranges.push([Math.max(0, i - contextLines), Math.min(lines.length - 1, i + contextLines)]);
      }
    }
  }
  if (!ranges.length) ranges.push([0, Math.min(lines.length - 1, Math.max(0, Number(opts.fallbackLines ?? 24) - 1))]);

  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }

  const parts = [];
  let prevEnd = -1;
  for (const [start, end] of merged) {
    if (start > prevEnd + 1) parts.push(`[... omitted lines ${prevEnd + 1}-${start - 1}; full output hash below ...]`);
    parts.push(lines.slice(start, end + 1).join('\n'));
    prevEnd = end;
  }
  if (prevEnd < lines.length - 1) parts.push(`[... omitted lines ${prevEnd + 1}-${lines.length - 1}; full output hash below ...]`);

  const excerpt = compactToBudget(parts.filter(Boolean).join('\n'), maxChars);
  const found = Object.fromEntries(tokens.map((t) => [t, out.includes(t)]));
  return {
    output_sha256: sha(out),
    total_chars: out.length,
    excerpt_chars: excerpt.length,
    max_chars: maxChars,
    truncated: excerpt.length < out.length,
    cited_tokens_found: found,
    excerpt,
    excerpt_sha256: sha(excerpt),
  };
}

function executionBody(spec) {
  const caseId = assertSafeCase(spec.case);
  const output = String(spec.output ?? '');
  const cited = Array.isArray(spec.cited_tokens) ? spec.cited_tokens.map(String) : [];
  return {
    version: 1,
    provenance_tier: TRUSTED_EXECUTION,
    capture_source: 'csift-capture',
    case: caseId,
    artifact: assertNonEmpty(spec.artifact, 'artifact'),
    locator: assertNonEmpty(spec.locator, 'locator'),
    tool: assertNonEmpty(spec.tool, 'tool'),
    command: assertNonEmpty(spec.command, 'command'),
    command_sha256: sha(spec.command),
    output,
    output_sha256: sha(output),
    exit_code: Number(spec.exit_code ?? 0),
    wrapper: spec.wrapper ? String(spec.wrapper) : null,
    captured_at: String(spec.captured_at || new Date().toISOString()),
    bounded_excerpt: boundedEvidenceExcerpt(output, cited, spec.excerpt_opts || {}),
  };
}

export function buildTrustedExecutionRecord(spec) {
  const body = executionBody(spec);
  const recordSha = sha(canonicalJson(body));
  return {
    execution_id: `TE-${body.case}-${recordSha.slice(0, 16)}`,
    ...body,
    record_sha256: recordSha,
  };
}

export function verifyExecutionRecord(record) {
  try {
    if (!record || record.provenance_tier !== TRUSTED_EXECUTION) return { ok: false, reason: 'not a trusted execution record' };
    if (record.output_sha256 !== sha(record.output ?? '')) return { ok: false, reason: 'output_sha256 mismatch' };
    if (record.command_sha256 !== sha(record.command ?? '')) return { ok: false, reason: 'command_sha256 mismatch' };
    const { execution_id: _id, record_sha256: _recordSha, ...body } = record;
    const recomputed = sha(canonicalJson(body));
    if (record.record_sha256 !== recomputed) return { ok: false, reason: 'record_sha256 mismatch' };
    if (record.execution_id !== `TE-${record.case}-${record.record_sha256.slice(0, 16)}`) return { ok: false, reason: 'execution_id mismatch' };
    return { ok: true, reason: 'trusted execution record verified' };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

function assertMatchesIfPresent(finding, key, expected) {
  if (finding[key] == null || finding[key] === '') return;
  if (String(finding[key]) !== String(expected)) {
    throw new Error(`${key} does not match trusted execution record: ${finding[key]} !== ${expected}`);
  }
}

export function resolveFindingEvidence(finding) {
  const f = { ...(finding || {}) };

  if (f.execution_record) {
    const record = f.execution_record;
    const v = verifyExecutionRecord(record);
    if (!v.ok) throw new Error(`trusted execution record failed verification: ${v.reason}`);
    assertMatchesIfPresent(f, 'case', record.case);
    assertMatchesIfPresent(f, 'artifact', record.artifact);
    assertMatchesIfPresent(f, 'locator', record.locator);
    assertMatchesIfPresent(f, 'tool', record.tool);
    assertMatchesIfPresent(f, 'command', record.command);
    return {
      ...f,
      case: record.case,
      artifact: record.artifact,
      locator: record.locator,
      tool: record.tool,
      command: record.command,
      output: record.output,
      provenance_tier: TRUSTED_EXECUTION,
      execution_id: record.execution_id,
      execution_record_sha256: record.record_sha256,
      evidence_excerpt: record.bounded_excerpt,
    };
  }

  if (f.output != null && f.provenance_tier !== STORED_OUTPUT_ONLY) {
    throw new Error('caller-supplied output refused: use csift capture and pass execution_ref/execution_record, or explicitly mark provenance_tier=STORED_OUTPUT_ONLY for legacy stored-output-only material');
  }
  if (f.provenance_tier === STORED_OUTPUT_ONLY) {
    return {
      ...f,
      output: String(f.output ?? ''),
      evidence_excerpt: f.evidence_excerpt || boundedEvidenceExcerpt(String(f.output ?? ''), f.cited_tokens || []),
    };
  }
  throw new Error('missing trusted execution record: run csift capture first, then record the finding with execution_ref');
}

export function executionFilename(record) {
  const v = verifyExecutionRecord(record);
  if (!v.ok) throw new Error(`cannot name invalid execution record: ${v.reason}`);
  return `${record.execution_id}-${record.record_sha256.slice(0, 12)}.json`;
}

export function readExecutionManifest(dir) {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, MANIFEST), 'utf8'));
    return { version: parsed.version || 1, latest_by_execution: parsed.latest_by_execution || {} };
  } catch {
    return { version: 1, latest_by_execution: {} };
  }
}

export function writeTrustedExecutionRecord(dir, record) {
  const file = executionFilename(record);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, file);
  const body = JSON.stringify(record, null, 2) + '\n';
  try {
    writeFileSync(path, body, { flag: 'wx' });
  } catch (e) {
    if (e?.code !== 'EEXIST') throw e;
    const existing = readFileSync(path, 'utf8');
    if (existing !== body) throw new Error(`hash-addressed execution collision for ${file}`);
  }
  const manifest = readExecutionManifest(dir);
  manifest.latest_by_execution[record.execution_id] = { file, record_sha256: record.record_sha256, captured_at: record.captured_at };
  writeFileSync(join(dir, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  return { file, path, manifest };
}

export function loadTrustedExecutionRecord(ref, baseDir = process.cwd()) {
  const s = assertNonEmpty(ref, 'execution_ref');
  const candidate = isAbsolute(s) ? s : resolve(baseDir, s);
  if (!existsSync(candidate)) throw new Error(`trusted execution record not found: ${s}`);
  if (!SAFE_FILE.test(basename(candidate))) throw new Error(`unsafe execution record filename: ${basename(candidate)}`);
  const record = JSON.parse(readFileSync(candidate, 'utf8'));
  const v = verifyExecutionRecord(record);
  if (!v.ok) throw new Error(`trusted execution record failed verification: ${v.reason}`);
  return record;
}
