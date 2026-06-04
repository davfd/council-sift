/**
 * recall.ts — recall NL primitive handler + provenance surface (S5:0)
 * Thread: G (iter6-execution) + Thread J (iter8 semantic retrieval)
 * Plan: SEMANTIC_MEMORY_V4_ITER6_WAVE_A.md + SEMANTIC_MEMORY_V4_ITER8.md
 * Gate evidence: spec:S4:2, spec:S5:0, spec:S5:1, spec:IG4, spec:IG5
 *
 * source_status ALWAYS present on every retrieval (BLOCK-20, Call 4, AD4).
 * Inline prose MUST NOT contain 'MemoryClaim', 'SummaryMemory', 'InferredMemory' (BLOCK-14).
 * authorized_by: Jonathan 2026-04-22T00:19:17Z (T1, decision delegation)
 *              + Jonathan 2026-04-22T00:24:36Z (T2 — iter5+iter6 original execution grant; chain anchor)
 *              + Jonathan 2026-04-22T19:52:52Z (T3 — iter6 NEW CHARTER; authoritative for Wave A)
 *              + Jonathan 2026-04-30T21:33:01Z (T7 — iter8 charter; E0+E4+E5 authorized changes below)
 */

/**
 * FC11 architectural note (2026-04-24, 5/5 unanimous):
 *
 * This handler does NOT route through frozen retrieve.ts. The iter4 retrieve.ts
 * module filters via IN_SCOPE edges on Scope nodes; Wave A writes (remember.ts)
 * do not create IN_SCOPE edges — they tag nodes with project_root per FC5's
 * tenant isolation model (AD6). Routing through retrieve.ts would return zero
 * results for all Wave A nodes, violating spec:S6:2's project_root filter
 * requirement.
 *
 * FC11 ratified this divergence:
 *   - spec:S4:2 amended to release the retrieve.ts mechanism requirement
 *     (behavioral requirements — source_status, inline prose suppression,
 *     project_root isolation — are fully preserved).
 *   - spec:S6:2 affirmed as the authoritative retrieval isolation mechanism
 *     for Wave A NL primitives.
 *   - retrieve.ts remains FROZEN (AD8) and is the correct infrastructure for
 *     Wave B IN_SCOPE-authorization flows.
 *
 * Do NOT introduce retrieve.ts routing into this handler without reopening FC11.
 */

/**
 * BLOCK-iter8-1 E0 carve-out: three coupled mechanical touches authorized by iter8 charter E0
 *   + 5/5 council Round 1 RATIFIED 2026-05-01T00:51-00:53Z UTC (Jophiel+Jeremiel+Barachiel+Raguel+Zadkiel).
 *   Zadkiel R3 forward requirement: ALL THREE coupled touches annotated under THIS SINGLE BLOCK header.
 *   (touch ii) line ~36: import { existsSync } from 'fs' REMOVED; replaced with classifySource import
 *   (touch iii) lines 91-96: StructuredMemoryPayload.reason JSDoc updated — 'remote_url_provenance_only' added
 *   (touch i) lines 108-119: resolveSourceStatus() body replaced with classifySource() delegation
 *   Binary source_status discriminator 'verifiable' | 'unverifiable' UNCHANGED. reason?: string type UNCHANGED.
 *   URL-scheme refs (discord://, http://) now return reason:'remote_url_provenance_only' (was: 'artifact_moved_or_deleted').
 */

// E0 touch (ii): import { existsSync } from 'fs' REMOVED (orphaned after resolveSourceStatus replaced below)
// Replaced with classifySource import from shared E0 helper per iter8 charter E0 + 5/5 council Round 1 RATIFIED 2026-05-01
import { classifySource } from '../core/source-classifier.js';
// G4 P0-M2: low-confidence flag enrichment — option (b): type intersection via enrichWithConfidenceFlag<T>
// No StructuredMemoryPayload interface change required; enrichment applied at retrieval time (zero-operator-labor).
// authorized_by: P0 grant 2026-05-11
import { enrichWithConfidenceFlag } from '../core/d3-2-confidence-override.js';
// G8 P0-M4: post-recall auto-VR evaluation (BLOCK-P0-3 fully discharged: G1 M3-shipped + G7b this milestone).
// Q-M4-3 Gabriel resolution: recall.ts elected over semantic_recall.ts — primary dispatch handler;
// text-pattern path hits the broader recall population; semantic_recall is opt-in fallback.
// collectSessionCorpus 3 pre-existing bugs fixed in G8 scope (R20 Raguel+Jeremiel + Gabriel Bug 3).
// A-ZADT-R16-1 superseded by R37 ratification 2026-05-15: sessionUuid added to handleRecall for
// CF-G7c-G8-SESSION-BARRIER fix (Option (a) + expanded Touch 4). M4-scoped constraint retired —
// recall now accepts sessionUuid as MCP inputSchema field to enable recall-time OBSERVED_IN writes.
// authorized_by: P0 grant 2026-05-11 (R20 5/5 ratified 2026-05-13; R37 5/5 ratified 2026-05-15)
import { attemptAutoVR, collectSessionCorpus } from '../core/d3-5-verification-record.js';
// CF-G7c-G8 R37 5/5: recall-time OBSERVED_IN edge writes per recalled nodeId — accumulates
// cross-session evidence so G7c criterion 2 + G8 Guard 1 (≥3 distinct sessions) become reachable.
import { resolveSession, deriveSessionNodeId } from '../core/session-resolver.js';
// CF-G7c-G8 R39 5/5 Layer 2: recall-time G7c re-evaluation — autoAnchorNode fires after
// OBSERVED_IN MERGE so a node crossing sessionCount ≥ 3 at recall time can crystallize a
// DoctrineAnchor. Pre-R39, autoAnchorNode was called only at remember.ts:443 where
// sessionCount=1 invariantly, making criterion 2 structurally unreachable.
import { autoAnchorNode, ANCHOR_CONFLICT_CHECKS } from '../core/d3-4-doctrine-anchor.js';
import { hasOpenConflict } from '../core/d3-1-conflict-record.js';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { getProjectRoot } from '../tenant.js';
import { emitTelemetry } from '../telemetry/index.js';

/**
 * StructuredMemoryPayload — FC4 binding interface.
 *
 * Returned by all 4 NL primitives (remember, recall, forget, what_do_you_know_about).
 * Inline prose output MUST NOT contain the strings 'MemoryClaim', 'SummaryMemory',
 * or 'InferredMemory' — see FC4 §4 (inline prose suppression rule).
 *
 * Source: FC4 council verdict — Barachiel (The Operator)
 * Authorization: T1 + T2 + T3
 */
// StructuredMemoryPayload extracted to types/index.ts per EXT-M6 (PN-EXT-2 types consolidation).
// Re-exported here to preserve call-site `from './recall.js'` and `from './handlers/recall.js'` imports.
import type { StructuredMemoryPayload } from '../types/index.js';
export type { StructuredMemoryPayload };

// E0 touch (i): resolveSourceStatus() function body replaced with classifySource() delegation.
// Binary source_status discriminator 'verifiable' | 'unverifiable' UNCHANGED. reason?: string UNCHANGED.
// URL-scheme refs (e.g. discord://) now correctly return reason:'remote_url_provenance_only' via classifySource.
/** Resolve source_status for a retrieved memory row (BLOCK-20: NEVER absent) */
function resolveSourceStatus(
  source_artifact_ref: string | null,
): { source_status: 'verifiable' | 'unverifiable'; reason?: string } {
  return classifySource(source_artifact_ref ?? undefined);
}

/** Resolve memory_type from Neo4j labels or stored property */
function resolveMemoryType(
  labels: string[],
  storedType: string | null,
): 'MemoryClaim' | 'SummaryMemory' | 'InferredMemory' {
  const VALID_TYPES = ['MemoryClaim', 'SummaryMemory', 'InferredMemory'] as const;
  type ValidType = (typeof VALID_TYPES)[number];

  // Check labels first
  for (const label of labels) {
    if ((VALID_TYPES as readonly string[]).includes(label)) {
      return label as ValidType;
    }
  }
  // Fallback to stored property
  if (storedType && (VALID_TYPES as readonly string[]).includes(storedType)) {
    return storedType as ValidType;
  }
  // Final fallback (satisfies type contract, never absent per BLOCK-13)
  return 'MemoryClaim';
}

/**
 * escapeLuceneTopic — P-5 Lucene special-char escape + phrase-quote helper.
 * Escapes all Lucene query-syntax reserved characters: + - & | ! ( ) { } [ ] ^ " ~ * ? : \ /
 * Wraps the escaped topic in double-quotes for phrase-match semantics (word-boundary, case-insensitive
 * via 'standard' analyzer). Single-word topics become single-term phrase queries (equivalent behavior).
 *
 * Export for unit-testability (tests/lexical-recall.test.ts).
 *
 * authorized_by: T11 (Jonathan 2026-05-05) + R-recall-auto-x-lexical 5/5 2026-05-28
 */
export function escapeLuceneTopic(topic: string): string {
  // Escape each Lucene reserved char with a backslash
  // Chars: + - & | ! ( ) { } [ ] ^ " ~ * ? : \ /
  // Backslash itself must be escaped first to avoid double-escaping
  const escaped = topic.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, (ch) => `\\${ch}`);
  // Wrap in double-quotes → phrase query; standard analyzer lowercases + word-breaks at runtime
  const base = `"${escaped}"`;

  // iter9 Tier 9.3 M6 (9.3a-5) — Lucene phrase boost for capitalized noun phrases.
  // Detect Title-case token sequences (e.g., "Alice Johnson", "New York City") and append
  // them as phrase-boosted clauses: `"Alice Johnson"^2`. Improves entity-precise retrieval —
  // exact-name matches score higher than partial token matches on the same result set.
  // All-lowercase topics: no match → no change → unchanged base phrase query returned.
  // Mixed topics: boost only the capitalized sub-sequences; base phrase covers the full topic.
  // authorized_by: T11 (Jonathan 2026-05-05) + R-iter9-tier9.3-consolidation-preflight 5/5 2026-05-28
  const capPhraseRegex = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
  const capPhrases = [...topic.matchAll(capPhraseRegex)].map((m) => m[0]);

  if (capPhrases.length === 0) return base;

  // Build phrase-boost queries for each detected capitalized sequence
  const boostParts = capPhrases.map((phrase) => {
    const escapedPhrase = phrase.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, (ch) => `\\${ch}`);
    return `"${escapedPhrase}"^2`;
  });

  return `${base} ${boostParts.join(' ')}`;
}

/**
 * rerankResults — P-3 cross-encoder reranking (top-100→top-15 by relevance score).
 * Loads Xenova/ms-marco-MiniLM-L-6-v2 via @xenova/transformers (local ONNX; ~22MB cache).
 * Scores each candidate against topic query; returns top-15 sorted by descending relevance.
 * No-op passthrough if candidates.length ≤ 15 (checked by caller; guarded here for safety).
 * Non-fatal: caller wraps in try/catch; reranking failure must not block recall delivery.
 *
 * authorized_by: T11 (Jonathan 2026-05-05) + Tier 9.2 charter M3
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rerankResults<T extends { content: string }>(
  topic: string,
  candidates: T[],
): Promise<T[]> {
  if (candidates.length <= 15) return candidates;

  // Dynamic import — P-3 is optional; caller handles import failure gracefully
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { pipeline } = await import('@xenova/transformers') as any;
  const reranker = await pipeline('text-classification', 'Xenova/ms-marco-MiniLM-L-6-v2');

  // Score each candidate individually (batch API varies by transformers version)
  const scoredCandidates = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const result = await reranker([[topic, candidate.content]], {
          padding: true,
          truncation: true,
        });
        const score: number = Array.isArray(result) && result[0] != null
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? ((result[0] as any).score ?? 0)
          : 0;
        return { candidate, score };
      } catch {
        return { candidate, score: 0 };
      }
    }),
  );

  // Sort descending by relevance score, return top-15
  return scoredCandidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map((s) => s.candidate);
}

export async function handleRecall(
  params: {
    topic: string;
    source_identity?: string;
    tenant_id?: string;
    /**
     * iter9 Tier 9.3 M4 (9.3a-3): sort option for recall results.
     * 'temporal': ORDER BY n.created_at DESC — most recent first.
     * 'relevance': current behavior (default, unchanged) — text-CONTAINS match order.
     * Enables "most recent N memories about X" query pattern for production agents.
     * authorized_by: T11 (Jonathan 2026-05-05) + R-iter9-tier9.3-consolidation-preflight 5/5 2026-05-28
     */
    sort?: 'temporal' | 'relevance';
    /**
     * Retrieval mode — F1 Raphael hardening + R-recall-auto-mode-design 5/5 2026-05-27.
     * 'text' (default): text-CONTAINS only; backward-compatible; used by all pre-existing callers.
     * 'auto': ALWAYS runs text-CONTAINS + lexical (P-5a) + semantic (when OPENAI_API_KEY present);
     *   three-way union merged by nodeId (text first, lexical-only second, semantic-only third).
     *   R-recall-auto-x-lexical 5/5 2026-05-28 extends always-both to three-way per PN-T92-1.
     * 'lexical': Lucene fulltext query via db.index.fulltext.queryNodes('memory_content_fulltext', ...).
     *   Phrase-quoted + Lucene-special-char-escaped topic. Replaces text-CONTAINS for this call.
     *   Requires m010-fulltext-index.cypher migration ONLINE; empty result if index absent.
     * Explicit opt-in required to prevent regressions in tests/callers that expect text-only behavior.
     * authorized_by: T7 (Jonathan 2026-04-30T21:33:01Z — iter8 charter E4) + Raphael Stage 5 2026-05-01
     *   + 5/5 R-recall-auto-mode-design 2026-05-27 + R-recall-auto-x-lexical 5/5 2026-05-28 (P-5/P-5a)
     */
    mode?: 'text' | 'auto' | 'lexical';
    /**
     * P-3 cross-encoder reranking (Tier 9.2 M3; T11 + BLOCK-T92-1).
     * When true AND structured.length > 15: apply rerankResults() post-retrieval — scores ALL
     *   candidates against topic via Xenova/ms-marco-MiniLM-L-6-v2 ONNX; returns top-15 sorted
     *   by descending relevance. Local inference; ~22MB model cache; zero API cost.
     * rerank=false/undefined OR ≤15 candidates: no-op passthrough; unchanged result order.
     * authorized_by: T11 (Jonathan 2026-05-05) + Tier 9.2 charter M3
     */
    rerank?: boolean;
    /**
     * CF-G7c-G8 R37 5/5 (Option (a) + expanded Touch 4): per-callSeat session UUID.
     * When present, MERGEs OBSERVED_IN edge per recalled nodeId before the G8 evaluation
     * loop runs — recall counts as "active in session" alongside CREATE-time OBSERVED_IN
     * writes from G7b. Closes the consumer-side architectural barrier where each MemoryClaim
     * received exactly 1 OBSERVED_IN edge at CREATE, making the ≥3-session threshold for
     * G7c criterion 2 + G8 Guard 1 architecturally unreachable.
     * authorized_by: R37 5/5 ratification 2026-05-15 (post-P0)
     */
    sessionUuid?: string;
    /**
     * Item 26 (R70 5/5): per-call recall limit override. Defaults to CLAW_RECALL_LIMIT_DEFAULT
     * env var (default 50, aligns with §3 GRAPH_REFERENCE doc). Positive integer only;
     * invalid values fall back to env default. Replaces former hardcoded LIMIT 10 that
     * silently dropped matches 11+ on broad keyword recall.
     */
    limit?: number;
  },
  neo4j: Neo4jService,
): Promise<{ structured: (StructuredMemoryPayload & { retrieval_mode: string })[]; prose: string; error?: string }> {

  // iter9 Tier 9.3 M7 (9.3a-6) — empty-topic guard (CF-T92-6 close).
  // If topic is empty or whitespace-only, return early WITHOUT executing any DB query.
  // Prevents mode='text' from returning ALL nodes when topic is empty (fulltext query degeneracy).
  // Applies before all recall mode dispatch — no DB round-trip on empty input.
  // authorized_by: T11 (Jonathan 2026-05-05) + R-iter9-tier9.3-consolidation-preflight 5/5 2026-05-28
  if (!params.topic || params.topic.trim() === '') {
    return { structured: [], prose: '', error: 'EMPTY_TOPIC' };
  }

  const project_root = params.tenant_id ?? getProjectRoot();
  const ts = new Date().toISOString();

  // D-W12 MEM-TELEMETRY: emit at handler entry (spec:S5:1, spec:IG5)
  emitTelemetry({ event: 'mem_recall_query', topic: params.topic, ts });

  // Item 20 (R70 5/5 + R71 Q3) — caller_seat prefix normalization fix.
  // Pre-fix (R59 normalization era): owner_seat stored as 'seat:raguel' via remember.ts:280-285;
  // recall.ts derived 'raguel' (no 'seat:' prepend) → filter 'seat:raguel' != 'raguel' → seat-private MISS.
  // Post-fix: emit 'seat:<name>' to match the normalized owner_seat write path.
  // Forward-compat: pass-through when source_identity already carries 'seat:' prefix.
  // Fail-closed: no caller identity → no seat-private access.
  const caller_seat = params.source_identity?.startsWith('council-seat:')
    ? `seat:${params.source_identity.slice('council-seat:'.length)}`
    : params.source_identity?.startsWith('seat:')
      ? params.source_identity
      : undefined;

  // Item 26 (R70 5/5) — recall LIMIT configurable.
  // Was: hardcoded LIMIT 10 (silently dropped matches 11+ in narrow text-CONTAINS recall;
  // operationally dangerous as semantic recall hit sets broaden in iter9 E4).
  // Now: CLAW_RECALL_LIMIT_DEFAULT env var (default 50; aligns with §3 documentation);
  // per-call params.limit pass-through overrides env default. Same pattern as Item 11
  // CLAW_LLM_CLASSIFIER_TIMEOUT_MS (ontology-classifier.ts:346-351).
  const RECALL_LIMIT_DEFAULT = (() => {
    const raw = process.env.CLAW_RECALL_LIMIT_DEFAULT;
    if (!raw) return 50;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 50;
  })();
  // iter9 Tier 9.3 M11 (9.3b-5) — RERANK_POOL_DEFAULT = 100 (CF-T92-1 close).
  // Separate from RECALL_LIMIT_DEFAULT (50). When rerank=true, fetch 100 candidates before
  // scoring and returning top-15 — larger corpora benefit from deeper candidate pool.
  // Non-reranked queries continue using RECALL_LIMIT_DEFAULT=50.
  // authorized_by: T11 (Jonathan 2026-05-05) + R-iter9-tier9.3-consolidation-preflight 5/5 2026-05-28
  const RERANK_POOL_DEFAULT = 100;

  // When rerank=true: use RERANK_POOL_DEFAULT (100) as the candidate pool before scoring;
  // top-15 are returned by rerankResults() post-retrieval.
  // When rerank=false/undefined: per-call limit override, then RECALL_LIMIT_DEFAULT (50).
  const recallLimit = params.rerank === true
    ? RERANK_POOL_DEFAULT
    : (params.limit && Number.isFinite(params.limit) && params.limit > 0
      ? Math.floor(params.limit)
      : RECALL_LIMIT_DEFAULT);

  // iter9 Tier 9.3 M4 (9.3a-3) — sort option ORDER BY clause.
  // 'temporal': ORDER BY n.created_at DESC (most recent first); applies to both text and lexical queries.
  // 'relevance'/undefined: preserve current query order (unchanged default behavior).
  // authorized_by: T11 (Jonathan 2026-05-05) + R-iter9-tier9.3-consolidation-preflight 5/5 2026-05-28
  const temporalOrderBy = params.sort === 'temporal' ? '\n         ORDER BY n.created_at DESC' : '';

  // C1 recall-path instrumentation: timing hook for cost-per-recall measurement (spec:S9:0)
  // authorized_by: T7 (Jonathan 2026-04-30T21:33:01Z — iter8 charter C1; spec:S9:0)
  const c1RecallStart = Date.now();
  // P-5 M1: conditional dispatch — lexical (Lucene fulltext) vs text-CONTAINS based on mode.
  // mode='lexical': calls db.index.fulltext.queryNodes with phrase-quoted + escaped topic.
  // mode='text': text-CONTAINS query (explicit opt-in for narrow keyword matching).
  // mode='auto' OR undefined: three-way union (text-CONTAINS + Lucene lexical + semantic).
  //
  // Post-T93 close-record amendment 2026-05-30 (orchestrator-direct + R-recall-default-mode-fix preflight):
  // Default changed from 'text' → 'auto' per Jophiel R-graph-cross-session-utility 2026-05-30 empirical
  // finding (59 OBSERVED_IN cross-session corroboration of pattern-recognition load-bearing semantic mode).
  // Seats calling recall() without explicit mode now get three-way union by default — the previously
  // documented [[feedback-seats-use-text-recall-not-semantic]] workaround is no longer required.
  //
  // authorized_by: T11 (Jonathan 2026-05-05) + R-recall-auto-x-lexical 5/5 2026-05-28
  //              + operator-direct 2026-05-30 post-T93-close
  const effectiveMode = params.mode ?? 'auto';
  const isLexicalMode = effectiveMode === 'lexical';
  let rows: Awaited<ReturnType<typeof neo4j.run>> = [];
  if (isLexicalMode) {
    try {
      const escapedTopic = escapeLuceneTopic(params.topic);
      rows = await neo4j.run(
        `CALL db.index.fulltext.queryNodes('memory_content_fulltext', $query)
         YIELD node AS n, score
         WHERE n.project_root = $project_root
           AND n.lifecycleState IN ['active', 'disputed']
           AND (n.visibility = 'council-shared' OR (n.visibility = 'seat-private' AND n.owner_seat = $caller_seat) OR n.visibility IS NULL)
         RETURN n.nodeId AS nodeId,
                n.content AS content,
                COALESCE(n.summary, LEFT(n.content, 400)) AS summary,
                n.source_artifact_ref AS source_artifact_ref,
                n.created_at AS created_at,
                n.lifecycleState AS lifecycleState,
                n.verificationState AS verificationState,
                n.memory_type AS memory_type,
                n.confidence_score AS confidence_score,
                n.governance_stratum AS governance_stratum,
                n.source_identity_status AS source_identity_status,
                n.reconciliation_status AS reconciliation_status,
                labels(n) AS labels${temporalOrderBy}
         LIMIT toInteger($recallLimit)`,
        { query: escapedTopic, project_root, caller_seat: caller_seat ?? null, recallLimit },
      );
    } catch (err) {
      // Graceful degradation: Lucene index absent or unavailable → empty result
      process.stderr.write(`[recall] lexical index absent or query failed — empty result: ${err}\n`);
      rows = [];
    }
  } else {
    rows = await neo4j.run(
      `MATCH (n)
       WHERE (n:MemoryClaim OR n:SummaryMemory OR n:InferredMemory)
         AND n.project_root = $project_root
         AND n.lifecycleState IN ['active', 'disputed']
         AND n.content CONTAINS $topic
         AND (n.visibility = 'council-shared' OR (n.visibility = 'seat-private' AND n.owner_seat = $caller_seat) OR n.visibility IS NULL)
       RETURN n.nodeId AS nodeId,
              n.content AS content,
              COALESCE(n.summary, LEFT(n.content, 400)) AS summary,
              n.source_artifact_ref AS source_artifact_ref,
              n.created_at AS created_at,
              n.lifecycleState AS lifecycleState,
              n.verificationState AS verificationState,
              n.memory_type AS memory_type,
              n.confidence_score AS confidence_score,
              n.governance_stratum AS governance_stratum,
              n.source_identity_status AS source_identity_status,
              n.reconciliation_status AS reconciliation_status,
              labels(n) AS labels${temporalOrderBy}
       LIMIT toInteger($recallLimit)`,
      { project_root, topic: params.topic, caller_seat: caller_seat ?? null, recallLimit },
    );
  }
  const c1RecallElapsedMs = Date.now() - c1RecallStart;
  // C1 cost-per-recall: emit timing for D-W8 pipeline cost model aggregation
  process.stderr.write(`[C1-COST] recall_ms=${c1RecallElapsedMs} results=${rows.length} mode=${isLexicalMode ? 'lexical' : 'text-pattern'} ts=${ts}\n`);

  const structured = rows.map((row) => {
    const source_artifact_ref = (row.source_artifact_ref as string | null) ?? null;
    const { source_status, reason } = resolveSourceStatus(source_artifact_ref);
    const memory_type = resolveMemoryType(
      (row.labels as string[]) ?? [],
      row.memory_type as string | null,
    );
    // R-spec-axes 5/5 (2026-05-22): lifecycleState is temporal only ('active'/'disputed'/etc).
    // 'disputed' continues to map to 'active' for external display (still recall-visible).
    // Epistemic axis surfaced as orthogonal verificationState payload field.
    const lifecycleState = (row.lifecycleState as string) === 'disputed'
      ? 'active'
      : (row.lifecycleState as 'active' | 'superseded' | 'archived');
    const verificationState =
      (row.verificationState as 'unverified' | 'verified' | null) ?? undefined;

    const payload: StructuredMemoryPayload & { retrieval_mode: string } = {
      content: row.content as string,
      summary: row.summary as string, // Council R2 5/5 2026-05-11: COALESCE fallback for pre-existing nodes
      source_artifact_ref,
      created_at: (row.created_at as string) ?? new Date().toISOString(),
      lifecycleState,
      memory_type,
      source_status, // BLOCK-20: NEVER absent
      ...(verificationState !== undefined ? { verificationState } : {}),
      ...(typeof row.confidence_score === 'number' ? { confidence_score: row.confidence_score } : {}),
      ...(typeof row.governance_stratum === 'string' ? { governance_stratum: row.governance_stratum } : {}),
      ...(typeof row.source_identity_status === 'string' ? { source_identity_status: row.source_identity_status } : {}),
      ...(typeof row.reconciliation_status === 'string' ? { reconciliation_status: row.reconciliation_status } : {}),
      ...(reason !== undefined ? { reason } : {}),
      nodeId: row.nodeId as string, // T9.3 BLOCK-T9-1 change (b): Cypher RETURN already includes n.nodeId AS nodeId at line 154; TypeScript-layer-only
      retrieval_mode: isLexicalMode ? 'lexical' : 'text-pattern', // T7 E5: mode disclosure; P-5 extends to lexical
    };

    // G4 P0-M2: enrich payload with low_confidence_flag (type intersection; no interface change per option (b))
    return enrichWithConfidenceFlag(payload);
  });

  // CF-G7c-G8 R37 5/5 (Option (a) + expanded Touch 4): recall-time OBSERVED_IN writes.
  // BEFORE the G8 evaluation block: if sessionUuid present, MERGE Session + OBSERVED_IN edge
  // per recalled nodeId. Each MemoryClaim now accumulates an OBSERVED_IN edge per distinct
  // recall session — closes the consumer-side architectural barrier (CF-G7c-G8-SESSION-BARRIER).
  // MERGE is idempotent: same node recalled in same session = no-op (no duplicate edge).
  // Semantics: OBSERVED_IN means "active in session (created OR recalled)" — neutral re: provenance.
  // Provenance lives in DERIVED_FROM → RawEvent.source + ingestTime; never in OBSERVED_IN.
  if (params.sessionUuid && structured.length > 0) {
    // R-spec-3 5/5 Layer-B-only (2026-05-22): pass normalized caller_seat so Session node
    // carries calling_seat for G8 Guard 1 witnessSeats accumulation (agent-identity Set).
    // R81 Commit F (F-R79-3, 2026-05-23): pass tenant_id so the Session is tenant-tagged
    // on first sight (recall path). Same derivation as remember.ts:481.
    await resolveSession(params.sessionUuid, neo4j, params.tenant_id ?? undefined, caller_seat);
    const sessionNodeId = deriveSessionNodeId(params.sessionUuid);
    await Promise.all(
      structured.map(async (payload) => {
        try {
          await neo4j.run(
            `MATCH (n {nodeId: $nodeId})
             MATCH (s:Session {nodeId: $sessionNodeId})
             MERGE (n)-[:OBSERVED_IN]->(s)`,
            { nodeId: payload.nodeId, sessionNodeId },
          );
        } catch {
          // Non-fatal: OBSERVED_IN write failure must not block recall delivery
        }
      }),
    );

    // CF-G7c-G8 R39 5/5 (Option (a)): recall-time G7c eligibility re-evaluation.
    // Inside the same sessionUuid gate as OBSERVED_IN MERGE above — sessionCount changed this
    // recall iff sessionUuid was present and MERGE fired, so re-checking has new information.
    // Pattern mirrors remember.ts:436-443 exactly: hasOpenConflict → conflictChecksPassed → autoAnchorNode.
    // autoAnchorNode is idempotent (eligibility check + existingAnchor check before DoctrineAnchor write).
    // Non-fatal try/catch: G7c crystallization failure must not block recall delivery.
    await Promise.all(
      structured.map(async (payload) => {
        if (!payload.nodeId) return;  // CF-TIER9-0-TSC-2: narrow string|undefined; Cypher RETURN n.nodeId guarantees non-null at runtime
        try {
          const openConflict = await hasOpenConflict(payload.nodeId, neo4j);
          const conflictChecksPassed = openConflict ? 0 : ANCHOR_CONFLICT_CHECKS;
          await autoAnchorNode(payload.nodeId, conflictChecksPassed, neo4j);
        } catch {
          // Non-fatal: G7c eligibility check / DoctrineAnchor write failure must not block recall delivery
        }
      }),
    );
  }

  // G8 P0-M4: post-recall auto-VR evaluation chain (BLOCK-P0-3 fully discharged: G1 M3 + G7b this milestone)
  // For each recalled node: collectSessionCorpus → attemptAutoVR (6-guard chain).
  // Parallel evaluation (Promise.all) — errors are non-fatal; VR write failure must not block recall delivery.
  // Guard 1 fails fast for nodes without qualifying corpus (no OBSERVED_IN edges → empty sessionIds → return early).
  // Scope: 'scope-council-deliberations-may-2026' passed as scopeName to attemptAutoVR.
  // promote-orchestrator.ts:314 derives `uuidv5(scopeName, NAMESPACE_UUID)` = 9592f0c5-...
  // VR IN_SCOPE edges land on this UUID-keyed Scope — NOT G10 literal (which is reachable
  // only via the F5 direct-MATCH bypass at remember.ts). Structurally distinct nodes; same
  // semantic scope. CF-M3-3 / proposed G16 scope-resolver refactor closes this gap.
  // G8-T1 pass: qualified corpus → VR written → n.lifecycleState transitions to 'verified'
  // G8-T2 pass: open ConflictRecord → Guard 2 blocks → no VR; lifecycle stays unchanged
  // BLOCK-P0-3-T1: verifies both G1 (ConflictRecord guard) AND G7b (OBSERVED_IN count guard) fire correctly
  if (structured.length > 0) {
    await Promise.all(
      structured.map(async (payload) => {
        if (!payload.nodeId) return;  // CF-TIER9-0-TSC-2: narrow string|undefined; Cypher RETURN guarantees non-null
        try {
          const corpus = await collectSessionCorpus(payload.nodeId, neo4j);
          // F1 P0-M4 hardening 2026-05-13 (Uriel HARDENING_REQUIRED; R23 5/5 ratified spec-tracking).
          // Third occurrence of CF-M3-3 scope-prefix drift (R12 IN_SCOPE bypass + R19 scopeCheck
          // filter + this). Pre-fix: 'council-deliberations-may-2026' → uuidv5 = 5c77dc0b-...
          // (not in graph) → first production qualifying recall would MERGE a permanent spurious
          // Scope; VR IN_SCOPE edges land there. setDifferenceTeardown masked it in vitest.
          // Post-fix: 'scope-council-deliberations-may-2026' → uuidv5 = 9592f0c5-... (already
          // in graph; idempotent MERGE) → VR IN_SCOPE targets the existing UUID-keyed Scope.
          // NOTE: this fix prevents spurious-Scope creation; it does NOT route VRs to G10
          // literal. G10 literal alignment requires the proposed G16 scope-resolver refactor.
          await attemptAutoVR(corpus, neo4j, ['scope-council-deliberations-may-2026']);
        } catch {
          // Non-fatal: VR evaluation errors must not block recall delivery
          // Errors here are logged at debug level; production callers receive unaffected recall result
        }
      }),
    );
  }

  // P-5a: mode='auto' three-way union extension (R-recall-auto-x-lexical 5/5 2026-05-28).
  // EXTENDS existing always-both block per PN-T92-1 — does NOT replace text-CONTAINS or semantic logic.
  // SUPERSEDES: R-recall-auto-mode-design 5/5 2026-05-27 two-way {text+semantic} contract.
  // Ordering: text-pattern first (existing); lexical-only second (Lucene cap ≤20); semantic-only third (cap ≤12 F4a).
  // Graceful degradation matrix:
  //   Lucene absent → try/catch → fall through to {text + semantic} (original 2-way behavior preserved)
  //   OPENAI_API_KEY absent → semantic gate not entered → {text + lexical}
  //   Both absent → text only (original single-path behavior)
  // OBSERVED_IN + G7c + G8: text path writes OBSERVED_IN above; semantic path writes internally; MERGE-idempotent.
  // authorized_by: T7 (Jonathan 2026-04-30T21:33:01Z — iter8 charter E4)
  //   + 5/5 R-recall-auto-mode-design 2026-05-27 (Jophiel e20ca70a · Zadkiel dc053b7f · Barachiel a3d85636
  //     · Raguel e0127e6e · Jeremiel 97d06229)
  //   + R-recall-auto-x-lexical 5/5 2026-05-28 R4 (P-5a three-way union)
  if (effectiveMode === 'auto') {
    // P-5a lexical-only second pass — BETWEEN text-CONTAINS and semantic per PN-T92-1
    try {
      const escapedTopicAuto = escapeLuceneTopic(params.topic);
      const lexRows = await neo4j.run(
        `CALL db.index.fulltext.queryNodes('memory_content_fulltext', $query)
         YIELD node AS n, score
         WHERE n.project_root = $project_root
           AND n.lifecycleState IN ['active', 'disputed']
           AND (n.visibility = 'council-shared' OR (n.visibility = 'seat-private' AND n.owner_seat = $caller_seat) OR n.visibility IS NULL)
         RETURN n.nodeId AS nodeId,
                n.content AS content,
                COALESCE(n.summary, LEFT(n.content, 400)) AS summary,
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
         LIMIT 20`,
        { query: escapedTopicAuto, project_root, caller_seat: caller_seat ?? null },
      );
      const textNodeIds = new Set(structured.map((s) => s.nodeId).filter(Boolean));
      const lexicalOnly = lexRows
        .map((row) => {
          const saf = (row.source_artifact_ref as string | null) ?? null;
          const { source_status, reason } = resolveSourceStatus(saf);
          const mt = resolveMemoryType((row.labels as string[]) ?? [], row.memory_type as string | null);
          const ls = (row.lifecycleState as string) === 'disputed' ? 'active' : (row.lifecycleState as 'active' | 'superseded' | 'archived');
          const vs = (row.verificationState as 'unverified' | 'verified' | null) ?? undefined;
          const p: StructuredMemoryPayload & { retrieval_mode: string } = {
            content: row.content as string,
            summary: row.summary as string,
            source_artifact_ref: saf,
            created_at: (row.created_at as string) ?? new Date().toISOString(),
            lifecycleState: ls,
            memory_type: mt,
            source_status,
            ...(vs !== undefined ? { verificationState: vs } : {}),
            ...(typeof row.confidence_score === 'number' ? { confidence_score: row.confidence_score } : {}),
            ...(typeof row.governance_stratum === 'string' ? { governance_stratum: row.governance_stratum } : {}),
            ...(typeof row.source_identity_status === 'string' ? { source_identity_status: row.source_identity_status } : {}),
            ...(typeof row.reconciliation_status === 'string' ? { reconciliation_status: row.reconciliation_status } : {}),
            ...(reason !== undefined ? { reason } : {}),
            nodeId: row.nodeId as string,
            retrieval_mode: 'lexical',
          };
          return enrichWithConfidenceFlag(p);
        })
        .filter((s) => s.nodeId && !textNodeIds.has(s.nodeId));
      if (lexicalOnly.length > 0) {
        structured.push(...lexicalOnly);
      }
    } catch (err) {
      // Lucene index absent → fall through to {text + semantic} (graceful degradation per P-5a matrix)
      process.stderr.write(`[recall] P-5a lexical dispatch in auto mode — index absent or unavailable: ${err}\n`);
    }

    // Semantic-only third pass — dedup against ALL prior results (text + lexical)
    if (process.env.OPENAI_API_KEY) {
      try {
        const { handleSemanticRecall } = await import('./semantic_recall.js');
        const semanticResult = await handleSemanticRecall(params, neo4j);
        // Dedup against ALL prior results (text-pattern + lexical)
        const priorNodeIds = new Set(structured.map((s) => s.nodeId).filter(Boolean));
        // Cast: semantic_recall.ts applies enrichWithConfidenceFlag internally (low_confidence_flag present
        // at runtime); TypeScript return type doesn't declare it. Safe runtime cast.
        const semanticOnly = (semanticResult.structured.filter(
          (s) => s.nodeId && !priorNodeIds.has(s.nodeId),
        )) as typeof structured;
        if (semanticOnly.length > 0) {
          structured.push(...semanticOnly);
        }
      } catch (err) {
        // Dispatch failure → fall through to text-pattern + lexical result only (fail-safe)
        process.stderr.write(`[recall] semantic_recall dispatch failed — returning text-pattern + lexical: ${err}\n`);
      }
    }
  }

  // P-3: cross-encoder reranking post-retrieval (M3 Tier 9.2; T11 + BLOCK-T92-1).
  // rerank=true AND structured.length > 15 → rerankResults() → top-15 by relevance.
  // rerank=false/undefined OR ≤15 candidates → no-op passthrough.
  // Non-fatal: try/catch ensures reranking failure does NOT block recall delivery.
  // authorized_by: T11 (Jonathan 2026-05-05) + Tier 9.2 charter M3
  if (params.rerank === true && structured.length > 15) {
    try {
      const reranked = await rerankResults(params.topic, structured);
      structured.splice(0, structured.length, ...reranked);
    } catch (err) {
      process.stderr.write(`[recall] reranking failed — returning unreranked candidates: ${err}\n`);
    }
  }

  // iter9 Tier 9.3 M3 (9.3a-2) + M5 (9.3a-4) — Prose timestamp + trust signal prefix.
  // M3: Each prose item prefixed with `[YYYY-MM-DDTHH:MMZ]` using n.created_at minute-precision.
  //   null created_at → empty brackets `[]` (graceful fallback; never crashes).
  // M5 (DEPENDS_ON M3): Extends prefix with lifecycleState + confidence_score when present.
  //   Full format: `[YYYY-MM-DDTHH:MMZ, lifecycleState, conf=N.NN] content...`
  //   Trust signals: verified vs disputed vs active; confidence level.
  //   Null fields omitted gracefully (bracket still present; just fewer fields inside).
  // BLOCK-14: Prose MUST NOT mention 'MemoryClaim', 'SummaryMemory', or 'InferredMemory'.
  // authorized_by: T11 (Jonathan 2026-05-05) + R-iter9-tier9.3-consolidation-preflight 5/5 2026-05-28
  function governanceProseSignal(item: StructuredMemoryPayload): string | null {
    switch (item.reconciliation_status) {
      case 'legacy_not_authoritative_for_formal_governance':
        return 'governance=legacy-non-authoritative';
      case 'formal_advisory_not_authoritative_council_cc_capture':
        return 'governance=advisory-formal';
      case 'formal_wrong_type_requires_reconciliation':
        return 'governance=formal-requires-reconciliation';
      default:
        return null;
    }
  }

  function formatProseItem(item: StructuredMemoryPayload & { retrieval_mode: string }): string {
    // M3: minute-precision timestamp (YYYY-MM-DDTHH:MMZ)
    const tsPart = item.created_at ? `${item.created_at.slice(0, 16)}Z` : null;
    // M5: lifecycleState (trust signal: active/disputed/superseded)
    const lifecyclePart: string | null = item.lifecycleState ?? null;
    // M5: confidence score (N.NN precision) — direct property access; conditional spread preserves it when present
    const confidenceVal = item.confidence_score;
    const confPart: string | null = typeof confidenceVal === 'number'
      ? `conf=${confidenceVal.toFixed(2)}`
      : null;
    // Build bracket from non-null parts
    const governancePart = governanceProseSignal(item);
    const parts: string[] = [tsPart, lifecyclePart, confPart, governancePart].filter((p): p is string => p !== null);
    const prefix = `[${parts.join(', ')}] `;
    return prefix + (item.summary ?? item.content);
  }

  // Prose MUST NOT mention 'MemoryClaim', 'SummaryMemory', or 'InferredMemory' (BLOCK-14)
  const prose =
    structured.length === 0
      ? `I don't have anything stored about "${params.topic}".`
      : `Here is what I remember about "${params.topic}": ${structured.map(formatProseItem).join(' | ')}`;

  return { structured, prose };
}
