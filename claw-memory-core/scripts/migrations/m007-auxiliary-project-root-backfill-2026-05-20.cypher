// m007-auxiliary-project-root-backfill-2026-05-20.cypher
// R71 5/5 council Q2 RATIFIED 2026-05-20: Item 27 class-fix backfill for auxiliary
// node project_root (mirrors Item 2 ConflictRecord fix at commit 5a6db4e0).
//
// Class bug context: 821 auxiliary nodes had NULL project_root across 5 types,
// making them vulnerable to setDifferenceTeardown (tests/_test-helpers.ts:130-137)
// and entryTimeCleanup (tests/_test-helpers.ts:96-110) DETACH-DELETE. Items 2 + 17
// were specific instances of this class bug. R48 baseline DoctrineAnchor was wiped
// by entryTimeCleanup (DA in label list at line 100). Write-path fix lands in Batch 1B
// commits; this migration backfills 821 existing nodes deriving project_root from
// connected MemoryClaim via deterministic edge traversal.
//
// Idempotent — re-running on already-tagged nodes is a no-op (filtered via project_root IS NULL).
// Scope-bounded — touches only the 5 auxiliary types; MemoryClaim already has project_root.
// No DELETE/REMOVE — pure SET operation.
//
// Pre-fix forensic (cypher-shell 2026-05-20):
//   RawEvent: 507 NULL / 507 total
//   Session:  234 NULL / 234 total
//   SupersessionAudit: 71 NULL / 71 total
//   Scope:    7   NULL / 7   total
//   DecayAuditLog: 2 NULL / 2 total
//   = 821 NULL across 5 types
//   DoctrineAnchor: 0 (write-path fix only; no backfill needed)
//   ConflictRecord: 0 (Item 2 fixed; no existing CRs to backfill)
//
// Derivation paths per a reviewer R71 + a reviewer R71 advisories:
//   RawEvent          ← (MC)-[:DERIVED_FROM]->(RE)
//   SupersessionAudit ← (MC)-[:SUPERSEDES*0..1]-(any) WHERE n.newVersionNodeId = MC.nodeId
//   DecayAuditLog     ← target n.targetNodeId → MC.nodeId
//   Session           ← (MC)-[:OBSERVED_IN]->(Session); pick any connected MC (single-tenant assumption)
//   Scope             ← workspace literal '<legacy-workspace>' (single production scope)

// ── Step 1: RawEvent backfill via DERIVED_FROM ────────────────────────────────
MATCH (re:RawEvent)
WHERE re.project_root IS NULL
OPTIONAL MATCH (mc:MemoryClaim)-[:DERIVED_FROM]->(re)
WITH re, mc.project_root AS pr
WHERE pr IS NOT NULL
SET re.project_root = pr
RETURN 'RawEvent' AS label, count(*) AS backfilled;

// ── Step 2: SupersessionAudit backfill via property join ──────────────────────
MATCH (sa:SupersessionAudit)
WHERE sa.project_root IS NULL
OPTIONAL MATCH (mc:MemoryClaim) WHERE mc.nodeId = sa.newVersionNodeId
WITH sa, mc.project_root AS pr
WHERE pr IS NOT NULL
SET sa.project_root = pr
RETURN 'SupersessionAudit' AS label, count(*) AS backfilled;

// ── Step 3: DecayAuditLog backfill via property join ──────────────────────────
MATCH (dal:DecayAuditLog)
WHERE dal.project_root IS NULL
OPTIONAL MATCH (mc:MemoryClaim) WHERE mc.nodeId = dal.targetNodeId
WITH dal, mc.project_root AS pr
WHERE pr IS NOT NULL
SET dal.project_root = pr
RETURN 'DecayAuditLog' AS label, count(*) AS backfilled;

// ── Step 4: Session backfill via OBSERVED_IN (pick any connected MC) ──────────
MATCH (s:Session)
WHERE s.project_root IS NULL
OPTIONAL MATCH (mc:MemoryClaim)-[:OBSERVED_IN]->(s)
WITH s, mc.project_root AS pr
WHERE pr IS NOT NULL
SET s.project_root = pr
RETURN 'Session' AS label, count(*) AS backfilled;

// ── Step 5: Scope backfill — workspace literal for production scopes ──────────
// Per a reviewer R71: "no MC ancestor at create time; workspace-path literal is the correct
// value for the single production Scope." Apply to all NULL-tagged Scopes.
MATCH (sc:Scope)
WHERE sc.project_root IS NULL
SET sc.project_root = '<legacy-workspace>'
RETURN 'Scope' AS label, count(*) AS backfilled;

// ── Final coverage report ─────────────────────────────────────────────────────
MATCH (n)
WHERE labels(n)[0] IN ['RawEvent', 'Session', 'SupersessionAudit', 'Scope', 'DecayAuditLog', 'DoctrineAnchor']
WITH labels(n)[0] AS lbl,
     count(*) AS total,
     count(CASE WHEN n.project_root IS NULL THEN 1 END) AS null_pr
RETURN lbl, total, null_pr
ORDER BY lbl;
