// m020-bare-owner-seat-normalize-cf-c-2026-05-30.cypher
// CF-C: Normalize 4 R1-era bare-name MemoryClaim owner_seat values
//
// 4 MemoryClaims written before BARE_SEAT_NAMES patch landed in remember.ts:
//   8a79f76b owner_seat="legacy-seat-1"
//   a681c8fa owner_seat="legacy-seat-5"   <- reviewer's deepest-corroboration node (9 sessions)
//   5438b5d9 owner_seat="legacy-seat-2"
//   8c4af33d owner_seat="legacy-seat-3"  <- the MemoryClaim DoctrineAnchor target (intersects CF-B)
//
// Seat-scoped queries using "seat:<name>" prefix silently miss these. BARE_SEAT_NAMES
// patch is forward-only. Idempotent normalization.
//
// authorized_by: internal-review 2026-05-30 (operator op 3)

MATCH (m:MemoryClaim)
WHERE m.owner_seat IN ["legacy-seat-1", "legacy-seat-5", "legacy-seat-2", "legacy-seat-3", "legacy-seat-4"]
  AND NOT m.owner_seat STARTS WITH "seat:"
SET m.owner_seat = "seat:" + m.owner_seat;
