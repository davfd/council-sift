/**
 * conflict-detector.ts — Semantic Memory V4 Conflict Detector
 * Thread: E (iter4-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER4_RETRIEVE.md
 * Gate evidence: spec:S4:1, spec:S6:3, spec:IG4
 *
 * AD7/Call 3: ConflictRecord lifecycle_clash only (iter4).
 * detectLifecycleClash() is the ONLY exported detection function.
 * Other conflict-type variants are OUT OF SCOPE for iter4 (deferred to iter5+).
 *
 * Call 3 code enforcement: only lifecycle_clash is implemented here.
 * No other conflict-type detection strings appear in this file.
 *
 * ConflictRecord writes:
 *   - conflictType = 'lifecycle_clash' (literal string)
 *   - resolutionState = 'open' (literal string)
 *   - CONFLICTS_WITH edges: exactly 2 (one to nodeA, one to nodeB)
 *   - Self-conflict (nodeA = nodeB) REJECTED per schema-contracts-v4.md §2.7
 *   - All 11 §1.7 required properties written
 */

import { v5 as uuidv5 } from 'uuid';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { NAMESPACE_UUID, deriveScopeNodeId } from './nodeid.js';

export interface DetectLifecycleClashInput {
  nodeA: string;      // nodeId of first conflicting node
  nodeB: string;      // nodeId of second conflicting node
  detectedBy: string; // agent or harness that detected the conflict
  scopeName: string;  // scope for IN_SCOPE edge
}

export interface ConflictRecordNode {
  nodeId: string;
  conflictTime: string;
  ingestTime: string;
  detectedBy: string;
  nodeA: string;
  nodeB: string;
  conflictType: 'lifecycle_clash';
  resolutionState: 'open';
  lifecycleState: 'active';
  provenanceEdges: string[];  // ['CONFLICTS_WITH', 'CONFLICTS_WITH']
  scopeEdges: string[];       // scope nodeId list
}

export type DetectResult =
  | { status: 'conflict_recorded'; record: ConflictRecordNode }
  | { status: 'rejected'; reason: string };

/**
 * Detect a lifecycle clash between two memory nodes and write a ConflictRecord.
 *
 * lifecycle_clash: two nodes have incompatible lifecycle states (e.g., both active
 * but their content contradicts in a lifecycle sense, or both claim to be the active
 * version of the same conceptual fact).
 *
 * Per AD7/Call 3: ONLY lifecycle_clash is supported in iter4.
 * Other conflict variants (iter5+) are not implemented here.
 *
 * Self-conflict (nodeA = nodeB) is rejected per §2.7.
 * CONFLICTS_WITH cardinality: exactly 2 per ConflictRecord.
 *
 * @param input  - clash parameters
 * @param neo4j  - Neo4jService instance
 * @returns DetectResult — recorded or rejected
 */
export async function detectLifecycleClash(
  input: DetectLifecycleClashInput,
  neo4j: Neo4jService,
): Promise<DetectResult> {
  const now = new Date().toISOString();

  // §2.7: Self-conflict guard — nodeA must not equal nodeB
  if (input.nodeA === input.nodeB) {
    return {
      status: 'rejected',
      reason: `schema-contracts-v4.md §2.7: self-conflict rejected — nodeA and nodeB are the same nodeId: ${input.nodeA}`,
    };
  }

  // Derive deterministic ConflictRecord nodeId
  const canonicalKey = JSON.stringify({
    type: 'ConflictRecord',
    conflictType: 'lifecycle_clash',
    nodeA: input.nodeA < input.nodeB ? input.nodeA : input.nodeB,
    nodeB: input.nodeA < input.nodeB ? input.nodeB : input.nodeA,
    detectedBy: input.detectedBy,
  });
  const nodeId = uuidv5(canonicalKey, NAMESPACE_UUID);

  // Item 29 expanded (R-spec-3 5/5 — class-bug closure 2026-05-22): MERGE by scopeName
  // (semantic key) — mirrors Item 28 fix on scope-resolver.ts + supersession-manager.ts
  // + promote-orchestrator.ts. The fallback nodeId is uuidv5-derived; ON MATCH preserves
  // whatever nodeId an existing Scope carries (literal OR uuidv5). resolvedScopeNodeId
  // captured from RETURN for downstream IN_SCOPE bindings.
  const fallbackScopeNodeId = deriveScopeNodeId(input.scopeName);

  // Single transaction: ConflictRecord + CONFLICTS_WITH (×2) + IN_SCOPE
  const driver = neo4j.getDriver();
  const session = driver.session();
  let scopeNodeId: string = fallbackScopeNodeId;
  try {
    await session.executeWrite(async (tx) => {
      // Ensure Scope node exists (MERGE by scopeName)
      const scRows = await tx.run(
        `MERGE (sc:Scope {scopeName: $scopeName})
         ON CREATE SET sc.nodeId = $fallbackScopeNodeId, sc.createdAt = datetime()
         RETURN sc.nodeId AS nodeId`,
        { scopeName: input.scopeName, fallbackScopeNodeId },
      );
      scopeNodeId =
        (scRows.records[0]?.get('nodeId') as string | undefined) ?? fallbackScopeNodeId;

      // Create ConflictRecord — all 11 §1.7 required properties:
      // nodeId, conflictTime, ingestTime, detectedBy, nodeA, nodeB,
      // conflictType, resolutionState, lifecycleState, provenanceEdges, scopeEdges
      await tx.run(
        `MERGE (cr:ConflictRecord {nodeId: $nodeId})
         ON CREATE SET
           cr.conflictTime     = $now,
           cr.ingestTime       = $now,
           cr.detectedBy       = $detectedBy,
           cr.nodeA            = $nodeA,
           cr.nodeB            = $nodeB,
           cr.conflictType     = 'lifecycle_clash',
           cr.resolutionState  = 'open',
           cr.lifecycleState   = 'active'`,
        {
          nodeId,
          now,
          detectedBy: input.detectedBy,
          nodeA: input.nodeA,
          nodeB: input.nodeB,
        },
      );

      // CONFLICTS_WITH edge to nodeA (cardinality: exactly 1 of 2 per record)
      await tx.run(
        `MATCH (cr:ConflictRecord {nodeId: $crNodeId})
         MATCH (a {nodeId: $nodeA})
         MERGE (cr)-[:CONFLICTS_WITH]->(a)`,
        { crNodeId: nodeId, nodeA: input.nodeA },
      );

      // CONFLICTS_WITH edge to nodeB (cardinality: exactly 2 of 2 per record)
      await tx.run(
        `MATCH (cr:ConflictRecord {nodeId: $crNodeId})
         MATCH (b {nodeId: $nodeB})
         MERGE (cr)-[:CONFLICTS_WITH]->(b)`,
        { crNodeId: nodeId, nodeB: input.nodeB },
      );

      // IN_SCOPE edge
      await tx.run(
        `MATCH (cr:ConflictRecord {nodeId: $crNodeId})
         MATCH (sc:Scope {nodeId: $scopeNodeId})
         MERGE (cr)-[:IN_SCOPE]->(sc)`,
        { crNodeId: nodeId, scopeNodeId },
      );
    });
  } finally {
    await session.close();
  }

  const record: ConflictRecordNode = {
    nodeId,
    conflictTime: now,
    ingestTime: now,
    detectedBy: input.detectedBy,
    nodeA: input.nodeA,
    nodeB: input.nodeB,
    conflictType: 'lifecycle_clash',
    resolutionState: 'open',
    lifecycleState: 'active',
    provenanceEdges: ['CONFLICTS_WITH', 'CONFLICTS_WITH'],
    scopeEdges: [scopeNodeId],
  };

  return { status: 'conflict_recorded', record };
}
