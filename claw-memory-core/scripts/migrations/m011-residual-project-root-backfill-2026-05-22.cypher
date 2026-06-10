// m011-residual-project-root-backfill-2026-05-22.cypher
// R-spec-axes + Tier B class-sweep follow-up (2026-05-22): m007 (Item 27 R71)
// covered 821 nodes but missed write paths that produced post-backfill NULL
// project_root. Tier B audit identified the residual:
//   - SupersessionAudit: 63 NULL (point-in-time.ts:252 writeSupersedesEdge — fixed in same commit)
//   - RawEvent: 46 NULL (legacy pre-m007 not caught by backfill selector)
//   - Session: 2 NULL (legacy pre-m007)
//   - RetrievalAudit: 1 NULL (retrieve.ts:287 — fixed in same commit)
//   - VerificationRecord: 0 currently (F-R76-2 promote-orchestrator.ts:317 write-path
//     fix lands in same commit; no nodes to backfill)
//
// Write-path fixes (this commit):
//   point-in-time.ts:252 — SupersessionAudit CREATE adds project_root from target tgt
//   retrieve.ts:287 — RetrievalAudit CREATE adds project_root from query.scope
//   promote-orchestrator.ts:317 — VR MERGE adds project_root from target (F-R76-2)
//   session-resolver.ts:138 — defensive coalesce on attributeSession MATCH branch
//
// Idempotent — re-running on already-tagged nodes is no-op (filtered via IS NULL).
// Scope-bounded — touches only the 4 auxiliary types.
//
// authorized_by: R-spec-axes 5/5 council ratification 2026-05-22 + operator "fix and wired for good" mandate

// ── SupersessionAudit: derive from newVersionNodeId target MemoryClaim ───────
MATCH (sa:SupersessionAudit)
WHERE sa.project_root IS NULL
  AND sa.newVersionNodeId IS NOT NULL
MATCH (mc:MemoryClaim {nodeId: sa.newVersionNodeId})
WHERE mc.project_root IS NOT NULL
SET sa.project_root = mc.project_root
RETURN count(sa) AS supersessionAuditBackfilled;

// Fallback: SA where target MC is no longer present — derive from priorVersionNodeId
MATCH (sa:SupersessionAudit)
WHERE sa.project_root IS NULL
  AND sa.priorVersionNodeId IS NOT NULL
MATCH (mc:MemoryClaim {nodeId: sa.priorVersionNodeId})
WHERE mc.project_root IS NOT NULL
SET sa.project_root = mc.project_root
RETURN count(sa) AS supersessionAuditFallbackBackfilled;

// ── RawEvent: derive from DERIVED_FROM-connected MemoryClaim ──────────────────
MATCH (mc:MemoryClaim)-[:DERIVED_FROM]->(re:RawEvent)
WHERE re.project_root IS NULL
  AND mc.project_root IS NOT NULL
WITH re, head(collect(DISTINCT mc.project_root)) AS pr
SET re.project_root = pr
RETURN count(re) AS rawEventBackfilled;

// ── Session: legacy nodes — bind to workspace tenant ──────────────────────────
// 2 NULL legacy Sessions predate Item 27. Bind to canonical workspace project_root
// since these Sessions are operator-historical (no clean MC derivation path).
MATCH (s:Session)
WHERE s.project_root IS NULL
SET s.project_root = '<legacy-workspace>'
RETURN count(s) AS sessionBackfilled;

// ── RetrievalAudit: legacy — bind to workspace tenant ─────────────────────────
MATCH (ra:RetrievalAudit)
WHERE ra.project_root IS NULL
SET ra.project_root = '<legacy-workspace>'
RETURN count(ra) AS retrievalAuditBackfilled;

// ── Forensic post-migration: confirm zero remaining auxiliary NULL ────────────
MATCH (n)
WHERE n.project_root IS NULL
  AND (n:SupersessionAudit OR n:RawEvent OR n:Session OR n:RetrievalAudit OR n:VerificationRecord)
RETURN labels(n) AS label, count(n) AS remainingNullCount;
