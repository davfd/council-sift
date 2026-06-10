// m016-zero-constraint-nodeid-uniqueness-2026-05-29.cypher
// F5 zero-constraint uniqueness fix (iter9 Tier 9.3 Stage 5 Raphael hardening)
//
// Root cause (Uriel Stage 4 Check 9 / I8):
//   SHOW CONSTRAINTS confirmed 3 node types with ZERO constraints of any kind:
//     SupersessionAudit — CREATE in supersession-manager.ts (randomUUID nodeId)
//     RetrievalAudit    — CREATE in retrieve.ts:306 (randomUUID at :284)
//     DecayAuditLog     — CREATE in d3-3-decay.ts:483 (randomUUID)
//   All 3 use randomUUID() → collision practically impossible in production.
//   But zero DB-level rejection means duplicate nodeIds are silently accepted.
//   The governance layer should enforce what the application already assumes.
//
// Fix: Add single-key uniqueness constraints on nodeId (uniqueness-first step per Uriel §I8).
//   Two-step pattern: (1) this migration — uniqueness on nodeId; (2) iter10 P2-7 — compound
//   (nodeId, project_root) when multi-tenant deployment gate is reached.
//   Compound NOT added here — SA/RA/DAL are audit logs, lower cross-tenant risk, consistent
//   with I1 + I3 deployment-trigger gating.
//
// Smoke gate (Raphael-runnable):
//   SHOW CONSTRAINTS WHERE name IN [
//     'supersession_audit_nodeid_unique',
//     'retrieval_audit_nodeid_unique',
//     'decay_audit_log_nodeid_unique'
//   ]
//   → 3 rows.
//
// authorized_by: iter9 Tier 9.3 operator scope addition F5 (2026-05-29)
//   "no auto-defer without explicit operator authorization" principle
// Applied: 2026-05-29

CREATE CONSTRAINT supersession_audit_nodeid_unique IF NOT EXISTS
  FOR (n:SupersessionAudit) REQUIRE n.nodeId IS UNIQUE;

CREATE CONSTRAINT retrieval_audit_nodeid_unique IF NOT EXISTS
  FOR (n:RetrievalAudit) REQUIRE n.nodeId IS UNIQUE;

CREATE CONSTRAINT decay_audit_log_nodeid_unique IF NOT EXISTS
  FOR (n:DecayAuditLog) REQUIRE n.nodeId IS UNIQUE;
