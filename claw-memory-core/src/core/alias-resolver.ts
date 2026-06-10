/**
 * alias-resolver.ts — Semantic Memory V4 Alias Resolver
 * Thread: D (iter3-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER3_CLASSIFY.md
 * Gate evidence: spec:S3:1, spec:IG3
 *
 * AD5: :Alias label with nodeId uniqueness. UUID v5 from locked namespace.
 * identity-normalization-v4.md §1.5:
 *   - :Alias nodes are AUDIT-ONLY; they must not appear as primary identity
 *     references in any provenance or scope edge.
 *   - All downstream edges target the CANONICAL nodeId, not the alias nodeId.
 *   - resolveAlias writes the :Alias node for audit, then returns the canonical nodeId.
 */

import { v5 as uuidv5 } from 'uuid';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { NAMESPACE_UUID } from './nodeid.js';

export type IdentityType = 'seat' | 'agent' | 'operator' | 'user';

export interface AliasResolveResult {
  canonicalNodeId: string;
  aliasNodeId: string;
}

/**
 * Derive a deterministic nodeId for an :Alias node.
 * UUID v5 of the aliasLabel using the locked semantic-memory-v4 namespace.
 *
 * @param aliasLabel - The alias label string (e.g., 'alias:operator:example:jcb')
 * @returns UUID v5 string
 */
export function deriveAliasNodeId(aliasLabel: string): string {
  return uuidv5(aliasLabel, NAMESPACE_UUID);
}

/**
 * Resolve an alias to its canonical identity node.
 *
 * Per identity-normalization-v4.md §1.5:
 *   1. The canonical nodeId is derived from the targetStableId (not the alias).
 *   2. The :Alias node is written for audit purposes only.
 *   3. All edges that would target the alias are rewritten to target canonicalNodeId.
 *
 * @param aliasLabel     - The alias label string (e.g., 'alias:operator:example:jcb')
 * @param targetType     - The identity type of the canonical target
 * @param targetStableId - The canonical stable_id (e.g., 'operator:example')
 * @param neo4j          - Neo4jService instance
 * @returns AliasResolveResult with canonicalNodeId (for edge substitution) and aliasNodeId (audit)
 */
export async function resolveAlias(
  aliasLabel: string,
  targetType: IdentityType,
  targetStableId: string,
  neo4j: Neo4jService,
): Promise<AliasResolveResult> {
  // Derive alias nodeId (for audit-only :Alias node)
  const aliasNodeId = deriveAliasNodeId(aliasLabel);

  // Derive canonical nodeId from the targetStableId (same derivation as identity-resolver.ts)
  const canonicalNodeId = uuidv5(targetStableId, NAMESPACE_UUID);

  const typeLabel = targetType.charAt(0).toUpperCase() + targetType.slice(1);

  // Write audit-only :Alias node (MERGE — idempotent)
  await neo4j.run(
    `MERGE (a:Alias {nodeId: $aliasNodeId})
     ON CREATE SET
       a.aliasLabel    = $aliasLabel,
       a.targetStableId = $targetStableId,
       a.targetType    = $targetType,
       a.createdAt     = datetime()
     RETURN a.nodeId AS nodeId`,
    { aliasNodeId, aliasLabel, targetStableId, targetType },
  );

  // Ensure the canonical identity node exists (lazy MERGE for audit linkage)
  await neo4j.run(
    `MERGE (n:${typeLabel} {nodeId: $nodeId})
     ON CREATE SET n.identifier = $canonicalId, n.createdAt = datetime()
     RETURN n.nodeId AS nodeId`,
    { nodeId: canonicalNodeId, canonicalId: targetStableId },
  );

  // Return canonicalNodeId for edge substitution (NOT aliasNodeId)
  // All downstream edges (provenance, scope) must target canonicalNodeId.
  return { canonicalNodeId, aliasNodeId };
}
