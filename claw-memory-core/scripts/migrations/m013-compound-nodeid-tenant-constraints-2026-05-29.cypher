// m013-compound-nodeid-tenant-constraints-2026-05-29.cypher
// R-iter9-tier9.3-nodeid-collision 5/5 council 2026-05-29:
//   Q1 5/5 VERIFIED: nodeId = UUIDv5({source, eventTime, rawContent}) — no tenant in hash (nodeid.ts:47-58 + AD7)
//   Q2 5/5 VERIFIED: single-property constraints `{label}_nodeid_unique` enforce GLOBAL uniqueness per label
//   Q3 5/5 VERIFIED: bare CREATE at remember.ts:358; ConstraintValidationFailed propagates to MCP caller
//   Q4 5/5 verified architectural gap (NOT bench-only): same content + same created_at_override +
//     same source_identity across different project_roots produces identical nodeId → second CREATE
//     hits global constraint → silent ingest loss (bench catch{}) or propagated error (production retro-ingest).
//
// Fix B (5/5 endorsed; all 5 reject hash-input change per AD7):
//   Drop 3 single-property constraints; replace with compound (nodeId, project_root) constraints.
//   Multi-tenant safety: identical nodeId in different project_roots is now permitted.
//   nodeId stability preserved (AD7 invariant intact).
//
// Data safety: single-property constraint is strictly stronger than compound.
//   All existing nodes trivially satisfy the new weaker compound form.
//   No data migration or backfill required.
//
// Pre-migration constraint state (cypher-shell SHOW CONSTRAINTS 2026-05-29):
//   memory_claim_nodeid_unique     NODE_PROPERTY_UNIQUENESS  ["MemoryClaim"]    ["nodeId"]
//   summary_memory_nodeid_unique   NODE_PROPERTY_UNIQUENESS  ["SummaryMemory"]  ["nodeId"]
//   inferred_memory_nodeid_unique  NODE_PROPERTY_UNIQUENESS  ["InferredMemory"] ["nodeId"]
//
// Post-migration:
//   memory_claim_nodeid_tenant_unique     NODE_PROPERTY_UNIQUENESS  ["MemoryClaim"]    ["nodeId", "project_root"]
//   summary_memory_nodeid_tenant_unique   NODE_PROPERTY_UNIQUENESS  ["SummaryMemory"]  ["nodeId", "project_root"]
//   inferred_memory_nodeid_tenant_unique  NODE_PROPERTY_UNIQUENESS  ["InferredMemory"] ["nodeId", "project_root"]
//
// Pre-check (must return 0 rows; existing graph has no duplicates per pre-migration single-property constraint):
//   MATCH (n) WHERE n:MemoryClaim OR n:SummaryMemory OR n:InferredMemory
//   WITH labels(n)[0] AS lbl, n.nodeId AS nid, count(*) AS cnt
//   WHERE cnt > 1
//   RETURN lbl, nid, cnt LIMIT 5;
//
// Migration sequence:

DROP CONSTRAINT memory_claim_nodeid_unique;
DROP CONSTRAINT summary_memory_nodeid_unique;
DROP CONSTRAINT inferred_memory_nodeid_unique;

CREATE CONSTRAINT memory_claim_nodeid_tenant_unique
  FOR (n:MemoryClaim) REQUIRE (n.nodeId, n.project_root) IS UNIQUE;

CREATE CONSTRAINT summary_memory_nodeid_tenant_unique
  FOR (n:SummaryMemory) REQUIRE (n.nodeId, n.project_root) IS UNIQUE;

CREATE CONSTRAINT inferred_memory_nodeid_tenant_unique
  FOR (n:InferredMemory) REQUIRE (n.nodeId, n.project_root) IS UNIQUE;

// Post-migration verification:
//   SHOW CONSTRAINTS WHERE labelsOrTypes IN [['MemoryClaim'],['SummaryMemory'],['InferredMemory']];
//   Expected: 3 rows, properties = ["nodeId", "project_root"] each.
//
// Applied: 2026-05-29 (operator operator-authorized; council R-nodeid-collision 5/5)
// Live graph state confirmed post-migration: 3 compound constraints active, all 3 single-property dropped.
