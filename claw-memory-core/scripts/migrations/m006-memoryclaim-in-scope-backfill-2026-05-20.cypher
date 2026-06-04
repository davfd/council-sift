// m006-memoryclaim-in-scope-backfill-2026-05-20.cypher
// R71 5/5 Q2 + R70 5/5 Item 16(a) RATIFIED 2026-05-20: MemoryClaim IN_SCOPE backfill.
//
// Pre-fix (R69 forensic): MATCH (m:MemoryClaim)-[:IN_SCOPE]->() RETURN count(m) → 0
// Cause: F5 path wrote IN_SCOPE on RawEvent only (remember.ts:404-411).
// §3 GRAPH_REFERENCE query pattern was structurally dead.
//
// Write-path fix lands in Batch 1E commit (remember.ts adds MC IN_SCOPE MERGE
// after the RawEvent IN_SCOPE wire). This migration backfills existing MCs.
//
// Targets the post-Item-19 unified G10 literal Scope (nodeId='scope-council-deliberations-may-2026').
// Scope merge happened 2026-05-20; this backfill runs AFTER Item 19 close.
//
// Idempotent — MERGE on (m)-[:IN_SCOPE]->(sc) is no-op if edge exists.
// Scope-bounded — only adds IN_SCOPE for MCs that don't already have it to the unified Scope.

MATCH (m:MemoryClaim)
WHERE NOT EXISTS { (m)-[:IN_SCOPE]->(:Scope {nodeId: 'scope-council-deliberations-may-2026'}) }
MATCH (sc:Scope {nodeId: 'scope-council-deliberations-may-2026'})
MERGE (m)-[:IN_SCOPE]->(sc)
RETURN count(m) AS backfilled;

// Coverage report after backfill
MATCH (m:MemoryClaim)
WITH count(m) AS total_mc,
     count{(m:MemoryClaim)-[:IN_SCOPE]->()} AS mc_with_in_scope
RETURN total_mc, mc_with_in_scope;
