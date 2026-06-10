#!/usr/bin/env node
/**
 * export_execution_log.mjs — emit the Agent Execution Log for a case (FIND EVIL! deliverable).
 *
 * Produces a timestamped, ordered event stream straight from the audit substrate so a judge can
 * trace ANY finding back to the specific tool execution + Council verdict + Receipt that produced it.
 *
 *   node eval/export_execution_log.mjs <case>
 *   → execution-logs/<case>.jsonl   (one event per line)
 *   → execution-logs/<case>.md      (human-readable)
 *
 * Env: NEO4J_URI/USER/PASSWORD (isolated 7690 graph).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Neo4jService } from '../claw-memory-core/dist/storage/neo4j/neo4j.service.js';
import { guardIsolatedUri, assertSafeId } from '../safety.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const die = (m) => { console.error(m); process.exit(1); };
const caseId = process.argv[2];
if (!caseId) die('usage: node eval/export_execution_log.mjs <case>');
guardIsolatedUri(process.env.NEO4J_URI, die);
assertSafeId(caseId, die, 'case id');  // flows into the output filename

const svc = new Neo4jService();
const rows = await svc.run(
  `MATCH (n:MemoryClaim {project_root:$t}) WHERE n.finding_id IS NOT NULL
   OPTIONAL MATCH (n)-[:DERIVED_FROM]->(te:ToolExecution)
   OPTIONAL MATCH (r:CouncilReceipt)-[:CERTIFIES]->(n)
   RETURN n.finding_id AS fid, n.created_at AS created_at, n.status AS status,
          n.observation AS observation, n.confidence AS confidence,
          n.evidence_artifact AS artifact, n.evidence_locator AS locator, n.evidence_tool AS tool,
          n.evidence_command AS command, n.evidence_output_sha256 AS output_sha256, n.content_sha256 AS csha,
          te.ranAt AS ran_at, n.markedWrongAt AS marked_wrong_at, n.markedWrongReason AS marked_wrong_reason,
          r.created_at AS receipt_at, r.receipt_sha256 AS receipt_sha256
   ORDER BY n.created_at`,
  { t: caseId },
);

const events = [];
for (const r of rows) {
  events.push({ ts: r.created_at, event: 'finding_deposited', actor: 'agent:analyst', finding_id: r.fid,
    status: 'DRAFT', confidence: r.confidence, observation: r.observation, content_sha256: r.csha });
  events.push({ ts: r.ran_at || r.created_at, event: 'tool_executed', actor: 'agent:analyst', finding_id: r.fid,
    tool: r.tool, command: r.command, artifact: r.artifact, locator: r.locator, output_sha256: r.output_sha256 });
  if (r.marked_wrong_at) {
    events.push({ ts: r.marked_wrong_at, event: 'council_refuted', actor: 'seat:citation→seat:synthesis',
      finding_id: r.fid, disposition: 'BOUNCE_FOR_CORRECTION', reason: r.marked_wrong_reason });
  }
  if (r.receipt_at) {
    events.push({ ts: r.receipt_at, event: 'council_verified', actor: 'seat:synthesis', finding_id: r.fid,
      disposition: 'COUNCIL_VERIFIED', receipt_sha256: r.receipt_sha256 });
  }
}
events.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

mkdirSync(resolve(__dir, '..', 'execution-logs'), { recursive: true });
const jsonl = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
writeFileSync(resolve(__dir, '..', 'execution-logs', `${caseId}.jsonl`), jsonl);

const md = `# Agent Execution Log — case ${caseId}

Ordered, timestamped event stream from the Council-SIFT audit substrate. Every finding traces to the
tool execution (with output hash), the Council verdict, and (if verified) the Council Receipt.

| ts | event | actor | finding | detail |
|---|---|---|---|---|
${events.map((e) => {
  const detail = e.event === 'tool_executed' ? `\`${e.command}\` → output_sha256 ${String(e.output_sha256).slice(0, 12)}…`
    : e.event === 'council_refuted' ? e.reason
    : e.event === 'council_verified' ? `receipt ${String(e.receipt_sha256).slice(0, 12)}…`
    : `${e.confidence} — ${String(e.observation).slice(0, 60)}`;
  return `| ${e.ts} | ${e.event} | ${e.actor} | ${e.finding_id} | ${detail} |`;
}).join('\n')}
`;
writeFileSync(resolve(__dir, '..', 'execution-logs', `${caseId}.md`), md);

try { await svc.close?.(); } catch {}
console.log(`wrote execution-logs/${caseId}.jsonl (${events.length} events) + ${caseId}.md`);
process.exit(0);
