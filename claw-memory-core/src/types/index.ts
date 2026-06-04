/**
 * types/index.ts — claw-memory consolidated public types
 * Thread: J (extraction Tier E.2)
 * Plan: SEMANTIC_MEMORY_V4_EXTRACTION
 * Gate evidence: spec:S6:0 (EXT-M6 types consolidation; PN-EXT-2)
 *
 * Sources:
 *   MemoryNode          — extracted from exclusion-filter.ts:19 (moved EXT-M4)
 *   StructuredMemoryPayload — extracted from handlers/recall.ts:65 (moved EXT-M3)
 *   MemoryClaim         — new string-literal type (charter §2; PN-EXT-2)
 *
 * Unidirectional: exclusion-filter.ts and recall.ts re-export from here;
 * no circular dependency introduced.
 *
 * authorized_by: E1 grant Jonathan 2026-05-05 + BLOCK-EXT-4 (hand-maintained; no codegen)
 */

/**
 * MemoryClaim — string-literal type alias for the Neo4j label used on memory claim nodes.
 * Per charter §2 public API surface; PN-EXT-2.
 */
export type MemoryClaim = 'MemoryClaim';

/**
 * MemoryNode — retrieved semantic memory node with exclusion-filter metadata.
 * Extracted from exclusion-filter.ts:19 per PN-EXT-2.
 *
 * Gate evidence: spec:S5:1, spec:S6:6, spec:IG6 (preserved from original)
 */
export interface MemoryNode {
  nodeId: string;
  lifecycleState: string;
  labels: string[];              // Neo4j node labels
  confidenceScore?: number;      // InferredMemory only
  supersessionTime?: string;     // ISO-8601; present when lifecycleState=superseded
  scopeNodeIds: string[];        // IN_SCOPE edge target nodeIds
  callerScopeNodeIds: string[];  // scope nodeIds the caller is authorized for
  isPrivate?: boolean;           // true if node is in a private scope caller lacks
}

/**
 * StructuredMemoryPayload — FC4 binding interface returned by all NL primitives.
 * Extracted from handlers/recall.ts:65 per PN-EXT-2.
 *
 * Returned by all 4 NL primitives (remember, recall, forget, what_do_you_know_about).
 * Inline prose output MUST NOT contain the strings 'MemoryClaim', 'SummaryMemory',
 * or 'InferredMemory' — see FC4 §4 (inline prose suppression rule).
 *
 * Source: FC4 council verdict — Barachiel (The Operator)
 * Authorization: T1 + T2 + T3
 */
export interface StructuredMemoryPayload {
  /** Verbatim stored memory content */
  content: string;

  /**
   * Bounded excerpt for context-efficient recall (Council R2 5/5 2026-05-11).
   * Generated at write time via generateSummary(); COALESCE fallback for pre-existing nodes.
   * When content.length <= SUMMARY_MAX_CHARS (400), summary === content.
   * Otherwise: content.slice(0, 400) + '...' (≤403 chars total).
   * Callers requiring full content use `content`; SLO-budgeted callers use `summary`.
   */
  summary?: string;

  /**
   * Path or identifier of the source artifact.
   * Non-null when source_status === 'verifiable'.
   * May be null when source_status === 'unverifiable'.
   */
  source_artifact_ref: string | null;

  /** ISO-8601 datetime of original write */
  created_at: string;

  /**
   * Current lifecycle state of the memory node — TEMPORAL axis only.
   * Wave B extension (spec:S2:2): 'incorrect' retained for backward compat.
   * P0-M3 Patch A: 'disputed' added — mark-wrong sets disputed; re-surfaces in recall.
   * R-spec-axes 5/5 (2026-05-22): 'verified' REMOVED — epistemic state moved to
   * verificationState (below). lifecycleState is now purely temporal.
   * authorized_by: P0 grant 2026-05-11 + R-spec-axes 5/5 2026-05-22
   */
  lifecycleState: 'active' | 'superseded' | 'archived' | 'incorrect' | 'disputed';

  /**
   * Epistemic verification status — ORTHOGONAL to lifecycleState.
   * R-spec-axes 5/5 (2026-05-22): separated from lifecycleState to prevent temporal
   * operations (e.g., supersede) silently erasing epistemic state. G8 auto-VR path
   * sets verificationState='verified'; lifecycleState unchanged at 'active'.
   * Optional: pre-migration MCs may lack this field; readers default to 'unverified'.
   * Scope: MemoryClaim + SummaryMemory + InferredMemory only (NOT VR/RawEvent/Scope/Session/DoctrineAnchor).
   */
  verificationState?: 'unverified' | 'verified';

  /**
   * Assigned memory type — ALWAYS PRESENT (FC4 §3, BLOCK-13).
   * Never absent, never optional — even under LLM escalation or parse failure.
   */
  memory_type: 'MemoryClaim' | 'SummaryMemory' | 'InferredMemory';

  /**
   * Provenance verification status — ALWAYS PRESENT (Call 4 T-gate; AD4; BLOCK-20).
   * Never absent from any payload.
   */
  source_status: 'verifiable' | 'unverifiable';

  /**
   * Classifier confidence score.
   * Present for InferredMemory nodes; absent for MemoryClaim and SummaryMemory.
   * Float in range [0.0, 1.0].
   */
  confidence_score?: number;

  /**
   * Reason the source is unverifiable (present when source_status === 'unverifiable'; absent otherwise).
   * Canonical values (E0 touch iii — 'remote_url_provenance_only' added 2026-05-01 per iter8 charter E0):
   *   - 'artifact_moved_or_deleted' — source_artifact_ref was set but the referenced file is unreadable at retrieval time
   *   - 'no_source_provided' — source_artifact_ref was null/absent at write time
   *   - 'remote_url_provenance_only' — source_artifact_ref is a URL scheme (discord://, http://, etc.); provenance cannot be verified locally
   */
  reason?: string;

  /**
   * Unique node identifier for this memory node.
   * T9.3 authorized addition: T9 grant 2026-04-29T01:45:25Z (FC11 carve-out change (a)).
   * OPTIONAL — backward-compatible with existing StructuredMemoryPayload construction sites
   * (supersede.ts, mark-wrong.ts, list-sources.ts) which do not populate nodeId.
   * BLOCK-T9-4: required-string causes compile failures at those 3 sites; optional is safe.
   */
  nodeId?: string;

  /** SHA-256 of content persisted for formal readback verification. */
  content_sha256?: string;

  /** Caller/source identity used for classifier policy and audit. */
  source_identity?: string;

  /** Normalized owner seat, e.g. seat:philo. */
  owner_seat?: string;

  /** True when this write used the strict formal Council-deposit gate. */
  formal_deposit?: boolean;

  /** Expected memory type asserted by formal-deposit callers. */
  expected_memory_type?: 'MemoryClaim' | 'SummaryMemory' | 'InferredMemory';

  /** Write surface that produced the node, e.g. council-cc. */
  writer_path?: string;

  /** Governance stratum used by Council-memory health/audit gates. */
  governance_stratum?: string;

  /** Whether source identity is verified/present/missing for governance audit. */
  source_identity_status?: string;

  /** Whether this memory requires reconciliation before formal governance use. */
  reconciliation_status?: string;

  /** Tenant/project root used in the memory graph write. */
  project_root?: string;
}
