/**
 * retrieve.ts — Semantic Memory V4 Top-Level Retrieval Orchestrator
 * Thread: E (iter4-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER4_RETRIEVE.md
 * Gate evidence: spec:S5:4, spec:S6:4, spec:IG5, spec:IG6, spec:IG7
 *
 * AD1: retrieve(query): RetrievalResponse
 * Each RetrievalItem carries all 4 explainability fields:
 *   {status, provenance, scopeBasis, selectionRationale}
 * Missing any field → item REJECTED pre-delivery.
 *
 * Pipeline (executable-path-v4.md §1 Stage 4):
 *   1. Parse query → permission check
 *   2. If asOf present: PiT reconstruction via reconstructAt()
 *   3. Apply exclusion filter (4 defaults per §5)
 *   4. Rank results
 *   5. Compose RetrievalItem[] with all 4 explainability fields
 *   6. Reject items missing any field before delivery
 *   7. Emit retrieval audit record
 */

import { randomUUID } from 'crypto';
import { v5 as uuidv5 } from 'uuid';
// PN-EXT-1 import-path fix (EXT-M7): 6 relative imports → from 'claw-memory'
// BLOCK-EXT-2: only these 6 import lines modified; no content change; no relocation.
// authorized_by: E1 grant Jonathan 2026-05-05
import { Neo4jService, NAMESPACE_UUID, parseRetrievalQuery, applyExclusionFilters, composeRationale, reconstructAt, getProjectRoot } from 'claw-memory';
import type { RetrievalQuery } from 'claw-memory';
import type { MemoryNode } from 'claw-memory';
import type { RationaleContext } from 'claw-memory';
import type { PiTNode } from 'claw-memory';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RetrievalItem {
  nodeId: string;
  memoryType: string;
  content: string;
  // ── 4 required explainability fields (AD1 / executable-path-v4.md §4) ────
  status: string;                // lifecycleState at retrieval time
  provenance: string[];          // ordered nodeId chain from root RawEvent to this node
  scopeBasis: string;            // names IN_SCOPE edge + scope identifier
  selectionRationale: string;    // names ≥1 tracked criterion (AD3)
}

export interface RetrievalAuditRecord {
  auditNodeId: string;
  retrievalTime: string;
  callerIdentity: string;
  queryParameters: Record<string, unknown>;
  resultNodeIds: string[];
}

export interface RetrievalResponse {
  items: RetrievalItem[];
  retrievalTime: string;
  auditRecord: RetrievalAuditRecord;
  empty?: true;               // set when caller is out-of-scope (no results)
}

// ── Main retrieve function ────────────────────────────────────────────────────

/**
 * Top-level retrieval function.
 *
 * @param rawQuery - raw input to be parsed and validated
 * @param neo4j    - Neo4jService instance
 * @returns RetrievalResponse
 */
export async function retrieve(
  rawQuery: unknown,
  neo4j: Neo4jService,
): Promise<RetrievalResponse> {
  const retrievalTime = new Date().toISOString();

  // ── Step 1: Parse + permission check ────────────────────────────────────
  const parseResult = await parseRetrievalQuery(rawQuery, neo4j);
  if (!parseResult.valid) {
    // Out-of-scope caller: return empty response with audit record already written
    const emptyAudit: RetrievalAuditRecord = {
      auditNodeId: randomUUID(),
      retrievalTime,
      callerIdentity: (rawQuery as any)?.callerIdentity ?? 'unknown',
      queryParameters: rawQuery as Record<string, unknown>,
      resultNodeIds: [],
    };
    return { items: [], retrievalTime, auditRecord: emptyAudit, empty: true };
  }

  const query: RetrievalQuery = parseResult.query;

  // Determine authorized scope nodeIds for this caller
  const callerScopeNodeIds = [uuidv5(query.scope, NAMESPACE_UUID)];

  // ── Step 2: Fetch candidate nodes (PiT or current) ──────────────────────
  let candidates: MemoryNode[];

  if (query.asOf) {
    // PiT dispatch: reconstructAt throws CauseAttributionError if §2.4 fails
    // R52 5/5 — pass tenant explicitly for cross-tenant filter (default fallback to server root)
    const project_root = query.tenant_id ?? getProjectRoot();
    const pitResult = await reconstructAt(query.asOf, neo4j, callerScopeNodeIds, project_root);
    candidates = pitResult.nodes.map((n: PiTNode) => _toMemoryNode(n, callerScopeNodeIds));
  } else {
    // Current-recall
    candidates = await _fetchCurrentNodes(query, callerScopeNodeIds, neo4j);
  }

  // ── Step 3: Apply exclusion filter ──────────────────────────────────────
  const filterResult = applyExclusionFilters(candidates, query.asOf);
  const eligible = filterResult.included;

  // Apply lifecycle filter if provided
  const lifecycleFiltered = query.lifecycleFilter
    ? eligible.filter((n) => query.lifecycleFilter!.includes(n.lifecycleState as any))
    : eligible;

  // ── Step 4: Rank results ──────────────────────────────────────────────────
  // Rank by: verified > active > disputed, then by ingestTime desc (recency)
  const ranked = _rankNodes(lifecycleFiltered);

  // ── Step 5-6: Compose RetrievalItems, reject missing fields ─────────────
  const items: RetrievalItem[] = [];
  const rationaleContext = ranked.map((n) => ({
    nodeId: n.nodeId,
    lifecycleState: n.lifecycleState,
    confidenceScore: n.confidenceScore,
    ingestTime: (n as any).ingestTime,
    scopeMatch: query.scope,
  } as RationaleContext));

  for (const node of ranked) {
    const item = await _composeItem(node, query, rationaleContext, neo4j);
    // Reject items missing any of the 4 required fields (AD1 contract)
    if (!item.status || !item.provenance || item.provenance.length === 0 || !item.scopeBasis || !item.selectionRationale) {
      // Item missing required field — reject pre-delivery (log but don't include)
      continue;
    }
    items.push(item);
  }

  // ── Step 7: Emit retrieval audit record ──────────────────────────────────
  const auditRecord = await _writeRetrievalAudit(
    retrievalTime,
    query,
    items.map((i) => i.nodeId),
    neo4j,
  );

  return { items, retrievalTime, auditRecord };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _toMemoryNode(n: PiTNode, callerScopeNodeIds: string[]): MemoryNode {
  return {
    nodeId: n.nodeId,
    lifecycleState: n.lifecycleState,
    labels: n.labels,
    confidenceScore: n.confidenceScore,
    supersessionTime: n.supersessionTime,
    scopeNodeIds: n.scopeNodeIds ?? [],
    callerScopeNodeIds,
    ingestTime: n.ingestTime,
  } as MemoryNode & { ingestTime: string };
}

async function _fetchCurrentNodes(
  query: RetrievalQuery,
  callerScopeNodeIds: string[],
  neo4j: Neo4jService,
): Promise<MemoryNode[]> {
  const rows = await neo4j.run(
    `MATCH (n)-[:IN_SCOPE]->(sc:Scope {nodeId: $scopeNodeId})
     WHERE (n:MemoryClaim OR n:SummaryMemory OR n:InferredMemory OR
            n:DoctrineAnchor OR n:ConflictRecord)
       AND n.ingestTime IS NOT NULL
     OPTIONAL MATCH (n)-[:IN_SCOPE]->(allScopes:Scope)
     RETURN n.nodeId AS nodeId,
            labels(n) AS labels,
            n.lifecycleState AS lifecycleState,
            n.confidenceScore AS confidenceScore,
            n.supersessionTime AS supersessionTime,
            n.ingestTime AS ingestTime,
            collect(allScopes.nodeId) AS scopeNodeIds`,
    { scopeNodeId: callerScopeNodeIds[0] ?? '' },
  );

  return rows.map((row) => ({
    nodeId: row.nodeId as string,
    labels: row.labels as string[],
    lifecycleState: row.lifecycleState as string,
    confidenceScore: row.confidenceScore as number | undefined,
    supersessionTime: row.supersessionTime as string | undefined,
    scopeNodeIds: row.scopeNodeIds as string[],
    callerScopeNodeIds,
    ingestTime: row.ingestTime as string,
  } as MemoryNode & { ingestTime: string }));
}

function _rankNodes(nodes: MemoryNode[]): MemoryNode[] {
  const stateOrder: Record<string, number> = { verified: 0, active: 1, disputed: 2 };
  return [...nodes].sort((a, b) => {
    const sa = stateOrder[a.lifecycleState] ?? 99;
    const sb = stateOrder[b.lifecycleState] ?? 99;
    if (sa !== sb) return sa - sb;
    // Recency: newer ingestTime first
    const ta = (a as any).ingestTime ?? '';
    const tb = (b as any).ingestTime ?? '';
    return tb.localeCompare(ta);
  });
}

async function _composeItem(
  node: MemoryNode,
  query: RetrievalQuery,
  comparisonSet: RationaleContext[],
  neo4j: Neo4jService,
): Promise<RetrievalItem> {
  const labels = node.labels ?? [];
  const memoryType = labels.find((l) =>
    ['MemoryClaim', 'SummaryMemory', 'InferredMemory', 'DoctrineAnchor', 'ConflictRecord'].includes(l),
  ) ?? 'Unknown';

  // ── status field ──────────────────────────────────────────────────────────
  const status = node.lifecycleState; // from node.lifecycleState

  // ── provenance chain (ordered nodeId list from root RawEvent to this node) ─
  const provenance = await _buildProvenanceChain(node.nodeId, neo4j);

  // ── scopeBasis field ──────────────────────────────────────────────────────
  const scopeBasis = `IN_SCOPE edge authorizes retrieval for scope '${query.scope}' (scopeNodeId: ${node.scopeNodeIds[0] ?? uuidv5(query.scope, NAMESPACE_UUID)})`;

  // ── selectionRationale (composeRationale — throws if no tracked criteria) ─
  let selectionRationale: string;
  try {
    selectionRationale = composeRationale(
      {
        nodeId: node.nodeId,
        lifecycleState: node.lifecycleState,
        confidenceScore: node.confidenceScore,
        ingestTime: (node as any).ingestTime,
        scopeMatch: query.scope,
      },
      { scope: query.scope, asOf: query.asOf },
      comparisonSet,
    );
  } catch {
    // composeRationale threw — item has no valid rationale, will be filtered below
    selectionRationale = '';
  }

  // Fetch content text
  const contentRow = await neo4j.run(
    `MATCH (n {nodeId: $nodeId}) RETURN coalesce(n.content, n.claimText, n.summaryText, n.inferenceText, n.doctrineText, n.nodeId) AS content LIMIT 1`,
    { nodeId: node.nodeId },
  );
  const content = contentRow.length > 0 ? String(contentRow[0].content) : node.nodeId;

  return { nodeId: node.nodeId, memoryType, content, status, provenance, scopeBasis, selectionRationale };
}

/** Build provenance chain from root RawEvent to this node via provenance edges */
async function _buildProvenanceChain(nodeId: string, neo4j: Neo4jService): Promise<string[]> {
  // Walk DERIVED_FROM / SUMMARIZES / INFERRED_FROM edges to find root RawEvent
  const rows = await neo4j.run(
    `MATCH path = (n {nodeId: $nodeId})-[:DERIVED_FROM|SUMMARIZES|INFERRED_FROM*1..10]->(root:RawEvent)
     RETURN [node IN nodes(path) | node.nodeId] AS chain LIMIT 1`,
    { nodeId },
  );
  if (rows.length > 0) {
    return rows[0].chain as string[];
  }
  // Node is itself a root (RawEvent) or has no provenance chain recorded
  return [nodeId];
}

async function _writeRetrievalAudit(
  retrievalTime: string,
  query: RetrievalQuery,
  resultNodeIds: string[],
  neo4j: Neo4jService,
): Promise<RetrievalAuditRecord> {
  const auditNodeId = randomUUID();
  // Tier B class-sweep follow-up (R-spec-axes 5/5 2026-05-22): inherit project_root
  // from query.tenant_id (R52 5/5 cross-tenant isolation field). Commit C (Gabriel A3
  // 2026-05-23): when tenant_id absent, derive from the first result node's project_root
  // so RetrievalAudit is always tagged. Closes the residual NULL-RA case Gabriel A3 named.
  let projectRoot: string | null = query.tenant_id ?? null;
  if (projectRoot === null && resultNodeIds.length > 0) {
    try {
      const rows = await neo4j.run(
        `MATCH (n {nodeId: $nodeId})
         WHERE n.project_root IS NOT NULL
         RETURN n.project_root AS pr
         LIMIT 1`,
        { nodeId: resultNodeIds[0] },
      );
      projectRoot = (rows[0]?.pr as string | undefined) ?? null;
    } catch {
      // Non-fatal — RetrievalAudit will be tagged NULL; m011-class backfill catches it.
    }
  }
  try {
    await neo4j.run(
      `CREATE (a:RetrievalAudit {
         nodeId: $auditNodeId,
         retrievalTime: $retrievalTime,
         callerIdentity: $callerIdentity,
         scope: $scope,
         asOf: $asOf,
         resultCount: $resultCount,
         ingestTime: $retrievalTime,
         project_root: $projectRoot
       })`,
      {
        auditNodeId,
        retrievalTime,
        callerIdentity: query.callerIdentity,
        scope: query.scope,
        asOf: query.asOf ?? null,
        resultCount: resultNodeIds.length,
        projectRoot,
      },
    );
  } catch {
    // Non-fatal
  }
  return {
    auditNodeId,
    retrievalTime,
    callerIdentity: query.callerIdentity,
    queryParameters: { scope: query.scope, asOf: query.asOf },
    resultNodeIds,
  };
}
