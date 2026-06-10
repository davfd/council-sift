// m009-scope-duplicate-cleanup-2026-05-20.cypher
// R73 F-BAR-3 cleanup (Item 28) — operator-greenlighted 2026-05-20.
//
// Pre-fix: scope-resolver.ts MERGE on nodeId (uuidv5-derived) created duplicate Scope nodes
// when an existing literal-nodeId Scope already carried the same scopeName. Item 19 (R71 5/5)
// merged the duplicate data once; F-BAR-3 (a reviewer R73) caught that the code path still
// recreated duplicates on every remember() call (data-merged-but-code-not-rewired pattern).
// Item 28 write-path fix lands in scope-resolver.ts + supersession-manager.ts — this migration
// cleans the duplicate node that accumulated during R72-R73 session activity.
//
// Cleanup targets (cypher-shell forensic confirmed at R73 by a reviewer F-BAR-3):
//   Canonical: nodeId='scope-council-deliberations-may-2026', 948 MC + 524 RE IN_SCOPE edges
//   Duplicate: nodeId='9592f0c5-981a-5674-8586-6892f4aeff8c', 0 MC + 9 RE IN_SCOPE edges
//
// Same scopeName ('scope-council-deliberations-may-2026') on both. Item 19 ratified G10 literal
// as the survivor. m009 moves the 9 RE IN_SCOPE edges to canonical and deletes duplicate.
//
// Idempotent — re-running on a clean graph is a no-op (no duplicate to match).
// Scope-bounded — touches only the F-BAR-3 duplicate; does not affect the canonical Scope.
// Atomic — single MERGE+DELETE block keeps edges + node deletion in one statement.

// ── Step 1: move 9 RawEvent IN_SCOPE edges from duplicate to canonical ────────
MATCH (re:RawEvent)-[oldEdge:IN_SCOPE]->(dup:Scope {nodeId: '9592f0c5-981a-5674-8586-6892f4aeff8c'})
MATCH (canon:Scope {nodeId: 'scope-council-deliberations-may-2026'})
MERGE (re)-[:IN_SCOPE]->(canon)
DELETE oldEdge
RETURN count(re) AS edges_moved;

// ── Step 2: DETACH DELETE the duplicate Scope node ────────────────────────────
MATCH (dup:Scope {nodeId: '9592f0c5-981a-5674-8586-6892f4aeff8c'})
DETACH DELETE dup
RETURN 'duplicate Scope deleted' AS status;

// ── Step 3: verification — confirm single canonical Scope remains ─────────────
MATCH (sc:Scope {scopeName: 'scope-council-deliberations-may-2026'})
RETURN
  count(sc) AS scope_count,
  collect(sc.nodeId)[0] AS canonical_nodeId,
  count{(sc)<-[:IN_SCOPE]-(:RawEvent)} AS rawevent_edges,
  count{(sc)<-[:IN_SCOPE]-(:MemoryClaim)} AS memoryclaim_edges;
