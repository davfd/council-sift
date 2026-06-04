// R80 Commit E orphan MC recovery (2026-05-23)
//
// State at session open: 12 MemoryClaim nodes carry verificationState='verified'
// but have ZERO incoming VERIFIES edges — the audit chain is broken (their backing
// VerificationRecords were deleted by the F-R80-1 bug class in
// tests/supersession-manager.test.ts:51 + tests/classifier.test.ts:66 +
// tests/promote-orchestrator.test.ts:49-66, all closed in Commit E).
//
// Per operator's "no gaming, no shortcuts" mandate: we cannot leave MCs claiming
// verificationState='verified' without backing VRs. The honest reset is to mark
// them verificationState='unverified' + audit marker. G8 will re-fire naturally
// as council seats accumulate corroboration evidence again.
//
// Recovery contract:
//   - Match: MC with verificationState='verified' AND NOT EXISTS { (vr)-[:VERIFIES]->(mc) }
//   - Action: SET verificationState='unverified' + verificationState_orphan_recovery='Commit-E'
//   - Audit: write one DecayAuditLog entry per recovered MC (triggeredBy='operator.override')
//
// Same pattern as Commit D's 9-MC recovery (verificationState_orphan_recovery='Commit-D').

CALL {
  MATCH (m:MemoryClaim)
  WHERE m.verificationState = 'verified'
    AND NOT EXISTS { MATCH (vr:VerificationRecord)-[:VERIFIES]->(m) }
  WITH collect(m) AS orphans
  UNWIND orphans AS m
  SET m.verificationState = 'unverified',
      m.verificationState_orphan_recovery = 'Commit-E'
  WITH m
  CREATE (dal:DecayAuditLog {
    nodeId: randomUUID(),
    targetNodeId: m.nodeId,
    priorState: 'verified',
    newState: 'unverified',
    transitionTime: toString(datetime()),
    ingestTime: toString(datetime()),
    triggeredBy: 'operator.override',
    project_root: coalesce(m.project_root, '<legacy-workspace>'),
    reason: 'R80 Commit E orphan recovery — F-R80-1 destroyed backing VRs; audit chain broken; honest reset to unverified'
  })
  RETURN count(dal) AS audits_written
}
RETURN audits_written AS orphans_reset;

// Verification — should return 0 after recovery:
MATCH (m:MemoryClaim)
WHERE m.verificationState = 'verified'
  AND NOT EXISTS { MATCH (vr:VerificationRecord)-[:VERIFIES]->(m) }
RETURN count(m) AS remaining_orphans;
