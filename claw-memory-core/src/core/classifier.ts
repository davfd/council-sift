/**
 * classifier.ts — Semantic Memory V4 Stage 2 Classify Orchestrator
 * Thread: D (iter3-execution) + E (iter4-execution, extend in-place)
 * Plan: SEMANTIC_MEMORY_V4_ITER3_CLASSIFY.md + SEMANTIC_MEMORY_V4_ITER4_RETRIEVE.md
 * Gate evidence: spec:S2:2, spec:S3:3, spec:S6:0, spec:IG1, spec:IG4, spec:IG6, spec:IG7
 *
 * Pipeline (executable-path-v4.md §1 Stage 2):
 *   Step 1: resolveMemoryTypes() — load classification policy → per-rule {memory_types, confidenceScore}
 *   Step 2: isAuthorized()       — scope-authz check (AD3/AD6 coupled mechanism)
 *   Step 3: deriveNodeId         — UUID v5 of {memoryType, rawEventNodeId} (deterministic)
 *   Step 4: de-duplicate         — skip types where nodeId already exists in graph (IG7)
 *   Step 5: validateCardinality  — 6-field audit record on failure (AD7)
 *   Step 6: MERGE derived node + provenance edge + IN_SCOPE edges (single tx per node)
 *
 * ROLLBACK INDEPENDENCE (AD1):
 *   Stage 2 failure rolls back derived nodes ONLY.
 *   Committed RawEvents remain in the graph after Stage 2 failure.
 *   classify-failed record is structurally distinct from ingest-failed record.
 *
 * iter4 additions (AD4/Call 4):
 *   - SummaryMemory: SUMMARIZES edge + versionOrdinal=1, priorVersionId=null
 *   - InferredMemory: INFERRED_FROM edge + versionOrdinal=1, priorVersionId=null
 *                     + confidenceScore from policy rule (NOT runtime-computed)
 *   - resolveMemoryTypes() used instead of resolveTypes() for per-rule confidenceScore
 *   - MemoryClaim path UNCHANGED (regression guard)
 */

import { randomUUID } from 'crypto';
import { v5 as uuidv5 } from 'uuid';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { NAMESPACE_UUID, deriveScopeNodeId } from './nodeid.js';
import { resolveMemoryTypes } from './classification-policy.js';
import { isAuthorized } from './scope-authz.js';
import { validateCardinality, type MemoryNodeType } from './cardinality-validator.js';

// ── NodeId derivation ────────────────────────────────────────────────────────

/**
 * Derive a deterministic nodeId for a derived memory node.
 * UUID v5 of canonical JSON {memoryType, rawEventNodeId} — stable across runs.
 * ingestTime and claimTime are permitted-to-differ fields (§2.2) and are excluded.
 */
function deriveMemoryNodeId(memoryType: string, rawEventNodeId: string): string {
  const canonical = JSON.stringify({ memoryType, rawEventNodeId });
  return uuidv5(canonical, NAMESPACE_UUID);
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClassifyInput {
  rawEventNodeId: string;
  source: string;           // canonical source identity (e.g., 'seat:raguel')
  rawContent: string;       // rawContent from RawEvent for content derivation (R63 unification — was claimText)
  eventTime: string;        // eventTime from RawEvent
  scopes: string[];         // requested scopes for derived nodes (subset of RawEvent scopes)
}

export interface ClassifiedNode {
  nodeId: string;
  memoryType: string;
  rawEventNodeId: string;
}

/** Classify-failed audit record — distinct from ingest-failed (AD1 rollback independence) */
export interface ClassifyFailedRecord {
  failureType: 'classification' | 'permission' | 'no_policy_match';
  attemptedOperation: 'classify';
  rawEventNodeId: string;          // AD1: identifies the RawEvent that remains committed
  committedRawEventPreserved: true; // AD1: explicit sentinel that RawEvent is NOT rolled back
  failedChecks: string[];
  failureTime: string;
  pipelineRunId: string;
}

export type ClassifyResult =
  | { status: 'classified'; classifiedNodes: ClassifiedNode[] }
  | { status: 'classify_failed'; record: ClassifyFailedRecord };

// ── Memory type → required edge type mapping ─────────────────────────────────

const PROVENANCE_EDGE_TYPE: Record<string, string> = {
  MemoryClaim: 'DERIVED_FROM',
  SummaryMemory: 'SUMMARIZES',
  InferredMemory: 'INFERRED_FROM',
};

// ── Classify orchestrator ────────────────────────────────────────────────────

/**
 * Classify a RawEvent by creating derived memory nodes.
 *
 * Satisfies all Stage 2 requirements per executable-path-v4.md §1:
 *   - memory_types[] per classification policy (Call 2)
 *   - scope-authz gate (AD3/AD6)
 *   - Deterministic nodeIds (UUID v5; IG7 idempotency)
 *   - Cardinality validation (AD7; IG2)
 *   - Rollback independence (AD1; IG6)
 *   - MERGE pattern for idempotent re-classify (IG7)
 *
 * @param input  - RawEvent data and classification context
 * @param neo4j  - Neo4jService instance
 * @returns ClassifyResult — classified with node list, or classify_failed with audit record
 */
export async function classifyRawEvent(
  input: ClassifyInput,
  neo4j: Neo4jService,
): Promise<ClassifyResult> {
  const pipelineRunId = randomUUID();
  const classifyTime = new Date().toISOString();

  // ── Step 1: Resolve classification policy (per-rule with confidenceScore) ──
  // iter4: use resolveMemoryTypes() to get per-rule {memory_types, confidenceScore}
  const policyResolutions = resolveMemoryTypes(input.source);

  if (policyResolutions.length === 0) {
    // No policy match — classify-failed (distinct from ingest-failed per AD1)
    return {
      status: 'classify_failed',
      record: {
        failureType: 'no_policy_match',
        attemptedOperation: 'classify',
        rawEventNodeId: input.rawEventNodeId,
        committedRawEventPreserved: true,
        failedChecks: [
          `no_policy_match: source '${input.source}' has no matching rule in classification-policy.yaml`,
        ],
        failureTime: classifyTime,
        pipelineRunId,
      },
    };
  }

  // ── Step 2: Scope-authz check (AD3/AD6 coupled mechanism) ────────────────
  // Determine authorized scopes: intersection of requested scopes and policy authz
  const authorizedScopes = input.scopes.filter((scope) => isAuthorized(input.source, scope));

  if (authorizedScopes.length === 0) {
    // No authorized scopes — permission failure (classify-failed, NOT ingest-failed)
    return {
      status: 'classify_failed',
      record: {
        failureType: 'permission',
        attemptedOperation: 'classify',
        rawEventNodeId: input.rawEventNodeId,
        committedRawEventPreserved: true,
        failedChecks: [
          `scope_authz: source '${input.source}' is not authorized for any requested scope: [${input.scopes.join(', ')}]. ` +
            'Checked scope-authz.yaml (AD3/AD6 coupled mechanism).',
        ],
        failureTime: classifyTime,
        pipelineRunId,
      },
    };
  }

  // ── Step 3–6: Derive nodeIds, de-duplicate, validate cardinality, MERGE ──
  // Iterate per-rule resolutions (a source may match multiple rules for different types)
  const classifiedNodes: ClassifiedNode[] = [];

  for (const resolution of policyResolutions) {
    for (const memoryType of resolution.memory_types) {
      // Step 3: Deterministic nodeId (UUID v5 of {memoryType, rawEventNodeId})
      const nodeId = deriveMemoryNodeId(memoryType, input.rawEventNodeId);

      // Step 4: De-duplication — skip if already exists (MERGE handles this, but
      // explicit check enables returning accurate classifiedNodes list)
      const existing = await neo4j.run(
        `MATCH (n {nodeId: $nodeId}) RETURN n.nodeId AS nodeId LIMIT 1`,
        { nodeId },
      );
      if (existing.length > 0) {
        // Node already exists — skip (idempotent re-classify per IG7)
        classifiedNodes.push({ nodeId, memoryType, rawEventNodeId: input.rawEventNodeId });
        continue;
      }

      // Step 5: Cardinality validation
      const edgeType = PROVENANCE_EDGE_TYPE[memoryType] ?? 'DERIVED_FROM';
      const provenanceEdges = [{ type: edgeType, targetNodeId: input.rawEventNodeId }];
      const scopeEdges = authorizedScopes.map((s) => ({ type: 'IN_SCOPE', targetNodeId: s }));

      const cardResult = validateCardinality({
        nodeType: memoryType as MemoryNodeType,
        nodeId,
        provenanceEdges,
        scopeEdges,
      });

      if (!cardResult.valid) {
        // Cardinality failure — classify-failed with audit record (AD1: RawEvent preserved)
        return {
          status: 'classify_failed',
          record: {
            failureType: 'classification',
            attemptedOperation: 'classify',
            rawEventNodeId: input.rawEventNodeId,
            committedRawEventPreserved: true,
            failedChecks: cardResult.failedChecks,
            failureTime: cardResult.failureTime,
            pipelineRunId: cardResult.pipelineRunId,
          },
        };
      }

      // Step 6: Single transaction — MERGE derived node + provenance + scope edges
      const driver = neo4j.getDriver();
      const session = driver.session();
      try {
        await session.executeWrite(async (tx) => {
          // MERGE memory node by nodeId — all required properties set ON CREATE only
          // (nodeId is the idempotency key; re-classify does not overwrite existing data)
          if (memoryType === 'MemoryClaim') {
            // R63 Q1 5/5: canonical primary text field is `content` (was `claimText`)
            await tx.run(
              `MERGE (n:MemoryClaim {nodeId: $nodeId})
               ON CREATE SET
                 n.claimTime      = $classifyTime,
                 n.ingestTime     = $classifyTime,
                 n.claimantId     = $source,
                 n.content        = $content,
                 n.lifecycleState = 'active'`,
              {
                nodeId,
                classifyTime,
                source: input.source,
                content: `Classification of: ${input.rawContent}`,
              },
            );
          } else if (memoryType === 'SummaryMemory') {
            // SummaryMemory path — iter4 AD4: versionOrdinal=1, priorVersionId=null per §3.1
            await tx.run(
              `MERGE (n:SummaryMemory {nodeId: $nodeId})
               ON CREATE SET
                 n.summaryTime    = $classifyTime,
                 n.ingestTime     = $classifyTime,
                 n.producedBy     = $source,
                 n.content        = $content,
                 n.versionOrdinal = 1,
                 n.priorVersionId = null,
                 n.lifecycleState = 'active'`,
              {
                nodeId,
                classifyTime,
                source: input.source,
                content: `Summary of: ${input.rawContent}`,
              },
            );
          } else if (memoryType === 'InferredMemory') {
            // InferredMemory path — iter4 AD4/Call 4: confidenceScore from policy rule (NOT computed at runtime)
            const confidenceScore = resolution.confidenceScore ?? 0.7; // fallback only; policy should always declare
            await tx.run(
              `MERGE (n:InferredMemory {nodeId: $nodeId})
               ON CREATE SET
                 n.inferenceTime  = $classifyTime,
                 n.ingestTime     = $classifyTime,
                 n.producedBy     = $source,
                 n.content        = $content,
                 n.confidenceScore = $confidenceScore,
                 n.versionOrdinal = 1,
                 n.priorVersionId = null,
                 n.lifecycleState = 'active'`,
              {
                nodeId,
                classifyTime,
                source: input.source,
                content: `Inference from: ${input.rawContent}`,
                confidenceScore, // sourced from policy rule (Call 4 compliance)
              },
            );
          }

          // MERGE provenance edge (DERIVED_FROM / SUMMARIZES / INFERRED_FROM)
          await tx.run(
            `MATCH (m {nodeId: $memNodeId})
             MATCH (e:RawEvent {nodeId: $rawEventNodeId})
             MERGE (m)-[:${edgeType}]->(e)`,
            { memNodeId: nodeId, rawEventNodeId: input.rawEventNodeId },
          );

          // MERGE IN_SCOPE edges for all authorized scopes.
          // Item 29 expanded (R-spec-3 5/5 — class-bug closure 2026-05-22): MERGE by scopeName
          // (semantic key) — same pattern as Item 28 + promote-orchestrator.ts fix.
          for (const scopeName of authorizedScopes) {
            const fallbackScopeNodeId = deriveScopeNodeId(scopeName);
            const scRows = await tx.run(
              `MERGE (sc:Scope {scopeName: $scopeName})
               ON CREATE SET sc.nodeId = $fallbackScopeNodeId, sc.createdAt = datetime()
               RETURN sc.nodeId AS nodeId`,
              { scopeName, fallbackScopeNodeId },
            );
            const resolvedScopeNodeId =
              (scRows.records[0]?.get('nodeId') as string | undefined) ?? fallbackScopeNodeId;
            await tx.run(
              `MATCH (m {nodeId: $memNodeId})
               MATCH (sc:Scope {nodeId: $scopeNodeId})
               MERGE (m)-[:IN_SCOPE]->(sc)`,
              { memNodeId: nodeId, scopeNodeId: resolvedScopeNodeId },
            );
          }
        });
      } finally {
        await session.close();
      }

      classifiedNodes.push({ nodeId, memoryType, rawEventNodeId: input.rawEventNodeId });
    }
  }

  return { status: 'classified', classifiedNodes };
}
