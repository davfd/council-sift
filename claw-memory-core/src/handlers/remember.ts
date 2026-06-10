/**
 * remember.ts — remember NL primitive handler (Wave B: D-W8 auto-capture extension)
 * Thread: G (iter6-execution) + Thread H (Wave B) + Thread J (iter8 semantic retrieval)
 * Plan: SEMANTIC_MEMORY_V4_ITER6_WAVE_A.md + SEMANTIC_MEMORY_V4_WAVE_B.md + SEMANTIC_MEMORY_V4_ITER8.md
 * Gate evidence (Wave A): spec:S4:1, spec:IG4
 * Gate evidence (Wave B): spec:S1:0, spec:S1:1, spec:IG1
 * Gate evidence (iter8): spec:S1:1 (E0 call site a), spec:S2:0 (E1 embedding write-path)
 *
 * Invokes ontology-classifier.ts classify() then writes to Neo4j.
 * Inline prose MUST NOT contain 'MemoryClaim', 'SummaryMemory', 'InferredMemory' (BLOCK-14).
 * authorized_by: Jonathan 2026-04-22T00:19:17Z (T1, decision delegation)
 *              + Jonathan 2026-04-22T00:24:36Z (T2 — iter5+iter6 original execution grant; chain anchor)
 *              + Jonathan 2026-04-22T19:52:52Z (T3 — iter6 NEW CHARTER; authoritative for Wave A)
 *              + Jonathan 2026-04-26T00:36:59Z (T4 — Wave B charter; D-W8 auto-capture)
 *              + Jonathan 2026-04-29T01:45:25Z (T9 — claw-memory Architecture Extensions; visibility/owner_seat
 *                schema extension S1:0; nodeId surface S2:2; created_at_override S2:4; original_capture audit guard)
 *              + Jonathan 2026-04-30T21:33:01Z (T7 — iter8 charter; E0 call site a + E1 embedding write-path)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D-W8 AUTO-CAPTURE TRIGGER MECHANISM — §2.1 design decision (Wave B Stage 3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Elected mechanism: Option (a) — Client-side hook.
 *
 * When `conversation_role` is present in params, auto-capture fires deterministically
 * with the FC3 role→category→threshold mapping (Call WB-1 binding):
 *   user      → category: 'operator' / confidence_floor: 0.80
 *   assistant → category: 'agent'    / confidence_floor: 0.75
 *   tool      → category: 'system'   / confidence_floor: 0.70
 *
 * Rationale for Option (a) over alternatives:
 *   (b) System prompt directive: probabilistic (LLM may not comply); risks
 *       OBS-J-FC1-01 (SYSTEM_PROMPT_TEMPLATE must not be modified without
 *       preserving all 3 FC1 constraints verbatim — Jophiel blocks at S3:2).
 *   (c) MCP server-side session hook: non-standard MCP behavior; requires
 *       protocol extension outside Wave B scope.
 *   (d) Hybrid: inherits the probabilistic risk of (b) for assistant turns.
 *   (a) is deterministic, testable under vitest, and leaves SYSTEM_PROMPT_TEMPLATE
 *       completely unchanged. The MCP client (Claude Code) fires `remember` with
 *       `conversation_role` set per turn boundary.
 *
 * BLOCK compliance:
 *   BLOCK-6: ANTHROPIC_API_KEY NOT referenced in this write path.
 *   BLOCK-8: ontology-classifier.ts SYSTEM_PROMPT_TEMPLATE NOT modified.
 *   OBS-J-FC1-01: All 3 FC1 constraints remain verbatim in SYSTEM_PROMPT_TEMPLATE.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// iter8 E0 call site (a): import { existsSync } from 'fs' REMOVED — replaced by classifySource import below
// authorized_by: T7 (Jonathan 2026-04-30T21:33:01Z — iter8 charter E0 call site a; spec:S1:1)
import { createHash } from 'node:crypto';
import { classifySource } from '../core/source-classifier.js';
// F5 P0-M3: import ingestRawEvent to wire DERIVED_FROM + IN_SCOPE edges per provenance chain design.
// authorized_by: P0 grant 2026-05-11 (BLOCK-P0-1 DISCHARGED: G10 Scope node live 2026-05-11T16:37Z)
import { ingestRawEvent } from '../core/raw-event-ingester.js';
import type { IngestResult } from '../core/raw-event-ingester.js';
// G7a/G7b/G7c P0-M4: session resolver + doctrine anchor imports.
// G7a: resolveSession MERGEs Session node; deriveSessionNodeId gives deterministic nodeId for OBSERVED_IN wire.
// G7c: autoAnchorNode fires post-write; ANCHOR_CONFLICT_CHECKS = 3 (all conflict checks passed value).
// G7c conflictChecksPassed derivation: hasOpenConflict (canonical check from d3-1-conflict-record.ts).
// authorized_by: P0 grant 2026-05-11 (R20 5/5 ratified 2026-05-13)
import { resolveSession, deriveSessionNodeId } from '../core/session-resolver.js';
import { autoAnchorNode, ANCHOR_CONFLICT_CHECKS } from '../core/d3-4-doctrine-anchor.js';
import { hasOpenConflict } from '../core/d3-1-conflict-record.js';
import { classify } from '../core/ontology-classifier.js';
import { deriveRawEventNodeId } from '../core/nodeid.js';
import { generateSummary } from '../core/summary.js';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { getProjectRoot } from '../tenant.js';
import { emitTelemetry } from '../telemetry/index.js';
import type { StructuredMemoryPayload } from './recall.js';

// ── FC3 role→category→threshold mapping (Call WB-1 binding — EXACT values) ──

export type ConversationRole = 'user' | 'assistant' | 'tool';

/**
 * FC3 binding: role→category→confidence_floor (Call WB-1 — EXACT, no deviation).
 * user      → operator / 0.80
 * assistant → agent    / 0.75
 * tool      → system   / 0.70
 */
const FC3_ROLE_MAP: Record<ConversationRole, { category: string; confidence_floor: number }> = {
  user:      { category: 'operator', confidence_floor: 0.80 },
  assistant: { category: 'agent',    confidence_floor: 0.75 },
  tool:      { category: 'system',   confidence_floor: 0.70 },
};

export type MemoryType = 'MemoryClaim' | 'SummaryMemory' | 'InferredMemory';

const BARE_SEAT_NAMES = new Set([
  'raguel', 'jeremiel', 'jophiel', 'barachiel', 'zadkiel',
  'gabriel', 'raphael', 'michael', 'uriel', 'raziel', 'sariel', 'metatron',
  // D-seats — brother-instance philosopher council (added 2026-05-30 post-R1 first-deposit findings)
  'kallimachos', 'sextus', 'archimedes', 'philo', 'humboldt',
]);

function normalizeOwnerSeat(ownerSeat?: string): string | undefined {
  if (!ownerSeat) return undefined;
  if (BARE_SEAT_NAMES.has(ownerSeat)) return `seat:${ownerSeat}`;
  if (ownerSeat.startsWith('council-seat:')) return `seat:${ownerSeat.slice('council-seat:'.length)}`;
  return ownerSeat;
}

function seatNameFromOwnerSeat(ownerSeat?: string): string | null {
  const normalized = normalizeOwnerSeat(ownerSeat);
  return normalized?.startsWith('seat:') ? normalized.slice('seat:'.length) : null;
}

function seatNameFromSourceIdentity(sourceIdentity?: string): string | null {
  if (!sourceIdentity) return null;
  if (sourceIdentity.startsWith('council-seat:')) return sourceIdentity.slice('council-seat:'.length);
  if (sourceIdentity.startsWith('seat:')) return sourceIdentity.slice('seat:'.length);
  return null;
}

function countNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: () => number }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value ?? 0);
}

export type GovernanceStratification = {
  governance_stratum: 'formal_deposit' | 'informal_memory' | 'legacy_pre_source_identity';
  source_identity_status: 'verified' | 'present' | 'missing_legacy_not_backfilled';
  reconciliation_status: 'formal_verified_shape_or_runtime_verifiable'
    | 'formal_advisory_not_authoritative_council_cc_capture'
    | 'formal_wrong_type_requires_reconciliation'
    | 'legacy_not_authoritative_for_formal_governance'
    | 'not_required';
};

function councilSeatNameFromSourceIdentity(sourceIdentity?: string | null): string | null {
  if (!sourceIdentity?.startsWith('council-seat:')) return null;
  return sourceIdentity.slice('council-seat:'.length);
}

export function deriveRememberGovernanceStratification(row: {
  labels?: string[];
  memory_type?: string | null;
  formal_deposit?: boolean | null;
  writer_path?: string | null;
  source_artifact_ref?: string | null;
  source_identity?: string | null;
  owner_seat?: string | null;
}): GovernanceStratification {
  const labels = Array.isArray(row.labels) ? row.labels : [];
  const formal = row.formal_deposit === true;
  const sourceIdentity = typeof row.source_identity === 'string' ? row.source_identity : null;
  const ownerSeat = typeof row.owner_seat === 'string' ? normalizeOwnerSeat(row.owner_seat) : null;
  const writerPath = typeof row.writer_path === 'string' ? row.writer_path : null;
  const sourceRef = typeof row.source_artifact_ref === 'string' ? row.source_artifact_ref : null;
  const memoryType = typeof row.memory_type === 'string' ? row.memory_type : null;

  const sourceSeat = councilSeatNameFromSourceIdentity(sourceIdentity);
  const ownerSeatName = ownerSeat?.startsWith('seat:') ? ownerSeat.slice('seat:'.length) : null;
  const identityVerified = Boolean(sourceSeat && ownerSeatName && sourceSeat === ownerSeatName);
  const verifiedCouncilCcCapture = formal
    && labels.includes('MemoryClaim')
    && memoryType === 'MemoryClaim'
    && writerPath === 'council-cc'
    && typeof sourceRef === 'string'
    && sourceRef.startsWith('discord://')
    && identityVerified;

  let governance_stratum: GovernanceStratification['governance_stratum'];
  if (formal) governance_stratum = 'formal_deposit';
  else if (!sourceIdentity) governance_stratum = 'legacy_pre_source_identity';
  else governance_stratum = 'informal_memory';

  let source_identity_status: GovernanceStratification['source_identity_status'];
  if (!sourceIdentity) source_identity_status = 'missing_legacy_not_backfilled';
  else if (identityVerified) source_identity_status = 'verified';
  else source_identity_status = 'present';

  let reconciliation_status: GovernanceStratification['reconciliation_status'];
  if (formal && (!labels.includes('MemoryClaim') || memoryType !== 'MemoryClaim')) {
    reconciliation_status = 'formal_wrong_type_requires_reconciliation';
  } else if (verifiedCouncilCcCapture) {
    reconciliation_status = 'formal_verified_shape_or_runtime_verifiable';
  } else if (formal) {
    reconciliation_status = 'formal_advisory_not_authoritative_council_cc_capture';
  } else if (!sourceIdentity) {
    reconciliation_status = 'legacy_not_authoritative_for_formal_governance';
  } else {
    reconciliation_status = 'not_required';
  }

  return { governance_stratum, source_identity_status, reconciliation_status };
}

async function verifyFreshFormalDeposit(params: {
  nodeId: string;
  source_identity: string;
  owner_seat: string;
  source_artifact_ref: string | null;
  project_root: string;
  content_sha256: string;
  expected_memory_type: MemoryType;
  writer_path: string | null;
  freshRead: typeof Neo4jService.runFreshRead;
}): Promise<void> {
  const rows = await params.freshRead(
    `MATCH (n {nodeId: $nodeId})
     WHERE any(l IN labels(n) WHERE l IN ['MemoryClaim','SummaryMemory','InferredMemory'])
     OPTIONAL MATCH (n)-[:DERIVED_FROM]->(e:RawEvent)
     OPTIONAL MATCH (n)-[:OBSERVED_IN]->(s:Session)
     OPTIONAL MATCH (n)-[:IN_SCOPE]->(sc:Scope)
     RETURN labels(n) AS labels,
            n.memory_type AS memory_type,
            n.source_identity AS source_identity,
            n.owner_seat AS owner_seat,
            n.source_artifact_ref AS source_artifact_ref,
            n.project_root AS project_root,
            n.formal_deposit AS formal_deposit,
            n.expected_memory_type AS expected_memory_type,
            n.writer_path AS writer_path,
            n.content_sha256 AS content_sha256,
            count(DISTINCT e) AS raw_events,
            count(DISTINCT s) AS sessions,
            count(DISTINCT sc) AS scopes
     LIMIT 5`,
    { nodeId: params.nodeId },
  );

  if (rows.length === 0) {
    throw new Error(`[remember] fresh formal deposit verification failed WRITE_RETURNED_BUT_ABSENT nodeId=${params.nodeId}`);
  }
  const row = rows[0] as Record<string, unknown>;
  const labels = Array.isArray(row.labels) ? row.labels as string[] : [];
  if (!labels.includes(params.expected_memory_type) || row.memory_type !== params.expected_memory_type) {
    throw new Error(
      `[remember] fresh formal deposit verification failed PRESENT_WRONG_TYPE nodeId=${params.nodeId} labels=${JSON.stringify(labels)} memory_type=${String(row.memory_type)}`,
    );
  }

  const provenanceFailures: string[] = [];
  if (row.source_identity !== params.source_identity) provenanceFailures.push(`source_identity=${String(row.source_identity)}`);
  if (row.owner_seat !== params.owner_seat) provenanceFailures.push(`owner_seat=${String(row.owner_seat)}`);
  if (row.source_artifact_ref !== params.source_artifact_ref) provenanceFailures.push(`source_artifact_ref=${String(row.source_artifact_ref)}`);
  if (row.project_root !== params.project_root) provenanceFailures.push(`project_root=${String(row.project_root)}`);
  if (row.formal_deposit !== true) provenanceFailures.push(`formal_deposit=${String(row.formal_deposit)}`);
  if (row.expected_memory_type !== params.expected_memory_type) provenanceFailures.push(`expected_memory_type=${String(row.expected_memory_type)}`);
  if (row.writer_path !== params.writer_path) provenanceFailures.push(`writer_path=${String(row.writer_path)}`);
  if (row.content_sha256 !== params.content_sha256) provenanceFailures.push(`content_sha256=${String(row.content_sha256)}`);
  if (provenanceFailures.length > 0) {
    throw new Error(`[remember] fresh formal deposit verification failed PRESENT_MISSING_PROVENANCE nodeId=${params.nodeId}: ${provenanceFailures.join('; ')}`);
  }

  const rawEvents = countNumber(row.raw_events);
  const sessions = countNumber(row.sessions);
  const scopes = countNumber(row.scopes);
  if (rawEvents < 1 || sessions < 1 || scopes < 1) {
    throw new Error(`[remember] fresh formal deposit verification failed PRESENT_MISSING_EDGES nodeId=${params.nodeId}: raw_events=${rawEvents}; sessions=${sessions}; scopes=${scopes}`);
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function handleRemember(
  params: {
    content: string;
    source_artifact_ref?: string;
    source_identity?: string;
    tenant_id?: string;
    /** D-W8: conversation role for auto-capture. When present, auto-capture fires. */
    conversation_role?: ConversationRole;
    /** T9.1 S1:0: visibility scope for this memory node. Defaults to 'council-shared' if absent. */
    visibility?: 'council-shared' | 'seat-private';
    /** T9.1 S1:0: owner seat ID (required semantically when visibility = 'seat-private'). */
    owner_seat?: string;
    /** T9.4 S2:3/S2:4: ISO-8601 override timestamp for retro-ingest; overrides write time when present. */
    created_at_override?: string;
    /** F4 P0-M3: INTERNAL test injection only — overrides G10 Scope nodeId in IN_SCOPE MERGE for guard testability.
     *  Production callers MUST NOT pass this. Defaults to 'scope-council-deliberations-may-2026' (G10 literal).
     *  R17 5/5 convergent pattern: param injection preferred over vi.spyOn for query-text brittle risk.
     */
    _testScopeNodeId?: string;
    /** G7a P0-M4: stable session UUID for OBSERVED_IN edge + auto-anchor evaluation chain.
     *  When present: MERGE Session node (G7a) + write (MemoryClaim)-[:OBSERVED_IN]->(Session) (G7b) + call autoAnchorNode (G7c).
     *  When absent: safe-degradation — no OBSERVED_IN write; G7 auto-anchor disabled for this write.
     *  PROHIBITED: callers MUST NOT generate a fresh UUID per call — defeats cross-session corroboration
     *  (single conversation session producing N writes = N spurious distinct sessions, R20 5/5 mandate).
     *  Caller (MCP client) is responsible for passing consistent UUID within one conversation context.
     *  A-ZADT-R16-1: surfaced in MCP inputSchema (mcp/index.ts) — TS-handler + absent MCP schema = HARDENING.
     *  authorized_by: P0 grant 2026-05-11 (R20 5/5 ratified 2026-05-13)
     */
    sessionUuid?: string;
    /** Formal Council deposit gate: when true, caller must satisfy identity/type/session locks. */
    formal_deposit?: boolean;
    /** Formal deposit expected Neo4j memory label/type; currently council-cc requires MemoryClaim. */
    expected_memory_type?: MemoryType;
    /** Which write surface produced this call; persisted for audit. */
    writer_path?: 'council-cc' | 'seat-direct' | 'operator' | string;
    /** Explicit escape hatch for future formal auto-capture; default is reject. */
    allow_formal_auto_capture?: boolean;
  },
  neo4j: Neo4jService,
  /**
   * iter9 Tier 9.0 M3 — classifyFn function-level injection.
   * When absent: module's own `classify` is used (production default).
   * When present: injected function replaces `classify` call — enables LLM isolation in tests.
   * Two-arg `handleRemember(params, neo4j)` callers are UNCHANGED (default applies).
   * Raguel R17 5/5 confirmed: `classify` is an exported function, not a class.
   */
  { classifyFn = classify, formalFreshReadFn = Neo4jService.runFreshRead }: {
    classifyFn?: typeof classify;
    formalFreshReadFn?: typeof Neo4jService.runFreshRead;
  } = {},
): Promise<{ structured: StructuredMemoryPayload; prose: string; auto_capture?: boolean }> {
  const is_auto_capture = params.conversation_role !== undefined;
  const normalizedOwnerSeat = normalizeOwnerSeat(params.owner_seat);
  const isFormalDeposit = params.formal_deposit === true;
  const requestedFormalWriterPath = params.writer_path ?? (isFormalDeposit ? 'operator' : null);
  // Formal governance writes are not a public MCP self-assertion. Only the
  // council-cc narrator MCP subprocess is allowed to mint formal deposits; seat
  // direct MCP memories remain advisory unless captured by that daemon path.
  if (isFormalDeposit && process.env.CLAW_MEMORY_FORMAL_DEPOSIT_WRITER !== requestedFormalWriterPath) {
    throw new Error(`[remember] formal_deposit writer_path ${requestedFormalWriterPath ?? '<null>'} is not trusted by this MCP context`);
  }
  // F1c P0-M2: server-side defense-in-depth — auto_capture requires owner_seat.
  // Prevents future callers from producing null-owner_seat auto-captures.
  // c1-cost-model.ts fixed under F1a before this guard activates.
  // Test path: handleRemember({ conversation_role: 'user', content: 'x' }) → throws (no owner_seat).
  // authorized_by: P0 grant 2026-05-11
  if (is_auto_capture && !params.owner_seat) {
    throw new Error('[remember] auto_capture requires owner_seat — set owner_seat to identify the capturing agent');
  }
  // T9.4 S2:4: conditional created_at — use override for retro-ingest; else use current write time
  const created_at = params.created_at_override ?? new Date().toISOString();
  const ingestTime = params.created_at_override ?? new Date().toISOString(); // ingestTime always reflects actual ingest
  // T9.4 S2:4: original_capture audit guard — Neo4j-only per PN-5(b); NOT added to StructuredMemoryPayload
  const original_capture: 'live' | 'retro' = params.created_at_override !== undefined ? 'retro' : 'live';

  // ── D-W8 Auto-Capture: derive source_identity from conversation_role ──────
  let source_identity: string;
  let confidence_floor: number | undefined;

  if (is_auto_capture) {
    const role = params.conversation_role!;
    const fc3 = FC3_ROLE_MAP[role];
    // Use the concrete owner identity when the auto-capture caller provides one;
    // fall back to the FC3 role identity only for legacy callers. This keeps FC3's
    // confidence floor while preserving seat/operator provenance for later audits.
    source_identity = params.source_identity ?? normalizedOwnerSeat ?? `${fc3.category}:auto-capture-${role}`;
    confidence_floor = fc3.confidence_floor;
  } else {
    // R56 R51 close: fall back to params.owner_seat when source_identity absent.
    // Pre-fix: omitted source_identity → 'operator:unknown' → Constraint 4 silent → council
    // verdicts mislabeled :SummaryMemory (Sariel R55 + initial Michael R55). Fallback chain
    // makes Constraint 4 fire on seat-pattern owner_seat regardless of source_identity supply.
    source_identity = params.source_identity ?? normalizedOwnerSeat ?? 'operator:unknown';
    confidence_floor = undefined;
  }

  if (isFormalDeposit) {
    if (!params.source_identity) {
      throw new Error('[remember] formal_deposit requires source_identity (canonical council-seat:<seat>)');
    }
    if (!normalizedOwnerSeat) {
      throw new Error('[remember] formal_deposit requires owner_seat (canonical seat:<seat>)');
    }
    if (!params.sessionUuid) {
      throw new Error('[remember] formal_deposit requires sessionUuid for OBSERVED_IN verification');
    }
    if (params.conversation_role && !params.allow_formal_auto_capture) {
      throw new Error('[remember] formal_deposit rejects conversation_role auto-capture unless allow_formal_auto_capture is true');
    }
    if (!params.expected_memory_type) {
      throw new Error('[remember] formal_deposit requires expected_memory_type');
    }
    if (!params.source_identity.startsWith('council-seat:')) {
      throw new Error('[remember] formal_deposit source_identity must use canonical council-seat:<seat> form');
    }
    const sourceSeat = seatNameFromSourceIdentity(params.source_identity);
    const ownerSeat = seatNameFromOwnerSeat(normalizedOwnerSeat);
    if (!sourceSeat || !ownerSeat || sourceSeat !== ownerSeat) {
      throw new Error('[remember] formal_deposit source_identity must name the same seat as owner_seat');
    }
    if (params.visibility && params.visibility !== 'council-shared') {
      throw new Error('[remember] formal_deposit visibility must be council-shared');
    }
  }

  const project_root = params.tenant_id ?? getProjectRoot();

  // ── Classification: route through classify() without modifying ontology-classifier.ts ──
  // Auto-capture still uses the same classify() interface (AD1 compliance).
  // BLOCK-8: ontology-classifier.ts SYSTEM_PROMPT_TEMPLATE is NOT modified here.
  // confidence_floor is applied POST-classify as a minimum floor (not passed into classify()).
  // iter9 Tier 9.0 M3: classifyFn routes to injected function (test isolation) or module's classify (production).
  const classification = await classifyFn(params.content, source_identity);
  const memory_type = classification.type;

  if (isFormalDeposit && params.expected_memory_type && memory_type !== params.expected_memory_type) {
    throw new Error(
      `[remember] formal_deposit expected_memory_type ${params.expected_memory_type} but classifier produced ${memory_type}`,
    );
  }

  const content_sha256 = createHash('sha256').update(params.content, 'utf8').digest('hex');
  const formal_writer_path = requestedFormalWriterPath;
  const formal_verification_method = isFormalDeposit ? 'handler_create_plus_post_create_match' : null;
  const governance = deriveRememberGovernanceStratification({
    labels: [memory_type],
    memory_type,
    formal_deposit: isFormalDeposit,
    writer_path: formal_writer_path,
    source_artifact_ref: params.source_artifact_ref ?? null,
    source_identity,
    owner_seat: normalizedOwnerSeat ?? null,
  });
  const { governance_stratum, source_identity_status, reconciliation_status } = governance;

  // Apply confidence floor: if classified confidence is below the FC3 floor for auto-capture,
  // keep the type but record that the confidence was floor-clamped.
  const effective_confidence = confidence_floor !== undefined
    ? Math.max(classification.confidence ?? 0, confidence_floor)
    : (classification.confidence ?? null);

  // ── Node ID ───────────────────────────────────────────────────────────────
  const nodeId = deriveRawEventNodeId({
    source: source_identity,
    eventTime: created_at,
    rawContent: params.content,
  });

  // ── Source status (iter8 E0 call site a) ─────────────────────────────────
  // iter8 E0: replace inline existsSync-based source_status logic with classifySource() call.
  // authorized_by: T7 (Jonathan 2026-04-30T21:33:01Z — iter8 charter E0 call site a; spec:S1:1)
  // URL-scheme refs (e.g. discord://) now return reason:'remote_url_provenance_only' via classifySource.
  const { source_status, reason } = classifySource(params.source_artifact_ref ?? undefined);
  const source_artifact_ref = params.source_artifact_ref ?? null;

  // ── Telemetry: emit before write ──────────────────────────────────────────
  emitTelemetry({
    event: 'mem_remember_write',
    memory_type,
    source_status,
    auto_capture: is_auto_capture,
    ...(is_auto_capture ? { conversation_role: params.conversation_role } : {}),
    confidence: effective_confidence,
    ts: created_at,
  });

  // ── AUTO_CAPTURE_EXERCISED sentinel for smoke observability ───────────────
  if (is_auto_capture) {
    // emitted to stderr so it is captured in smoke log (MCP server stderr → smoke log)
    process.stderr.write(`AUTO_CAPTURE_EXERCISED: true\n`);
  }

  // ── iter8 E1+E3: EmbeddingsService embedding generation ──────────────────
  // OPENAI_API_KEY conditional: if key absent, skip embedding gracefully (E5 degradation).
  // authorized_by: T7 (Jonathan 2026-04-30T21:33:01Z — iter8 charter E1; spec:S2:0)
  // EmbeddingsService import path: ./core/embeddings/embeddings.service.ts
  // C1 write-path instrumentation: timing hook for cost-per-write measurement (spec:S9:0)
  const c1WriteStart = Date.now();
  let embedding: number[] | null = null;
  if (process.env.OPENAI_API_KEY) {
    try {
      const { EmbeddingsService } = await import('../core/embeddings/embeddings.service.js');
      const embeddingsService = new EmbeddingsService();
      embedding = await embeddingsService.embedText(params.content);
    } catch (err) {
      // Graceful degradation per E5: log warning; node written without embedding property
      process.stderr.write(`[remember] EmbeddingsService embedding failed — node written without embedding: ${err}\n`);
    }
  } else {
    // E5 mode-disclosure: log degradation on first call (startup banner is in index.ts)
    process.stderr.write(`[remember] OPENAI_API_KEY absent — node written without embedding (text-pattern recall only)\n`);
  }
  const c1WriteElapsedMs = Date.now() - c1WriteStart;
  // C1 cost-per-write: emit timing for D-W8 pipeline cost model aggregation
  process.stderr.write(`[C1-COST] write_ms=${c1WriteElapsedMs} content_len=${params.content.length} has_embedding=${embedding !== null} ts=${created_at}\n`);

  // ── F5 P0-M3: Provenance chain — ingestRawEvent before MemoryClaim CREATE ────
  // Pre-call guard: only call if owner_seat has a typed prefix ('seat:' or 'operator:').
  // 'agent:', 'user:', 'system:' callers fall through to SKIP path (M5 Sariel G15 CF).
  // authorized_by: P0 grant 2026-05-11
  //
  // F5-Q1 resolution: BEFORE-CREATE ordering (separate writes, orphan RawEvent acceptable).
  //   Orphan-RawEvent disposition: if MemoryClaim CREATE fails after ingestRawEvent returns
  //   'ingested', a RawEvent exists without a DERIVED_FROM target. Acceptable — RawEvent nodes
  //   are semantically standalone (R10 Barachiel A-BAR-R10-3 + Jeremiel A-J-R10-2).
  //
  // F5-Q3 rejection handling:
  //   'rejected' failureType 'validation'  → throw (short-circuit; MemoryClaim NOT written)
  //   'rejected' failureType 'permission'  → pass-through (write MemoryClaim; no edges; log)
  //   'deferred' reason 'unresolved_user'  → pass-through (write MemoryClaim; no edges)
  //
  // F5-Q2 IngestInput mapping:
  //   source        ← params.source_artifact_ref ?? `mcp-remember-${params.owner_seat}`
  //   eventTime     ← created_at
  //   ingestTime    ← created_at (same write time)
  //   rawContent    ← params.content
  //   lifecycleState← 'active'
  //   sourceIdentity.label ← params.owner_seat
  //   sourceIdentity.type  ← 'seat' | 'operator' (prefix-derived)
  //   scopes        ← ['scope-council-deliberations-may-2026'] (G10 Scope; M3 hardcoded)
  //                   Future: derive from caller context (R10 Zadkiel A-ZADT-R10-1 CF)

  let f5IngestResult: IngestResult | null = null;
  let f5RawEventNodeId: string | null = null;

  // R40 ratified 5/5 2026-05-17 (Option b): bare-seat-name normalization before F5 gate.
  // Pre-R40, ~352 writes from bare council-seat names (`raguel`, `jophiel`, etc.) were
  // SKIP-routed because the F5 gate at line 250-253 only matches `seat:*` / `operator:*` prefixes.
  // Going-forward normalization: rewrite known bare names to canonical `seat:*` form.
  // Forward-only — historical 352 nodes stay as-is per R40 (a) refused.
  // Orchestrator (bare) NOT normalized — separate identity (R40 4/5 + R41 5/5 routed it to
  // operator:orchestrator; bare orchestrator remains LoCoMo benchmark; SKIP route correct).
  //
  // R59 council 5/5 2026-05-19: extend normalization to strip `council-seat:` prefix.
  // Background: R49 widened ontology-classifier Constraint 4 to accept `council-seat:*` as a
  // valid MemoryClaim-forcing prefix, but the F5 gate at line 270-273 still matched only
  // `seat:*` / `operator:*` — so `council-seat:raguel` writes got the right label but lost
  // DERIVED_FROM/IN_SCOPE wiring (Sariel R55 + initial Michael R55 = production evidence).
  // R59 council CONTESTED a naive f5OwnerSeatType-only fix (Barachiel retracted): widening
  // the ternary leaves `normalizedOwnerSeat='council-seat:raguel'` unchanged, propagating into
  // `ingestRawEvent.sourceIdentity.label` → `identity-resolver.ts:88` open-roster path →
  // `mergeIdentityNode` creates a distinct `Seat {identifier:'council-seat:raguel'}` node
  // separate from canonical `Seat {identifier:'seat:raguel'}` (identity-registry.yaml has
  // zero `council-seat:*` entries; stable_id Zod schema is `^(operator|seat|agent|user):`).
  // Correct fix: strip the prefix HERE, before the F5 gate AND before identity resolution,
  // so `council-seat:raguel` → `seat:raguel` → registry hits canonical → no fragmentation.
  // Const, not in-place mutation: avoids side-effect on caller-owned params object.
  const f5OwnerSeatType: 'seat' | 'operator' | null =
    normalizedOwnerSeat?.startsWith('seat:') ? 'seat'
    : normalizedOwnerSeat?.startsWith('operator:') ? 'operator'
    : null;

  if (f5OwnerSeatType !== null && normalizedOwnerSeat) {
    const ingestInput = {
      source: params.source_artifact_ref ?? `mcp-remember-${normalizedOwnerSeat}`,
      eventTime: created_at,
      ingestTime: created_at,
      rawContent: params.content,
      lifecycleState: 'active' as const,
      sourceIdentity: { label: normalizedOwnerSeat, type: f5OwnerSeatType },
      scopes: ['scope-council-deliberations-may-2026'],
      // Item 27 (R71 5/5 2026-05-20) — thread project_root onto RawEvent so DERIVED_FROM
      // survives setDifferenceTeardown tenant guard.
      project_root,
    };
    f5IngestResult = await ingestRawEvent(ingestInput, neo4j);

    if (f5IngestResult.status === 'rejected' && f5IngestResult.failureType === 'validation') {
      // Short-circuit: malformed payload — don't write MemoryClaim.
      const checks = f5IngestResult.failedChecks.join(', ');
      throw new Error(`[remember] ingestRawEvent validation rejection: ${checks}`);
    }

    if (f5IngestResult.status === 'rejected' && f5IngestResult.failureType === 'permission') {
      // Pass-through: registry gap — write MemoryClaim without provenance edges; log gap.
      process.stderr.write(
        `[remember] F5 permission rejection (registry gap) — MemoryClaim written without DERIVED_FROM/IN_SCOPE: ${f5IngestResult.failedChecks.join(', ')}\n`,
      );
    }
    // 'deferred' (unresolved_user): pass-through silently (write MemoryClaim; no edges)

    if (f5IngestResult.status === 'ingested') {
      f5RawEventNodeId = f5IngestResult.nodeId;
    }
  } else if (normalizedOwnerSeat) {
    // SKIP path with caller-supplied owner_seat lacking `seat:`/`operator:` prefix AND
    // not in BARE_SEAT_NAMES allowlist (i.e., bare `orchestrator`, NULL, or unknown identity).
    // Routing-hygiene telemetry per R-EXT 5/5 + Zadkiel G16 architectural call 2026-05-13:
    // scope-authz.yaml is purpose-built for the classify/synthesis pipeline (NOT general
    // write admission); the lighter instrument for unlisted-identity observability is a
    // stderr log when callers bypass the prefix convention. Bare-name writes bypass F5
    // provenance wiring → no DERIVED_FROM / IN_SCOPE edges. See CF-P0-LAYER-B-1/2.
    process.stderr.write(
      `[remember] unlisted-prefix owner_seat: ${normalizedOwnerSeat} (SKIP path; no DERIVED_FROM/IN_SCOPE edges; expected 'seat:' or 'operator:' prefix)\n`,
    );
  }
  // SKIP path (null f5OwnerSeatType): write MemoryClaim only; no provenance edges.

  // ── Write to Neo4j ────────────────────────────────────────────────────────
  // iter9 Tier 9.3 M10 (9.3b-4) — event_time wire (option b per BLOCK-T93-4 + PN-T93-3):
  // When created_at_override is set, also persist n.event_time = created_at_override.
  // Rationale: Tier 9.2 M4/M5 bench harness uses created_at_override to pass event_time at ingest;
  // wiring at the product handler level enables recall_at_time for production tenants, not just bench.
  // Option (a) delete was explicitly OUT OF SCOPE (BLOCK-T93-4). existing writes without
  // created_at_override remain unaffected (event_time is null for those nodes, which is the
  // pre-existing state for all 1029+ seat MCs written before this milestone).
  // authorized_by: T11 (Jonathan 2026-05-05) + PN-T93-3 + R-iter9-tier9.3-consolidation-preflight 5/5 2026-05-28
  const event_time = params.created_at_override ?? null;

  await neo4j.run(
    `CREATE (n:\`${memory_type}\` {
       nodeId: $nodeId,
       content: $content,
       summary: $summary,
       source_artifact_ref: $source_artifact_ref,
       created_at: $created_at,
       event_time: $event_time,
       lifecycleState: 'active',
       verificationState: 'unverified',
       memory_type: $memory_type,
       source_status: $source_status,
       source_status_reason: $source_status_reason,
       classification_path: $classification_path,
       confidence_score: $confidence_score,
       project_root: $project_root,
       ingestTime: $ingestTime,
       auto_capture: $auto_capture,
       visibility: $visibility,
       owner_seat: $owner_seat,
       source_identity: $source_identity,
       formal_deposit: $formal_deposit,
       expected_memory_type: $expected_memory_type,
       writer_path: $writer_path,
       content_sha256: $content_sha256,
       verification_method: $verification_method,
       governance_stratum: $governance_stratum,
       source_identity_status: $source_identity_status,
       reconciliation_status: $reconciliation_status,
       original_capture: $original_capture,
       embedding: $embedding
     })`,
    {
      nodeId,
      content: params.content,
      summary: generateSummary(params.content), // Council R2 5/5 2026-05-11: bounded excerpt for SLO budget
      source_artifact_ref,
      created_at,
      event_time,                                         // iter9 T93 M10: null when no override; created_at_override when set
      memory_type,
      source_status,
      // F3 P0-M2: persist source_status_reason — classifySource() reason computed at line 142 but was
      // only included in StructuredMemoryPayload (response), never written to Neo4j. authorized_by: P0 grant 2026-05-11
      source_status_reason: reason ?? null,
      // F4 P0-M2: persist classification_path — classify() ClassificationResult.path is 'rule-based' | 'llm-escalation'
      // computed at line 122 but not persisted. authorized_by: P0 grant 2026-05-11
      classification_path: classification.path,
      confidence_score: effective_confidence,
      project_root,
      ingestTime,
      auto_capture: is_auto_capture,
      visibility: params.visibility ?? 'council-shared', // T9.1 S1:0: default to council-shared
      owner_seat: normalizedOwnerSeat ?? null,           // T9.1 S1:0; R40 5/5 normalized bare-seat names
      source_identity,
      formal_deposit: isFormalDeposit,
      expected_memory_type: params.expected_memory_type ?? null,
      writer_path: formal_writer_path,
      content_sha256,
      verification_method: formal_verification_method,
      governance_stratum,
      source_identity_status,
      reconciliation_status,
      original_capture,                                   // T9.4 S2:4: 'live' | 'retro'; Neo4j-only per PN-5(b)
      embedding,                                          // iter8 E1: null when key absent (graceful degradation)
    },
  );

  // ── F5 P0-M3: Wire DERIVED_FROM edge from MemoryClaim to RawEvent ────────────
  // Only when ingestRawEvent returned 'ingested' (f5RawEventNodeId is non-null).
  // Separate neo4j.run() — not part of the CREATE transaction (per F5-Q1 BEFORE-CREATE ordering).
  // F5-T4: post-F5 new MemoryClaims have 1 outgoing DERIVED_FROM edge to a RawEvent.
  if (f5RawEventNodeId) {
    await neo4j.run(
      `MATCH (n {nodeId: $memNodeId})
       MATCH (e:RawEvent {nodeId: $rawEventNodeId})
       MERGE (n)-[:DERIVED_FROM]->(e)`,
      { memNodeId: nodeId, rawEventNodeId: f5RawEventNodeId },
    );
    // F5-T1 IN_SCOPE fix (R12 5/5 convergent): direct MERGE to G10 literal nodeId.
    // Root cause: ingestRawEvent passed 'scope-council-deliberations-may-2026' as a scopeName to
    // scope-resolver.ts:36 deriveScopeNodeId() → uuidv5(...) → spurious UUID Scope node MERGEd.
    // G10 has a hand-assigned LITERAL nodeId (non-UUID); bypassing scope-resolver is correct here.
    // Architectural cleanup (scope-resolver UUID vs literal) = M5/post-P0 carry-forward (Zadkiel options a/b/c).
    //
    // F4 P0-M3: parameterized scopeNodeId for testability (R17 5/5 convergent).
    // Production: _testScopeNodeId absent → defaults to G10 literal.
    // Test injection: F4-T1 passes a non-existent test scope nodeId to exercise the guard throw path.
    // Guard: throws if Scope MATCH returns 0 rows (missing G10 would silently no-op otherwise).
    const _scopeNodeId = params._testScopeNodeId ?? 'scope-council-deliberations-may-2026';
    await neo4j.run(
      `MATCH (e:RawEvent {nodeId: $rawEventNodeId})
       MATCH (sc:Scope {nodeId: $scopeNodeId})
       MERGE (e)-[:IN_SCOPE]->(sc)`,
      { rawEventNodeId: f5RawEventNodeId, scopeNodeId: _scopeNodeId },
    );
    // F4 P0-M3: post-MERGE Scope existence verification (parallel to remember.ts CREATE guard at :339-345).
    // If G10 Scope node is absent, the second MATCH returns 0 rows and MERGE fires no edge — no error raised.
    // This guard surfaces that silent failure as a throw, matching the D4 council R25 pattern.
    // authorized_by: P0 grant 2026-05-11 (Uriel F4 finding + R16/R17 5/5 ratification)
    // R19 5/5 VERIFIED 2026-05-12: filter scopeCheck by specific $scopeNodeId.
    // Pre-R19: unfiltered MATCH matched ANY IN_SCOPE edge — including the UUID-spurious
    // Scope edge ingestRawEvent wires internally via scope-resolver.ts:36 uuidv5(scopeName).
    // Result: F4-T1 (passes _testScopeNodeId pointing at absent Scope) was masked by the
    // spurious edge; guard never fired. Filtering to the intended scopeNodeId aligns the
    // check with the guard's documented purpose (verify the SPECIFIC IN_SCOPE wire to G10
    // or test-injected scope landed). Same pattern as raw-event-ingester.ts:185.
    const scopeCheck = await neo4j.run(
      `MATCH (e:RawEvent {nodeId: $rawEventNodeId})-[:IN_SCOPE]->(sc:Scope {nodeId: $scopeNodeId})
       RETURN sc.nodeId AS scopeNodeId`,
      { rawEventNodeId: f5RawEventNodeId, scopeNodeId: _scopeNodeId },
    );
    if (scopeCheck.length === 0) {
      throw new Error(
        `F5 IN_SCOPE wire failed: RawEvent ${f5RawEventNodeId} has no IN_SCOPE edge after MERGE. ` +
        `Scope '${_scopeNodeId}' may be missing from graph. ` +
        `Verify with: MATCH (sc:Scope {nodeId: '${_scopeNodeId}'}) RETURN sc.createdAt`,
      );
    }

    // Item 16 (R70 5/5 + R71 Q2 implicit) — wire MemoryClaim → IN_SCOPE → Scope.
    // Previously F5 wrote IN_SCOPE on RawEvent only; §3 GRAPH_REFERENCE query pattern
    // `MATCH (m:MemoryClaim)-[:IN_SCOPE]->(:Scope)` returned 0 results structurally.
    // Post-fix: same _scopeNodeId from above (G10 literal post-Item-19 unified Scope);
    // MERGE-idempotent; no duplicate edges. Restores documented multi-scope semantics.
    await neo4j.run(
      `MATCH (m {nodeId: $nodeId})
       MATCH (sc:Scope {nodeId: $scopeNodeId})
       MERGE (m)-[:IN_SCOPE]->(sc)`,
      { nodeId, scopeNodeId: _scopeNodeId },
    );
  }

  // D4 (council R25 5/5 VERIFIED 2026-05-07): post-CREATE durability verification.
  // neo4j.run() can ACK SUCCESS without durable persistence (R21 class: WSL2/VHDX
  // fsync race during shutdown returned protocol-level OK but lost data on reboot).
  // MATCH on (nodeId, project_root) is O(1) via {memory_claim|summary_memory|inferred_memory}_nodeid_tenant_unique
  // compound constraints (R-nodeid-collision 5/5 2026-05-29: project_root added as second key).
  // R-nodeid-fix-audit 4/4 Q4 convergent finding 2026-05-29: project_root REQUIRED on this MATCH —
  // without it, compound constraint allows same nodeId in multiple tenants, so a single-key lookup
  // could match another tenant's node and report a false-pass D4 verification on a failed write.
  const verify = await neo4j.run(
    'MATCH (n) WHERE n.nodeId = $nodeId AND n.project_root = $project_root RETURN n.nodeId',
    { nodeId, project_root },
  );
  if (verify.length === 0) {
    throw new Error(`[remember] write verification failed: nodeId ${nodeId} not found after CREATE`);
  }

  // ── G7a/G7b/G7c P0-M4: Post-write evaluation chain ──────────────────────────
  // G7a: session resolver wire — MERGE Session node when sessionUuid is provided.
  // G7b: write (MemoryClaim)-[:OBSERVED_IN]->(Session) edge (gated: sessionUuid present).
  // G7c: autoAnchorNode post-write (inline location per Q-M4-2; same file as G7a/G7b).
  //
  // Safe-degradation: when sessionUuid is absent, entire G7 chain is skipped (Zadkiel C-ZADT-R20-2).
  // This is NOT a failure path — many callers legitimately omit sessionUuid.
  //
  // BLOCK-P0-3 partial discharge: G7b lands here; G8 (recall.ts) depends on these OBSERVED_IN edges.
  // Full BLOCK-P0-3 discharge requires G8 wired (recall.ts, same milestone).
  //
  // authorized_by: P0 grant 2026-05-11 (R20 5/5 ratified 2026-05-13)
  if (params.sessionUuid) {
    // G7a: MERGE Session node (resolveSession handles MERGE + pending_attribution state)
    // Item 27 R71: pass project_root so Session survives setDifferenceTeardown.
    // R-spec-3 5/5 Layer-B-only (2026-05-22): pass normalizedOwnerSeat (R59 'seat:<name>'
    // or 'operator:<name>') as callingSeat so the Session node carries calling_seat —
    // remember()-time observations contribute to G8 Guard 1 witnessSeats accumulation.
    await resolveSession(params.sessionUuid, neo4j, project_root, normalizedOwnerSeat ?? undefined);
    const sessionNodeId = deriveSessionNodeId(params.sessionUuid);

    // G7b: OBSERVED_IN edge from MemoryClaim to Session
    // G7b-T1 pass condition: (m:MemoryClaim)-[:OBSERVED_IN]->(s:Session) edge live after call
    // G7b-T1 fail condition: no edge (G7b wire not working)
    await neo4j.run(
      `MATCH (n {nodeId: $nodeId})
       MATCH (s:Session {nodeId: $sessionNodeId})
       MERGE (n)-[:OBSERVED_IN]->(s)`,
      { nodeId, sessionNodeId },
    );

    // G7c: autoAnchorNode — conflictChecksPassed derivation per R20 Jophiel C-JOPH-R20-1:
    //   hasOpenConflict (canonical d3-1 check) → true = open conflict exists → pass 0 (anchor blocked)
    //                                           → false = no conflict → pass ANCHOR_CONFLICT_CHECKS (3)
    // Uses hasOpenConflict from d3-1-conflict-record.ts (canonical implementation; avoids inline Cypher duplication).
    // G7c-T1 directed unit test: Cypher-seeded preconditions; NOT a handleRemember integration test (R20 3/5 J+Z+R).
    const openConflict = await hasOpenConflict(nodeId, neo4j);
    const conflictChecksPassed = openConflict ? 0 : ANCHOR_CONFLICT_CHECKS;
    await autoAnchorNode(nodeId, conflictChecksPassed, neo4j);
  } else if (f5OwnerSeatType !== null && normalizedOwnerSeat) {
    // I5 P0-M4 telemetry 2026-05-13 (Uriel Findings I3 / INFO-M4-3 D4 sub-dimension —
    // G7c safe-degradation as silent feature-disable; R23 5/5 spec-tracking confirmed).
    //
    // Item 21 (R71 5/5 council convergent 2026-05-20) — bypass close via structured
    // telemetry: caller has correct seat:/operator: prefix (F5 chain wired DERIVED_FROM +
    // IN_SCOPE) but omitted sessionUuid → G7a/b/c chain silently skipped → MemoryClaim
    // has no OBSERVED_IN edge → auto-anchor (G7c) disabled. Gating would be a breaking
    // API change per Jeremiel R71 deferral; structured `mem_remember_bypass` event
    // enables grep-based bypass-caller audit + future tightening per spec.
    emitTelemetry({
      event: 'mem_remember_bypass',
      reason: 'no_session_uuid',
      owner_seat: normalizedOwnerSeat,
      nodeId,
      ts: new Date().toISOString(),
    });
    process.stderr.write(
      `[remember] absent sessionUuid for ${normalizedOwnerSeat} (F5 wired; G7 chain skipped; no OBSERVED_IN edge; auto-anchor disabled for this write)\n`,
    );
  }

  if (isFormalDeposit) {
    await verifyFreshFormalDeposit({
      nodeId,
      source_identity,
      owner_seat: normalizedOwnerSeat!,
      source_artifact_ref,
      project_root,
      content_sha256,
      expected_memory_type: params.expected_memory_type!,
      writer_path: formal_writer_path,
      freshRead: formalFreshReadFn,
    });
  }

  const structured: StructuredMemoryPayload = {
    content: params.content,
    source_artifact_ref,
    created_at,
    lifecycleState: 'active',
    memory_type,
    source_status,
    confidence_score: effective_confidence ?? undefined,
    ...(reason !== undefined ? { reason } : {}),
    nodeId, // T9.3 S2:2: surface nodeId from line 116 variable; StructuredMemoryPayload now accepts nodeId?: string
    content_sha256,
    source_identity,
    owner_seat: normalizedOwnerSeat ?? undefined,
    formal_deposit: isFormalDeposit,
    expected_memory_type: params.expected_memory_type,
    writer_path: formal_writer_path ?? undefined,
    governance_stratum,
    source_identity_status,
    reconciliation_status,
    project_root,
  };

  // Prose MUST NOT mention 'MemoryClaim', 'SummaryMemory', or 'InferredMemory' (BLOCK-14)
  const prose = is_auto_capture
    ? "Auto-captured memory stored."
    : "Memory saved. I'll remember this information for future reference.";

  return { structured, prose, auto_capture: is_auto_capture };
}
