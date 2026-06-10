/**
 * version-lineage.ts — Semantic Memory V4 Version Lineage Enforcement
 * Thread: E (iter4-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER4_RETRIEVE.md
 * Gate evidence: spec:S3:0, spec:S6:7, spec:IG2
 *
 * Enforces schema-contracts-v4.md §3.1-§3.2 and time-governance-v4.md §3.1-§3.2
 * version lineage invariants for SummaryMemory and InferredMemory.
 *
 * Exports:
 *   validateVersionChain  — walks VERSION_OF edges back to versionOrdinal=1
 *   requirePriorVersionLink — rejects versionOrdinal > 1 with null priorVersionId
 *   rejectFirstVersionWithPrior — rejects versionOrdinal = 1 with non-null priorVersionId
 */

import { Neo4jService } from '../storage/neo4j/neo4j.service.js';

export interface VersionNode {
  nodeId: string;
  versionOrdinal: number;
  priorVersionId: string | null;
}

export interface VersionChainResult {
  valid: boolean;
  chain: string[];     // nodeIds from current to v1 (inclusive)
  error?: string;
}

/**
 * Walk VERSION_OF edges from the given nodeId back to the root (versionOrdinal=1).
 * Returns the ordered chain and detects gaps or cycles.
 *
 * Per schema-contracts-v4.md §3.1-§3.2: the chain from current back to versionOrdinal=1
 * must be fully traceable via VERSION_OF edges without gaps.
 *
 * @param nodeId  - Starting nodeId (the newest version)
 * @param neo4j   - Neo4jService instance
 * @returns VersionChainResult with chain[] and validity
 */
export async function validateVersionChain(
  nodeId: string,
  neo4j: Neo4jService,
): Promise<VersionChainResult> {
  const chain: string[] = [];
  const visited = new Set<string>();
  let currentId = nodeId;
  const MAX_DEPTH = 100; // cycle guard

  while (chain.length < MAX_DEPTH) {
    if (visited.has(currentId)) {
      return { valid: false, chain, error: `cycle detected at nodeId=${currentId}` };
    }
    visited.add(currentId);
    chain.push(currentId);

    // Get current node
    const rows = await neo4j.run(
      `MATCH (n {nodeId: $nodeId}) RETURN n.versionOrdinal AS ord, n.priorVersionId AS priorId LIMIT 1`,
      { nodeId: currentId },
    );
    if (rows.length === 0) {
      return { valid: false, chain, error: `nodeId not found: ${currentId}` };
    }

    const ord = Number(rows[0].ord);
    const priorId = rows[0].priorId as string | null;

    if (ord === 1) {
      // Reached root — chain is complete
      return { valid: true, chain };
    }

    // Non-root: must have a VERSION_OF edge to priorVersionId
    if (!priorId) {
      return {
        valid: false,
        chain,
        error: `gap: versionOrdinal=${ord} but priorVersionId=null at nodeId=${currentId}`,
      };
    }

    // Verify VERSION_OF edge exists
    const edgeRows = await neo4j.run(
      `MATCH (n {nodeId: $nodeId})-[:VERSION_OF]->(p {nodeId: $priorId}) RETURN p.nodeId AS pid LIMIT 1`,
      { nodeId: currentId, priorId },
    );
    if (edgeRows.length === 0) {
      return {
        valid: false,
        chain,
        error: `gap: VERSION_OF edge missing from ${currentId} to ${priorId}`,
      };
    }

    currentId = priorId;
  }

  return { valid: false, chain, error: `chain exceeded max depth ${MAX_DEPTH} (possible cycle)` };
}

/**
 * Reject if versionOrdinal > 1 AND priorVersionId is null or missing.
 * Per §3.1: non-first versions must link to predecessor.
 *
 * @param node - Version node to validate
 * @throws Error if versionOrdinal > 1 and priorVersionId is absent
 */
export function requirePriorVersionLink(node: VersionNode): void {
  if (node.versionOrdinal > 1 && (node.priorVersionId === null || node.priorVersionId === undefined)) {
    throw new Error(
      `version-lineage violation: versionOrdinal=${node.versionOrdinal} requires priorVersionId (§3.1/§3.2) but got null/undefined for nodeId=${node.nodeId}`,
    );
  }
}

/**
 * Reject if versionOrdinal = 1 AND priorVersionId is not null.
 * Per §3.1: first versions must not reference a prior version.
 *
 * @param node - Version node to validate
 * @throws Error if versionOrdinal = 1 and priorVersionId is present
 */
export function rejectFirstVersionWithPrior(node: VersionNode): void {
  if (node.versionOrdinal === 1 && node.priorVersionId !== null && node.priorVersionId !== undefined) {
    throw new Error(
      `version-lineage violation: versionOrdinal=1 must have priorVersionId=null (§3.1/§3.2) but got '${node.priorVersionId}' for nodeId=${node.nodeId}`,
    );
  }
}
