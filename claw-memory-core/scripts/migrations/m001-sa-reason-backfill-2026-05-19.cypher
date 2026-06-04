// m001-sa-reason-backfill-2026-05-19.cypher
//
// R55/R56 Item 8 G5 SupersessionAudit reason field backfill.
//
// Context: Item 8 added `reason` field to SupersessionAudit nodes via writeSupersedesEdge
// (point-in-time.ts) at commit 96890af7 (2026-05-19). Pre-fix corpus had 34 SA nodes with
// no reason field. R56 reset (commit ed16ec05) extended the fix to supersession-manager.supersede()
// D3-internal path with non-null sentinel 'system:d3-supersession' (per pre-Item-8-backfill
// precedent — R56 council 9/9 refused NULL-by-default).
//
// This migration runs idempotently:
//  - Pre-Item-8 corpus: 34 nodes get reason='pre-Item-8-backfill' (R55 original backfill)
//  - Any post-fix D3 SA writes that arrived with NULL: get 'system:d3-supersession' sentinel
//    (defensive — D3 path should now write the sentinel directly, but legacy state covered)
//
// Authority: R51 5/5 + R55 9/9 + R56 9/9 + operator operator-auth 2026-05-19.

// Step 1 — Pre-Item-8 corpus backfill (R55 original; 34 nodes)
// Idempotent: re-running on already-backfilled nodes is a no-op.
MATCH (sa:SupersessionAudit)
WHERE sa.reason IS NULL
  AND sa.ingestTime < '2026-05-19T00:00:00Z'
SET sa.reason = 'pre-Item-8-backfill';

// Step 2 — Post-fix D3-path NULL sentinel backfill (R56 reset)
// Any SA node written post-Item-8 without reason gets the D3 sentinel.
// In normal operation supersession-manager.supersede() now writes this directly;
// migration covers any historical NULL nodes that slipped through during the rollout.
MATCH (sa:SupersessionAudit)
WHERE sa.reason IS NULL
SET sa.reason = 'system:d3-supersession';

// Verification (manual run):
//   MATCH (sa:SupersessionAudit) RETURN count(sa) AS total, count(sa.reason) AS with_reason;
//   -- expected: total == with_reason
