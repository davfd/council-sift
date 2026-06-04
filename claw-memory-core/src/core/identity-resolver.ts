/**
 * identity-resolver.ts — Semantic Memory V4 Identity Resolution
 * Thread: C (iter2-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER2_INGEST.md
 * Gate IG3 evidence: per-type policy per identity-normalization-v4.md §1.1–1.4
 *
 * Per-type policy (AD4, AD2):
 *   seat  / agent   → lazy MERGE on first reference (open-roster)
 *   operator        → registry lookup → throw UnknownOperatorError if unresolved
 *   user            → registry lookup → deferred-attribution marker if unresolved
 *
 * MERGE Cypher pattern (seat/agent/user when resolved):
 *   MERGE (n:<TypeLabel> {nodeId: $nodeId})
 *   ON CREATE SET n.identifier = $canonicalId, n.createdAt = datetime()
 *   RETURN n.nodeId as nodeId
 */

import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { resolve as registryResolve, IdentityType } from './identity-registry.js';
import { deriveIdentityNodeId } from './nodeid.js';

/** Thrown when an operator alias is not found in the registry (§1.3) */
export class UnknownOperatorError extends Error {
  constructor(label: string) {
    super(
      `UNKNOWN_OPERATOR: '${label}' is not registered in identity-registry.yaml. ` +
        'Ingest halted — no provisional node written (identity-normalization-v4.md §1.3).',
    );
    this.name = 'UnknownOperatorError';
  }
}

export type ResolveResult =
  | { status: 'resolved'; canonicalId: string; nodeId: string }
  | { status: 'deferred'; canonicalId: null; reason: 'unresolved_user' };

/** Map IdentityType → Neo4j label */
const TYPE_LABEL: Record<IdentityType, string> = {
  seat: 'Seat',
  agent: 'Agent',
  operator: 'Operator',
  user: 'User',
  system: 'system',
};

/**
 * Resolve and upsert an identity node per the per-type policy.
 *
 * @param label  - The alias or stable_id string to resolve
 * @param type   - The identity type (seat | agent | operator | user)
 * @param neo4j  - Neo4jService instance for graph operations
 * @returns ResolveResult — resolved with nodeId, or deferred for unresolved user
 * @throws UnknownOperatorError when operator is not in registry
 */
export async function resolveIdentity(
  label: string,
  type: IdentityType,
  neo4j: Neo4jService,
): Promise<ResolveResult> {
  const canonicalFromRegistry = registryResolve(label, type);

  // --- Operator policy (§1.3): halt if unresolved ---
  if (type === 'operator') {
    if (canonicalFromRegistry === null) {
      throw new UnknownOperatorError(label);
    }
    const canonicalId = canonicalFromRegistry;
    const nodeId = deriveIdentityNodeId(canonicalId);
    await mergeIdentityNode(type, canonicalId, nodeId, neo4j);
    return { status: 'resolved', canonicalId, nodeId };
  }

  // --- User policy (§1.4): defer if unresolved ---
  if (type === 'user') {
    if (canonicalFromRegistry === null) {
      // Attribution deferred; no node written
      return { status: 'deferred', canonicalId: null, reason: 'unresolved_user' };
    }
    const canonicalId = canonicalFromRegistry;
    const nodeId = deriveIdentityNodeId(canonicalId);
    await mergeIdentityNode(type, canonicalId, nodeId, neo4j);
    return { status: 'resolved', canonicalId, nodeId };
  }

  // --- Seat / Agent policy (§1.1, §1.2): lazy MERGE (open-roster) ---
  // If registry resolves: use canonical stable_id.
  // If registry miss: use label itself as canonical (open-roster; label assumed canonical format).
  const canonicalId = canonicalFromRegistry ?? label;
  const nodeId = deriveIdentityNodeId(canonicalId);
  await mergeIdentityNode(type, canonicalId, nodeId, neo4j);
  return { status: 'resolved', canonicalId, nodeId };
}

/**
 * MERGE identity node into the graph.
 * Creates on first reference; returns existing nodeId on subsequent calls.
 */
async function mergeIdentityNode(
  type: IdentityType,
  canonicalId: string,
  nodeId: string,
  neo4j: Neo4jService,
): Promise<void> {
  const label = TYPE_LABEL[type];
  await neo4j.run(
    `MERGE (n:${label} {nodeId: $nodeId})
     ON CREATE SET n.identifier = $canonicalId, n.createdAt = datetime()
     RETURN n.nodeId AS nodeId`,
    { nodeId, canonicalId },
  );
}
