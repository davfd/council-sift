// m012-verification-state-init-2026-05-22.cypher
// R-spec-axes 5/5 council ratification 2026-05-22: lifecycle/epistemic axis separation.
//
// Architectural context:
//   Pre-separation: lifecycleState packed two orthogonal axes — temporal
//     (active/superseded/archived/disputed) + epistemic (verified/unverified).
//     Temporal operations (supersede, decay-to-active) silently erased epistemic
//     state. a reviewer R71 surfaced the empirical incident: G8 fired on VR 92a746b7,
//     target df3e3643 became lifecycleState='verified', then supersede() overwrote
//     within 7 minutes losing the epistemic signal.
//
// This migration:
//   Initializes verificationState='unverified' on all MemoryClaim (+ SummaryMemory,
//   InferredMemory) nodes that lack the field. Trivially safe: pre-migration count
//   of lifecycleState='verified' MCs = 0 (post-supersession state); no epistemic
//   state is at risk of being lost in the transition.
//
//   Forensic pre-migration count (cypher-shell 2026-05-22):
//     MemoryClaim total: 1087 (active=972, superseded=93, archived=22)
//     MemoryClaim lifecycleState='verified': 0
//     Nodes with verificationState IS NOT NULL: 0
//
// Idempotent — re-running on already-tagged nodes is no-op (filtered via IS NULL).
// Scope-bounded per R-spec-axes F1 (a reviewer): MC + SM + IM only. VR/RawEvent/Scope/
// Session/DoctrineAnchor excluded — those types do not carry epistemic verification state.
//
// Write-path complement: promote-orchestrator.ts:447-448 now writes
//   SET n.verificationState = 'verified', n.verificationTime = $verificationTime
// instead of SET n.lifecycleState = 'verified' (which is structurally impossible
// under the new schema). All recall + decay paths updated to operate on
// verificationState as the epistemic axis (decoupled from lifecycleState temporal).
//
// authorized_by: R-spec-axes 5/5 council ratification 2026-05-22
//   (Q1 binding 5/5 + Q4 migration 5/5 + a reviewer F1 scope-binding advisory)
//   + operator operator authorization "shit up, running, wired and fixed" 2026-05-22

// ── MemoryClaim: initialize verificationState='unverified' ────────────────────
MATCH (n:MemoryClaim)
WHERE n.verificationState IS NULL
SET n.verificationState = 'unverified'
RETURN count(n) AS memoryClaimInitialized;

// ── SummaryMemory: initialize verificationState='unverified' ──────────────────
MATCH (n:SummaryMemory)
WHERE n.verificationState IS NULL
SET n.verificationState = 'unverified'
RETURN count(n) AS summaryMemoryInitialized;

// ── InferredMemory: initialize verificationState='unverified' ─────────────────
MATCH (n:InferredMemory)
WHERE n.verificationState IS NULL
SET n.verificationState = 'unverified'
RETURN count(n) AS inferredMemoryInitialized;

// ── Forensic post-migration: verify all in-scope types tagged ─────────────────
MATCH (n)
WHERE (n:MemoryClaim OR n:SummaryMemory OR n:InferredMemory)
  AND n.verificationState IS NULL
RETURN labels(n) AS label, count(n) AS remainingNullCount;
