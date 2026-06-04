/**
 * semantic_recall.ts — E4 semantic retrieval handler (vector-similarity recall)
 * Thread: J (iter8 semantic retrieval)
 * Plan: SEMANTIC_MEMORY_V4_ITER8
 * Task: spec:S4:0 (task:S4:0)
 * Gate evidence: gate:G3 (IG-iter8-E4)
 *
 * PN-iter8-1 path (b): This handler is a new MODULE but NOT a new MCP tool.
 * Invoked from recall.ts dispatch path when OPENAI_API_KEY present.
 * index.ts tool count remains 9 (4+3+1+1=9) — NO server.registerTool() call here.
 * NOT imported directly in index.ts.
 *
 * BLOCK-iter8-2: retrieve.ts NOT routed through (per FC11 rationale; Wave A nodes have no IN_SCOPE edges).
 * BLOCK-iter8-3: NOT registered as new MCP tool (PN-iter8-1 path (b) elected).
 *
 * T9.1 inheritance: prefix-strip caller_seat pattern REUSED from recall.ts lines 160-162 (verbatim inline).
 * T9.1 inheritance: visibility WHERE clause REPLICATED from recall.ts line 170 (identical predicate).
 *
 * authorized_by: T7 (Jonathan 2026-04-30T21:33:01Z — iter8 charter E4)
 *              + PN-iter8-1 path (b) elected by Gabriel SPEC_OK 2026-05-01T04:29Z
 */

// E3 read-side wiring: EmbeddingsService imported from CORRECTED path (not semantic-memory/embeddings-service)
// authorized_by: T7 (Jonathan 2026-04-30T21:33:01Z — iter8 charter E3)
import { classifySource } from '../core/source-classifier.js';
// G4 P0-M2: low-confidence flag enrichment — option (b): type intersection via enrichWithConfidenceFlag<T>
// Applied in both vector-similarity path and text-pattern fallback path.
// authorized_by: P0 grant 2026-05-11
import { enrichWithConfidenceFlag } from '../core/d3-2-confidence-override.js';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { getProjectRoot } from '../tenant.js';
import type { StructuredMemoryPayload } from './recall.js';
// CF-G7c-G8 R37 5/5: recall-time OBSERVED_IN edge writes per recalled nodeId (both vector + fallback paths).
import { resolveSession, deriveSessionNodeId } from '../core/session-resolver.js';
// CF-G7c-G8 R39 5/5 Layer 2: recall-time G7c + G8 wiring closure on the semantic path.
// Pre-R39, semantic_recall.ts had OBSERVED_IN writes but neither autoAnchorNode (G7c) nor
// attemptAutoVR (G8) — direct semantic_recall invocations bypassed both crystallization paths.
// R39 5/5 (Zadkiel + Raguel scope) folds G7c + G8 atomic on the semantic path.
import { autoAnchorNode, ANCHOR_CONFLICT_CHECKS } from '../core/d3-4-doctrine-anchor.js';
import { hasOpenConflict } from '../core/d3-1-conflict-record.js';
import { attemptAutoVR, collectSessionCorpus } from '../core/d3-5-verification-record.js';

// Vector indexes created by E2 migrate-vector-indexes-iter8.ts (dimensions=3072, similarity=cosine)
const VECTOR_INDEXES = [
  'idx_mem_claim_embedding',
  'idx_summary_mem_embedding',
  'idx_inferred_mem_embedding',
] as const;

/** Resolve memory_type from Neo4j labels or stored property — mirrors recall.ts resolveMemoryType() */
function resolveMemoryType(
  labels: string[],
  storedType: string | null,
): 'MemoryClaim' | 'SummaryMemory' | 'InferredMemory' {
  const VALID_TYPES = ['MemoryClaim', 'SummaryMemory', 'InferredMemory'] as const;
  type ValidType = (typeof VALID_TYPES)[number];
  for (const label of labels) {
    if ((VALID_TYPES as readonly string[]).includes(label)) return label as ValidType;
  }
  if (storedType && (VALID_TYPES as readonly string[]).includes(storedType)) return storedType as ValidType;
  return 'MemoryClaim';
}

function governanceProsePrefix(item: Pick<StructuredMemoryPayload, 'reconciliation_status'>): string {
  switch (item.reconciliation_status) {
    case 'legacy_not_authoritative_for_formal_governance':
      return '[governance=legacy-non-authoritative] ';
    case 'formal_advisory_not_authoritative_council_cc_capture':
      return '[governance=advisory-formal] ';
    case 'formal_wrong_type_requires_reconciliation':
      return '[governance=formal-requires-reconciliation] ';
    default:
      return '';
  }
}

/**
 * Write OBSERVED_IN edges per recalled nodeId for the active session.
 * CF-G7c-G8 R37 5/5 (Option (a) + expanded Touch 4): semantic recall is observation; each
 * recalled node accumulates an OBSERVED_IN edge per distinct session (MERGE-idempotent).
 * Same pattern as recall.ts post-R37. Errors are non-fatal — must not block recall delivery.
 *
 * R-spec-3 5/5 Layer-B-only (2026-05-22): callingSeat (already R59-normalized as 'seat:<name>'
 * via the Item 20 prefix fix at line 161-165) is threaded through resolveSession() so the
 * Session node carries s.calling_seat for G8 Guard 1 witness-identity accumulation.
 */
async function writeRecallObservedIn(
  sessionUuid: string,
  nodeIds: string[],
  neo4j: Neo4jService,
  callingSeat?: string,
  projectRoot?: string,
): Promise<void> {
  // R81 Commit F (F-R79-3, 2026-05-23): thread projectRoot into resolveSession so
  // the Session is tenant-tagged on first sight (semantic_recall path). Same
  // derivation as remember.ts:481 and recall.ts:264.
  await resolveSession(sessionUuid, neo4j, projectRoot, callingSeat);
  const sessionNodeId = deriveSessionNodeId(sessionUuid);
  await Promise.all(
    nodeIds.map(async (nodeId) => {
      try {
        await neo4j.run(
          `MATCH (n {nodeId: $nodeId})
           MATCH (s:Session {nodeId: $sessionNodeId})
           MERGE (n)-[:OBSERVED_IN]->(s)`,
          { nodeId, sessionNodeId },
        );
      } catch {
        // Non-fatal: OBSERVED_IN write failure must not block recall delivery
      }
    }),
  );
}

/**
 * CF-G7c-G8 R39 5/5 (Option (a) + Zadkiel + Raguel atomic-on-semantic-path scope):
 * recall-time G7c eligibility re-evaluation + G8 auto-VR evaluation per recalled nodeId.
 * Mirrors recall.ts G7c + G8 blocks. Both gated on caller already having MERGEd OBSERVED_IN
 * edges this session (caller passes through writeRecallObservedIn first).
 * Non-fatal: any crystallization failure must not block recall delivery.
 */
async function attemptRecallCrystallization(
  nodeIds: string[],
  neo4j: Neo4jService,
): Promise<void> {
  await Promise.all(
    nodeIds.map(async (nodeId) => {
      try {
        const openConflict = await hasOpenConflict(nodeId, neo4j);
        const conflictChecksPassed = openConflict ? 0 : ANCHOR_CONFLICT_CHECKS;
        await autoAnchorNode(nodeId, conflictChecksPassed, neo4j);
      } catch {
        // Non-fatal: G7c eligibility check / DoctrineAnchor write failure must not block recall delivery
      }
      try {
        const corpus = await collectSessionCorpus(nodeId, neo4j);
        await attemptAutoVR(corpus, neo4j, ['scope-council-deliberations-may-2026']);
      } catch {
        // Non-fatal: G8 VR evaluation / write failure must not block recall delivery
      }
    }),
  );
}

export async function handleSemanticRecall(
  params: {
    topic?: string;
    query?: string;
    source_identity?: string;
    tenant_id?: string;
    limit?: number;
    offset?: number;
    /** CF-G7c-G8 R37 5/5: per-callSeat session UUID for recall-time OBSERVED_IN writes (vector + fallback paths). */
    sessionUuid?: string;
  },
  neo4j: Neo4jService,
): Promise<{ structured: (StructuredMemoryPayload & { retrieval_mode: string })[]; prose: string; error?: string }> {
  // ── E5 spec:S5:2: OPENAI_API_KEY absent → explicit structured error (NOT empty array, NOT fallback) ──
  // Key-absent is detected at handler init; distinct from mid-query failure which uses fallback path.
  // Per operator §10 #3: silence-degradation explicitly rejected — explicit error required.
  if (!process.env.OPENAI_API_KEY) {
    const errorMsg = 'OPENAI_API_KEY absent — semantic_recall requires OPENAI_API_KEY for vector-similarity retrieval. Set OPENAI_API_KEY environment variable to enable semantic recall.';
    process.stderr.write(`[semantic_recall] ${errorMsg}\n`);
    return {
      structured: [],
      prose: `ERROR: ${errorMsg}`,
      error: errorMsg,
    };
  }

  const queryText = params.query ?? params.topic ?? '';
  const project_root = params.tenant_id ?? getProjectRoot();
  const limit = Math.max(1, Math.min(12, params.limit ?? 10)); // F4a Raphael hardening: cap 50→12 per spec:S9:2 ≤12 SLO (T6 FSD §2.7 A6)
  const offset = Math.max(0, params.offset ?? 0);
  // topK buffer: fetch extra to cover deduplication across 3 indexes then paginate
  const topK = offset + limit + 10;

  // Item 20 (R70 5/5 + R71 Q3 + R72 Zadkiel BLOCKING) — caller_seat prefix normalization fix.
  // Zadkiel R72 caught this completion-criterion gap: Item 20 was applied to recall.ts (text path)
  // but missed semantic_recall.ts (semantic path). Same bug, different file. R59 normalization
  // stores owner_seat as 'seat:<name>'; filter needs 'seat:' prefix to match.
  // Fail-closed: absent or non-prefixed source_identity → caller_seat undefined → seat-private OR-branch false.
  const caller_seat = params.source_identity?.startsWith('council-seat:')
    ? `seat:${params.source_identity.slice('council-seat:'.length)}`
    : params.source_identity?.startsWith('seat:')
      ? params.source_identity
      : undefined;

  // ── E3 read-side: embed query text via EmbeddingsService ──────────────────
  // OPENAI_API_KEY is present at this point (guarded above).
  // Dynamic import avoids circular dependency; EmbeddingsService throws on construction without key.
  let queryVector: number[] | null = null;
  try {
    const { EmbeddingsService } = await import('../core/embeddings/embeddings.service.js');
    const embeddingsService = new EmbeddingsService();
    queryVector = await embeddingsService.embedText(queryText);
  } catch (err) {
    // Mid-query failure (rate limit, timeout, transient) → fallback path (NOT key-absent path)
    process.stderr.write(`[semantic_recall] EmbeddingsService.embedText() failed — falling back to text-pattern: ${err}\n`);
  }

  // ── Fallback path: embedding failed mid-query → text-pattern; retrieval_mode:'fallback' ──
  // This is DISTINCT from key-absent path above (which returns explicit error).
  if (!queryVector) {
    return fallbackToTextPattern(queryText, project_root, caller_seat, limit, offset, neo4j);
  }

  // ── Vector similarity queries across all 3 indexes ─────────────────────────
  // T9.1 visibility WHERE: identical predicate to recall.ts line 170
  type VectorRow = {
    nodeId: string;
    content: string;
    source_artifact_ref: string | null;
    created_at: string;
    lifecycleState: string;
    verificationState: string | null;
    memory_type: string | null;
    confidence_score: number | null;
    governance_stratum: string | null;
    source_identity_status: string | null;
    reconciliation_status: string | null;
    labels: string[];
    vector_score: number;
  };

  const allRows: VectorRow[] = [];
  const seenNodeIds = new Set<string>();

  for (const indexName of VECTOR_INDEXES) {
    try {
      const rows = await neo4j.run(
        `CALL db.index.vector.queryNodes($indexName, $topK, $queryVector)
         YIELD node AS n, score
         WHERE n.project_root = $project_root
           AND n.lifecycleState IN ['active', 'disputed']
           AND (n.visibility = 'council-shared' OR (n.visibility = 'seat-private' AND n.owner_seat = $caller_seat) OR n.visibility IS NULL)
         RETURN n.nodeId AS nodeId,
                n.content AS content,
                n.source_artifact_ref AS source_artifact_ref,
                n.created_at AS created_at,
                n.lifecycleState AS lifecycleState,
                n.verificationState AS verificationState,
                n.memory_type AS memory_type,
                n.confidence_score AS confidence_score,
                n.governance_stratum AS governance_stratum,
                n.source_identity_status AS source_identity_status,
                n.reconciliation_status AS reconciliation_status,
                labels(n) AS labels,
                score AS vector_score`,
        { indexName, topK, queryVector, project_root, caller_seat: caller_seat ?? null },
      );

      for (const row of rows) {
        const nodeId = row.nodeId as string;
        if (!seenNodeIds.has(nodeId)) {
          seenNodeIds.add(nodeId);
          allRows.push({
            nodeId,
            content: row.content as string,
            source_artifact_ref: (row.source_artifact_ref as string | null) ?? null,
            created_at: (row.created_at as string) ?? new Date().toISOString(),
            lifecycleState: row.lifecycleState as string,
            verificationState: (row.verificationState as string | null) ?? null,
            memory_type: (row.memory_type as string | null) ?? null,
            confidence_score: (row.confidence_score as number | null) ?? null,
            governance_stratum: (row.governance_stratum as string | null) ?? null,
            source_identity_status: (row.source_identity_status as string | null) ?? null,
            reconciliation_status: (row.reconciliation_status as string | null) ?? null,
            labels: (row.labels as string[]) ?? [],
            vector_score: (row.vector_score as number) ?? 0,
          });
        }
      }
    } catch (err) {
      // Individual index failure (e.g. index POPULATING, not yet ONLINE): log and continue
      process.stderr.write(`[semantic_recall] vector query on index '${indexName}' failed: ${err}\n`);
    }
  }

  // When no vector results from any index, fall through to text-pattern fallback
  if (allRows.length === 0) {
    return fallbackToTextPattern(queryText, project_root, caller_seat, limit, offset, neo4j, params.sessionUuid);
  }

  // Sort by vector_score descending; paginate
  allRows.sort((a, b) => b.vector_score - a.vector_score);
  const pageRows = allRows.slice(offset, offset + limit);

  const structured = pageRows.map((row): StructuredMemoryPayload & { retrieval_mode: string } => {
    const source_artifact_ref = row.source_artifact_ref;
    const { source_status, reason } = classifySource(source_artifact_ref ?? undefined);
    const memory_type = resolveMemoryType(row.labels, row.memory_type);
    // R-spec-axes 5/5 (2026-05-22): lifecycleState is temporal only; verificationState orthogonal.
    const lifecycleState = row.lifecycleState === 'disputed'
      ? 'active' as const
      : (row.lifecycleState as 'active' | 'superseded' | 'archived');
    const verificationState =
      (row.verificationState as 'unverified' | 'verified' | null) ?? undefined;

    // G4 P0-M2: enrich payload with low_confidence_flag (type intersection; no interface change per option (b))
    return enrichWithConfidenceFlag({
      content: row.content,
      source_artifact_ref,
      created_at: row.created_at,
      lifecycleState,
      memory_type,
      source_status,                                                                           // BLOCK-20: NEVER absent
      ...(verificationState !== undefined ? { verificationState } : {}),
      ...(typeof row.confidence_score === 'number' ? { confidence_score: row.confidence_score } : {}),
      ...(typeof row.governance_stratum === 'string' ? { governance_stratum: row.governance_stratum } : {}),
      ...(typeof row.source_identity_status === 'string' ? { source_identity_status: row.source_identity_status } : {}),
      ...(typeof row.reconciliation_status === 'string' ? { reconciliation_status: row.reconciliation_status } : {}),
      ...(reason !== undefined ? { reason } : {}),
      nodeId: row.nodeId,
      retrieval_mode: 'semantic',                                                              // E5: vector-similarity success
    });
  });

  // Prose MUST NOT mention 'MemoryClaim', 'SummaryMemory', or 'InferredMemory' (BLOCK-14)
  const prose = structured.length === 0
    ? `I don't have anything stored about "${queryText}".`
    : `Here is what I remember about "${queryText}": ${structured.map((s) => `${governanceProsePrefix(s)}${s.content}`).join(' | ')}`;

  // CF-G7c-G8 R37 5/5 (Option (a) + expanded Touch 4): vector-path semantic recall is observation.
  // R-spec-3 5/5 Layer-B-only: pass normalized caller_seat through so the Session node carries
  // calling_seat for G8 Guard 1 witnessSeats accumulation (agent-identity independence).
  if (params.sessionUuid && structured.length > 0) {
    // CF-TIER9-0-TSC-2: narrow (string|undefined)[] → string[] (Cypher RETURN n.nodeId guarantees non-null at runtime)
    const nodeIds = structured.map((s) => s.nodeId).filter((id): id is string => id !== undefined);
    if (nodeIds.length > 0) {
      await writeRecallObservedIn(params.sessionUuid, nodeIds, neo4j, caller_seat, params.tenant_id ?? undefined);
      // CF-G7c-G8 R39 5/5 Layer 2: G7c re-evaluation + G8 auto-VR per recalled nodeId.
      // After OBSERVED_IN MERGE — sessionCount incremented this recall, so re-checking has new information.
      await attemptRecallCrystallization(nodeIds, neo4j);
    }
  }

  return { structured, prose };
}

// ── Text-pattern fallback ─────────────────────────────────────────────────────
// Mirrors recall.ts CONTAINS query; retrieval_mode:'fallback' on every item.
// Fires when: (a) OPENAI_API_KEY absent, (b) EmbeddingsService fails, (c) all vector indexes return 0 results.
async function fallbackToTextPattern(
  topic: string,
  project_root: string,
  caller_seat: string | undefined,
  limit: number,
  offset: number,
  neo4j: Neo4jService,
  sessionUuid?: string,
): Promise<{ structured: (StructuredMemoryPayload & { retrieval_mode: string })[]; prose: string }> {
  const rows = await neo4j.run(
    `MATCH (n)
     WHERE (n:MemoryClaim OR n:SummaryMemory OR n:InferredMemory)
       AND n.project_root = $project_root
       AND n.lifecycleState IN ['active', 'disputed']
       AND n.content CONTAINS $topic
       AND (n.visibility = 'council-shared' OR (n.visibility = 'seat-private' AND n.owner_seat = $caller_seat) OR n.visibility IS NULL)
     RETURN n.nodeId AS nodeId,
            n.content AS content,
            n.source_artifact_ref AS source_artifact_ref,
            n.created_at AS created_at,
            n.lifecycleState AS lifecycleState,
            n.verificationState AS verificationState,
            n.memory_type AS memory_type,
            n.confidence_score AS confidence_score,
            n.governance_stratum AS governance_stratum,
            n.source_identity_status AS source_identity_status,
            n.reconciliation_status AS reconciliation_status,
            labels(n) AS labels
     SKIP toInteger($offset)
     LIMIT toInteger($limit)`,
    { project_root, topic, caller_seat: caller_seat ?? null, offset, limit },
  );

  const structured = rows.map((row): StructuredMemoryPayload & { retrieval_mode: string } => {
    const source_artifact_ref = (row.source_artifact_ref as string | null) ?? null;
    const { source_status, reason } = classifySource(source_artifact_ref ?? undefined);
    const labels = (row.labels as string[]) ?? [];
    const VALID_TYPES = ['MemoryClaim', 'SummaryMemory', 'InferredMemory'] as const;
    type ValidType = (typeof VALID_TYPES)[number];
    const memory_type: ValidType = labels.find(
      (l): l is ValidType => (VALID_TYPES as readonly string[]).includes(l),
    ) ?? ((row.memory_type as ValidType) ?? 'MemoryClaim');
    // R-spec-axes 5/5 (2026-05-22): lifecycleState is temporal only; verificationState orthogonal.
    const lifecycleState = (row.lifecycleState as string) === 'disputed'
      ? 'active' as const
      : (row.lifecycleState as 'active' | 'superseded' | 'archived');
    const verificationState =
      (row.verificationState as 'unverified' | 'verified' | null) ?? undefined;

    // G4 P0-M2: enrich payload with low_confidence_flag (text-pattern fallback path)
    return enrichWithConfidenceFlag({
      content: row.content as string,
      source_artifact_ref,
      created_at: (row.created_at as string) ?? new Date().toISOString(),
      lifecycleState,
      memory_type,
      source_status,                                                                           // BLOCK-20: NEVER absent
      ...(verificationState !== undefined ? { verificationState } : {}),
      ...(typeof row.confidence_score === 'number' ? { confidence_score: row.confidence_score } : {}),
      ...(typeof row.governance_stratum === 'string' ? { governance_stratum: row.governance_stratum } : {}),
      ...(typeof row.source_identity_status === 'string' ? { source_identity_status: row.source_identity_status } : {}),
      ...(typeof row.reconciliation_status === 'string' ? { reconciliation_status: row.reconciliation_status } : {}),
      ...(reason !== undefined ? { reason } : {}),
      nodeId: row.nodeId as string,
      retrieval_mode: 'fallback',                                                              // E5: text-pattern fallback
    });
  });

  // Prose MUST NOT mention 'MemoryClaim', 'SummaryMemory', or 'InferredMemory' (BLOCK-14)
  const prose = structured.length === 0
    ? `I don't have anything stored about "${topic}".`
    : `Here is what I remember about "${topic}": ${structured.map((s) => `${governanceProsePrefix(s)}${s.content}`).join(' | ')}`;

  // CF-G7c-G8 R37 5/5 (Option (a) + expanded Touch 4): text-pattern fallback is also observation.
  // R-spec-3 5/5 Layer-B-only: pass caller_seat through (already R59-normalized by main handler).
  if (sessionUuid && structured.length > 0) {
    // CF-TIER9-0-TSC-2: narrow (string|undefined)[] → string[] (Cypher RETURN guarantees non-null)
    const nodeIds = structured.map((s) => s.nodeId).filter((id): id is string => id !== undefined);
    if (nodeIds.length > 0) {
      await writeRecallObservedIn(sessionUuid, nodeIds, neo4j, caller_seat, project_root);
      // CF-G7c-G8 R39 5/5 Layer 2: G7c re-evaluation + G8 auto-VR per recalled nodeId.
      await attemptRecallCrystallization(nodeIds, neo4j);
    }
  }

  return { structured, prose };
}
