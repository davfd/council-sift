// m015-nodeid-range-indexes-2026-05-29.cypher
// F1 compound-index-regression fix (iter9 Tier 9.3 Stage 5 Raphael hardening)
//
// Root cause (Uriel Stage 4 F1):
//   m013 replaced single-property constraints {MemoryClaim,SummaryMemory,InferredMemory}_nodeid_unique
//   with compound (nodeId, project_root) constraints. m014 did the same for VerificationRecord.
//   Single-property uniqueness constraints served DUAL purpose: uniqueness enforcement AND index
//   backing for O(1) single-key MATCH. Compound constraints only index the full (nodeId, project_root)
//   tuple — a single-key MATCH (n:MemoryClaim {nodeId: 'X'}) falls to NodeByLabelScan O(1,745+).
//
// Fix: Add RANGE indexes on (n.nodeId) for all 4 affected labels.
//   Uniqueness remains enforced by compound constraint (m013/m014 untouched).
//   Single-key labeled MATCH → NodeIndexSeek O(1). No code changes required.
//
// Affected hot paths fixed by this migration:
//   ingest-bulk.ts:62          — MERGE (n:MemoryClaim { nodeId: $nodeId })
//   supersession-manager.ts:146 — MERGE (n:SummaryMemory {nodeId: $nodeId})
//   supersession-manager.ts:167 — MERGE (n:InferredMemory {nodeId: $nodeId})
//   supersession-manager.ts:191 — MERGE (n:MemoryClaim {nodeId: $nodeId})
//
// Unlabeled MATCH sites (NOT fixed here — iter10 P1-3 code-side hardening):
//   supersession-manager.ts:100 — MATCH (n {nodeId: $nodeId}) LIMIT 1
//   promote-orchestrator.ts:330 — MATCH (tgt {nodeId: $targetNodeId})
//   promote-orchestrator.ts:368 — MATCH (target {nodeId: $targetNodeId})
//
// Smoke gate (Raphael-runnable):
//   SHOW INDEXES WHERE name IN [
//     'memory_claim_nodeid_idx', 'summary_memory_nodeid_idx',
//     'inferred_memory_nodeid_idx', 'verification_record_nodeid_idx'
//   ]
//   → 4 rows; state='ONLINE' for each before declaring done (wait for POPULATING → ONLINE).
//
// Post-deploy supplemental (operator-runnable):
//   Browser EXPLAIN at localhost:7474 — MATCH (n:MemoryClaim {nodeId: 'X'})
//   → confirms NodeIndexSeek(memory_claim_nodeid_idx) not NodeByLabelScan.
//
// authorized_by: iter9 Tier 9.3 Raphael Stage 5 hardening (F1); Uriel HARDENING_REQUIRED
// Applied: 2026-05-29

CREATE INDEX memory_claim_nodeid_idx IF NOT EXISTS FOR (n:MemoryClaim) ON (n.nodeId);
CREATE INDEX summary_memory_nodeid_idx IF NOT EXISTS FOR (n:SummaryMemory) ON (n.nodeId);
CREATE INDEX inferred_memory_nodeid_idx IF NOT EXISTS FOR (n:InferredMemory) ON (n.nodeId);
CREATE INDEX verification_record_nodeid_idx IF NOT EXISTS FOR (n:VerificationRecord) ON (n.nodeId);
