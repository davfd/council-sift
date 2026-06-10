/**
 * d3-1-conflict-record.ts — D3.1 ConflictRecord Management
 * Thread: I (T5 lifecycle execution)
 * Plan: SEMANTIC_MEMORY_V4_T5_LIFECYCLE.md
 * Gate evidence: spec:S3:8, spec:S4:5 (partial), spec:IG-T5-6
 *
 * AD-T5-1 ELECTED: option (b) — ConflictRecord is auto-written when
 * mark-wrong MCP tool is invoked for a claim. No additional operator action required.
 *
 * AD-T5-4 ELECTED: option (ii) — indefinite disputed state as design;
 * disputed_duration_days auto-computed and surfaced in retrieval payload.
 *
 * EPISTEMIC INTENT ANNOTATION (Zadkiel §3.1 mandatory verbatim):
 * "The disputed-both default preserves contested information rather than silently resolving it. This is an intentional epistemic choice."
 *
 * Zero-operator-labor mandate (charter §4 / BLOCK-T5-12):
 *   Auto-path: mark-wrong invocation → ConflictRecord auto-write →
 *   disputed-both state in retrieval → disputed_duration_days surfaced.
 *   No operator action required on auto-path.
 *
 * CLI escape hatch: resolve-conflict command for operator-directed resolution.
 *
 * authorized_by: T6 (Jonathan 2026-04-28T04:16:20Z)
 */

import { v5 as uuidv5 } from 'uuid';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { NAMESPACE_UUID } from './nodeid.js';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * ConflictPayload: the conflict annotation computed for a disputed pair.
 *
 * EPISTEMIC INTENT ANNOTATION (Zadkiel §3.1):
 * "The disputed-both default preserves contested information rather than silently resolving it. This is an intentional epistemic choice."
 */
export interface ConflictPayload {
  conflict_flag: boolean;
  contestedNodeId: string;
  contradictingNodeId?: string;
  resolutionState: 'open';
  /** ISO-8601 timestamp of dispute onset */
  disputeTime: string;
  /** Conflict trigger: 'mark-wrong' for AD-T5-1 option (b) */
  trigger: string;
}

/** Legacy type alias for backward compat */
export interface RetrievalConflictPayload {
  conflict_flag: boolean;
  conflict_record_id?: string;
  disputed_duration_days?: number;
}

// ── ConflictRecord node-id derivation ────────────────────────────────────────

function deriveConflictNodeId(contestedNodeId: string, disputeTime: string): string {
  const canonical = JSON.stringify({ contestedNodeId, disputeTime, type: 'ConflictRecord-D3.1' });
  return uuidv5(canonical, NAMESPACE_UUID);
}

// ── Compute conflict payload (pure function; no DB) ───────────────────────────

/**
 * Compute the conflict payload annotation for a dispute pair.
 *
 * Pure function — no database write. Used to build the payload attached to
 * disputed nodes in retrieval results.
 *
 * AD-T5-1 option (b): trigger = 'mark-wrong' identifies the detection criterion.
 * "The disputed-both default preserves contested information rather than silently resolving it. This is an intentional epistemic choice."
 *
 * @param contestedNodeId     - The node that was marked wrong
 * @param contradictingNodeId - The contradicting node (may be null for orphan conflicts)
 * @param trigger             - 'mark-wrong' (AD-T5-1 option b detection criterion)
 */
export function computeConflictPayload(
  contestedNodeId: string,
  contradictingNodeId: string | null,
  trigger: string,
): ConflictPayload {
  const disputeTime = new Date().toISOString();
  const payload: ConflictPayload = {
    conflict_flag: true,
    contestedNodeId,
    resolutionState: 'open',
    disputeTime,
    trigger,
  };
  if (contradictingNodeId) {
    payload.contradictingNodeId = contradictingNodeId;
  }
  return payload;
}

// ── Auto-write ConflictRecord when mark-wrong fires (AD-T5-1 option b) ───────

/**
 * Auto-writes a ConflictRecord when mark-wrong MCP tool is invoked.
 *
 * AD-T5-1 ELECTED option (b): mark-wrong invocation is the trigger. The
 * ConflictRecord is created automatically — no further operator action required.
 *
 * Both the marked-wrong node and any contradicting node (if provided) are
 * transitioned to lifecycleState='disputed', and retrieval returns BOTH nodes
 * with conflict_flag=true (disputed-both default).
 *
 * "The disputed-both default preserves contested information rather than silently resolving it. This is an intentional epistemic choice."
 *
 * @param contestedNodeId     - The node being marked wrong
 * @param contradictingNodeId - The contradicting node (null for orphan conflicts — no contradicting node known)
 * @param neo4j               - Neo4jService instance
 * @returns The ConflictRecord nodeId (string)
 *
 * G1 P0-M3 option (b): signature accepts `string | null` so mark-wrong can always call
 * autoWriteConflictRecord even when no contradicting node is provided (orphan path).
 * `.filter(Boolean)` at line 144 removes null → orphan ConflictRecord has
 * CONFLICTS_WITH edge to contested node only; cr.contradictingNodeId IS NULL.
 * authorized_by: P0 grant 2026-05-11 (R10 5/5 unanimously elected option b)
 */
export async function autoWriteConflictRecord(
  contestedNodeId: string,
  contradictingNodeId: string | null,
  neo4j: Neo4jService,
  project_root?: string,
): Promise<string> {
  const disputeTime = new Date().toISOString();
  const conflictNodeId = deriveConflictNodeId(contestedNodeId, disputeTime);

  // R65 Item 2 fix: write project_root on ConflictRecord so cross-file test cleanup
  // (entryTimeCleanup in tests/_test-helpers.ts) preserves production-tenant records.
  // Pre-fix: ConflictRecord nodes were created without project_root → fell outside the
  // tenant guard and were silently wiped on every cross-file vitest run, leaving the
  // contested MemoryClaim with lifecycleState='disputed' + earliestDisputeTime set
  // but no surviving ConflictRecord (node 9145dd8b 2026-05-17 is the canonical case).
  // Fallback derivation from contested node if caller didn't pass through.
  let resolvedProjectRoot: string | null = project_root ?? null;
  if (!resolvedProjectRoot) {
    const rows = await neo4j.run(
      `MATCH (n {nodeId: $contestedNodeId}) RETURN n.project_root AS pr LIMIT 1`,
      { contestedNodeId },
    );
    resolvedProjectRoot = (rows[0]?.pr as string | null | undefined) ?? null;
  }

  // Create ConflictRecord node with all required fields
  await neo4j.run(
    `MERGE (cr:ConflictRecord {nodeId: $conflictNodeId})
     ON CREATE SET
       cr.contestedNodeId = $contestedNodeId,
       cr.contradictingNodeId = $contradictingNodeId,
       cr.resolutionState = 'open',
       cr.trigger = 'mark-wrong',
       cr.conflict_flag = true,
       cr.disputeTime = $disputeTime,
       cr.project_root = $project_root`,
    {
      conflictNodeId,
      contestedNodeId,
      contradictingNodeId,
      disputeTime,
      project_root: resolvedProjectRoot,
    },
  );

  // Create CONFLICTS_WITH edges and set disputed state on both nodes
  // disputed-both default: BOTH nodes transition to 'disputed'
  // Type guard: filter out null (orphan path — only contestedNodeId gets CONFLICTS_WITH edge)
  const involvedNodeIds = [contestedNodeId, contradictingNodeId].filter((id): id is string => id !== null && id !== '');
  for (const nodeId of involvedNodeIds) {
    await neo4j.run(
      `MATCH (cr:ConflictRecord {nodeId: $conflictNodeId})
       MATCH (n {nodeId: $nodeId})
       MERGE (cr)-[:CONFLICTS_WITH]->(n)
       SET n.lifecycleState = 'disputed',
           n.earliestDisputeTime = CASE WHEN n.earliestDisputeTime IS NULL THEN $disputeTime ELSE n.earliestDisputeTime END`,
      { conflictNodeId, nodeId, disputeTime },
    );
  }

  return conflictNodeId;
}

// ── Query open conflicts for a node (guard #2 support for D3.5) ───────────────

/**
 * Check whether any open ConflictRecord names a given node as contested.
 * Used by D3.5 VerificationRecord auto-VR guard #2 (no open conflict).
 *
 * Checks BOTH:
 *   1. ConflictRecord-[:CONFLICTS_WITH]->(n) edge
 *   2. ConflictRecord.contestedNodeId = nodeId (field-based check)
 *
 * @param nodeId - Node to check
 * @param neo4j  - Neo4jService instance
 * @returns true if at least one open ConflictRecord targets this node
 */
export async function hasOpenConflict(nodeId: string, neo4j: Neo4jService): Promise<boolean> {
  const rows = await neo4j.run(
    `MATCH (cr:ConflictRecord)
     WHERE cr.resolutionState = 'open'
       AND (cr.contestedNodeId = $nodeId
            OR cr.contradictingNodeId = $nodeId
            OR EXISTS { (cr)-[:CONFLICTS_WITH]->(n {nodeId: $nodeId}) })
     RETURN count(cr) AS cnt`,
    { nodeId },
  );
  const cnt = (rows[0]?.cnt as { low: number } | number) ?? 0;
  const count = typeof cnt === 'object' ? cnt.low : cnt;
  return count > 0;
}

// ── CLI escape hatch: resolve-conflict ────────────────────────────────────────

/**
 * CLI escape hatch: resolve-conflict — allows operator-directed resolution.
 *
 * This is the ESCAPE HATCH and is NOT required on the auto-path.
 * ZERO-OPERATOR-LABOR: disputes surface and persist automatically.
 * Operator may resolve via this function, but is never required to do so.
 *
 * Positional args: (conflictId, verdict, resolvedBy, neo4j)
 * Alias command: `resolve-conflict <id> --winner <id>` (CLI integration point).
 */
export async function resolveConflict(
  conflictId: string,
  verdict: 'non-conflict' | 'confirmed-conflict',
  resolvedBy: string,
  neo4j: Neo4jService,
): Promise<{ status: 'resolved' | 'not_found' | 'already_resolved'; conflictRecordId: string; verdict?: string }> {
  const rows = await neo4j.run(
    `MATCH (cr:ConflictRecord {nodeId: $conflictId})
     RETURN cr.resolutionState AS resolutionState`,
    { conflictId },
  );

  if (rows.length === 0) {
    return { status: 'not_found', conflictRecordId: conflictId };
  }

  if (rows[0].resolutionState === 'resolved') {
    return { status: 'already_resolved', conflictRecordId: conflictId };
  }

  const resolutionTime = new Date().toISOString();

  await neo4j.run(
    `MATCH (cr:ConflictRecord {nodeId: $conflictId})
     SET cr.resolutionState = 'resolved',
         cr.verdict = $verdict,
         cr.resolvedBy = $resolvedBy,
         cr.resolutionTime = $resolutionTime`,
    {
      conflictId,
      verdict,
      resolvedBy,
      resolutionTime,
    },
  );

  // If verdict is non-conflict, restore nodes from disputed state
  if (verdict === 'non-conflict') {
    await neo4j.run(
      `MATCH (cr:ConflictRecord {nodeId: $conflictId})-[:CONFLICTS_WITH]->(n)
       WHERE NOT EXISTS {
         MATCH (cr2:ConflictRecord)-[:CONFLICTS_WITH]->(n)
         WHERE cr2.resolutionState = 'open' AND cr2.nodeId <> $conflictId
       }
       SET n.lifecycleState = 'active'`,
      { conflictId },
    );
  }

  return {
    status: 'resolved',
    conflictRecordId: conflictId,
    verdict,
  };
}
