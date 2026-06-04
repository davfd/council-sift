// m014-vr-compound-nodeid-tenant-constraint-2026-05-29.cypher
// R-iter9-tier9.3-merge-tenancy 4/5 PROMOTE 2026-05-29 (forced convergence):
//   Q2 VerificationRecord vote: 4/5 BUG → promote compound constraint
//     - a reviewer: F-R76-2 ON MATCH SET coalesce preserves first tenant's project_root permanently;
//       VERIFIES edge MATCH unscoped → Cartesian to all tenants' MCs after deb611cb
//     - a reviewer: graph-structural corruption of governance layer; one VR certifies multiple
//       per-tenant MCs simultaneously
//     - a reviewer: decisive — "No F5-equivalent gate on G8"; VR contamination is governance-direct,
//       not just provenance; promote-orchestrator.ts:330,368 unscoped MATCH returns multiple rows
//     - a reviewer: REVERSED prior position; coalesce("tenant-A", "tenant-B") trace decisive
//   Q2 KEEP camp: a reviewer (governance-singleton model; verifierId='system-cross-session-ratification'
//     has global scope; verificationState on MC unscoped applies to all copies correctly)
//
// Migration: drop single-property, replace with compound (nodeId, project_root).
//   F-R76-2 (R-spec-axes 5/5 2026-05-22) added project_root to VR on CREATE for setDifferenceTeardown
//   survival; deb611cb compound MC constraint enabled the VR collision path by allowing same MC
//   nodeId in two project_roots; this migration extends the same fix to VR.
//
// Data safety: single-property strictly stronger than compound. Existing nodes preserved.
//   Live VR count pre-migration: 218 active, all in 1 tenant — no collisions possible.
//
// Pre-check (must return 0):
//   MATCH (n:VerificationRecord) WITH n.nodeId AS nid, count(*) AS cnt WHERE cnt > 1 RETURN nid, cnt LIMIT 5;
//
// Migration sequence:

DROP CONSTRAINT verification_record_nodeid_unique;

CREATE CONSTRAINT verification_record_nodeid_tenant_unique
  FOR (n:VerificationRecord) REQUIRE (n.nodeId, n.project_root) IS UNIQUE;

// Post-migration verification (expect 1 row, properties=["nodeId","project_root"]):
//   SHOW CONSTRAINTS WHERE labelsOrTypes = ['VerificationRecord'];
//
// Applied: 2026-05-29 (operator operator-authorized via R-merge-tenancy ratification)
//
// CF-merge-tenancy-RawEvent: Q1 RawEvent vote was 3/5 PROMOTE vs 2/5 KEEP — UNDER ≥4/5 binding.
// Routed to operator decision OR additional round; F5 admit-list currently gates production
// contamination paths for RawEvent (a reviewer), but R71 inscription per a reviewer/a reviewer/a reviewer
// states "tenant boundary for auxiliary nodes." Carried forward to iter10 or pending operator
// disposition.
//
// Code-side hardening (DEFERRED — Q4 R-fix-audit secondary latent sites):
//   promote-orchestrator.ts:330,368 unscoped MATCH (target {nodeId: $targetNodeId})
//   → should be scoped: MATCH (target {nodeId: $targetNodeId, project_root: $project_root})
//   This migration prevents the collision; the unscoped MATCH still produces VERIFIES edges to
//   multiple tenants' MCs if same MC nodeId exists (which compound MC constraint now permits).
//   Recommend follow-on iter10 hardening to scope these MATCHes.
