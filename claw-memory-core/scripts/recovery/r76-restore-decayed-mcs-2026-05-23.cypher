// r76-restore-decayed-mcs-2026-05-23.cypher
// F-R76-1 recovery — Jonathan operator-authorized 2026-05-22 + 2026-05-23.
//
// Context: R76 council audit surfaced that the R-spec-6 Phase 3 confidence-decay
// test suite ran applyConfidenceDecay() against the shared Neo4j instance without
// a tenant filter (test beforeAll set CLAW_DECAY_CONFIDENCE_ENABLED=true). The
// per-vitest-run ORDER BY n.lastDecayTime IS NULL DESC selected production MCs
// alongside test fixtures, accumulating ~80 production MCs with confidence_score
// permanently shifted below classifier write-time values.
//
// Recovery posture: R-spec-6 R6-O6 lazy-init coalesce preserved original_confidence_score
// on first decay pass for every affected MC. This script restores confidence_score
// from that preserved origin value AND writes an 'operator.override' DecayAuditLog
// entry per restored node so the audit chain documents: classifier → test-decayed
// → operator-restored.
//
// Write-path fix: Commit B adds optional tenantFilter parameter to applyConfidenceDecay
// and threads it through runDecayCron. Tests now pass TEST_TENANT; production cron
// retains corpus-wide behavior. This recovery is one-shot — future test runs cannot
// repeat the mutation.
//
// Idempotent — only restores nodes where original_confidence_score differs from
// current confidence_score. Re-running on already-restored corpus is no-op.
//
// authorized_by: Jonathan operator "shit up, running, wired and fixed" 2026-05-22
//   + Commit A (4d3fd8d2) + Commit B F-R76-1 tenantFilter ratified by R-spec-axes 5/5

// ── Pre-recovery forensic ──────────────────────────────────────────────────────
MATCH (n:MemoryClaim)
WHERE n.original_confidence_score IS NOT NULL
  AND n.original_confidence_score <> n.confidence_score
RETURN count(n) AS preRecoveryAffected,
       min(n.original_confidence_score - n.confidence_score) AS minDelta,
       max(n.original_confidence_score - n.confidence_score) AS maxDelta,
       avg(n.original_confidence_score - n.confidence_score) AS avgDelta;

// ── Step 1: write operator.override DecayAuditLog entries for audit trail ─────
MATCH (n:MemoryClaim)
WHERE n.original_confidence_score IS NOT NULL
  AND n.original_confidence_score <> n.confidence_score
CREATE (log:DecayAuditLog {
  nodeId: 'audit-recovery-' + n.nodeId + '-' + toString(datetime()),
  targetNodeId: n.nodeId,
  priorState: 'active',
  newState: 'active',
  transitionTime: toString(datetime()),
  triggeredBy: 'operator.override',
  project_root: n.project_root,
  confidence_before: n.confidence_score,
  confidence_after: n.original_confidence_score,
  decay_amount: n.confidence_score - n.original_confidence_score,
  decay_curve_version: 'activity-weighted-hybrid-v1'
})
RETURN count(log) AS auditLogsWritten;

// ── Step 2: restore confidence_score to classifier-origin value ───────────────
MATCH (n:MemoryClaim)
WHERE n.original_confidence_score IS NOT NULL
  AND n.original_confidence_score <> n.confidence_score
SET n.confidence_score = n.original_confidence_score,
    n.confidence_overridden = true,
    n.confidence_overridden_by = 'system:r76-recovery-2026-05-23',
    n.confidence_overridden_at = toString(datetime()),
    n.lastDecayTriggeredBy = 'operator.override'
RETURN count(n) AS restoredCount;

// ── Post-recovery forensic: zero remaining mismatches ─────────────────────────
MATCH (n:MemoryClaim)
WHERE n.original_confidence_score IS NOT NULL
  AND n.original_confidence_score <> n.confidence_score
RETURN count(n) AS postRecoveryAffected;
