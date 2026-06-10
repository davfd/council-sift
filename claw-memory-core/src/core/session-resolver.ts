/**
 * session-resolver.ts — Semantic Memory V4 Session Resolver
 * Thread: D (iter3-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER3_CLASSIFY.md
 * Gate evidence: spec:S3:2, spec:IG3
 *
 * AD5: :Session label with nodeId uniqueness. UUID v5 from locked namespace.
 * identity-normalization-v4.md §1.6:
 *   - Sessions are transient identity references that must be re-attributed
 *     to a canonical user/operator identity before a memory node is finalized.
 *   - If session resolution succeeds: return {status: 'resolved', canonicalIdentity}
 *   - If session cannot be re-attributed: return {status: 'pending_attribution', sessionNodeId}
 *     The memory node must NOT be made retrieval-eligible until attribution resolves.
 */

import { v5 as uuidv5 } from 'uuid';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { NAMESPACE_UUID } from './nodeid.js';

export type SessionResolveResult =
  | { status: 'resolved'; canonicalIdentity: string }
  | { status: 'pending_attribution'; sessionNodeId: string };

/**
 * Derive a deterministic nodeId for a :Session node.
 * UUID v5 of the sessionUuid using the locked semantic-memory-v4 namespace.
 *
 * @param sessionUuid - The session UUID string
 * @returns UUID v5 string
 */
export function deriveSessionNodeId(sessionUuid: string): string {
  return uuidv5(sessionUuid, NAMESPACE_UUID);
}

/**
 * Resolve a session UUID to a canonical identity.
 *
 * Per identity-normalization-v4.md §1.6:
 *   1. Look up :Session node in the graph by sessionUuid.
 *   2. If the :Session node has a canonical_identity property → resolved.
 *   3. Otherwise → create/update the :Session node with pending_attribution status
 *      and return pending_attribution state.
 *
 * Memory nodes with pending_attribution status must NOT be finalized until
 * the session is resolved to a canonical identity.
 *
 * @param sessionUuid - The session UUID to resolve
 * @param neo4j       - Neo4jService instance
 * @returns SessionResolveResult — resolved with canonicalIdentity, or pending_attribution
 */
export async function resolveSession(
  sessionUuid: string,
  neo4j: Neo4jService,
  // Item 27 (R71 5/5 2026-05-20): optional project_root for tenant boundary protection.
  // When supplied, Session node is tagged with project_root on CREATE so it survives
  // setDifferenceTeardown cleanup. Caller (remember.ts) passes this through from the
  // MemoryClaim being written; the Session belongs to the same tenant as its observers.
  project_root?: string,
  // R-spec-3 5/5 Layer-B-only (2026-05-22): optional callingSeat for G8 Guard 1.
  // When supplied (already R59-normalized as 'seat:<name>' or 'operator:<name>' by callers),
  // Session node is tagged so OBSERVED_IN traversals can collect distinct witness identities.
  // collectSessionCorpus() reads DISTINCT s.calling_seat for the witnessSeats array;
  // checkGuard1() requires new Set(witnessSeats).size >= 2 — agent independence, not URI count.
  // ON MATCH preserves first-recorded value via coalesce; subsequent same-session writes
  // by the same seat are idempotent (the seat identity belongs to the session, not to writes).
  callingSeat?: string,
): Promise<SessionResolveResult> {
  const sessionNodeId = deriveSessionNodeId(sessionUuid);

  // Look up existing :Session node in the graph
  const rows = await neo4j.run(
    `MATCH (s:Session {nodeId: $sessionNodeId})
     RETURN s.canonical_identity AS canonicalIdentity, s.status AS status`,
    { sessionNodeId },
  );

  if (rows.length > 0 && rows[0]?.canonicalIdentity) {
    // Session has been resolved to a canonical identity.
    // R-spec-3: still write calling_seat if supplied + not yet recorded (coalesce semantic).
    if (callingSeat) {
      await neo4j.run(
        `MATCH (s:Session {nodeId: $sessionNodeId})
         SET s.calling_seat = coalesce(s.calling_seat, $callingSeat)`,
        { sessionNodeId, callingSeat },
      );
    }
    return {
      status: 'resolved',
      canonicalIdentity: rows[0].canonicalIdentity as string,
    };
  }

  // Session not found or not yet attributed — create/update in pending_attribution state
  await neo4j.run(
    `MERGE (s:Session {nodeId: $sessionNodeId})
     ON CREATE SET
       s.sessionUuid  = $sessionUuid,
       s.status       = 'pending_attribution',
       s.createdAt    = datetime(),
       s.project_root = $project_root,
       s.calling_seat = $callingSeat
     ON MATCH SET
       s.status       = CASE WHEN s.canonical_identity IS NULL
                             THEN 'pending_attribution'
                             ELSE s.status END,
       s.project_root = coalesce(s.project_root, $project_root),
       s.calling_seat = coalesce(s.calling_seat, $callingSeat)
     RETURN s.nodeId AS nodeId`,
    {
      sessionNodeId,
      sessionUuid,
      project_root: project_root ?? null,
      callingSeat: callingSeat ?? null,
    },
  );

  return {
    status: 'pending_attribution',
    sessionNodeId,
  };
}

/**
 * Attribute a session to a canonical identity.
 * Called when attribution becomes known (e.g., user logs in and session is traced).
 *
 * @param sessionUuid        - The session UUID to attribute
 * @param canonicalIdentity  - The canonical stable_id of the resolved identity
 * @param neo4j              - Neo4jService instance
 */
export async function attributeSession(
  sessionUuid: string,
  canonicalIdentity: string,
  neo4j: Neo4jService,
): Promise<void> {
  // R77 close — Commit C (Gabriel A4 / Uriel F2 2026-05-23): MATCH-only. The
  // function contract is "attribute an *already-resolved* session" — MERGE-create
  // semantics here were always wrong because the caller never provides project_root,
  // and Session writes without project_root are test-cleanup-fragile (Tier B class
  // bug). If the Session doesn't exist, the caller should call resolveSession() first;
  // attributeSession() is a no-op in that case (silent — not a hard error since
  // attribution is metadata enrichment, not a state machine transition).
  const sessionNodeId = deriveSessionNodeId(sessionUuid);
  await neo4j.run(
    `MATCH (s:Session {nodeId: $sessionNodeId})
     SET s.canonical_identity = $canonicalIdentity,
         s.status             = 'resolved'
     RETURN s.nodeId AS nodeId`,
    { sessionNodeId, sessionUuid, canonicalIdentity },
  );
}
