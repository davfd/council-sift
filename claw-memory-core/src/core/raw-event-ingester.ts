/**
 * raw-event-ingester.ts — Semantic Memory V4 RawEvent Ingest Orchestrator
 * Thread: C (iter2-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER2_INGEST.md
 * Gate evidence: spec:S3:4, spec:IG1, spec:IG2, spec:IG5
 *
 * Pipeline (executable-path-v4.md §1 Stage 1):
 *   Step 0: deriveRawEventNodeId — pre-compute provisional nodeId for audit records
 *   Step 1: validateRawEvent    — reject on fail; return rejection with 6-field audit record
 *   Step 3: resolveIdentity     — per-type policy (seat/agent lazy MERGE, operator halt, user defer)
 *   Step 4: resolveScope        — lazy MERGE :Scope nodes for each scope
 *   Step 5: Cardinality check   — scopes.length ≥ 1 (IG2); HAS_SOURCE = 1 from step 3
 *   Step 6: Single transaction  — MERGE RawEvent + HAS_SOURCE edge + IN_SCOPE edges
 *   Step 7: Return ingested status with edge counts
 *
 * On ANY failure before step 6: no write; rejection/deferred status returned.
 * Step 6 writes inside a Neo4j session.executeWrite transaction — auto-rollback on failure.
 *
 * Validation-failure audit record (executable-path-v4.md §3.1 — all 6 fields):
 *   failureType, attemptedOperation, nodeId, failedChecks, failureTime, pipelineRunId
 */

import { randomUUID } from 'crypto';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { deriveRawEventNodeId } from './nodeid.js';
import { validateRawEvent } from './property-validator.js';
import { resolveIdentity, UnknownOperatorError } from './identity-resolver.js';
import { resolveScope } from './scope-resolver.js';
import { IdentityType } from './identity-registry.js';

export interface IngestInput {
  source: string;
  eventTime: string;
  ingestTime: string;
  rawContent: string;
  lifecycleState: 'active' | 'superseded' | 'archived';
  sourceIdentity: { label: string; type: IdentityType };
  scopes: string[];
  /**
   * Item 27 (R71 5/5 council convergent 2026-05-20): tenant boundary for auxiliary nodes.
   * RawEvent.project_root protects DERIVED_FROM edges from setDifferenceTeardown
   * (tests/_test-helpers.ts:130-137). Class-bug fix mirrors Item 2 pattern (commit 5a6db4e0,
   * ConflictRecord). When omitted, falls back to derived/none; callers SHOULD pass through.
   */
  project_root?: string;
}

export type IngestResult =
  | { status: 'ingested'; nodeId: string; hasSourceEdges: number; inScopeEdges: number }
  | {
      status: 'rejected';
      failureType: 'validation' | 'permission';
      failedChecks: string[];
      nodeId: string | undefined;
      attemptedOperation: 'ingest';
      failureTime: string;
      pipelineRunId: string;
    }
  | { status: 'deferred'; reason: 'unresolved_user' };

/**
 * Ingest a RawEvent through the 6-step pipeline.
 * Steps are executed in order: validate → nodeId → identity → scope → cardinality → write.
 *
 * @param input  - The raw event data and identity/scope context
 * @param neo4j  - Neo4jService instance for graph operations
 * @returns IngestResult — ingested, rejected, or deferred
 */
export async function ingestRawEvent(input: IngestInput, neo4j: Neo4jService): Promise<IngestResult> {
  const pipelineRunId = randomUUID();

  // ── Step 0: Pre-derive nodeId (provisional — needed for audit records on any failure)
  // nodeId is pure computation over {source, eventTime, rawContent}; no graph write.
  // Required so that a step-1 validation rejection still carries nodeId in the audit record
  // per executable-path-v4.md §3.1 "nodeId (provisional, if one was assigned)".
  const nodeId = deriveRawEventNodeId({
    source: input.source,
    eventTime: input.eventTime,
    rawContent: input.rawContent,
  });

  // ── Step 1: Validate ──────────────────────────────────────────────────────────
  // validateRawEvent checks all 6 required RawEvent properties per §1.1 and §2.1.
  const validationResult = validateRawEvent({
    nodeId,
    eventTime: input.eventTime,
    ingestTime: input.ingestTime,
    source: input.source,
    rawContent: input.rawContent,
    lifecycleState: input.lifecycleState,
  });

  if (!validationResult.valid) {
    // Rollback: no write attempted. Return all 6 §3.1 audit fields.
    return {
      status: 'rejected',
      failureType: 'validation',
      failedChecks: validationResult.failedChecks,
      nodeId: validationResult.nodeId,
      attemptedOperation: 'ingest',
      failureTime: validationResult.failureTime,
      pipelineRunId: validationResult.pipelineRunId,
    };
  }

  // ── Step 3: Resolve identity ──────────────────────────────────────────────────
  // Per-type policy (AD4, identity-normalization-v4.md §1.1–1.4):
  //   seat/agent → lazy MERGE; operator → throw UnknownOperatorError; user → defer
  let identityResult: { status: 'resolved'; canonicalId: string; nodeId: string } | { status: 'deferred' };
  try {
    const resolved = await resolveIdentity(input.sourceIdentity.label, input.sourceIdentity.type, neo4j);
    if (resolved.status === 'deferred') {
      return { status: 'deferred', reason: 'unresolved_user' };
    }
    identityResult = resolved;
  } catch (err) {
    if (err instanceof UnknownOperatorError) {
      // Halt ingest — operator not registered; no partial commit
      return {
        status: 'rejected',
        failureType: 'permission',
        failedChecks: [err.message],
        nodeId,
        attemptedOperation: 'ingest',
        failureTime: new Date().toISOString(),
        pipelineRunId,
      };
    }
    throw err;
  }

  // ── Step 4: Resolve scopes ───────────────────────────────────────────────────
  // Lazy MERGE :Scope nodes for each scope name; collect nodeIds for edge creation.
  // Item 27 R71: thread project_root through to Scope MERGE so :Scope survives cleanup.
  const scopeResults = await Promise.all(
    input.scopes.map((scopeName) => resolveScope(scopeName, neo4j, input.project_root)),
  );
  const scopeNodeIds = scopeResults.map((r) => r.nodeId);

  // ── Step 5: Cardinality check (IG2) ──────────────────────────────────────────
  // Minimum scope: ≥1 IN_SCOPE edge required (schema-contracts-v4.md §3.2)
  // Minimum provenance: HAS_SOURCE = 1 (guaranteed by resolved identity from step 3)
  if (scopeNodeIds.length === 0) {
    return {
      status: 'rejected',
      failureType: 'validation',
      failedChecks: ['scopeEdges: zero IN_SCOPE scopes provided; minimum is 1 (schema-contracts-v4.md §3.2)'],
      nodeId,
      attemptedOperation: 'ingest',
      failureTime: new Date().toISOString(),
      pipelineRunId,
    };
  }

  // ── Step 6: Single write transaction ─────────────────────────────────────────
  // MERGE RawEvent + HAS_SOURCE edge + IN_SCOPE edges.
  // executeWrite provides an explicit transaction with auto-rollback on failure.
  const driver = neo4j.getDriver();
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      // MERGE RawEvent node (idempotent — same nodeId → same node)
      // Item 27 R71: write project_root on CREATE so RawEvent survives setDifferenceTeardown
      // tenant guard (mirror Item 2 ConflictRecord pattern at commit 5a6db4e0).
      await tx.run(
        `MERGE (e:RawEvent {nodeId: $nodeId})
         ON CREATE SET
           e.eventTime      = $eventTime,
           e.ingestTime     = $ingestTime,
           e.source         = $source,
           e.rawContent     = $rawContent,
           e.lifecycleState = $lifecycleState,
           e.project_root   = $project_root`,
        {
          nodeId,
          eventTime: input.eventTime,
          ingestTime: input.ingestTime,
          source: input.source,
          rawContent: input.rawContent,
          lifecycleState: input.lifecycleState,
          project_root: input.project_root ?? null,
        },
      );

      // MERGE HAS_SOURCE edge from RawEvent to resolved identity node
      await tx.run(
        `MATCH (e:RawEvent {nodeId: $eventNodeId})
         MATCH (s) WHERE s.nodeId = $sourceNodeId
         MERGE (e)-[:HAS_SOURCE]->(s)`,
        { eventNodeId: nodeId, sourceNodeId: (identityResult as { nodeId: string }).nodeId },
      );

      // MERGE IN_SCOPE edges — one per resolved scope node
      for (const scopeNodeId of scopeNodeIds) {
        await tx.run(
          `MATCH (e:RawEvent {nodeId: $eventNodeId})
           MATCH (sc:Scope {nodeId: $scopeNodeId})
           MERGE (e)-[:IN_SCOPE]->(sc)`,
          { eventNodeId: nodeId, scopeNodeId },
        );
      }
    });
  } finally {
    await session.close();
  }

  // ── Step 7: Return ingested status ───────────────────────────────────────────
  return {
    status: 'ingested',
    nodeId,
    hasSourceEdges: 1,
    inScopeEdges: scopeNodeIds.length,
  };
}
