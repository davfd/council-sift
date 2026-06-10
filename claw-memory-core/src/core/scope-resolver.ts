/**
 * scope-resolver.ts — Semantic Memory V4 Scope Node Resolver
 * Thread: C (iter2-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER2_INGEST.md
 * AD3: :Scope label with scopeName property
 * AD6 (R73 Item 28 rewire): Lazy MERGE on :Scope {scopeName} — semantic key.
 *
 * MERGE pattern (Item 28 R73 — post-F-BAR-3):
 *   MERGE (n:Scope {scopeName: $scopeName})
 *   ON CREATE SET n.nodeId = $nodeId, n.createdAt = datetime(), n.project_root = $project_root
 *   ON MATCH SET n.project_root = coalesce(n.project_root, $project_root)
 *   RETURN n.nodeId AS nodeId
 *
 * Pre-Item-28 (broken): MERGE on `nodeId` derived via `uuidv5(scopeName)` caused duplicate
 * Scope nodes when an existing literal-nodeId Scope (e.g., G10 'scope-council-deliberations-may-2026')
 * already carried the same scopeName. Item 19 (R71 5/5) merged the duplicate DATA; F-BAR-3
 * (Barachiel R73) caught that the CODE PATH still recreated duplicates on every remember() call.
 * Jeremiel R71: "rewire scope-resolver to MATCH G10 literal instead of MERGE-uuidv5."
 *
 * Post-fix: MERGE by scopeName (the semantic uniqueness key). Existing literal-nodeId Scope
 * nodes are MATCHED before any uuidv5 fallback fires. Return value gives whatever nodeId the
 * matched/created Scope carries — caller uses it for IN_SCOPE edges.
 *
 * IN_SCOPE edge creation is handled by the orchestrator (raw-event-ingester.ts) after scope
 * nodes are resolved.
 */

import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { deriveScopeNodeId } from './nodeid.js';

export interface ScopeResolveResult {
  nodeId: string;
}

/**
 * Resolve a :Scope node by scopeName.
 * Creates the :Scope node on first reference (lazy MERGE on scopeName per Item 28 R73).
 * Returns whatever nodeId the matched/created Scope carries.
 *
 * @param scopeName - The canonical scope name (e.g., 'council-deliberations')
 * @param neo4j     - Neo4jService instance for graph operations
 * @returns ScopeResolveResult with the :Scope node's nodeId (may be literal OR uuidv5)
 */
export async function resolveScope(
  scopeName: string,
  neo4j: Neo4jService,
  // Item 27 (R71 5/5 2026-05-20): tenant boundary on Scope nodes.
  // When provided, Scope is tagged with project_root so setDifferenceTeardown preserves it.
  project_root?: string,
): Promise<ScopeResolveResult> {
  // Item 28 R73 (post-F-BAR-3): MERGE by scopeName (semantic uniqueness key).
  // ON CREATE assigns uuidv5-derived nodeId as a deterministic fallback for first-write.
  // ON MATCH preserves whatever nodeId the existing Scope carries (e.g., G10 literal).
  // RETURN gives caller the live nodeId regardless of source.
  const fallbackNodeId = deriveScopeNodeId(scopeName);
  const rows = await neo4j.run(
    `MERGE (n:Scope {scopeName: $scopeName})
     ON CREATE SET
       n.nodeId       = $fallbackNodeId,
       n.createdAt    = datetime(),
       n.project_root = $project_root
     ON MATCH SET
       n.project_root = coalesce(n.project_root, $project_root)
     RETURN n.nodeId AS nodeId`,
    { scopeName, fallbackNodeId, project_root: project_root ?? null },
  );
  const nodeId = (rows[0]?.nodeId as string) ?? fallbackNodeId;
  return { nodeId };
}
