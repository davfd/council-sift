/**
 * d3-4-doctrine-anchor.ts — D3.4 DoctrineAnchor
 * Thread: I (T5 lifecycle execution)
 * Plan: SEMANTIC_MEMORY_V4_T5_LIFECYCLE.md
 * Gate evidence: spec:S3:10, spec:S4:5 (partial), spec:IG-T5-6
 *
 * Auto-anchor trigger (3 criteria; all required; none may use weasel qualifier):
 *   1. confidence_score >= 0.95 (not > 0.94 or approximate)
 *   2. Claim present in >= 3 distinct sessions
 *   3. All M = 3 conflict checks passed (no active ConflictRecord)
 *
 * Anchor protection: once anchored, lower-confidence contradictions
 * CANNOT trigger a ConflictRecord auto-write against the anchor.
 * Integration with D3.1: d3-4 checks anchor flag BEFORE D3.1 writes ConflictRecord.
 *
 * Zero-operator-labor mandate (charter §4 / BLOCK-T5-12):
 *   Auto-path: criteria evaluation → auto-anchor fires when all 3 met.
 *   No operator input required. CLI anchor escape hatch is supplementary.
 *
 * PN-3 dependency: D3.4 DEPENDS_ON D3.1 (edge e15 S3:8→S3:10). DoctrineAnchor
 * must correctly interact with ConflictRecord at auto-dispute time. The anchor
 * flag check is the integration point.
 *
 * authorized_by: T6 (Jonathan 2026-04-28T04:16:20Z)
 */

import { v5 as uuidv5 } from 'uuid';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { NAMESPACE_UUID } from './nodeid.js';

// ── Constants ────────────────────────────────────────────────────────────────

/** Auto-anchor confidence threshold: exactly 0.95 (not approximate) */
export const ANCHOR_CONFIDENCE_THRESHOLD = 0.95;  // Public snapshot keeps the canonical confidence threshold exact; downstream redesign work is outside this repo.

/** Minimum distinct session count for auto-anchor: exactly 3 */
export const ANCHOR_MIN_SESSIONS = 3;

/**
 * Number of distinct conflict checks that must pass for auto-anchor (M).
 *
 * Value derivation: 3 elected at Michael Stage 3 (T6 2026-04-28). M was TBD
 * in T5 charter §3.1 (no council-ratified value); no explicit derivation
 * document found across charter, spec manifest, or council records (5/5
 * council Round 1 + Round 2 verification 2026-04-28). Value is operationally
 * consistent with adjacent ANCHOR_MIN_SESSIONS=3 (corpus session quorum) but
 * the alignment was NOT confirmed as intentional design — the proximity-based
 * inference is not load-bearing. May be calibrated in a future iteration
 * based on observed auto-anchor false-positive rate; the current value is a
 * defensible default, not an empirically-tuned threshold.
 */
export const ANCHOR_CONFLICT_CHECKS = 3;

// ── Types ────────────────────────────────────────────────────────────────────

export interface AnchorCheckInput {
  nodeId: string;
  confidence_score: number | null;
  /**
   * Distinct session IDs in which this claim has been **active** — written at CREATE time
   * (G7b, remember.ts) OR at recall time (recall.ts + semantic_recall.ts post-R37 wiring).
   * Semantic per R37 5/5 (Option (a) + expanded Touch 4): "active in session" covers both
   * creation and recall observation. Provenance (when-created) is tracked via DERIVED_FROM
   * → RawEvent.source + ingestTime, never via OBSERVED_IN.
   */
  sessionIds: string[];
}

export interface AnchorEligibilityResult {
  eligible: boolean;
  nodeId: string;
  confidence_score: number | null;
  session_count: number;
  conflict_checks_passed: number;
  /** Which criterion failed (if not eligible) */
  blocking_criterion?: 'confidence' | 'session_count' | 'conflict_check';
}

export interface AnchorWriteResult {
  status: 'anchored' | 'already_anchored' | 'not_eligible' | 'node_not_found';
  nodeId: string;
  anchor_time?: string;
}

export interface AnchorProtectionResult {
  /** true = ConflictRecord auto-write is BLOCKED (anchor protection active) */
  blocked: boolean;
  reason?: string;
}

// ── Auto-anchor eligibility check ────────────────────────────────────────────

/**
 * Check whether a node is eligible for auto-anchoring.
 *
 * All 3 criteria must be met (no weasel qualifier on any threshold):
 *   1. confidence_score >= 0.95 (exact threshold)
 *   2. session_count >= 3 (exact minimum)
 *   3. conflict_checks_passed >= M = 3 (exactly 3 checks must have passed)
 *
 * @param input - Node data including confidence and session IDs
 * @param conflictChecksPassed - How many conflict checks have passed for this node
 */
export function checkAnchorEligibility(
  input: AnchorCheckInput,
  conflictChecksPassed: number,
): AnchorEligibilityResult {
  // Criterion 1: confidence >= 0.95
  if (input.confidence_score === null || input.confidence_score < ANCHOR_CONFIDENCE_THRESHOLD) {
    return {
      eligible: false,
      nodeId: input.nodeId,
      confidence_score: input.confidence_score,
      session_count: input.sessionIds.length,
      conflict_checks_passed: conflictChecksPassed,
      blocking_criterion: 'confidence',
    };
  }

  // Criterion 2: distinct sessions >= 3
  const distinctSessions = new Set(input.sessionIds).size;
  if (distinctSessions < ANCHOR_MIN_SESSIONS) {
    return {
      eligible: false,
      nodeId: input.nodeId,
      confidence_score: input.confidence_score,
      session_count: distinctSessions,
      conflict_checks_passed: conflictChecksPassed,
      blocking_criterion: 'session_count',
    };
  }

  // Criterion 3: conflict checks >= M = 3
  if (conflictChecksPassed < ANCHOR_CONFLICT_CHECKS) {
    return {
      eligible: false,
      nodeId: input.nodeId,
      confidence_score: input.confidence_score,
      session_count: distinctSessions,
      conflict_checks_passed: conflictChecksPassed,
      blocking_criterion: 'conflict_check',
    };
  }

  return {
    eligible: true,
    nodeId: input.nodeId,
    confidence_score: input.confidence_score,
    session_count: distinctSessions,
    conflict_checks_passed: conflictChecksPassed,
  };
}

// ── Auto-anchor write ─────────────────────────────────────────────────────────

/**
 * Auto-anchor a node when all 3 criteria are satisfied.
 *
 * Zero-operator-labor: fires automatically when criteria are met.
 * No operator input required on the auto-path.
 *
 * Queries the node's confidence_score and OBSERVED_IN session count from the graph,
 * checks eligibility, then:
 *   1. Sets n.isDoctrineAnchor = true on the MemoryClaim node
 *   2. Creates a separate DoctrineAnchor node with targetNodeId = nodeId
 *
 * @param nodeId               - Node to anchor
 * @param conflictChecksPassed - Number of conflict checks that have passed (M criterion)
 * @param neo4j                - Neo4jService instance
 */
export async function autoAnchorNode(
  nodeId: string,
  conflictChecksPassed: number,
  neo4j: Neo4jService,
): Promise<AnchorWriteResult> {
  // Query node confidence + tenant from graph.
  // Item 27 R71: fetch project_root so DoctrineAnchor inherits tenant boundary —
  // DA is in entryTimeCleanup label list (`_test-helpers.ts:100`); NULL project_root
  // would cause DETACH-DELETE on next test run (this is what wiped the R48 baseline DA).
  const nodeRows = await neo4j.run(
    `MATCH (n {nodeId: $nodeId})
     RETURN n.confidence_score AS confidence_score, n.project_root AS project_root`,
    { nodeId },
  );

  if (nodeRows.length === 0) {
    return { status: 'node_not_found', nodeId };
  }

  const confidence_score = nodeRows[0].confidence_score as number | null;
  const nodeProjectRoot = (nodeRows[0].project_root as string | null | undefined) ?? null;

  // Query distinct sessions via OBSERVED_IN edges
  const sessionCount = await getDistinctSessionCount(nodeId, neo4j);

  // Build sessionIds array (synthetic IDs for eligibility check — count matters)
  const sessionIds = Array.from({ length: sessionCount }, (_, i) => `session-${i}`);

  // Check eligibility using all 3 criteria
  const eligibility = checkAnchorEligibility(
    { nodeId, confidence_score, sessionIds },
    conflictChecksPassed,
  );

  if (!eligibility.eligible) {
    return { status: 'not_eligible', nodeId };
  }

  // R40 Barachiel BLOCKING (race fix 2026-05-17): atomic MERGE replaces read-then-CREATE.
  // Pre-fix: lines 206-212 read existingAnchor, lines 227-235 CREATE — no transaction isolation.
  // R39 wired Promise.all() in recall.ts; concurrent autoAnchorNode() invocations all read
  // existingAnchor.length === 0 before any committed, then all proceeded to CREATE — producing
  // duplicate DoctrineAnchor nodes (e.g., dfd6f0d0 had 3 anchors). MERGE on targetNodeId is
  // atomic check-and-create at the database level; first writer wins, subsequent writers bind
  // to existing node without duplication. ON CREATE SET only fires for the create branch.
  // Constraint: `doctrine_anchor_targetNodeId_unique` (live, see SHOW CONSTRAINTS).
  //
  // R62 Item 1 (P2 wiring scope): in addition to the property-MERGE atomicity key, an `ANCHORS`
  // edge is written from this DoctrineAnchor to the target MemoryClaim. The edge is the canonical
  // graph relationship per edge-matrix §1 (path (b)); the property remains as the merge-atomicity
  // key (race-safe per R40). Symmetric with `doctrine-manager.writeAnchor()` (path (a)) which
  // writes ANCHORS → RawEvent. Property-vs-edge dropping decision deferred to council follow-up.
  const anchorTime = new Date().toISOString();
  const anchorNodeId = uuidv5(`DoctrineAnchor:${nodeId}:${anchorTime}`, NAMESPACE_UUID);

  // Set anchor flag on the MemoryClaim node (idempotent SET; safe to re-run)
  await neo4j.run(
    `MATCH (n {nodeId: $nodeId})
     SET n.isDoctrineAnchor = true,
         n.anchoredAt = coalesce(n.anchoredAt, $anchorTime),
         n.anchorTriggeredBy = coalesce(n.anchorTriggeredBy, 'auto')`,
    { nodeId, anchorTime },
  );

  // Atomic MERGE on DoctrineAnchor + ANCHORS edge to target MemoryClaim — race-safe.
  // Property MERGE provides atomicity (R40 fix); 2nd MERGE on the edge is idempotent (binds to
  // existing edge if present, creates if absent). Both writes happen in a single transaction.
  // Item 27 R71: write project_root on DoctrineAnchor MERGE so the anchor survives
  // entryTimeCleanup label-filtered DETACH-DELETE (root cause of R48 anchor disappearance).
  const mergeResult = await neo4j.run(
    `MERGE (da:DoctrineAnchor {targetNodeId: $nodeId})
     ON CREATE SET
       da.nodeId = $anchorNodeId,
       da.anchoredAt = $anchorTime,
       da.triggeredBy = 'auto',
       da.project_root = $project_root
     ON MATCH SET
       da.project_root = coalesce(da.project_root, $project_root)
     WITH da
     MATCH (m {nodeId: $nodeId})
     MERGE (da)-[:ANCHORS]->(m)
     RETURN da.anchoredAt AS resultAnchorTime,
            da.anchoredAt = $anchorTime AS wasCreated`,
    { anchorNodeId, nodeId, anchorTime, project_root: nodeProjectRoot },
  );

  const wasCreated = mergeResult[0]?.wasCreated === true;
  const resultAnchorTime = mergeResult[0]?.resultAnchorTime as string ?? anchorTime;

  if (!wasCreated) {
    return { status: 'already_anchored', nodeId };
  }
  return { status: 'anchored', nodeId, anchor_time: resultAnchorTime };
}

// ── Anchor protection check (D3.1 integration point) ─────────────────────────

/**
 * Check whether anchor protection blocks a ConflictRecord auto-write.
 *
 * Called by D3.1 BEFORE writing a ConflictRecord. If the target node is
 * a DoctrineAnchor and the contradicting node has lower confidence, the
 * auto-write is BLOCKED.
 *
 * PN-3 integration: this function is the interface between D3.4 and D3.1.
 * D3.1 must call this function before auto-writing a ConflictRecord against
 * an anchored node.
 *
 * @param anchoredNodeId         - The DoctrineAnchor node under threat
 * @param contradictingConfidence - Confidence of the lower-confidence contradicting claim
 * @param neo4j                  - Neo4jService instance
 * @returns AnchorProtectionResult — blocked=true if ConflictRecord write should be blocked
 */
export async function checkAnchorProtection(
  anchoredNodeId: string,
  contradictingConfidence: number | null,
  neo4j: Neo4jService,
): Promise<AnchorProtectionResult> {
  const rows = await neo4j.run(
    `MATCH (n {nodeId: $nodeId})
     RETURN n.isDoctrineAnchor AS isDoctrineAnchor, n.confidence_score AS confidence_score`,
    { nodeId: anchoredNodeId },
  );

  if (rows.length === 0 || rows[0].isDoctrineAnchor !== true) {
    // Not an anchor — no protection; allow ConflictRecord to proceed
    return { blocked: false };
  }

  const anchorConfidence = rows[0].confidence_score as number | null;

  // Protection triggers if: node is anchored AND contradicting confidence < anchor confidence
  if (
    contradictingConfidence !== null &&
    anchorConfidence !== null &&
    contradictingConfidence < anchorConfidence
  ) {
    return {
      blocked: true,
      reason: `Anchor protection: anchored node (confidence=${anchorConfidence}) cannot be auto-disputed by lower-confidence contradiction (confidence=${contradictingConfidence})`,
    };
  }

  // Equal or higher confidence contradiction: allow ConflictRecord
  return { blocked: false };
}

// ── CLI escape hatch: anchor ──────────────────────────────────────────────────

/**
 * CLI escape hatch: anchor — operator may manually anchor any claim.
 *
 * This is the ESCAPE HATCH. The auto-path (criteria-based auto-anchor) works
 * without operator intervention. This function allows operators to anchor
 * claims that haven't reached the auto-anchor thresholds but are known-reliable.
 *
 * Command alias: `anchor "<claim>"` (CLI integration point).
 *
 * @param nodeId      - Node to manually anchor
 * @param anchoredBy  - Identity of the operator
 * @param neo4j       - Neo4jService instance
 */
export async function manualAnchorNode(
  nodeId: string,
  anchoredBy: string,
  neo4j: Neo4jService,
): Promise<AnchorWriteResult> {
  // Item 27 R71: fetch project_root for tenant boundary on the manual DA write.
  const nodeRows = await neo4j.run(
    `MATCH (n {nodeId: $nodeId})
     RETURN n.nodeId AS id, n.project_root AS project_root`,
    { nodeId },
  );

  if (nodeRows.length === 0) {
    return { status: 'node_not_found', nodeId };
  }
  const nodeProjectRoot = (nodeRows[0].project_root as string | null | undefined) ?? null;

  // R42 4/5 carry-forward (Zadkiel + Raguel + Barachiel + Jeremiel): same race pattern as
  // autoAnchorNode pre-fix. Lower production risk (CLI escape hatch; sequential invocation
  // expected) but architecturally inconsistent. Applying same atomic MERGE pattern as
  // autoAnchorNode for consistency + belt-and-suspenders with the targetNodeId unique constraint.
  const anchorTime = new Date().toISOString();
  const anchorNodeId = uuidv5(`DoctrineAnchor:manual:${nodeId}:${anchorTime}`, NAMESPACE_UUID);

  // Set anchor flag on the source node (idempotent via COALESCE — first-writer semantics)
  await neo4j.run(
    `MATCH (n {nodeId: $nodeId})
     SET n.isDoctrineAnchor = true,
         n.anchoredAt = coalesce(n.anchoredAt, $anchorTime),
         n.anchorTriggeredBy = coalesce(n.anchorTriggeredBy, 'manual'),
         n.anchoredBy = coalesce(n.anchoredBy, $anchoredBy)`,
    { nodeId, anchorTime, anchoredBy },
  );

  // Atomic MERGE on DoctrineAnchor + ANCHORS edge — race-safe (R42 carry-forward fix +
  // R62 Item 1 edge refactor). Property MERGE provides atomicity (R40 pattern); 2nd MERGE
  // on the edge is idempotent (binds to existing edge if present). Both writes in single tx.
  // Item 27 R71: project_root tagged so DA survives entryTimeCleanup tenant filter.
  const mergeResult = await neo4j.run(
    `MERGE (da:DoctrineAnchor {targetNodeId: $nodeId})
     ON CREATE SET
       da.nodeId = $anchorNodeId,
       da.anchoredAt = $anchorTime,
       da.triggeredBy = 'manual',
       da.anchoredBy = $anchoredBy,
       da.project_root = $project_root
     ON MATCH SET
       da.project_root = coalesce(da.project_root, $project_root)
     WITH da
     MATCH (m {nodeId: $nodeId})
     MERGE (da)-[:ANCHORS]->(m)
     RETURN da.anchoredAt AS resultAnchorTime,
            da.anchoredAt = $anchorTime AS wasCreated`,
    { anchorNodeId, nodeId, anchorTime, anchoredBy, project_root: nodeProjectRoot },
  );

  const wasCreated = mergeResult[0]?.wasCreated === true;
  const resultAnchorTime = mergeResult[0]?.resultAnchorTime as string ?? anchorTime;

  if (!wasCreated) {
    return { status: 'already_anchored', nodeId };
  }
  return { status: 'anchored', nodeId, anchor_time: resultAnchorTime };
}

// ── Session count query helper ────────────────────────────────────────────────

/**
 * Query the number of distinct sessions in which a node has been **active** —
 * written at CREATE time (G7b, remember.ts) OR at recall time (recall.ts +
 * semantic_recall.ts post-R37 wiring). Uses OBSERVED_IN edges to Session nodes.
 *
 * R37 5/5 (Option (a) + expanded Touch 4) reframed OBSERVED_IN semantic from
 * "captured by memory capture pipeline" (CREATE-only) to "active in session"
 * (CREATE OR recall). Each MemoryClaim accumulates one OBSERVED_IN edge per
 * distinct session in which it was created or recalled (MERGE-idempotent).
 *
 * @param nodeId - Node to check
 * @param neo4j  - Neo4jService instance
 * @returns Count of distinct Session nodes connected via OBSERVED_IN edges
 */
export async function getDistinctSessionCount(
  nodeId: string,
  neo4j: Neo4jService,
): Promise<number> {
  const rows = await neo4j.run(
    `MATCH (n {nodeId: $nodeId})-[:OBSERVED_IN]->(s:Session)
     RETURN count(DISTINCT s.nodeId) AS sessionCount`,
    { nodeId },
  );
  const cnt = (rows[0]?.sessionCount as { low: number } | number) ?? 0;
  return typeof cnt === 'object' ? cnt.low : cnt;
}
