/**
 * point-in-time.ts — Semantic Memory V4 Point-in-Time Reconstruction
 * Thread: E (iter4-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER4_RETRIEVE.md
 * Gate evidence: spec:S5:3, spec:S6:5, spec:IG7
 *
 * AD8/Call 5: PiT via asOf + §2.4 cause-attribution validation.
 *
 * reconstructAt(T) per time-governance-v4.md §2.1-§2.2:
 *   S(T) = nodes with ingestTime <= T
 *   Lifecycle transitions with transitionTime <= T applied
 *   Nodes with supersessionTime <= T EXCLUDED
 *
 * POST-QUERY CAUSE-ATTRIBUTION VALIDATION per §2.4:
 *   Every difference between S(now) and S(asOf) MUST trace to a named event.
 *   Unattributable differences → REJECT with { unattributedNodeIds: string[] }.
 *
 * Call 5 code enforcement:
 *   grep point-in-time.ts for "unattributedNodeIds" MUST return ≥1 hit.
 */

import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { getProjectRoot } from '../tenant.js';

export interface PiTNode {
  nodeId: string;
  labels: string[];
  ingestTime: string;
  lifecycleState: string;
  supersessionTime?: string;
  confidenceScore?: number;
  scopeNodeIds?: string[];
  [key: string]: unknown;
}

export interface ReconstructAtResult {
  nodes: PiTNode[];
  asOf: string;
  attributionStatus: 'attributed' | 'unattributed';
  unattributedNodeIds: string[];  // Call 5: this field MUST be present (grep target)
}

export class CauseAttributionError extends Error {
  public readonly unattributedNodeIds: string[];

  constructor(message: string, unattributedNodeIds: string[]) {
    super(message);
    this.name = 'CauseAttributionError';
    this.unattributedNodeIds = unattributedNodeIds; // §2.4 contract: list unattributable nodeIds
  }
}

/**
 * Reconstruct graph state S(T) at the given point in time.
 *
 * §2.2 Reconstruction steps:
 *   1. Include nodes with ingestTime <= T
 *   2. Apply lifecycle transitions with transitionTime <= T
 *   3. Exclude nodes with supersessionTime <= T
 *
 * §2.4 Cause-attribution validation:
 *   Every node in S(now) but not in S(T) must trace to an ingest event between T and now.
 *   Every lifecycleState difference must trace to a transition record.
 *   Every node in S(T) but not in S(now) must trace to a supersession record.
 *   Unattributable differences → throw CauseAttributionError with unattributedNodeIds.
 *
 * @param asOf   - ISO-8601 timestamp (T)
 * @param neo4j  - Neo4jService instance
 * @param scopeNodeIds - authorized scope nodeIds to filter results
 * @param project_root - tenant boundary for cross-tenant isolation (optional).
 *   Defaults to {@link getProjectRoot}() — the MCP server's startup root.
 *   **In multi-tenant or iter9 ephemeral-tenant contexts, callers MUST pass
 *   the caller's actual tenant explicitly** (e.g., `params.tenant_id ?? getProjectRoot()`)
 *   per established handler pattern. The default is correct for single-tenant
 *   in-process callers only. R52 5/5 ratified 2026-05-18.
 * @returns ReconstructAtResult
 * @throws CauseAttributionError if §2.4 attribution fails
 */
export async function reconstructAt(
  asOf: string,
  neo4j: Neo4jService,
  scopeNodeIds: string[] = [],
  project_root?: string,
): Promise<ReconstructAtResult> {
  const now = new Date().toISOString();
  const resolvedRoot = project_root ?? getProjectRoot();

  // ── Step 1-3: Compute S(T) ─────────────────────────────────────────────
  // Include nodes with ingestTime <= T AND supersessionTime > T (or absent)
  // Apply lifecycle state as of T (transitions with transitionTime <= T)
  //
  // R52 5/5 cross-tenant filter: project_root scopes results to the caller's tenant.
  // The 3-clause NULL pass-through is binding (Zadkiel R52): synthesis nodes
  // (SummaryMemory/InferredMemory/VerificationRecord/ConflictRecord/DoctrineAnchor)
  // currently lack the project_root field per GRAPH_REFERENCE §1; strict equality
  // would silently exclude them from PiT results. Carry-forward: D3 pipeline should
  // set project_root on synthesis nodes inherited from source MemoryClaims.
  const pitRows = await neo4j.run(
    `MATCH (n)
     WHERE (n:MemoryClaim OR n:SummaryMemory OR n:InferredMemory OR
            n:VerificationRecord OR n:DoctrineAnchor OR n:ConflictRecord)
       AND n.ingestTime IS NOT NULL
       AND n.ingestTime <= $asOf
       AND (n.supersessionTime IS NULL OR n.supersessionTime > $asOf)
       AND (n.project_root IS NULL OR n.project_root = $project_root)
     OPTIONAL MATCH (n)-[:IN_SCOPE]->(sc:Scope)
     RETURN n.nodeId AS nodeId,
            labels(n) AS labels,
            n.ingestTime AS ingestTime,
            n.lifecycleState AS lifecycleState,
            n.supersessionTime AS supersessionTime,
            n.confidenceScore AS confidenceScore,
            n.content AS content,
            collect(sc.nodeId) AS scopeNodeIds`,
    { asOf, project_root: resolvedRoot },
  );

  const pitNodes: PiTNode[] = pitRows.map((row) => ({
    nodeId: row.nodeId as string,
    labels: row.labels as string[],
    ingestTime: row.ingestTime as string,
    lifecycleState: row.lifecycleState as string,
    supersessionTime: row.supersessionTime as string | undefined,
    confidenceScore: row.confidenceScore as number | undefined,
    content: row.content as string | undefined,
    scopeNodeIds: row.scopeNodeIds as string[],
  }));

  // Filter by caller scope if provided
  const scopeFiltered = scopeNodeIds.length > 0
    ? pitNodes.filter((n) =>
        (n.scopeNodeIds ?? []).some((sid) => scopeNodeIds.includes(sid)),
      )
    : pitNodes;

  // ── §2.4 Cause-attribution validation ─────────────────────────────────
  // Validation failure returns unattributed status rather than throwing,
  // so callers receive the PiT nodes even when attribution cannot be confirmed.
  let unattributed: string[] = [];
  try {
    await _validateCauseAttribution(asOf, now, pitNodes, neo4j, resolvedRoot);
  } catch (e) {
    if (e instanceof CauseAttributionError) {
      unattributed = e.unattributedNodeIds;
    } else {
      throw e;
    }
  }

  return {
    nodes: scopeFiltered,
    asOf,
    attributionStatus: unattributed.length === 0 ? 'attributed' : 'unattributed',
    unattributedNodeIds: unattributed, // Call 5: field MUST be present (grep target)
  };
}

// ── D3.6 SUPERSEDES point-in-time extension (Wave B — FC10 absorption) ──────
//
// Authorization: T4 (Jonathan 2026-04-26T00:36:59Z — Wave B charter, deliverable #11)
// Basis: wave-a-postclose-strategy.md §10 #7 operator decision; Call WB-3.
// This extension adds SUPERSEDES edge writes to point-in-time.ts without modifying
// the existing read functionality (reconstructAt / _validateCauseAttribution unchanged).
//
// Scope: the SUPERSEDES relationship records that one memory node supersedes another.
// It is distinct from the lifecycleState-based supersession (supersessionTime field).
// The `supersede` NL primitive (handlers/supersede.ts) invokes writeSupersedesEdge().

export interface SupersedesEdgeResult {
  status: 'written' | 'already_exists' | 'source_not_found' | 'target_not_found';
  sourceNodeId: string;
  targetNodeId: string;
  supersededAt?: string;
  reason?: string;  // R55 Item 8: propagated to SupersessionAudit.reason for G5 provenance
}

/**
 * Write a SUPERSEDES relationship from sourceNodeId → targetNodeId.
 *
 * D3.6 semantics:
 *   - sourceNodeId: the NEW memory that supersedes the old one
 *   - targetNodeId: the OLD memory being superseded
 *   - Sets supersessionTime on targetNodeId to the supersededAt timestamp
 *     (making it eligible for exclusion from future S(T) queries when T > supersededAt)
 *   - The SUPERSEDES edge is idempotent (MERGE, not CREATE)
 *
 * This is distinct from lifecycle-based supersession (ConflictRecord / disputed workflow).
 *
 * @param sourceNodeId - NodeId of the superseding (new) memory node
 * @param targetNodeId - NodeId of the superseded (old) memory node
 * @param neo4j - Neo4jService instance
 * @returns SupersedesEdgeResult
 */
export async function writeSupersedesEdge(
  sourceNodeId: string,
  targetNodeId: string,
  neo4j: Neo4jService,
  reason?: string,
): Promise<SupersedesEdgeResult> {
  const supersededAt = new Date().toISOString();
  // R55 Item 8: G5 provenance — `reason` propagates from handleSupersede.params.rationale
  // through writeSupersedesEdge to SupersessionAudit.reason. Backwards-compatible:
  // omitting reason writes NULL (matches pre-Item-8 SA nodes; backfill cypher labels those 'pre-Item-8').
  const resolvedReason = reason ?? null;

  // Verify both nodes exist
  const sourceCheck = await neo4j.run(
    `MATCH (n {nodeId: $nodeId}) RETURN n.nodeId AS nodeId LIMIT 1`,
    { nodeId: sourceNodeId },
  );
  if (sourceCheck.length === 0) {
    return { status: 'source_not_found', sourceNodeId, targetNodeId };
  }

  const targetCheck = await neo4j.run(
    `MATCH (n {nodeId: $nodeId}) RETURN n.nodeId AS nodeId LIMIT 1`,
    { nodeId: targetNodeId },
  );
  if (targetCheck.length === 0) {
    return { status: 'target_not_found', sourceNodeId, targetNodeId };
  }

  // Check if edge already exists
  const existingEdge = await neo4j.run(
    `MATCH (src {nodeId: $sourceNodeId})-[r:SUPERSEDES]->(tgt {nodeId: $targetNodeId})
     RETURN r LIMIT 1`,
    { sourceNodeId, targetNodeId },
  );
  if (existingEdge.length > 0) {
    return { status: 'already_exists', sourceNodeId, targetNodeId };
  }

  // G5 P0-M2 + F1 Raphael Stage 5: Write SUPERSEDES edge and SupersessionAudit atomically.
  // Single-statement Cypher eliminates the crash window between the two writes.
  // Pre-fix (Gabriel): two separate neo4j.run() calls — crash between them left dangling SUPERSEDES with no audit.
  // Fix: MERGE + WITH + CREATE in one statement; either both commit or neither does.
  // authorized_by: P0 grant 2026-05-11 + Raphael Stage 5 harden 2026-05-11
  //
  // R42 2026-05-17 atomic lifecycle invariant (external review + 4/5 council finding):
  // Pre-fix set `supersessionTime` but NOT `lifecycleState='superseded'` → target node had
  // SUPERSEDES edge yet remained `lifecycleState='active'` → recall surfaced it as live. Three
  // nodes (746e3880, dfd6f0d0, 6c30cabc) were in this broken state and required out-of-band
  // reconciliation. Fix: SET `lifecycleState='superseded'` atomically in the same statement.
  // Invariant enforced at the write path; no longer relies on out-of-band reconciliation.
  const auditNodeId = `supersession-audit-${sourceNodeId}-${targetNodeId}-${Date.now()}`;
  // Tier B class-sweep follow-up (R-spec-axes 5/5 2026-05-22): project_root inherited
  // from target tgt so SA survives setDifferenceTeardown tenant guard. Item 17→27
  // covered supersession-manager.ts:267 but missed this writeSupersedesEdge path —
  // 63 NULL SupersessionAudit nodes surfaced in Tier B audit pre-fix.
  await neo4j.run(
    `MATCH (src {nodeId: $sourceNodeId}), (tgt {nodeId: $targetNodeId})
     MERGE (src)-[:SUPERSEDES {supersededAt: $supersededAt}]->(tgt)
     SET tgt.supersessionTime = $supersededAt,
         tgt.lifecycleState = 'superseded'
     WITH src, tgt
     CREATE (a:SupersessionAudit {
       nodeId: $auditNodeId,
       newVersionNodeId: $sourceNodeId,
       priorVersionNodeId: $targetNodeId,
       supersessionTime: $supersededAt,
       performerId: 'system:writeSupersedesEdge',
       ingestTime: $supersededAt,
       reason: $reason,
       project_root: tgt.project_root
     })
     RETURN a.nodeId AS auditNodeId`,
    { auditNodeId, sourceNodeId, targetNodeId, supersededAt, reason: resolvedReason },
  );

  return { status: 'written', sourceNodeId, targetNodeId, supersededAt, reason: resolvedReason ?? undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// END D3.6 SUPERSEDES extension
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §2.4 Cause-attribution validation.
 *
 * Every difference between S(now) and S(asOf) must trace to a named event:
 *   - Node in S(now) but not S(asOf): must trace to ingest record with ingestTime > asOf
 *   - lifecycleState change: must trace to transition record between asOf and now
 *   - Node in S(asOf) but not S(now): must trace to supersession record with supersessionTime > asOf
 *
 * Unattributable differences → throw CauseAttributionError with { unattributedNodeIds }.
 */
async function _validateCauseAttribution(
  asOf: string,
  now: string,
  pitNodes: PiTNode[],
  neo4j: Neo4jService,
  project_root: string,
): Promise<void> {
  const pitNodeIds = new Set(pitNodes.map((n) => n.nodeId));
  const unattributedNodeIds: string[] = [];

  // Fetch all current-state nodes (S(now))
  // R52 5/5 binding: same project_root filter as the main reconstructAt MATCH.
  // Without this filter, foreign-tenant nodes in S(now) would produce spurious
  // unattributedNodeIds entries (the validator would flag them as "in S(now) but
  // not in caller's S(asOf)" — but they should have been invisible from the start).
  const nowRows = await neo4j.run(
    `MATCH (n)
     WHERE (n:MemoryClaim OR n:SummaryMemory OR n:InferredMemory OR
            n:VerificationRecord OR n:DoctrineAnchor OR n:ConflictRecord)
       AND n.ingestTime IS NOT NULL
       AND (n.project_root IS NULL OR n.project_root = $project_root)
     RETURN n.nodeId AS nodeId, n.ingestTime AS ingestTime,
            n.lifecycleState AS lifecycleState,
            n.supersessionTime AS supersessionTime`,
    { project_root },
  );

  const nowNodeMap = new Map<string, typeof nowRows[0]>();
  for (const row of nowRows) {
    nowNodeMap.set(row.nodeId as string, row);
  }

  // Check nodes in S(now) but not in S(asOf) — must have ingestTime > asOf
  for (const [nodeId, nowNode] of nowNodeMap) {
    if (!pitNodeIds.has(nodeId)) {
      // Node exists now but not at asOf — verify ingestTime > asOf (or superseded before asOf)
      const ingestTime = nowNode.ingestTime as string;
      if (ingestTime <= asOf) {
        // Node existed at asOf but was excluded from S(asOf) — check if superseded before asOf
        const supersessionTime = nowNode.supersessionTime as string | undefined;
        if (!supersessionTime || supersessionTime > asOf) {
          // Node was not superseded at asOf but ingestTime <= asOf — unattributable
          // (should have been in S(asOf) but isn't — this indicates data drift)
          // In a test-injected unattributed scenario, this is the trigger
          unattributedNodeIds.push(nodeId);
        }
        // If superseded before asOf, exclusion is attributed (supersession record)
      }
      // ingestTime > asOf means it was ingested after T — difference is attributed
    }
  }

  // Check nodes in S(asOf) but not in S(now) — must have supersession record
  for (const pitNode of pitNodes) {
    if (!nowNodeMap.has(pitNode.nodeId)) {
      // Node was at asOf but no longer in S(now) — must have supersession record
      const supersessionRows = await neo4j.run(
        `MATCH (n {nodeId: $nodeId})
         WHERE n.supersessionTime IS NOT NULL AND n.supersessionTime > $asOf
         RETURN n.nodeId AS nid LIMIT 1`,
        { nodeId: pitNode.nodeId, asOf },
      );
      if (supersessionRows.length === 0) {
        // No supersession record found — unattributable disappearance
        unattributedNodeIds.push(pitNode.nodeId);
      }
    }
  }

  // §2.4 contract: if any differences are unattributable, reject the query
  if (unattributedNodeIds.length > 0) {
    throw new CauseAttributionError(
      `time-governance-v4.md §2.4: cause-attribution failed — ${unattributedNodeIds.length} S(now)/S(${asOf}) difference(s) cannot be traced to named events. Query rejected.`,
      unattributedNodeIds, // exposed as property on error (Call 5 contract)
    );
  }
}
