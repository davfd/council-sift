#!/usr/bin/env node
/**
 * csift — Council-SIFT memory bridge (host-side → isolated claw-memory-core @ bolt 7690).
 *
 * The DFIR analyst calls these to write/trace findings through the REAL claw-memory
 * engine (genuine provenance edges + content_sha256), not raw Cypher.
 *
 *   capture          < execution.json deposit hash-verified local tool execution record
 *   record-finding   < finding.json   deposit a 4-part DFIR finding + trusted execution provenance
 *   refute <id> "<reason>"            seat objection: mark finding disputed + write ConflictRecord
 *   trace [--rerun] <id>              resolve finding → tool execution; re-hash stored output; --rerun
 *                                     independently re-executes the recorded command and compares the hash
 *   list   <case>                     list findings in a case with status
 *
 * Env: NEO4J_URI/USER/PASSWORD (source claw-memory-core/.env — must be the isolated 7690 graph).
 *
 * finding.json shape:
 *   { case, observation, interpretation, confidence(HIGH|MEDIUM|LOW|SPECULATIVE),
 *     execution_ref, cited_tokens }
 *
 * New findings must use `execution_ref` from `capture`; caller-supplied output is refused.
 * STORED_OUTPUT_ONLY is a historical receipt/trace label only, not a record-finding bypass.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Neo4jService } from '../claw-memory-core/dist/storage/neo4j/neo4j.service.js';
import { handleRemember } from '../claw-memory-core/dist/handlers/remember.js';
import { handleMarkWrong } from '../claw-memory-core/dist/handlers/mark-wrong.js';
import { guardIsolatedUri, assertSafeId } from '../safety.mjs';
import {
  buildTrustedExecutionRecord,
  loadTrustedExecutionRecord,
  resolveFindingEvidence,
  writeTrustedExecutionRecord,
} from '../council/trusted_execution.mjs';

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const die = (m) => { console.error('[csift] ' + m); process.exit(1); };
const CONF = ['HIGH', 'MEDIUM', 'LOW', 'SPECULATIVE'];
const __dir = dirname(fileURLToPath(import.meta.url));
const RECEIPT_MANIFEST_URL = new URL('../council/receipts/manifest.json', import.meta.url);
const EXECUTIONS_DIR = resolve(process.env.CSIFT_EXECUTIONS_DIR || resolve(__dir, '../council/executions'));

function receiptRerunStatus(findingId) {
  try {
    const manifest = JSON.parse(readFileSync(RECEIPT_MANIFEST_URL, 'utf8'));
    return manifest?.rerun_status_by_finding?.[findingId] || null;
  } catch {
    return null;
  }
}

// DFIR findings/deposits are MemoryClaims — deterministic rule-based result, no LLM/OpenAI key.
// Full ClassificationResult shape {type, properties, confidence, path} required by handleRemember.
const dfirClassify = async () => ({ type: 'MemoryClaim', properties: {}, confidence: 1.0, path: 'rule-based' });

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

function guardIsolated() { guardIsolatedUri(process.env.NEO4J_URI, die); }

async function captureExecution() {
  const raw = await readStdin();
  let spec;
  try { spec = JSON.parse(raw); } catch { die('capture expects a JSON spec on stdin'); }
  for (const k of ['case', 'artifact', 'locator', 'tool', 'command']) {
    if (!spec[k]) die(`missing required field: ${k}`);
  }
  assertSafeId(spec.case, die, 'case id');
  const wrapper = spec.wrapper || process.env.CSIFT_SIFT_WRAPPER || resolve(__dir, '../bin/sift');
  let output = '';
  let exit_code = 0;
  try {
    output = execFileSync(wrapper, [String(spec.command)], { encoding: 'utf8', maxBuffer: 1e8, timeout: Number(spec.timeout_ms || 180000) });
  } catch (e) {
    exit_code = Number(e?.status ?? 1);
    output = String(e?.stdout || '') + String(e?.stderr || '');
  }
  const record = buildTrustedExecutionRecord({ ...spec, output, exit_code, wrapper, captured_at: new Date().toISOString() });
  const written = writeTrustedExecutionRecord(EXECUTIONS_DIR, record);
  console.log(JSON.stringify({
    execution_id: record.execution_id,
    provenance_tier: record.provenance_tier,
    execution_ref: `council/executions/${written.file}`,
    record_sha256: record.record_sha256,
    output_sha256: record.output_sha256,
    exit_code,
  }, null, 2));
}

async function recordFinding(svc) {
  const raw = await readStdin();
  let f;
  try { f = JSON.parse(raw); } catch { die('record-finding expects a JSON finding on stdin'); }
  if (f.execution_ref && !f.execution_record) {
    try { f.execution_record = loadTrustedExecutionRecord(f.execution_ref, resolve(__dir, '..')); }
    catch (e) { die(String(e?.message || e)); }
  }
  try { f = resolveFindingEvidence(f); }
  catch (e) { die(String(e?.message || e)); }
  for (const k of ['case', 'observation', 'interpretation', 'confidence', 'artifact', 'locator', 'tool', 'command']) {
    if (!f[k]) die(`missing required field: ${k}`);
  }
  const conf = String(f.confidence).toUpperCase();
  if (!CONF.includes(conf)) die(`confidence must be one of ${CONF.join('|')}`);
  // PROVENANCE HARD GATE — a finding must cite a tool execution (NONE provenance rejected).
  if (!f.tool || !f.command) die('NONE provenance rejected: a finding must cite tool + command');
  // Case id flows into finding_id + filenames downstream — validate before use.
  assertSafeId(f.case, die, 'case id');

  const output = f.output ?? '';
  const outHash = sha(output);
  const content = `OBSERVATION: ${f.observation}\nINTERPRETATION: ${f.interpretation}\nCONFIDENCE: ${conf}`;
  const contentHash = sha(content);
  const ptr = `${f.artifact}#${f.locator}`;

  // Real engine write path: classify (forced MemoryClaim) → node + content_sha256 + DERIVED_FROM RawEvent.
  await handleRemember(
    {
      content,
      source_identity: 'agent:analyst',
      source_artifact_ref: ptr,
      tenant_id: f.case,
      sessionUuid: `session:${f.case}`,
      visibility: 'council-shared',
    },
    svc,
    { classifyFn: dfirClassify },
  );

  const found = await svc.run(
    `MATCH (n:MemoryClaim {content_sha256:$h, project_root:$t}) RETURN n.nodeId AS id ORDER BY n.created_at DESC LIMIT 1`,
    { h: contentHash, t: f.case },
  );
  const nodeId = found[0]?.id;
  if (!nodeId) die('deposit failed: finding node not found after remember()');

  const cnt = await svc.run(
    `MATCH (n:MemoryClaim {project_root:$t}) WHERE n.finding_id IS NOT NULL RETURN count(n) AS c`,
    { t: f.case },
  );
  const seq = String(Number(cnt[0]?.c ?? 0) + 1).padStart(3, '0');
  const findingId = `F-analyst-${f.case}-${seq}`;

  // Stamp DFIR fields on the finding + attach a purpose-built ToolExecution provenance node
  // (DERIVED_FROM) carrying the exact tool/command/output + hash — this is what `trace` re-verifies.
  await svc.run(
    `MATCH (n:MemoryClaim {nodeId:$id})
     SET n.finding_id=$fid, n.kind='finding', n.status='DRAFT', n.provenance_tier=$tier,
         n.observation=$obs, n.interpretation=$interp, n.confidence=$conf, n.cited_tokens=$cited,
         n.evidence_artifact=$art, n.evidence_locator=$loc, n.evidence_tool=$tool,
         n.evidence_command=$cmd, n.evidence_output_sha256=$oh,
         n.evidence_execution_id=$execId, n.evidence_execution_record_sha256=$execSha,
         n.evidence_excerpt=$excerpt, n.evidence_excerpt_sha256=$excerptSha
     MERGE (te:ToolExecution {output_sha256:$oh, project_root:$t})
       ON CREATE SET te.tool=$tool, te.command=$cmd, te.output=$out,
                     te.artifact=$art, te.locator=$loc, te.ranAt=$ts,
                     te.provenance_tier=$tier, te.execution_id=$execId,
                     te.execution_record_sha256=$execSha
     MERGE (n)-[:DERIVED_FROM]->(te)`,
    { id: nodeId, fid: findingId, obs: f.observation, interp: f.interpretation, conf,
      cited: Array.isArray(f.cited_tokens) ? f.cited_tokens.map(String) : [],
      art: f.artifact, loc: f.locator, tool: f.tool, cmd: f.command, oh: outHash, out: output,
      tier: f.provenance_tier, execId: f.execution_id || null, execSha: f.execution_record_sha256 || null,
      excerpt: f.evidence_excerpt ? JSON.stringify(f.evidence_excerpt) : null,
      excerptSha: f.evidence_excerpt?.excerpt_sha256 || null,
      t: f.case, ts: new Date().toISOString() },
  );

  console.log(JSON.stringify({
    finding_id: findingId, nodeId, status: 'DRAFT', confidence: conf, content_sha256: contentHash,
    evidence_pointer: { artifact: f.artifact, locator: f.locator, tool: f.tool, command: f.command, output_sha256: outHash },
    trusted_execution: { provenance_tier: f.provenance_tier, execution_id: f.execution_id || null, execution_record_sha256: f.execution_record_sha256 || null },
  }, null, 2));
}

async function refute(svc, id, reason) {
  if (!id || !reason) die('usage: refute <finding_id|nodeId> "<reason>"');
  const rows = await svc.run(
    `MATCH (n:MemoryClaim) WHERE n.nodeId=$id OR n.finding_id=$id RETURN n.nodeId AS id, n.project_root AS t LIMIT 1`,
    { id },
  );
  if (!rows.length) die('finding not found: ' + id);
  const mw = await handleMarkWrong({ nodeId: rows[0].id, reason, tenant_id: rows[0].t }, svc);
  await svc.run(`MATCH (n:MemoryClaim {nodeId:$id}) SET n.status='DISPUTED'`, { id: rows[0].id });
  const cr = await svc.run(
    `MATCH (cr:ConflictRecord) WHERE cr.contestedNodeId=$id OR (cr)-[:CONFLICTS_WITH]-(:MemoryClaim {nodeId:$id})
     RETURN cr.nodeId AS cr LIMIT 1`, { id: rows[0].id },
  );
  console.log(JSON.stringify({ nodeId: rows[0].id, lifecycle: mw.structured.lifecycleState, status: 'DISPUTED', conflict_record: cr[0]?.cr ?? null, reason }, null, 2));
}

function parseJsonOrNull(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function trace(svc, id, opts = {}) {
  if (!id) die('usage: trace [--rerun] <finding_id|nodeId>');
  const rows = await svc.run(
    `MATCH (n:MemoryClaim) WHERE n.nodeId=$id OR n.finding_id=$id
     OPTIONAL MATCH (n)-[:DERIVED_FROM]->(te:ToolExecution)
     RETURN n.finding_id AS fid, n.nodeId AS nodeId, n.status AS status, n.lifecycleState AS lifecycle,
            n.observation AS obs, n.interpretation AS interp, n.confidence AS conf, n.content_sha256 AS csha,
            n.evidence_artifact AS art, n.evidence_locator AS loc, n.evidence_tool AS tool,
            n.evidence_command AS cmd, n.evidence_output_sha256 AS oh,
            n.provenance_tier AS tier, n.evidence_execution_id AS execId,
            n.evidence_execution_record_sha256 AS execSha, n.evidence_excerpt AS excerpt,
            n.evidence_excerpt_sha256 AS excerptSha, te.output AS out LIMIT 1`,
    { id },
  );
  if (!rows.length) die('finding not found: ' + id);
  const r = rows[0];
  const rerun_status = receiptRerunStatus(r.fid);
  // Stored-chain integrity: re-hash the CAPTURED tool output held in the graph (proves the stored
  // output has not been altered since deposit + the cited hash is consistent). This does NOT, by
  // itself, prove SIFT produced it — use --rerun for that.
  const rehash = r.out != null ? sha(r.out) : null;
  const stored_chain = !rehash || !r.oh ? 'no captured tool output stored to re-hash'
    : rehash === r.oh ? 'VERIFIED — re-hash of the captured stored tool output matches evidence_output_sha256 (chain intact)'
    : 'MISMATCH — stored output does not match recorded hash (tampering)';

  // Independent re-execution: actually re-run the recorded command through the SIFT wrapper and
  // compare the FRESH output hash to the recorded one. This is what proves SIFT produces it.
  let independent_rerun = opts.rerun ? { requested: true } : undefined;
  if (opts.rerun) {
    if (rerun_status?.status === 'STORED_OUTPUT_ONLY') {
      independent_rerun = { requested: true, status: 'STORED_OUTPUT_ONLY',
        verdict: 'NOT_RERUNNABLE — this receipt is explicitly labeled stored-output-only; use stored_chain_integrity, or provide the original concrete evidence path before claiming independent rerun.',
        note: rerun_status.note || null };
    } else if (!r.cmd) {
      independent_rerun = { requested: true, status: 'NO_COMMAND — finding has no recorded command to re-run' };
    } else {
      const wrapper = process.env.SIFT_WRAPPER || `${process.env.HOME || ''}/sift-workstation/sift`;
      try {
        const fresh = execFileSync(wrapper, [r.cmd], { encoding: 'utf8', maxBuffer: 1e8, timeout: 180000 });
        const fh = sha(fresh);
        // Exact byte match, or identical modulo trailing whitespace (capture methods differ in trailing
        // newlines — bash $() strips them, execFileSync keeps them; a trailing-WS-insensitive match of the
        // real tool output is a legitimate equivalence and is reported transparently).
        const trim = (s) => String(s).replace(/[ \t\r\n]+$/, '');
        const exact = fh === r.oh;
        const normMatch = !exact && r.out != null && sha(trim(fresh)) === sha(trim(r.out));
        independent_rerun = {
          requested: true, wrapper, reran_command: r.cmd, fresh_output_sha256: fh, recorded_output_sha256: r.oh,
          match: exact ? 'exact' : normMatch ? 'modulo-trailing-whitespace' : 'none',
          verdict: exact
            ? 'INDEPENDENT_RERUN_VERIFIED — re-executing the tool reproduces the recorded output hash exactly'
            : normMatch
              ? 'INDEPENDENT_RERUN_VERIFIED — re-executing the tool reproduces the recorded output (identical modulo trailing whitespace)'
              : 'RERUN_DIVERGED — fresh tool output differs from the recorded output (non-deterministic tool, changed evidence, or fabrication)',
        };
      } catch (e) {
        independent_rerun = { requested: true, wrapper, reran_command: r.cmd,
          status: 'RERUN_FAILED', error: String(e?.message || e).slice(0, 200) };
      }
    }
  }

  console.log(JSON.stringify({
    finding_id: r.fid, nodeId: r.nodeId, status: r.status, lifecycle: r.lifecycle,
    claim: { observation: r.obs, interpretation: r.interp, confidence: r.conf, content_sha256: r.csha },
    evidence_pointer: { artifact: r.art, locator: r.loc, tool: r.tool, command: r.cmd, output_sha256: r.oh },
    trusted_execution: { provenance_tier: r.tier || null, execution_id: r.execId || null, execution_record_sha256: r.execSha || null, evidence_excerpt_sha256: r.excerptSha || null },
    evidence_excerpt: parseJsonOrNull(r.excerpt),
    rerun_status,
    stored_chain_integrity: stored_chain,
    independent_rerun,
  }, null, 2));
}

async function list(svc, caseId) {
  if (!caseId) die('usage: list <case>');
  const rows = await svc.run(
    `MATCH (n:MemoryClaim {project_root:$t}) WHERE n.finding_id IS NOT NULL
     RETURN n.finding_id AS fid, n.status AS status, n.confidence AS conf, n.observation AS obs ORDER BY n.finding_id`,
    { t: caseId },
  );
  if (!rows.length) { console.log('(no findings in ' + caseId + ')'); return; }
  for (const r of rows) console.log(`${r.fid}  [${r.status}/${r.conf}]  ${String(r.obs).slice(0, 80)}`);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  // capture writes local trusted-execution files only and does not touch Neo4j; DB commands below still guard the isolated graph.
  if (cmd === 'capture') { await captureExecution(); process.exit(0); }
  guardIsolated();
  const svc = new Neo4jService();
  try {
    if (cmd === 'record-finding') await recordFinding(svc);
    else if (cmd === 'refute') await refute(svc, args.find((a) => !a.startsWith('--')), args.filter((a) => !a.startsWith('--')).slice(1).join(' '));
    else if (cmd === 'trace') await trace(svc, args.find((a) => !a.startsWith('--')), { rerun: args.includes('--rerun') });
    else if (cmd === 'list') await list(svc, args[0]);
    else die('unknown command: ' + (cmd ?? '<none>') + ' (capture|record-finding|refute|trace|list)');
  } finally {
    try { await svc.close?.(); } catch {}
  }
  process.exit(0);
}
main().catch((e) => { console.error('[csift] ERROR', e?.message || e); process.exit(1); });
