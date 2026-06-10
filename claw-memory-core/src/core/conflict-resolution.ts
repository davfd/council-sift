/**
 * conflict-resolution.ts — Semantic Memory V4 ConflictRecord Resolution
 * Thread: F (iter5-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER5_A1HARNESS.md
 * Gate evidence: spec:S6:1, spec:IG6
 *
 * AD7 (D3.1): ConflictRecord.resolutionState state machine.
 *
 * Permitted transitions:
 *   open → resolved  (resolveConflict)
 *   resolved → archived  (archiveConflict)
 *
 * PROHIBITED: direct open → archived transition
 * (schema-contracts-v4.md §1.7 transition table).
 *
 * Coupling with lifecycle-transition.ts:
 * resolveConflict triggers restoreFromDisputed() for nodeA and nodeB
 * referenced by the ConflictRecord. Nodes will restore to 'active' if
 * no other open ConflictRecords reference them.
 */

import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { restoreFromDisputed } from './lifecycle-transition.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResolveResult {
  status: 'resolved' | 'not_found' | 'invalid_state' | 'already_resolved';
  conflictRecordId: string;
  newResolutionState?: string;
  restoredNodes?: string[];
  reason?: string;
}

export interface ArchiveResult {
  status: 'archived' | 'not_found' | 'invalid_state';
  conflictRecordId: string;
  newResolutionState?: string;
  reason?: string;
}

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Transition ConflictRecord.resolutionState from 'open' to 'resolved'.
 *
 * Records resolutionText and resolverId on the ConflictRecord node.
 *
 * Coupling: after transition, triggers restoreFromDisputed() for
 * the nodeA and nodeB referenced in the ConflictRecord. The restore
 * will succeed if no other open ConflictRecords reference those nodes.
 *
 * @param conflictRecordId - nodeId of the ConflictRecord to resolve
 * @param resolutionText   - recorded explanation of resolution
 * @param resolverId       - identity of the resolver (seat or operator)
 * @param neo4j            - Neo4jService instance
 */
export async function resolveConflict(
  conflictRecordId: string,
  resolutionText: string,
  resolverId: string,
  neo4j: Neo4jService,
): Promise<ResolveResult> {
  const rows = await neo4j.run(
    `MATCH (cr:ConflictRecord {nodeId: $crId})
     RETURN cr.resolutionState AS resolutionState,
            cr.nodeA AS nodeA,
            cr.nodeB AS nodeB`,
    { crId: conflictRecordId },
  );

  if (rows.length === 0) {
    return {
      status: 'not_found',
      conflictRecordId,
      reason: `ConflictRecord '${conflictRecordId}' not found`,
    };
  }

  const { resolutionState, nodeA, nodeB } = rows[0] as {
    resolutionState: string;
    nodeA: string;
    nodeB: string;
  };

  if (resolutionState === 'resolved') {
    return {
      status: 'already_resolved',
      conflictRecordId,
      newResolutionState: 'resolved',
      reason: `ConflictRecord '${conflictRecordId}' is already in 'resolved' state`,
    };
  }

  if (resolutionState !== 'open') {
    return {
      status: 'invalid_state',
      conflictRecordId,
      reason:
        `resolveConflict requires resolutionState='open'; ` +
        `current state: '${resolutionState}'. ` +
        `Direct '${resolutionState}'→'resolved' transition is not permitted (schema-contracts-v4.md §1.7)`,
    };
  }

  const resolvedAt = new Date().toISOString();

  // Transition: open → resolved; record resolution text and resolver
  await neo4j.run(
    `MATCH (cr:ConflictRecord {nodeId: $crId})
     SET cr.resolutionState = 'resolved',
         cr.resolutionText  = $resolutionText,
         cr.resolvedBy      = $resolverId,
         cr.resolvedAt      = $resolvedAt`,
    { crId: conflictRecordId, resolutionText, resolverId, resolvedAt },
  );

  // Coupling with lifecycle-transition.ts:
  // Attempt to restore disputed nodes for nodeA and nodeB.
  // restoreFromDisputed checks that no other open ConflictRecords remain.
  const restoredNodes: string[] = [];
  for (const targetNodeId of [nodeA, nodeB]) {
    if (!targetNodeId) continue;
    try {
      const restoreResult = await restoreFromDisputed(targetNodeId, neo4j);
      if (restoreResult.status === 'restored') {
        restoredNodes.push(targetNodeId);
      }
    } catch {
      // Non-fatal: node may not be disputed or graph state may differ
    }
  }

  return {
    status: 'resolved',
    conflictRecordId,
    newResolutionState: 'resolved',
    restoredNodes,
  };
}

/**
 * Transition ConflictRecord.resolutionState from 'resolved' to 'archived'.
 *
 * Enforces the two-step transition requirement:
 * open→resolved must precede resolved→archived.
 * Direct open→archived is PROHIBITED (schema-contracts-v4.md §1.7).
 *
 * @param conflictRecordId - nodeId of the ConflictRecord to archive
 * @param neo4j            - Neo4jService instance
 */
export async function archiveConflict(
  conflictRecordId: string,
  neo4j: Neo4jService,
): Promise<ArchiveResult> {
  const rows = await neo4j.run(
    `MATCH (cr:ConflictRecord {nodeId: $crId})
     RETURN cr.resolutionState AS resolutionState`,
    { crId: conflictRecordId },
  );

  if (rows.length === 0) {
    return {
      status: 'not_found',
      conflictRecordId,
      reason: `ConflictRecord '${conflictRecordId}' not found`,
    };
  }

  const { resolutionState } = rows[0] as { resolutionState: string };

  // Must be 'resolved' to archive — 'open' cannot go directly to 'archived'
  if (resolutionState !== 'resolved') {
    return {
      status: 'invalid_state',
      conflictRecordId,
      reason:
        `archiveConflict requires resolutionState='resolved'; ` +
        `current state: '${resolutionState}'. ` +
        `Direct '${resolutionState}'→'archived' transition is PROHIBITED ` +
        `(schema-contracts-v4.md §1.7 — must go through 'resolved' first)`,
    };
  }

  const archivedAt = new Date().toISOString();

  await neo4j.run(
    `MATCH (cr:ConflictRecord {nodeId: $crId})
     SET cr.resolutionState = 'archived', cr.archivedAt = $archivedAt`,
    { crId: conflictRecordId, archivedAt },
  );

  return {
    status: 'archived',
    conflictRecordId,
    newResolutionState: 'archived',
  };
}
