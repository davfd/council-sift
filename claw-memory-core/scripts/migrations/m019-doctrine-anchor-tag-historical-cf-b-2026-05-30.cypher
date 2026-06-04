// m019-doctrine-anchor-tag-historical-cf-b-2026-05-30.cypher
// CF-B: Tag 4 DoctrineAnchor orphans as historical-provisional
//
// 4 DoctrineAnchor nodes were created during R5 0.80-threshold window
// (5/5 ratified at write time). Threshold reverted to 0.95 per
// internal-review 2026-05-30 5/5. The 4 targets carry
// isDoctrineAnchor=true with confidence_score in [0.80, 0.82] — below the active criterion.
//
// Disposition: tag as provisional (preserves audit trail; iter10 doctrine_score
// redesign will re-evaluate). Not delete (would erase the 5/5 R5 history).
//
// Targets (all confidence_score < 0.95): 8c4af33d MemoryClaim, 5bfa0d4e/f910fb18/455f3e7c SummaryMemory.
//
// authorized_by: internal-review 2026-05-30 (operator op 3 + tag-historical recommendation)

MATCH (da:DoctrineAnchor)
MATCH (t {nodeId: da.targetNodeId})
WHERE t.confidence_score < 0.95
SET da.threshold_at_anchor = 0.80,
    da.status = "provisional_needs_review",
    da.ratified_by = "operator:jonathan-2026-05-30",
    da.note = "Anchored during R5 0.80-threshold window (5/5 ratified at time of write). Threshold reverted to 0.95 per internal-review 2026-05-30. Re-evaluate under iter10 doctrine_score redesign.";

MATCH (t)
WHERE t.isDoctrineAnchor = true AND t.confidence_score < 0.95
SET t.doctrineAnchor_threshold_at_anchor = 0.80,
    t.doctrineAnchor_status = "provisional_needs_review";
