// m018-scope-dedup-cf-a-2026-05-30.cypher
// CF-A: Scope deduplication
//
// Brother-instance pre-fix data debt from R1 era (before Item-28 scope-resolver fix).
// Two :Scope nodes exist with scopeName="scope-council-deliberations-may-2026":
//   - canonical literal nodeId="scope-council-deliberations-may-2026" (G10 bootstrap)
//   - spurious uuidv5 nodeId="9592f0c5-981a-5674-8586-6892f4aeff8c"
// Re-points all 91 IN_SCOPE edges to canonical, then deletes spurious node.
//
// scope-resolver.ts (post-Item-28) is correct (MERGE by scopeName); after this
// migration runs, all future writes go to canonical. No code change needed.
//
// authorized_by: internal-review 2026-05-30 (operator op 3 + reviewer recommendation a)
//                Empirical: reviewer R6 measured edge count 32 (R4) -> 91 (R6) — actively accumulating.

MATCH (canonical:Scope {nodeId: "scope-council-deliberations-may-2026"})
MATCH (source)-[r:IN_SCOPE]->(spurious:Scope {nodeId: "9592f0c5-981a-5674-8586-6892f4aeff8c"})
MERGE (source)-[:IN_SCOPE]->(canonical)
DELETE r;

MATCH (spurious:Scope {nodeId: "9592f0c5-981a-5674-8586-6892f4aeff8c"})
DELETE spurious;
