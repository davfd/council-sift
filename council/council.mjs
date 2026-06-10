#!/usr/bin/env node
/**
 * council.mjs — Council-SIFT verification loop (host-side → isolated claw-memory-core @ 7690).
 *
 * Dispatches a DRAFT finding to forensic verifier seats that try to REFUTE it against the
 * actual evidence, BEFORE any human sees it. Surviving findings get a hash-chained Council
 * Receipt; refuted findings are bounced (analyst self-corrects, no human).
 *
 *   review <finding_id>     run the seats; verify → emit Receipt, or refute → bounce for self-correction
 *   receipt <finding_id>    print the stored Council Receipt
 *
 * MVP seats (deterministic verification primitives; OpenClaw/LLM narration layers on top):
 *   Citation      — every evidence token the claim CITES (IPs, PIDs, paths, hashes) must actually
 *                   appear in the tool output. A cited-but-absent token = hallucination → REFUTE.
 *   Synthesis     — aggregate seat verdicts → disposition (COUNCIL_VERIFIED | BOUNCE_FOR_CORRECTION).
 *
 * Env: NEO4J_URI/USER/PASSWORD (isolated 7690 graph).
 */
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Neo4jService } from '../claw-memory-core/dist/storage/neo4j/neo4j.service.js';
import { handleMarkWrong } from '../claw-memory-core/dist/handlers/mark-wrong.js';
import { runSeats } from './seats.mjs';
import { llmSkepticPanel } from './llm_skeptic.mjs';
import { writeReceiptFiles } from './receipt_store.mjs';
import { guardIsolatedUri, assertSafeId } from '../safety.mjs';

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const die = (m) => { console.error('[council] ' + m); process.exit(1); };
const __dir = dirname(fileURLToPath(import.meta.url));
const RECEIPTS_DIR = resolve(__dir, 'receipts');

function guardIsolated() { guardIsolatedUri(process.env.NEO4J_URI, die); }

async function loadFinding(svc, id) {
  const rows = await svc.run(
    `MATCH (n:MemoryClaim) WHERE n.nodeId=$id OR n.finding_id=$id
     OPTIONAL MATCH (n)-[:DERIVED_FROM]->(te:ToolExecution)
     RETURN n.finding_id AS fid, n.nodeId AS nodeId, n.project_root AS case, n.status AS status,
            n.observation AS observation, n.interpretation AS interpretation, n.confidence AS confidence,
            n.cited_tokens AS cited_tokens, n.content_sha256 AS csha, n.evidence_artifact AS artifact,
            n.evidence_locator AS evidence_locator, n.evidence_tool AS tool, n.evidence_command AS command,
            n.evidence_output_sha256 AS output_sha256, n.provenance_tier AS provenance_tier,
            n.evidence_execution_id AS execution_id, n.evidence_execution_record_sha256 AS execution_record_sha256,
            n.evidence_excerpt AS evidence_excerpt, n.evidence_excerpt_sha256 AS evidence_excerpt_sha256,
            te.output AS output LIMIT 1`,
    { id },
  );
  if (!rows.length) die('finding not found: ' + id);
  const f = rows[0];
  if (typeof f.evidence_excerpt === 'string') {
    try { f.evidence_excerpt = JSON.parse(f.evidence_excerpt); } catch { f.evidence_excerpt = null; }
  }
  return f;
}

async function prevReceiptSha(svc, caseId) {
  const rows = await svc.run(
    `MATCH (r:CouncilReceipt {project_root:$t}) RETURN r.receipt_sha256 AS s ORDER BY r.created_at DESC LIMIT 1`,
    { t: caseId },
  );
  return rows[0]?.s ?? 'GENESIS';
}

async function review(svc, id) {
  const f = await loadFinding(svc, id);
  const { seats, synth } = runSeats(f);                  // Citation + Tool-semantics + Contradiction + Inference + Scope → Synthesis
  const ts = new Date().toISOString();

  console.log(`\n── Council review: ${f.fid} (${f.case}) ──`);
  for (const s of seats) console.log(`  ${s.seat.padEnd(16)} ${s.verdict.padEnd(12)} ${s.reasoning}`);
  console.log(`  ${synth.seat.padEnd(16)} ${synth.verdict}`);

  if (synth.verdict === 'BOUNCE_FOR_CORRECTION') {
    const reason = seats.filter((s) => s.verdict !== 'SUPPORTED').map((s) => `[${s.seat}] ${s.reasoning}`).join(' ');
    await handleMarkWrong({ nodeId: f.nodeId, reason, tenant_id: f.case }, svc);
    await svc.run(`MATCH (n:MemoryClaim {nodeId:$id}) SET n.status='DISPUTED'`, { id: f.nodeId });
    console.log(`\n  ⮑ BOUNCED: ${f.fid} marked DISPUTED + ConflictRecord written. Analyst must self-correct.\n`);
    return { disposition: 'BOUNCE_FOR_CORRECTION', finding_id: f.fid, by: 'deterministic-floor' };
  }

  // ── Additive LLM skeptic layer (Option B) ─────────────────────────────────────────────────────
  // Reached ONLY after the deterministic floor PASSED — so the panel can only ADD a bounce, never
  // rescue a refuted finding. A bounce needs a >=2/3 independent-skeptic majority (the false-positive
  // guard). Gated by COUNCIL_LLM_SKEPTIC; abstains with no effect if no authenticated Claude Agent SDK.
  let skeptic = { ran: false, mode: 'disabled', refute: false, threshold: 2, votes: [], refuteCount: 0,
    summary: 'LLM skeptic layer disabled (set COUNCIL_LLM_SKEPTIC=1 to enable the additive panel).' };
  if (/^(1|true|on|yes)$/i.test(process.env.COUNCIL_LLM_SKEPTIC || '')) {
    skeptic = await llmSkepticPanel({
      finding_id: f.fid, observation: f.observation, interpretation: f.interpretation,
      evidence_tool: f.tool, evidence_locator: f.evidence_locator, cited_tokens: f.cited_tokens,
      evidence_excerpt: f.evidence_excerpt,
    });
    console.log(`  ${'seat:llm-panel'.padEnd(16)} ${(skeptic.refute ? 'REFUTE' : 'SUPPORTED').padEnd(12)} [${skeptic.mode}] ${skeptic.summary}`);
    if (skeptic.refute) {
      await handleMarkWrong({ nodeId: f.nodeId, reason: `[seat:llm-skeptic-majority] ${skeptic.summary}`, tenant_id: f.case }, svc);
      await svc.run(`MATCH (n:MemoryClaim {nodeId:$id}) SET n.status='DISPUTED'`, { id: f.nodeId });
      console.log(`\n  ⮑ BOUNCED by LLM skeptic majority (${skeptic.refuteCount}/${skeptic.votes.length} ≥ ${skeptic.threshold}): ${f.fid} → DISPUTED + ConflictRecord. Analyst must self-correct.\n`);
      return { disposition: 'BOUNCE_FOR_CORRECTION', finding_id: f.fid, by: 'llm-skeptic-majority', skeptic };
    }
  }

  // COUNCIL_VERIFIED → emit hash-chained Council Receipt
  const prev = await prevReceiptSha(svc, f.case);
  const receiptBody = {
    finding_id: f.fid, nodeId: f.nodeId, case: f.case,
    claim: { observation: f.observation, interpretation: f.interpretation, confidence: f.confidence, content_sha256: f.csha },
    evidence_pointer: { artifact: f.artifact, locator: f.evidence_locator, tool: f.tool, command: f.command, output_sha256: f.output_sha256 },
    trusted_execution: { provenance_tier: f.provenance_tier || null, execution_id: f.execution_id || null, execution_record_sha256: f.execution_record_sha256 || null, evidence_excerpt_sha256: f.evidence_excerpt_sha256 || null },
    evidence_excerpt: f.evidence_excerpt || null,
    seats: [...seats, synth].map((s) => ({ seat: s.seat, lens: s.lens, verdict: s.verdict, reasoning: s.reasoning, evidence_checked: s.evidence_checked ?? null })),
    llm_skeptic_panel: { ran: skeptic.ran, mode: skeptic.mode, threshold: skeptic.threshold, refuteCount: skeptic.refuteCount, refute: skeptic.refute, votes: skeptic.votes, summary: skeptic.summary },
    disposition: 'COUNCIL_VERIFIED', created_at: ts, prev_receipt_sha256: prev,
  };
  const receipt_sha256 = sha(JSON.stringify(receiptBody) + prev);
  const receipt = { ...receiptBody, receipt_sha256 };

  await svc.run(
    `MATCH (n:MemoryClaim {nodeId:$id}) SET n.status='COUNCIL_VERIFIED'
     MERGE (r:CouncilReceipt {receipt_sha256:$rs})
       ON CREATE SET r.finding_id=$fid, r.project_root=$t, r.created_at=$ts,
                     r.prev_receipt_sha256=$prev, r.body=$body
     MERGE (r)-[:CERTIFIES]->(n)`,
    { id: f.nodeId, rs: receipt_sha256, fid: f.fid, t: f.case, ts, prev, body: JSON.stringify(receipt) },
  );
  assertSafeId(f.fid, die, 'finding id');  // never let a finding_id escape the receipts dir
  const written = writeReceiptFiles(RECEIPTS_DIR, receipt);
  console.log(`\n  ✓ COUNCIL_VERIFIED — Receipt ${receipt_sha256.slice(0, 16)}… (chains to ${String(prev).slice(0, 12)}…)`);
  console.log(`    written: council/receipts/${written.file}\n`);
  return { disposition: 'COUNCIL_VERIFIED', finding_id: f.fid, receipt_sha256, receipt_file: written.file };
}

async function showReceipt(svc, id) {
  const rows = await svc.run(
    `MATCH (r:CouncilReceipt)-[:CERTIFIES]->(n:MemoryClaim) WHERE n.finding_id=$id OR n.nodeId=$id
     RETURN r.body AS body ORDER BY r.created_at DESC LIMIT 1`, { id },
  );
  if (!rows.length) die('no receipt for ' + id);
  console.log(rows[0].body);
}

async function main() {
  guardIsolated();
  const [cmd, ...args] = process.argv.slice(2);
  const svc = new Neo4jService();
  try {
    if (cmd === 'review') await review(svc, args[0]);
    else if (cmd === 'receipt') await showReceipt(svc, args[0]);
    else die('unknown command: ' + (cmd ?? '<none>') + ' (review|receipt)');
  } finally {
    try { await svc.close?.(); } catch {}
  }
  process.exit(0);
}
main().catch((e) => { console.error('[council] ERROR', e?.message || e); process.exit(1); });
