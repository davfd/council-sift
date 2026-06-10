// m004-content-unification-2026-05-20.cypher
// R63 5/5 council convergence 2026-05-20: schema unification (Q1=b accidental drift).
//
// Backfills `n.content` from legacy per-type text fields (claimText/summaryText/inferenceText)
// on the iter2/iter3 smoke baseline nodes preserved by supersession-manager.test.ts F2b.
// At apply time (2026-05-20), live corpus has exactly 3 such nodes (all :MemoryClaim, all classifier-routed):
//   8f021d25-f586-52cc-8b5b-69a621dc5a48  claimText="Classification of: operator test ingest"
//   d3b6f749-761a-5ffa-a4ff-00f72487a6e5  claimText="Classification of: order seat test ingest"
//   67447682-ec24-5117-b69c-8108221c9b1b  claimText="Classification of: council seat test ingest"
//
// Idempotent — re-running is a no-op (clause checks n.content IS NULL).
// Scope-bounded — touches only nodes with NULL content AND at least one legacy field populated.
// No DELETE/REMOVE — legacy fields preserved as backcompat shadow (read-fallback in retrieve.ts:255).
//
// Pre-fix corpus split (cypher-shell 2026-05-20):
//   :MemoryClaim total=2023 | has_content=2020 | has_claimText=3 | has_summaryText=0 | has_inferenceText=0
// Post-fix expected:
//   :MemoryClaim total=2023 | has_content=2023 (universal coverage on canonical field)

MATCH (n)
WHERE (n:MemoryClaim OR n:SummaryMemory OR n:InferredMemory)
  AND n.content IS NULL
  AND (n.claimText IS NOT NULL OR n.summaryText IS NOT NULL OR n.inferenceText IS NOT NULL)
SET n.content = coalesce(n.claimText, n.summaryText, n.inferenceText)
RETURN
  count(*) AS backfilled,
  collect(n.nodeId)[..10] AS sample_nodeIds;
