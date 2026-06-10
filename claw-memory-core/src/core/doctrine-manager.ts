/**
 * doctrine-manager.ts — Semantic Memory V4 DoctrineAnchor Writer
 * Thread: E (iter4-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER4_RETRIEVE.md
 * Gate evidence: spec:S4:0, spec:S6:2, spec:IG3
 *
 * AD6: DoctrineAnchor write authority + immutability.
 * Authority check per time-governance-v4.md §4.1:
 *   - ONLY council.doctrine_authority may write DoctrineAnchor nodes.
 *   - council.interpretation_authority is REJECTED per §4.3 structural separation
 *     (doctrine and interpretation must not share node type or edge type).
 *   - Agent-class identities without delegated doctrine-authority are REJECTED.
 *
 * Immutability per §4.4:
 *   - Code path emits ZERO post-creation write statements on DoctrineAnchor nodes.
 *   - lifecycleState initialized 'active'; frozen — no transition permitted.
 *
 * ANCHORS edge per edge-matrix-v4.md §1 row 23 (DoctrineAnchor → RawEvent).
 * All 9 §1.6 required properties written at creation time.
 *
 * Permission-failure audit record per executable-path-v4.md §3.2.
 */

import { v5 as uuidv5 } from 'uuid';
import { randomUUID } from 'crypto';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { NAMESPACE_UUID } from './nodeid.js';

/** The ONLY authority permitted to write DoctrineAnchor nodes (time-governance §4.1) */
const DOCTRINE_AUTHORITY = 'council.doctrine_authority';

/**
 * §4.3 structural separation: interpretation authority governs MemoryClaim/SummaryMemory/InferredMemory.
 * It must NOT be accepted for DoctrineAnchor writes — doctrine and interpretation are distinct classes.
 */
const INTERPRETATION_AUTHORITY = 'council.interpretation_authority';

export type AnchorCategory = 'rule' | 'invariant' | 'policy';

export interface WriteAnchorInput {
  authorityId: string;        // must be 'council.doctrine_authority'
  doctrineText: string;       // the doctrine statement
  anchorCategory: AnchorCategory;
  anchorTime: string;         // ISO-8601: when doctrine was established
  sourceRawEventId: string;   // the RawEvent this doctrine traces to (ANCHORS edge target)
  scopeName: string;          // scope for IN_SCOPE edge
}

export interface DoctrineAnchorNode {
  nodeId: string;
  anchorTime: string;
  ingestTime: string;
  authorityId: string;
  doctrineText: string;
  anchorCategory: AnchorCategory;
  lifecycleState: 'active';
  provenanceEdges: string[];  // edge type list
  scopeEdges: string[];       // scope nodeId list
}

export type WriteAnchorResult =
  | { status: 'anchored'; anchor: DoctrineAnchorNode }
  | { status: 'rejected'; reason: string; auditRecord: PermissionFailureAuditRecord };

export interface PermissionFailureAuditRecord {
  failureType: 'permission';
  attemptedOperation: 'writeAnchor';
  callerIdentityId: string;
  requiredAuthority: string;
  scopeId: string;
  failureTime: string;
}

/**
 * Write a DoctrineAnchor node.
 * Authority check: only council.doctrine_authority succeeds.
 * council.interpretation_authority is explicitly rejected (§4.3).
 *
 * @param input  - anchor parameters including authorityId
 * @param neo4j  - Neo4jService instance
 * @returns WriteAnchorResult — anchored or rejected with audit record
 */
export async function writeAnchor(
  input: WriteAnchorInput,
  neo4j: Neo4jService,
): Promise<WriteAnchorResult> {
  const now = new Date().toISOString();

  // ── Authority check (§4.1 + §4.3) ───────────────────────────────────────
  // §4.3: council.interpretation_authority REJECTED — doctrine and interpretation
  // must not share node type or edge type. DoctrineAnchor is the exclusive doctrine
  // node type; interpretation authority governs interpretation-class types only.
  if (input.authorityId === INTERPRETATION_AUTHORITY) {
    const auditRecord: PermissionFailureAuditRecord = {
      failureType: 'permission',
      attemptedOperation: 'writeAnchor',
      callerIdentityId: input.authorityId,
      requiredAuthority: DOCTRINE_AUTHORITY,
      scopeId: input.scopeName,
      failureTime: now,
    };
    await _writePermissionFailureAudit(auditRecord, neo4j);
    return {
      status: 'rejected',
      reason: `§4.3 structural separation violation: council.interpretation_authority is rejected for DoctrineAnchor writes. DoctrineAnchor is the exclusive doctrine node type; interpretation authority governs MemoryClaim/SummaryMemory/InferredMemory only.`,
      auditRecord,
    };
  }

  // §4.1: only council.doctrine_authority accepted
  if (input.authorityId !== DOCTRINE_AUTHORITY) {
    const auditRecord: PermissionFailureAuditRecord = {
      failureType: 'permission',
      attemptedOperation: 'writeAnchor',
      callerIdentityId: input.authorityId,
      requiredAuthority: DOCTRINE_AUTHORITY,
      scopeId: input.scopeName,
      failureTime: now,
    };
    await _writePermissionFailureAudit(auditRecord, neo4j);
    return {
      status: 'rejected',
      reason: `§4.1 authority violation: only ${DOCTRINE_AUTHORITY} may write DoctrineAnchor nodes; caller=${input.authorityId}`,
      auditRecord,
    };
  }

  // ── Derive deterministic nodeId ─────────────────────────────────────────
  const canonicalKey = JSON.stringify({
    type: 'DoctrineAnchor',
    authorityId: input.authorityId,
    anchorTime: input.anchorTime,
    doctrineText: input.doctrineText,
  });
  const nodeId = uuidv5(canonicalKey, NAMESPACE_UUID);

  // ── Scope node ──────────────────────────────────────────────────────────
  // Item 29 expanded (R-spec-3 5/5 — class-bug closure 2026-05-22): MERGE by scopeName
  // (semantic key) + RETURN the resolved nodeId — same pattern as Item 28 + promote-
  // orchestrator.ts fix. Pre-fix MERGE-by-uuidv5 created F-BAR-3 duplicates when an
  // existing literal-nodeId Scope carried the same scopeName.
  const fallbackScopeNodeId = uuidv5(input.scopeName, NAMESPACE_UUID);

  // ── Single transaction: CREATE DoctrineAnchor + ANCHORS + IN_SCOPE ──────
  // §4.4 immutability: no post-creation write operations on DoctrineAnchor nodes.
  // All 9 §1.6 required properties written in ON CREATE SET only.
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

      // Create DoctrineAnchor node (ON CREATE only — §4.4 immutability)
      // All 9 §1.6 required properties: nodeId, anchorTime, ingestTime, authorityId,
      // doctrineText, anchorCategory, lifecycleState, provenanceEdges (via ANCHORS edge),
      // scopeEdges (via IN_SCOPE edge)
      await tx.run(
        `MERGE (da:DoctrineAnchor {nodeId: $nodeId})
         ON CREATE SET
           da.anchorTime      = $anchorTime,
           da.ingestTime      = $now,
           da.authorityId     = $authorityId,
           da.doctrineText    = $doctrineText,
           da.anchorCategory  = $anchorCategory,
           da.lifecycleState  = 'active'`,
        {
          nodeId,
          anchorTime: input.anchorTime,
          now,
          authorityId: input.authorityId,
          doctrineText: input.doctrineText,
          anchorCategory: input.anchorCategory,
        },
      );

      // ANCHORS edge: DoctrineAnchor → RawEvent (edge-matrix §1 row 23)
      await tx.run(
        `MATCH (da:DoctrineAnchor {nodeId: $nodeId})
         MATCH (re:RawEvent {nodeId: $sourceRawEventId})
         MERGE (da)-[:ANCHORS]->(re)`,
        { nodeId, sourceRawEventId: input.sourceRawEventId },
      );

      // IN_SCOPE edge
      await tx.run(
        `MATCH (da:DoctrineAnchor {nodeId: $nodeId})
         MATCH (sc:Scope {nodeId: $scopeNodeId})
         MERGE (da)-[:IN_SCOPE]->(sc)`,
        { nodeId, scopeNodeId },
      );
    });
  } finally {
    await session.close();
  }

  const anchor: DoctrineAnchorNode = {
    nodeId,
    anchorTime: input.anchorTime,
    ingestTime: now,
    authorityId: input.authorityId,
    doctrineText: input.doctrineText,
    anchorCategory: input.anchorCategory,
    lifecycleState: 'active',
    provenanceEdges: ['ANCHORS'],
    scopeEdges: [scopeNodeId],
  };

  return { status: 'anchored', anchor };
}

/** Write permission-failure audit record (executable-path-v4.md §3.2) */
async function _writePermissionFailureAudit(
  record: PermissionFailureAuditRecord,
  neo4j: Neo4jService,
): Promise<void> {
  const auditNodeId = randomUUID();
  try {
    await neo4j.run(
      `CREATE (a:PermissionFailureAudit {
         nodeId: $auditNodeId,
         failureType: $failureType,
         attemptedOperation: $attemptedOperation,
         callerIdentityId: $callerIdentityId,
         requiredAuthority: $requiredAuthority,
         scopeId: $scopeId,
         failureTime: $failureTime
       })`,
      {
        auditNodeId,
        failureType: record.failureType,
        attemptedOperation: record.attemptedOperation,
        callerIdentityId: record.callerIdentityId,
        requiredAuthority: record.requiredAuthority,
        scopeId: record.scopeId,
        failureTime: record.failureTime,
      },
    );
  } catch {
    // Audit write failure is non-fatal; the primary rejection still occurs
  }
}
