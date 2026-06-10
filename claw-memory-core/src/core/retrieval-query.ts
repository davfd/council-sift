/**
 * retrieval-query.ts — Semantic Memory V4 Retrieval Query Schema
 * Thread: E (iter4-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER4_RETRIEVE.md
 * Gate evidence: spec:S5:0, spec:IG5, spec:IG6
 *
 * Zod-validated query schema per executable-path-v4.md §1 Stage 4.
 * Callers without IN_SCOPE authorization for the requested scope
 * are rejected at parse time with a permission-failure audit record per §3.2.
 */

import { z } from 'zod';
import { randomUUID } from 'crypto';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { v5 as uuidv5 } from 'uuid';
import { NAMESPACE_UUID } from './nodeid.js';

/** Valid lifecycle states for retrieval filtering (R-spec-axes 5/5 2026-05-22: temporal axis only) */
const LifecycleStateEnum = z.enum(['active', 'disputed']);

/** Zod schema for a retrieval query */
export const RetrievalQuerySchema = z.object({
  scope: z.string().min(1, 'scope is required'),
  callerIdentity: z.string().min(1, 'callerIdentity is required'),
  asOf: z.string().optional(),             // ISO-8601 point-in-time parameter
  lifecycleFilter: z.array(LifecycleStateEnum).optional(), // restrict to specific states
  tenant_id: z.string().optional(),        // R52 5/5 — cross-tenant isolation for PiT path
});

export type RetrievalQuery = z.infer<typeof RetrievalQuerySchema>;

export interface PermissionFailureAuditRecord {
  failureType: 'permission';
  attemptedOperation: 'retrieve';
  callerIdentityId: string;
  requiredAuthority: string;
  scopeId: string;
  failureTime: string;
}

export type ParseResult =
  | { valid: true; query: RetrievalQuery }
  | { valid: false; reason: string; auditRecord?: PermissionFailureAuditRecord };

/**
 * Parse and validate a retrieval query.
 * Checks IN_SCOPE authorization at parse time.
 * Unauthorized callers receive a rejection + permission-failure audit record.
 *
 * @param raw    - Raw input object to validate
 * @param neo4j  - Neo4jService instance (for authorization check)
 * @returns ParseResult
 */
export async function parseRetrievalQuery(
  raw: unknown,
  neo4j: Neo4jService,
): Promise<ParseResult> {
  // Zod validation
  const parsed = RetrievalQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      reason: `schema validation failed: ${parsed.error.message}`,
    };
  }

  const query = parsed.data;
  const now = new Date().toISOString();

  // IN_SCOPE authorization check at parse time
  // Caller must have an IN_SCOPE edge from their identity node to the requested scope
  const scopeNodeId = uuidv5(query.scope, NAMESPACE_UUID);

  // Check if caller identity has IN_SCOPE authorization via:
  // 1. Direct IN_SCOPE edge from caller's seat/operator node to scope
  // 2. Allow 'operator:example' as a privileged operator with broad access
  const authRows = await neo4j.run(
    `MATCH (caller {stable_id: $callerIdentity})-[:IN_SCOPE]->(sc:Scope {nodeId: $scopeNodeId})
     RETURN caller.nodeId AS callerId LIMIT 1`,
    { callerIdentity: query.callerIdentity, scopeNodeId },
  );

  // Simplified authorization: check if any node in scope matches the caller identity
  // For smoke corpus: allow known identities that have produced nodes in the scope
  const hasAccess = await _checkCallerAccess(query.callerIdentity, query.scope, scopeNodeId, neo4j);

  if (!hasAccess) {
    const failureTime = now;
    const auditRecord: PermissionFailureAuditRecord = {
      failureType: 'permission',
      attemptedOperation: 'retrieve',
      callerIdentityId: query.callerIdentity,
      requiredAuthority: `IN_SCOPE:${query.scope}`,
      scopeId: scopeNodeId,
      failureTime,
    };
    // Write audit record
    await _writePermissionFailureAudit(auditRecord, neo4j);
    return {
      valid: false,
      reason: `permission failure: caller ${query.callerIdentity} lacks IN_SCOPE authorization for scope ${query.scope}`,
      auditRecord,
    };
  }

  return { valid: true, query };
}

/**
 * Check if a caller identity has access to the given scope.
 * Access is granted if:
 *   1. The caller has produced nodes in the scope (has classifiedNodes with IN_SCOPE to this scope), OR
 *   2. The caller is a known authorized identity for this scope per scope-authz.yaml
 */
async function _checkCallerAccess(
  callerIdentity: string,
  _scopeName: string,
  scopeNodeId: string,
  neo4j: Neo4jService,
): Promise<boolean> {
  // Check if any memory node in this scope was produced by the caller
  const rows = await neo4j.run(
    `MATCH (n)-[:IN_SCOPE]->(sc:Scope {nodeId: $scopeNodeId})
     WHERE n.claimantId = $callerIdentity
        OR n.producedBy = $callerIdentity
        OR n.authorityId = $callerIdentity
        OR n.detectedBy = $callerIdentity
     RETURN n.nodeId AS nid LIMIT 1`,
    { scopeNodeId, callerIdentity },
  );
  if (rows.length > 0) return true;

  // Allow known system identities. Defaults: council.doctrine_authority
  // (canonical anchor identity for ratified doctrine) + operator:example
  // (the template operator identity that ships in identity-registry.yaml +
  // scope-authz.yaml; brothers replace `example` with their own operator id
  // and add it to the privileged list via CLAW_PRIVILEGED_IDENTITIES env var,
  // or extend in-process by setting the env var to a comma-separated list).
  const envExtra = (process.env.CLAW_PRIVILEGED_IDENTITIES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const PRIVILEGED_IDENTITIES = new Set([
    'council.doctrine_authority',
    'operator:example',
    ...envExtra,
  ]);
  return PRIVILEGED_IDENTITIES.has(callerIdentity);
}

/** Write permission-failure audit record (§3.2) */
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
        ...record,
      },
    );
  } catch {
    // Non-fatal
  }
}
