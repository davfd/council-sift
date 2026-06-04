// m003-cleanup-accumulated-test-claims-2026-05-19.cypher
//
// R58 audit hygiene cleanup — Uriel R58 root cause finding.
//
// Context: During the R58 9-seat empirical audit of commit 12c4202f, seats ran
// concurrent vitest sessions against the shared Neo4j instance. Some sessions
// were terminated mid-execution (concurrent contention, SIGTERM, lock timeouts).
// When `afterAll` did not run, MemoryClaim test artifacts accumulated.
//
// Uriel R58 measured: 1962 MemoryClaim nodes in graph with seat:test-* identity
// or TEST_RUN_ID-shaped content patterns — none of which are baseline corpus.
//
// This migration is the canonical cleanup for that accumulated state, plus
// preventive coverage for the same pattern in future. It is idempotent and
// safe to re-run.
//
// Authority: R58 9-seat empirical audit + operator operator-auth 2026-05-19.
//
// SAFETY: All clauses scope to test-pattern identities ONLY (seat:test-*, or
// content/nodeId containing recognisable test-run-id fragments). Production
// MemoryClaims (seat:a reviewer, seat:michael, seat:operator, council-seat:*, etc.)
// are NOT touched. Smoke-baseline corpus is NOT touched.

// Step 1 — Test-pattern owner_seat (seat:test-r56-* + seat:test-* generic).
// These are TC-R56-1 + other R58-era test fixtures that hit production seat:* prefix.
MATCH (n:MemoryClaim)
WHERE n.owner_seat STARTS WITH 'seat:test-'
DETACH DELETE n;

// Step 2 — operator:test-* identities (F5-T3b unregistered-permission tests).
// These hit the F5 permission-rejection branch by design — MemoryClaim written
// without DERIVED_FROM/IN_SCOPE. Accumulate identically when afterAll doesn't run.
MATCH (n:MemoryClaim)
WHERE n.owner_seat STARTS WITH 'operator:test-'
DETACH DELETE n;

// Step 3 — RawEvent test artifacts (mirror cleanup; F5 writes RawEvent alongside MemoryClaim).
MATCH (e:RawEvent)
WHERE e.sourceIdentity STARTS WITH 'seat:test-'
   OR e.sourceIdentity STARTS WITH 'operator:test-'
DETACH DELETE e;

// Verification (manual run):
//   MATCH (n:MemoryClaim) WHERE n.owner_seat STARTS WITH 'seat:test-' OR n.owner_seat STARTS WITH 'operator:test-'
//   RETURN count(n) AS remaining_test_claims;
//   -- expected: 0
//
//   MATCH (e:RawEvent) WHERE e.sourceIdentity STARTS WITH 'seat:test-' OR e.sourceIdentity STARTS WITH 'operator:test-'
//   RETURN count(e) AS remaining_test_raw_events;
//   -- expected: 0
