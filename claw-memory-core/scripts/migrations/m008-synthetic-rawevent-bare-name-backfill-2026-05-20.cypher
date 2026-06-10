// m008-synthetic-rawevent-bare-name-backfill-2026-05-20.cypher
// R70 5/5 Item 25(a) RATIFIED 2026-05-20 — synthetic RawEvent backfill for 352 bare-name
// pre-prefix-corpus MemoryClaims (R40 (a) refusal REVERSED per operator directive).
//
// Pre-fix forensic (R69):
//   352 MCs with bare owner_seat (a reviewer/a reviewer/a reviewer/a reviewer/a reviewer) AND no
//   DERIVED_FROM edges, spanning 2026-05-01 → 2026-05-13 (pre-P0 close 2026-05-14).
//   Per-seat: a reviewer:83, a reviewer:74, a reviewer:67, a reviewer:66, a reviewer:62 = 352.
//   remember.ts:258 previously documented "Forward-only — historical 352 nodes stay
//   as-is per R40 (a) refused". Operator 2026-05-20: "no carry-over; pristine memory."
//
// Approach (Item 25(a) — synthetic-RE backfill):
//   For each of 352 bare-name MCs, create a synthetic RawEvent with:
//     source       = 'synthetic:pre-prefix-corpus-{YYYY-MM-DD}' (day-granular from MC.ingestTime)
//     eventTime    = MC.created_at / MC.ingestTime
//     ingestTime   = MC.ingestTime
//     rawContent   = 'Synthetic provenance: pre-prefix-corpus era node. Original write had
//                     bare owner_seat before R59 prefix normalization (2026-05-19). Attached
//                     DERIVED_FROM is reconstructive, not write-time evidence.'
//     project_root = MC.project_root (Item 27 protection inherited)
//     lifecycleState = 'active'
//   Wire (m:MemoryClaim)-[:DERIVED_FROM]->(re:RawEvent)
//
// Idempotent — guards against re-running by checking MC has no existing DERIVED_FROM.
// Scope-bounded — only the 352 bare-name MCs are targeted.

WITH '<legacy-workspace>' AS workspace_root
MATCH (m:MemoryClaim)
WHERE m.owner_seat IN ['a reviewer', 'a reviewer', 'a reviewer', 'a reviewer', 'a reviewer']
  AND NOT EXISTS { (m)-[:DERIVED_FROM]->() }
WITH m,
     // Derive day-bucketed source label from ingestTime (or created_at fallback)
     coalesce(m.ingestTime, m.created_at) AS reTime,
     'synthetic:pre-prefix-corpus-' + substring(coalesce(m.ingestTime, m.created_at), 0, 10) AS synthSource,
     // Deterministic synthetic RE nodeId so re-running is fully idempotent
     'synth-re-' + m.nodeId AS synthREId,
     coalesce(m.project_root, '<legacy-workspace>') AS pr
MERGE (re:RawEvent {nodeId: synthREId})
  ON CREATE SET
    re.source         = synthSource,
    re.eventTime      = reTime,
    re.ingestTime     = reTime,
    re.rawContent     = 'Synthetic provenance: pre-prefix-corpus era node. Original write had bare owner_seat before R59 prefix normalization (2026-05-19). Attached DERIVED_FROM is reconstructive, not write-time evidence.',
    re.lifecycleState = 'active',
    re.project_root   = pr,
    re.r71_item25_synthetic = true,
    re.r71_item25_target_mc = m.nodeId
MERGE (m)-[:DERIVED_FROM]->(re)
RETURN count(DISTINCT m) AS backfilled_mcs,
       count(DISTINCT re) AS synthetic_res_created;

// Coverage report
MATCH (m:MemoryClaim)
WHERE m.owner_seat IN ['a reviewer', 'a reviewer', 'a reviewer', 'a reviewer', 'a reviewer']
WITH count(m) AS bare_name_total,
     count(CASE WHEN EXISTS { (m)-[:DERIVED_FROM]->() } THEN 1 END) AS bare_name_with_derived,
     count(CASE WHEN NOT EXISTS { (m)-[:DERIVED_FROM]->() } THEN 1 END) AS bare_name_orphan
RETURN bare_name_total, bare_name_with_derived, bare_name_orphan;
