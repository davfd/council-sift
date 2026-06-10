/**
 * lifecycle-transition.ts — Semantic Memory V4 Lifecycle Transition Module
 * Thread: F (iter5-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER5_A1HARNESS.md
 * Gate evidence: spec:S6:0, spec:IG6
 *
 * AD6 (D1.4e disputed workflow): deterministic state machine for
 * active ↔ disputed transitions.
 *
 * Trigger: ConflictRecord with conflictType=lifecycle_clash AND resolutionState=open.
 * Restore: only when ALL ConflictRecords referencing this node have
 *   resolutionState != 'open' (none remain in open state).
 * Promotion gate: isPromotionEligible() returns false for disputed-state nodes.
 *
 * Call 3 boundary: conflictType trigger check uses ONLY 'lifecycle_clash'.
 * fact_contradiction and scope_overlap are permanently structural-only per AD11.
 */

import { Neo4jService } from '../storage/neo4j/neo4j.service.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TransitionResult {
  status: 'transitioned' | 'already_disputed' | 'node_not_found' | 'conflict_not_found' | 'invalid_conflict';
  nodeId: string;
  newLifecycleState?: string;
  reason?: string;
}

export interface RestoreResult {
  status: 'restored' | 'blocked_open_conflicts' | 'node_not_found' | 'not_disputed';
  nodeId: string;
  newLifecycleState?: string;
  openConflictIds?: string[];
  reason?: string;
}

export interface EligibilityResult {
  eligible: boolean;
  nodeId: string;
  lifecycleState: string;
  reason?: string;
}

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Transition a memory node to lifecycleState='disputed'.
 *
 * AD6 trigger specification: only fires on a ConflictRecord where
 * conflictType = 'lifecycle_clash' AND resolutionState = 'open'
 * (Call 3 boundary: lifecycle_clash ONLY — fact_contradiction and
 * scope_overlap are permanently structural-only per AD11/D1.4b-c).
 *
 * @param nodeId           - nodeId of the node to transition
 * @param conflictRecordId - nodeId of the triggering ConflictRecord
 * @param neo4j            - Neo4jService instance
 */
export async function transitionToDisputed(
  nodeId: string,
  conflictRecordId: string,
  neo4j: Neo4jService,
): Promise<TransitionResult> {
  // Verify ConflictRecord exists with correct trigger conditions
  const crRows = await neo4j.run(
    `MATCH (cr:ConflictRecord {nodeId: $crId})
     RETURN cr.conflictType AS conflictType, cr.resolutionState AS resolutionState`,
    { crId: conflictRecordId },
  );

  if (crRows.length === 0) {
    return {
      status: 'conflict_not_found',
      nodeId,
      reason: `ConflictRecord '${conflictRecordId}' not found`,
    };
  }

  const { conflictType, resolutionState } = crRows[0] as { conflictType: string; resolutionState: string };

  // AD6 trigger: conflictType MUST be 'lifecycle_clash' AND resolutionState MUST be 'open'
  if (conflictType !== 'lifecycle_clash' || resolutionState !== 'open') {
    return {
      status: 'invalid_conflict',
      nodeId,
      reason:
        `ConflictRecord trigger requires conflictType='lifecycle_clash' AND resolutionState='open'; ` +
        `got conflictType='${conflictType}', resolutionState='${resolutionState}' (AD6 trigger-specification)`,
    };
  }

  // Check node exists
  const nodeRows = await neo4j.run(
    `MATCH (n {nodeId: $nodeId}) RETURN n.lifecycleState AS lifecycleState`,
    { nodeId },
  );

  if (nodeRows.length === 0) {
    return { status: 'node_not_found', nodeId, reason: `Node '${nodeId}' not found in graph` };
  }

  if ((nodeRows[0] as { lifecycleState: string }).lifecycleState === 'disputed') {
    return { status: 'already_disputed', nodeId, newLifecycleState: 'disputed' };
  }

  // Transition to disputed
  await neo4j.run(
    `MATCH (n {nodeId: $nodeId}) SET n.lifecycleState = 'disputed'`,
    { nodeId },
  );

  return { status: 'transitioned', nodeId, newLifecycleState: 'disputed' };
}

/**
 * Restore a disputed node to lifecycleState='active'.
 *
 * AD6 restore condition: BOTH conditions must be satisfied:
 *   1. ConflictRecord that triggered the dispute has resolutionState = 'resolved'
 *   2. No OTHER open ConflictRecords reference this node via CONFLICTS_WITH edge
 *
 * If any ConflictRecord referencing this node is still 'open', restore is BLOCKED.
 *
 * @param nodeId - nodeId of the node to restore
 * @param neo4j  - Neo4jService instance
 */
export async function restoreFromDisputed(
  nodeId: string,
  neo4j: Neo4jService,
): Promise<RestoreResult> {
  // Check node exists and is in disputed state
  const nodeRows = await neo4j.run(
    `MATCH (n {nodeId: $nodeId}) RETURN n.lifecycleState AS lifecycleState`,
    { nodeId },
  );

  if (nodeRows.length === 0) {
    return { status: 'node_not_found', nodeId, reason: `Node '${nodeId}' not found in graph` };
  }

  const lifecycleState = (nodeRows[0] as { lifecycleState: string }).lifecycleState;
  if (lifecycleState !== 'disputed') {
    return {
      status: 'not_disputed',
      nodeId,
      newLifecycleState: lifecycleState,
      reason: `Node '${nodeId}' is not in 'disputed' state; current state: '${lifecycleState}'`,
    };
  }

  // Check for any open ConflictRecords referencing this node
  // (both nodeA/nodeB match via CONFLICTS_WITH edge)
  const openConflictRows = await neo4j.run(
    `MATCH (cr:ConflictRecord)-[:CONFLICTS_WITH]->(n {nodeId: $nodeId})
     WHERE cr.resolutionState = 'open'
     RETURN cr.nodeId AS crId`,
    { nodeId },
  );

  if (openConflictRows.length > 0) {
    const openConflictIds = openConflictRows.map((r: Record<string, unknown>) => r.crId as string);
    return {
      status: 'blocked_open_conflicts',
      nodeId,
      openConflictIds,
      reason:
        `Cannot restore node '${nodeId}' to active: ${openConflictIds.length} ConflictRecord(s) ` +
        `still in 'open' state: [${openConflictIds.join(', ')}]. ` +
        `All referencing ConflictRecords must be resolved before restore (AD6)`,
    };
  }

  // All ConflictRecords resolved — restore to active
  await neo4j.run(
    `MATCH (n {nodeId: $nodeId}) SET n.lifecycleState = 'active'`,
    { nodeId },
  );

  return { status: 'restored', nodeId, newLifecycleState: 'active' };
}

/**
 * Check whether a node is eligible for active→verified promotion.
 *
 * AD6: disputed-state nodes are NOT eligible for promotion.
 * Returns false when lifecycleState = 'disputed'.
 *
 * Integrates with promote-orchestrator.ts: callers must check
 * isPromotionEligible() before attempting verified promotion.
 *
 * @param nodeId - nodeId to check
 * @param neo4j  - Neo4jService instance
 */
export async function isPromotionEligible(
  nodeId: string,
  neo4j: Neo4jService,
): Promise<EligibilityResult> {
  const rows = await neo4j.run(
    `MATCH (n {nodeId: $nodeId}) RETURN n.lifecycleState AS lifecycleState`,
    { nodeId },
  );

  if (rows.length === 0) {
    return {
      eligible: false,
      nodeId,
      lifecycleState: 'not_found',
      reason: `Node '${nodeId}' not found in graph`,
    };
  }

  const lifecycleState = (rows[0] as { lifecycleState: string }).lifecycleState;

  // disputed nodes are NOT eligible for active→verified promotion (AD6)
  const eligible = lifecycleState !== 'disputed';

  return {
    eligible,
    nodeId,
    lifecycleState,
    reason: eligible
      ? undefined
      : `Node '${nodeId}' is in 'disputed' state — disputed nodes are NOT eligible for active→verified promotion (AD6)`,
  };
}
