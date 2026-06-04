/**
 * supersession-manager.ts — Semantic Memory V4 Supersession Manager
 * Thread: E (iter4-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER4_RETRIEVE.md
 * Gate evidence: spec:S3:1, spec:S6:1, spec:IG2
 *
 * AD5/Call 2: Operator-driven supersession ONLY.
 * No content-similarity auto-detection. No autoDetect function. No scan function.
 *
 * supersede() performs in ONE transaction:
 *   (a) Create successor node (versionOrdinal = predecessor.versionOrdinal + 1,
 *       priorVersionId = predecessorId)
 *   (b) SUPERSEDES edge from successor → predecessor (cardinality exactly 1)
 *   (c) VERSION_OF edge IFF both nodes are SummaryMemory or both InferredMemory
 *       (MemoryClaim has NO VERSION_OF — edge-matrix §1 rows 27-28)
 *   (d) predecessor.lifecycleState → superseded
 *   (e) supersession audit record {newVersionNodeId, priorVersionNodeId,
 *       supersessionTime, performerId} per time-governance-v4.md §1.4, §3.1
 *
 * VERSION_OF exclusion note (edge-matrix-v4.md §1 rows 27-28):
 *   VERSION_OF is defined only for SummaryMemory→SummaryMemory and
 *   InferredMemory→InferredMemory self-chains. MemoryClaim has no VERSION_OF row.
 *   The SUPERSEDES edge is used alone to link MemoryClaim versions.
 */

import { randomUUID } from 'crypto';
import { v5 as uuidv5 } from 'uuid';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { NAMESPACE_UUID, deriveScopeNodeId } from './nodeid.js';
import { requirePriorVersionLink, rejectFirstVersionWithPrior } from './version-lineage.js';

// Call 2 enforcement: No auto-detection code path.
// grep supersession-manager.ts for "similarity" MUST return 0 hits.
// grep supersession-manager.ts for "autoDetect" MUST return 0 hits.
// grep supersession-manager.ts for "scan" MUST return 0 hits.

/** Labels that permit VERSION_OF self-chains per edge-matrix §1 rows 27-28 */
const VERSION_OF_ELIGIBLE_LABELS = new Set(['SummaryMemory', 'InferredMemory']);

/**
 * R57 PO-1 (Zadkiel): module-level sentinel for D3-internal supersession audit records.
 * Used at both write sites (SA CREATE param + auditRecord return) to keep them in sync.
 * Non-null per pre-Item-8-backfill precedent; R56 council 9/9 refused NULL-by-default.
 */
const D3_SUPERSESSION_SENTINEL = 'system:d3-supersession';

export interface SupersedeInput {
  predecessorId: string;          // nodeId of the node being superseded
  successorInput: {
    nodeType: string;             // must match predecessor nodeType
    contentText: string;          // the updated content (written to `n.content` for all node types — R63 Q1 unification)
    producedBy: string;           // agent/seat producing the new version
    confidenceScore?: number;     // required for InferredMemory; from policy
    scopes: string[];             // scope names for IN_SCOPE edges
  };
  performerId: string;            // operator/seat driving the supersession (Call 2)
  reason?: string;                // R56 Item 8 D3-internal: G5 provenance — defaults to 'system:d3-supersession' sentinel (non-null per pre-Item-8-backfill precedent; refused NULL-by-default by R56 council)
  /**
   * Item 27 (R71 5/5 2026-05-20): tenant boundary for SupersessionAudit + Scope writes.
   * When omitted, caller falls back to predecessor's project_root (derived inside).
   * Threading project_root ensures SA + Scope nodes survive setDifferenceTeardown.
   */
  project_root?: string;
}

export interface SupersessionAuditRecord {
  newVersionNodeId: string;
  priorVersionNodeId: string;
  supersessionTime: string;
  performerId: string;
  reason: string;                 // R56 Item 8: always populated; non-null sentinel if not supplied
}

export interface SupersedeResult {
  status: 'superseded';
  newNodeId: string;
  predecessorId: string;
  versionOrdinal: number;
  versionOfEdgeWritten: boolean;
  auditRecord: SupersessionAuditRecord;
}

/**
 * Supersede a memory node with a new successor version.
 * Operator-driven only (Call 2). No auto-detection.
 *
 * @param input  - supersession parameters
 * @param neo4j  - Neo4jService instance
 * @returns SupersedeResult with audit record
 */
export async function supersede(
  input: SupersedeInput,
  neo4j: Neo4jService,
): Promise<SupersedeResult> {
  const supersessionTime = new Date().toISOString();

  // Fetch predecessor node to determine nodeType, versionOrdinal, and tenant.
  // Item 27 R71: include project_root in fetch so SA + Scope inherit tenant when caller omits.
  const predRows = await neo4j.run(
    `MATCH (n {nodeId: $nodeId}) RETURN labels(n) AS labels, n.versionOrdinal AS ord, n.lifecycleState AS state, n.project_root AS project_root LIMIT 1`,
    { nodeId: input.predecessorId },
  );
  if (predRows.length === 0) {
    throw new Error(`supersession-manager: predecessor not found: ${input.predecessorId}`);
  }
  const predLabels: string[] = predRows[0].labels as string[];
  const predOrdinal = Number(predRows[0].ord ?? 1);
  const newOrdinal = predOrdinal + 1;
  // Item 27 R71: caller-supplied takes priority; predecessor's tenant is the fallback.
  const resolvedProjectRoot: string | null =
    input.project_root ?? (predRows[0].project_root as string | null | undefined) ?? null;

  // Determine the label to use for the successor
  const nodeType = input.successorInput.nodeType;

  // Derive deterministic nodeId for successor
  const canonicalKey = JSON.stringify({
    memoryType: nodeType,
    predecessorId: input.predecessorId,
    versionOrdinal: newOrdinal,
  });
  const newNodeId = uuidv5(canonicalKey, NAMESPACE_UUID);

  // Version lineage validation
  requirePriorVersionLink({ nodeId: newNodeId, versionOrdinal: newOrdinal, priorVersionId: input.predecessorId });
  // First version guard (newOrdinal is never 1 in a supersession, but check defensively)
  if (newOrdinal === 1) {
    rejectFirstVersionWithPrior({ nodeId: newNodeId, versionOrdinal: 1, priorVersionId: input.predecessorId });
  }

  // Determine if VERSION_OF edge should be written
  // Only for SummaryMemory→SummaryMemory or InferredMemory→InferredMemory self-chains
  // MemoryClaim has no VERSION_OF row per edge-matrix §1 rows 27-28
  const predecessorIsEligible = predLabels.some((l) => VERSION_OF_ELIGIBLE_LABELS.has(l));
  const successorIsEligible = VERSION_OF_ELIGIBLE_LABELS.has(nodeType);
  const writeVersionOf = predecessorIsEligible && successorIsEligible && nodeType === predLabels.find(l => VERSION_OF_ELIGIBLE_LABELS.has(l));

  // Single transaction: all 5 operations
  const driver = neo4j.getDriver();
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      // (a) Create successor node
      if (nodeType === 'SummaryMemory') {
        await tx.run(
          `MERGE (n:SummaryMemory {nodeId: $nodeId})
           ON CREATE SET
             n.summaryTime    = $now,
             n.ingestTime     = $now,
             n.producedBy     = $producedBy,
             n.content        = $contentText,
             n.versionOrdinal = $versionOrdinal,
             n.priorVersionId = $priorVersionId,
             n.lifecycleState = 'active',
             n.verificationState = 'unverified'`,
          {
            nodeId: newNodeId,
            now: supersessionTime,
            producedBy: input.successorInput.producedBy,
            contentText: input.successorInput.contentText,
            versionOrdinal: newOrdinal,
            priorVersionId: input.predecessorId,
          },
        );
      } else if (nodeType === 'InferredMemory') {
        await tx.run(
          `MERGE (n:InferredMemory {nodeId: $nodeId})
           ON CREATE SET
             n.inferenceTime  = $now,
             n.ingestTime     = $now,
             n.producedBy     = $producedBy,
             n.content        = $contentText,
             n.confidenceScore = $confidenceScore,
             n.versionOrdinal = $versionOrdinal,
             n.priorVersionId = $priorVersionId,
             n.lifecycleState = 'active',
             n.verificationState = 'unverified'`,
          {
            nodeId: newNodeId,
            now: supersessionTime,
            producedBy: input.successorInput.producedBy,
            contentText: input.successorInput.contentText,
            confidenceScore: input.successorInput.confidenceScore ?? 0.7,
            versionOrdinal: newOrdinal,
            priorVersionId: input.predecessorId,
          },
        );
      } else if (nodeType === 'MemoryClaim') {
        // MemoryClaim also supports supersession (SUPERSEDES only — no VERSION_OF)
        await tx.run(
          `MERGE (n:MemoryClaim {nodeId: $nodeId})
           ON CREATE SET
             n.claimTime      = $now,
             n.ingestTime     = $now,
             n.claimantId     = $producedBy,
             n.content        = $contentText,
             n.versionOrdinal = $versionOrdinal,
             n.priorVersionId = $priorVersionId,
             n.lifecycleState = 'active',
             n.verificationState = 'unverified'`,
          {
            nodeId: newNodeId,
            now: supersessionTime,
            producedBy: input.successorInput.producedBy,
            contentText: input.successorInput.contentText,
            versionOrdinal: newOrdinal,
            priorVersionId: input.predecessorId,
          },
        );
      }

      // Add IN_SCOPE edges for successor
      // Item 27 R71: project_root tagged on Scope MERGE so the node survives setDifferenceTeardown.
      // Item 28 R73 (post-F-BAR-3): MERGE by scopeName (semantic key) — mirrors scope-resolver.ts fix.
      // Caller no longer pre-computes nodeId; the MERGE returns whatever nodeId the matched/created
      // Scope carries (literal OR uuidv5) and the IN_SCOPE edge binds via that returned value.
      for (const scopeName of input.successorInput.scopes) {
        const fallbackScopeNodeId = deriveScopeNodeId(scopeName);
        const scRows = await tx.run(
          `MERGE (sc:Scope {scopeName: $scopeName})
           ON CREATE SET sc.nodeId = $fallbackScopeNodeId, sc.createdAt = datetime(), sc.project_root = $project_root
           ON MATCH SET sc.project_root = coalesce(sc.project_root, $project_root)
           RETURN sc.nodeId AS nodeId`,
          { scopeName, fallbackScopeNodeId, project_root: resolvedProjectRoot },
        );
        const resolvedScopeNodeId = (scRows.records[0]?.get('nodeId') as string) ?? fallbackScopeNodeId;
        await tx.run(
          `MATCH (n {nodeId: $newNodeId})
           MATCH (sc:Scope {nodeId: $scopeNodeId})
           MERGE (n)-[:IN_SCOPE]->(sc)`,
          { newNodeId, scopeNodeId: resolvedScopeNodeId },
        );
      }

      // (b) SUPERSEDES edge from successor → predecessor (cardinality exactly 1)
      await tx.run(
        `MATCH (successor {nodeId: $newNodeId})
         MATCH (predecessor {nodeId: $predecessorId})
         MERGE (successor)-[:SUPERSEDES]->(predecessor)`,
        { newNodeId, predecessorId: input.predecessorId },
      );

      // (c) VERSION_OF edge IFF same-type-self-chain (SummaryMemory or InferredMemory only)
      // MemoryClaim is explicitly excluded — no VERSION_OF row in edge-matrix §1
      if (writeVersionOf) {
        await tx.run(
          `MATCH (successor {nodeId: $newNodeId})
           MATCH (predecessor {nodeId: $predecessorId})
           MERGE (successor)-[:VERSION_OF]->(predecessor)`,
          { newNodeId, predecessorId: input.predecessorId },
        );
      }

      // (d) predecessor.lifecycleState → superseded
      await tx.run(
        `MATCH (n {nodeId: $predecessorId})
         SET n.lifecycleState = 'superseded',
             n.supersessionTime = $supersessionTime`,
        { predecessorId: input.predecessorId, supersessionTime },
      );

      // (e) Supersession audit record
      // R56 Item 8 D3-internal close: `reason` field always populated. Non-null sentinel
      // 'system:d3-supersession' when caller doesn't supply (pre-Item-8-backfill precedent;
      // R56 council refused NULL-by-default for D3 path). Closes Michael R55 + Uriel F1 finding.
      const auditNodeId = randomUUID();
      const resolvedReason = input.reason ?? D3_SUPERSESSION_SENTINEL;
      // Item 27 R71: project_root tagged on SupersessionAudit so the node survives setDifferenceTeardown.
      await tx.run(
        `CREATE (a:SupersessionAudit {
           nodeId: $auditNodeId,
           newVersionNodeId: $newVersionNodeId,
           priorVersionNodeId: $priorVersionNodeId,
           supersessionTime: $supersessionTime,
           performerId: $performerId,
           ingestTime: $now,
           reason: $reason,
           project_root: $project_root
         })`,
        {
          auditNodeId,
          newVersionNodeId: newNodeId,
          priorVersionNodeId: input.predecessorId,
          supersessionTime,
          performerId: input.performerId,
          now: supersessionTime,
          reason: resolvedReason,
          project_root: resolvedProjectRoot,
        },
      );
    });
  } finally {
    await session.close();
  }

  const auditRecord: SupersessionAuditRecord = {
    newVersionNodeId: newNodeId,
    priorVersionNodeId: input.predecessorId,
    supersessionTime,
    performerId: input.performerId,
    reason: input.reason ?? D3_SUPERSESSION_SENTINEL,
  };

  return {
    status: 'superseded',
    newNodeId,
    predecessorId: input.predecessorId,
    versionOrdinal: newOrdinal,
    versionOfEdgeWritten: writeVersionOf,
    auditRecord,
  };
}
