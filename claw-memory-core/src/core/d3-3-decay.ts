/**
 * d3-3-decay.ts — D3.3 Decay Cron Task
 * Thread: I (T5 lifecycle execution)
 * Plan: SEMANTIC_MEMORY_V4_T5_LIFECYCLE.md
 * Gate evidence: spec:S3:5, spec:S4:5 (partial), spec:IG-T5-6
 *
 * Lifecycle + epistemic + confidence decay cron — three automated transitions:
 *   1. verificationState: verified → unverified after exactly 180 days (R-spec-axes 5/5 2026-05-23;
 *      re-attestation required; lifecycleState stays 'active')
 *   2. lifecycleState: superseded → archived after exactly 365 days (RawEvent only)
 *   3. confidence_score decay on MemoryClaim (R-spec-6 Phase 3 2026-05-22)
 *      Activity-weighted hybrid: c × exp(-λ / max(1, N_recent_recalls))
 *      OFF by default (CLAW_DECAY_CONFIDENCE_ENABLED=false circuit breaker).
 *      Path A authorization: classifier output is the ORIGIN value; decay cron
 *      may adjust within ratified bounds (R-spec-6 R2 5/5; see d3-2 header).
 *
 * IMPORTANT: D3.3 does NOT close the disputed state.
 * Per lifecycle-thresholds-v4.md §1.2: disputed → active requires
 * ConflictRecord.resolutionState = resolved with verdict = non-conflict.
 * D3.3 time-based decay MUST NOT implement this transition.
 *
 * IMPORTANT: confidence decay does NOT trigger lifecycle archival.
 * Per lifecycle-thresholds-v4.md §3 (R-spec-6 R2 5/5): archived = RawEvent only.
 * MemoryClaim at confidence floor (0.10 default) stays 'active', ranked lowest;
 * operator uses supersede() for terminal removal. NO archival on confidence floor.
 *
 * IMPORTANT: ordering constraint within runDecayCron() (R-spec-6 R2 5/5):
 *   Step 1-2: lifecycle transitions (parallel-safe)
 *   Step 3:   Item 23 DoctrineAnchor batch-scan (sequential; NOT a separate setInterval)
 *   Step 4:   applyConfidenceDecay (sequential; AFTER Item 23 so newly-anchored nodes
 *             gain isDoctrineAnchor immunity in the same pass)
 *
 * Zero-operator-labor mandate (charter §4 / BLOCK-T5-12):
 *   Auto-path fires without operator action; operator input is never required
 *   on the cron path. Escape hatch: overrideConfidence() CLI + decayFrozenUntil
 *   property (not required on auto-path).
 *
 * Audit log: every transition writes an entry with priorState, newState,
 * transitionTime, triggeredBy per lifecycle-thresholds-v4.md §2 transition table.
 * Confidence-decay entries additionally carry confidence_before, confidence_after,
 * decay_amount, decay_curve_version.
 *
 * authorized_by: T6 (Jonathan 2026-04-28T04:16:20Z) + R-spec-6 R2 5/5 (2026-05-22)
 */

import { Neo4jService } from '../storage/neo4j/neo4j.service.js';

// ── Constants ────────────────────────────────────────────────────────────────

/** verificationState verified → unverified threshold (R-spec-axes 5/5): exactly 180 days in ms */
export const VERIFIED_DECAY_DAYS = 180;
export const VERIFIED_DECAY_MS = VERIFIED_DECAY_DAYS * 24 * 60 * 60 * 1000;

/** superseded → archived threshold: exactly 365 days in milliseconds (RawEvent only) */
export const SUPERSEDED_ARCHIVE_DAYS = 365;
export const SUPERSEDED_ARCHIVE_MS = SUPERSEDED_ARCHIVE_DAYS * 24 * 60 * 60 * 1000;

/**
 * R-spec-6 Phase 3 confidence-decay defaults (5/5 ratified 2026-05-22).
 * All overridable via CLAW_DECAY_* env vars; getDecayEnvConfig() resolves at call time.
 */
export const CLAW_DECAY_CONFIDENCE_ENABLED_DEFAULT = false; // R6-O4 circuit breaker — OFF by default
export const CLAW_DECAY_RATE_LAMBDA_DEFAULT = 0.01;          // base decay rate per cron pass (Raguel hybrid)
export const CLAW_DECAY_WINDOW_DAYS_DEFAULT = 30;            // recent-recall window for witnessSeats count
export const CLAW_DECAY_MAX_NODES_PER_PASS_DEFAULT = 200;    // batch cap for cron cost ceiling
export const CLAW_DECAY_MIN_AGE_DAYS_DEFAULT = 14;           // cold-start protection: skip recent nodes
export const CLAW_DECAY_CONFIDENCE_FLOOR_DEFAULT = 0.10;     // R-spec-6 R2 5/5 — below=stale, not nullified
export const CLAW_DECAY_WIRING_BASELINE_DEFAULT = '2026-05-15'; // R37 OBSERVED_IN wiring date
export const CLAW_DECAY_CURVE_VERSION = 'activity-weighted-hybrid-v1';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DecayTransition {
  nodeId: string;
  priorState: string;
  newState: string;
  transitionTime: string;
  /**
   * R-spec-6 Phase 3 (2026-05-22) extends union with 'decay.confidence' for
   * activity-weighted confidence decay + 'operator.override' for CLI confidence
   * overrides + 'operator.freeze' for decay-freeze property writes.
   */
  triggeredBy:
    | 'decay.re-attestation'
    | 'decay.archive'
    | 'decay.confidence'
    | 'operator.override'
    | 'operator.freeze';
  /** Present only for triggeredBy='decay.confidence' or 'operator.override'/freeze */
  confidence_before?: number;
  confidence_after?: number;
  decay_amount?: number;
  /** Curve version snapshot (e.g., 'activity-weighted-hybrid-v1') for backward-compat audit */
  decay_curve_version?: string;
}

export interface DecayCronResult {
  /**
   * R-spec-axes 5/5 (2026-05-23): `verificationState: verified → unverified` transitions
   * performed by `applyVerificationStateDecay`. Field name `verifiedToActive` retained
   * for backward compatibility with existing callers; new code should read
   * `DecayTransition.priorState`/`newState` which carry the accurate values
   * (`'verified'` → `'unverified'`) under the new schema.
   */
  verifiedToActive: DecayTransition[];
  /** superseded → archived transitions performed (RawEvent only) */
  supersededToArchived: DecayTransition[];
  /** Disputed nodes observed — D3.3 does NOT transition these */
  disputedNodesObserved: number;
  /** R-spec-6 Phase 3: confidence-decay entries written (empty if CONFIDENCE_ENABLED=false) */
  confidenceDecays: DecayTransition[];
  /** Timestamp when the cron run completed */
  runTime: string;
}

// ── R-spec-6 Phase 3 env config resolver ──────────────────────────────────────

interface DecayEnvConfig {
  confidenceEnabled: boolean;
  rateLambda: number;
  windowDays: number;
  maxNodesPerPass: number;
  minAgeDays: number;
  confidenceFloor: number;
  wiringBaselineDate: string;
}

/**
 * Resolve CLAW_DECAY_* env vars at call time. Pure function; no side effects.
 * Falls back to ratified defaults when env var absent or unparseable.
 */
export function getDecayEnvConfig(): DecayEnvConfig {
  const parseFloat01 = (raw: string | undefined, fallback: number): number => {
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
  };
  const parsePositiveInt = (raw: string | undefined, fallback: number): number => {
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  const parseBool = (raw: string | undefined, fallback: boolean): boolean => {
    if (raw === undefined) return fallback;
    return raw.toLowerCase() === 'true';
  };
  return {
    confidenceEnabled: parseBool(
      process.env.CLAW_DECAY_CONFIDENCE_ENABLED,
      CLAW_DECAY_CONFIDENCE_ENABLED_DEFAULT,
    ),
    rateLambda: parseFloat01(process.env.CLAW_DECAY_RATE_LAMBDA, CLAW_DECAY_RATE_LAMBDA_DEFAULT),
    windowDays: parsePositiveInt(process.env.CLAW_DECAY_WINDOW_DAYS, CLAW_DECAY_WINDOW_DAYS_DEFAULT),
    maxNodesPerPass: parsePositiveInt(
      process.env.CLAW_DECAY_MAX_NODES_PER_PASS,
      CLAW_DECAY_MAX_NODES_PER_PASS_DEFAULT,
    ),
    minAgeDays: parsePositiveInt(process.env.CLAW_DECAY_MIN_AGE_DAYS, CLAW_DECAY_MIN_AGE_DAYS_DEFAULT),
    confidenceFloor: parseFloat01(
      process.env.CLAW_DECAY_CONFIDENCE_FLOOR,
      CLAW_DECAY_CONFIDENCE_FLOOR_DEFAULT,
    ),
    wiringBaselineDate: process.env.CLAW_DECAY_WIRING_BASELINE_DATE ?? CLAW_DECAY_WIRING_BASELINE_DEFAULT,
  };
}

// ── Transition 1: verificationState verified → unverified after 180 days ─────

/**
 * Apply verificationState verified → unverified transitions on MemoryClaim
 * nodes that haven't been re-attested in 180 days. Epistemic-axis-only.
 *
 * R-spec-axes 5/5 (2026-05-22): epistemic decay decoupled from lifecycle.
 *   - Selection: verificationState='verified' AND lifecycleState='active'
 *     (Jophiel correction: re-attest only current versions; superseded nodes
 *      keep their epistemic state as historical record)
 *   - Mutation: verificationState='unverified' (NOT lifecycleState)
 *   - MATCH (n:MemoryClaim) explicit — VR/RawEvent/Scope/Session/DA excluded by label
 *
 * Per lifecycle-thresholds-v4.md §2: trigger is verificationTime > 180 days
 * before current date. Threshold is exactly 180 days (>= 180, not > 180.x).
 *
 * Audit record fields per §2:
 *   priorState = 'verified', newState = 'unverified',
 *   transitionTime = now, triggeredBy = 'decay.re-attestation'
 */
async function applyVerificationStateDecay(
  neo4j: Neo4jService,
  now: Date,
): Promise<DecayTransition[]> {
  const cutoff = new Date(now.getTime() - VERIFIED_DECAY_MS).toISOString();

  const rows = await neo4j.run(
    `MATCH (n:MemoryClaim)
     WHERE n.verificationState = 'verified'
       AND n.lifecycleState = 'active'
       AND n.verificationTime <= $cutoff
     RETURN n.nodeId AS nodeId, n.verificationTime AS verificationTime`,
    { cutoff },
  );

  if (rows.length === 0) return [];

  const transitions: DecayTransition[] = [];
  const transitionTime = now.toISOString();

  for (const row of rows) {
    const nodeId = row.nodeId as string;

    await neo4j.run(
      `MATCH (n:MemoryClaim {nodeId: $nodeId})
       WHERE n.verificationState = 'verified'
         AND n.lifecycleState = 'active'
       SET n.verificationState = 'unverified',
           n.decayTransitionTime = $transitionTime,
           n.decayTriggeredBy = 'decay.re-attestation'`,
      { nodeId, transitionTime },
    );

    transitions.push({
      nodeId,
      priorState: 'verified',
      newState: 'unverified',
      transitionTime,
      triggeredBy: 'decay.re-attestation',
    });
  }

  return transitions;
}

// ── Transition 2: superseded → archived after 365 days (RawEvent only) ────────

/**
 * Apply superseded → archived transitions for RawEvent nodes older than 365 days.
 *
 * Per lifecycle-thresholds-v4.md §2 and §3: archival applies ONLY to RawEvent
 * nodes (not MemoryClaim, SummaryMemory, InferredMemory, etc.).
 *
 * R-spec-6 R2 5/5 explicit: confidence decay does NOT trigger archival.
 * MemoryClaim at confidence floor stays 'active'. Operator uses supersede()
 * for terminal removal. This transition remains RawEvent-only.
 *
 * Audit record fields per §2:
 *   priorState = 'superseded', newState = 'archived',
 *   transitionTime = now, triggeredBy = 'decay.archive'
 */
async function applySupersededToArchivedDecay(
  neo4j: Neo4jService,
  now: Date,
): Promise<DecayTransition[]> {
  const cutoff = new Date(now.getTime() - SUPERSEDED_ARCHIVE_MS).toISOString();

  // ONLY RawEvent nodes (per §3 lifecycle state definitions)
  const rows = await neo4j.run(
    `MATCH (n:RawEvent)
     WHERE n.lifecycleState = 'superseded'
       AND n.supersessionTime <= $cutoff
     RETURN n.nodeId AS nodeId, n.supersessionTime AS supersessionTime`,
    { cutoff },
  );

  if (rows.length === 0) return [];

  const transitions: DecayTransition[] = [];
  const transitionTime = now.toISOString();

  for (const row of rows) {
    const nodeId = row.nodeId as string;

    await neo4j.run(
      `MATCH (n:RawEvent {nodeId: $nodeId})
       WHERE n.lifecycleState = 'superseded'
       SET n.lifecycleState = 'archived',
           n.archiveTime = $transitionTime,
           n.decayTriggeredBy = 'decay.archive'`,
      { nodeId, transitionTime },
    );

    transitions.push({
      nodeId,
      priorState: 'superseded',
      newState: 'archived',
      transitionTime,
      triggeredBy: 'decay.archive',
    });
  }

  return transitions;
}

// ── Transition 3: confidence decay on MemoryClaim (R-spec-6 Phase 3) ──────────

/**
 * Apply activity-weighted hybrid confidence decay to eligible MemoryClaim nodes.
 *
 * Authorization: R-spec-6 R2 5/5 (2026-05-22). The classifier output is the
 * ORIGIN value; this cron may adjust within ratified bounds. d3-2 header is
 * narrowed to auto-path scope; see d3-2-confidence-override.ts:7-10 amendment.
 *
 * Circuit breaker: CLAW_DECAY_CONFIDENCE_ENABLED=false by default. Phase 3
 * implementation ships safely (no production effect) until operator enables.
 *
 * R-spec-6 R2 5/5 binding spec:
 *   - Curve: confidence × exp(-λ / max(1, N_recent_recalls)) — Raguel hybrid
 *   - Floor: 0.10 (stays 'active' at floor; NO archived transition)
 *   - Anchor immunity: isDoctrineAnchor=true nodes skip decay entirely
 *   - Freeze: decayFrozenUntil ISO8601 property; auto-expires
 *   - Label scope: MATCH (n:MemoryClaim) explicit — SummaryMemory + InferredMemory
 *     excluded per R5 Q4 (synthesis decay = Phase 4)
 *   - Pre-wiring guard: max(1, rawCount) for nodes that predate R37 wiring
 *     (CLAW_DECAY_WIRING_BASELINE_DATE='2026-05-15'); prevents mass-decay on first enable
 *   - Min age: skip nodes < CLAW_DECAY_MIN_AGE_DAYS old (cold-start protection)
 *   - Max per pass: CLAW_DECAY_MAX_NODES_PER_PASS cap on cron cost
 *   - original_confidence_score lazy-init: SET coalesce(n.original_confidence_score, n.confidence_score)
 *     at first decay pass; preserves classifier write-time value immutably
 *
 * Audit record fields per §2 (extended):
 *   priorState = newState = 'active' (lifecycle unchanged),
 *   transitionTime = now, triggeredBy = 'decay.confidence',
 *   confidence_before, confidence_after, decay_amount, decay_curve_version
 */
async function applyConfidenceDecay(
  neo4j: Neo4jService,
  now: Date,
  config: DecayEnvConfig,
  tenantFilter?: string,
): Promise<DecayTransition[]> {
  if (!config.confidenceEnabled) return []; // R6-O4 circuit breaker

  const nowIso = now.toISOString();
  const minAgeCutoff = new Date(now.getTime() - config.minAgeDays * 24 * 60 * 60 * 1000).toISOString();
  const windowStart = new Date(now.getTime() - config.windowDays * 24 * 60 * 60 * 1000).toISOString();

  // R-spec-6 R5 Q4 5/5: MATCH (n:MemoryClaim) explicit. SummaryMemory + InferredMemory
  // excluded; synthesis-node decay deferred to Phase 4.
  // F-R76-1 (3-seat BLOCKING — Jophiel + Jeremiel + Raguel R76): optional tenantFilter
  // for test isolation. Production cron omits (default: corpus-wide); test callers pass
  // TEST_TENANT to prevent the per-vitest-run mutation of production MCs.
  const rows = await neo4j.run(
    `MATCH (n:MemoryClaim)
     WHERE n.lifecycleState = 'active'
       AND ($tenantFilter IS NULL OR n.project_root = $tenantFilter)
       AND NOT coalesce(n.isDoctrineAnchor, false)
       AND (n.decayFrozenUntil IS NULL OR n.decayFrozenUntil < $nowIso)
       AND n.confidence_score IS NOT NULL
       AND n.confidence_score > $floor
       AND n.ingestTime IS NOT NULL
       AND n.ingestTime <= $minAgeCutoff
     OPTIONAL MATCH (n)-[:OBSERVED_IN]->(s:Session)
       WHERE s.createdAt >= $windowStart
     WITH n, count(DISTINCT s) AS rawCount
     WITH n,
          CASE
            WHEN n.ingestTime < $wiringBaseline AND rawCount = 0 THEN 1
            ELSE rawCount
          END AS effectiveRecallCount
     RETURN n.nodeId AS nodeId,
            n.confidence_score AS confidence,
            n.original_confidence_score AS originalConfidence,
            effectiveRecallCount AS recallCount,
            n.lastDecayTime AS lastDecayTime
     ORDER BY n.lastDecayTime IS NULL DESC, n.lastDecayTime ASC, n.ingestTime ASC
     LIMIT toInteger($maxPerPass)`,
    {
      tenantFilter: tenantFilter ?? null,
      nowIso,
      minAgeCutoff,
      windowStart,
      wiringBaseline: config.wiringBaselineDate,
      floor: config.confidenceFloor,
      maxPerPass: config.maxNodesPerPass,
    },
  );

  if (rows.length === 0) return [];

  const transitionTime = nowIso;

  // Compute decay per-node in memory, filter out floor-clamp no-ops
  type DecayUpdate = {
    nodeId: string;
    confidence_before: number;
    confidence_after: number;
    decay_amount: number;
  };
  const updates: DecayUpdate[] = [];
  for (const row of rows) {
    const nodeId = row.nodeId as string;
    const confidenceBefore = row.confidence as number;
    const recallCount = (typeof row.recallCount === 'object'
      ? (row.recallCount as { low: number }).low
      : (row.recallCount as number)) ?? 0;
    const effectiveN = Math.max(1, recallCount);

    // Hybrid formula: confidence × exp(-λ / max(1, N_recent_recalls))
    const exponent = -config.rateLambda / effectiveN;
    const decayed = confidenceBefore * Math.exp(exponent);
    const confidenceAfter = Math.max(decayed, config.confidenceFloor);
    const decayAmount = confidenceBefore - confidenceAfter;

    if (decayAmount <= 0) continue; // no-op if floor-clamp would produce no change

    updates.push({ nodeId, confidence_before: confidenceBefore, confidence_after: confidenceAfter, decay_amount: decayAmount });
  }

  if (updates.length === 0) return [];

  // R6-O6 lazy-init original_confidence_score via coalesce — preserves classifier
  // write-time value immutably. Batched UNWIND keeps the cron pass O(1) round-trips
  // instead of O(N) per-node SET queries (200-node default × ~10ms RTT = 2s saved).
  await neo4j.run(
    `UNWIND $updates AS u
     MATCH (n:MemoryClaim {nodeId: u.nodeId})
     SET n.original_confidence_score = coalesce(n.original_confidence_score, n.confidence_score),
         n.confidence_score = u.confidence_after,
         n.lastDecayTime = $transitionTime,
         n.lastDecayTriggeredBy = 'decay.confidence'`,
    { updates, transitionTime },
  );

  return updates.map((u) => ({
    nodeId: u.nodeId,
    priorState: 'active',
    newState: 'active',
    transitionTime,
    triggeredBy: 'decay.confidence' as const,
    confidence_before: u.confidence_before,
    confidence_after: u.confidence_after,
    decay_amount: u.decay_amount,
    decay_curve_version: CLAW_DECAY_CURVE_VERSION,
  }));
}

// ── Observe disputed nodes (no transition — D3.3 does NOT close disputed) ─────

/**
 * Count disputed nodes for audit purposes.
 *
 * D3.3 MUST NOT transition disputed → active. This is explicitly NOT implemented.
 * Per lifecycle-thresholds-v4.md §1.2: disputed → active requires
 * ConflictRecord.resolutionState = resolved with verdict = non-conflict.
 * That path is in D3.1, NOT D3.3.
 *
 * This function is called to log the observed count as part of the cron run
 * audit record (confirming D3.3 is not touching disputed nodes).
 */
export async function observeDisputedCount(neo4j: Neo4jService): Promise<number> {
  const rows = await neo4j.run(
    `MATCH (n)
     WHERE n.lifecycleState = 'disputed'
     RETURN count(n) AS cnt`,
    {},
  );
  const cnt = (rows[0]?.cnt as { low: number } | number) ?? 0;
  return typeof cnt === 'object' ? cnt.low : cnt;
}

// ── Audit log writer ──────────────────────────────────────────────────────────

/**
 * Write decay audit log entries to Neo4j.
 *
 * Each transition produces one DecayAuditLog node. Lifecycle transitions write
 * 4 required §2 fields. R-spec-6 Phase 3 confidence-decay entries additionally
 * carry confidence_before, confidence_after, decay_amount, decay_curve_version.
 *
 * R-spec-6 R2 5/5 + R5 Q5 R6-O9: test-generated DecayAuditLog entries MUST
 * carry project_root via target inheritance. Test fixtures that create
 * MemoryClaims without project_root produce NULL-project_root audit nodes
 * (per the 2 audit-test-* nodes Raguel surfaced). Phase 3 test guard:
 * fixtures MUST seed project_root on the target MemoryClaim.
 */
async function writeAuditLog(
  transitions: DecayTransition[],
  neo4j: Neo4jService,
): Promise<void> {
  // Item 27 R71: project_root inherited from target node so DecayAuditLog
  // survives setDifferenceTeardown tenant filter.
  for (const t of transitions) {
    await neo4j.run(
      `MATCH (target {nodeId: $targetNodeId})
       CREATE (log:DecayAuditLog {
         nodeId: $auditId,
         targetNodeId: $targetNodeId,
         priorState: $priorState,
         newState: $newState,
         transitionTime: $transitionTime,
         triggeredBy: $triggeredBy,
         project_root: target.project_root,
         confidence_before: $confidenceBefore,
         confidence_after: $confidenceAfter,
         decay_amount: $decayAmount,
         decay_curve_version: $decayCurveVersion
       })`,
      {
        auditId: `audit-${t.nodeId}-${t.transitionTime}`,
        targetNodeId: t.nodeId,
        priorState: t.priorState,
        newState: t.newState,
        transitionTime: t.transitionTime,
        triggeredBy: t.triggeredBy,
        confidenceBefore: t.confidence_before ?? null,
        confidenceAfter: t.confidence_after ?? null,
        decayAmount: t.decay_amount ?? null,
        decayCurveVersion: t.decay_curve_version ?? null,
      },
    );
  }
}

/**
 * R-spec-6 Phase 3 R6-O8: exported writeAuditLog wrapper for operator-override
 * audit entries. d3-2's overrideConfidence() calls this to record operator
 * confidence mutations in the same audit surface as automated decay.
 */
export async function writeDecayAuditLog(
  transition: DecayTransition,
  neo4j: Neo4jService,
): Promise<void> {
  await writeAuditLog([transition], neo4j);
}

// ── Main cron entry point ─────────────────────────────────────────────────────

/**
 * Run the D3.3 decay cron task.
 *
 * Zero-operator-labor: this function runs entirely without operator input.
 * Disputed nodes are OBSERVED but NOT transitioned (D3.3 invariant).
 *
 * Auto-path (BLOCK-T5-12): decay fires automatically when thresholds are crossed.
 * No operator action is required or expected on the cron auto-path.
 *
 * R-spec-6 R2 5/5 ordering (R6-O12 + Q3 R5 ratified):
 *   Steps 1-2: lifecycle transitions (existing, parallel-safe)
 *   Step 3:    Item 23 DoctrineAnchor batch-scan (sequential; pending Item 23 spec round)
 *   Step 4:    applyConfidenceDecay (sequential; AFTER Item 23 so newly-anchored
 *              nodes gain immunity in the same pass)
 *
 * Item 23 placeholder is a TODO comment until that spec round dispatches.
 * The placeholder MUST be a callable function inside this cron (NOT a separate
 * setInterval) per R-spec-6 R2 5/5 — two independent intervals cannot enforce
 * relative ordering.
 *
 * @param neo4j - Neo4jService instance
 * @param nowOverride - Optional date override for testing (default: current time)
 * @param tenantFilter - F-R76-1 (3-seat BLOCKING R76): optional project_root scope
 *   for test isolation. Production cron omits (corpus-wide). Tests pass TEST_TENANT
 *   to prevent the per-vitest-run mutation of production MCs that R76 surfaced
 *   (904 production DecayAuditLog entries via cross-tenant ORDER BY pickup).
 * @returns DecayCronResult with all transitions and audit metadata
 */
export async function runDecayCron(
  neo4j: Neo4jService,
  nowOverride?: Date,
  tenantFilter?: string,
): Promise<DecayCronResult> {
  const now = nowOverride ?? new Date();
  const runTime = now.toISOString();
  const config = getDecayEnvConfig();

  // Steps 1-2: existing lifecycle transitions (parallel-safe — independent writes).
  const [verifiedToActive, supersededToArchived, disputedNodesObserved] = await Promise.all([
    applyVerificationStateDecay(neo4j, now),
    applySupersededToArchivedDecay(neo4j, now),
    observeDisputedCount(neo4j),
  ]);

  // Step 3: Item 23 DoctrineAnchor batch-scan placeholder (R-spec-6 R2 5/5 + R5 Q3).
  // Item 23 MUST be a sequential step inside this cron — NOT a separate setInterval.
  // Once Item 23 spec dispatches + closes, replace this TODO with the function call.
  // Sequencing rationale: G7c first so threshold-crossing nodes get anchored before
  // confidence decay can knock them below ANCHOR_CONFIDENCE_THRESHOLD (0.95) in the
  // same pass; the isDoctrineAnchor=true flag then triggers immunity in Step 4.
  // TODO(Item 23): await runDoctrineAnchorBatchScan(neo4j, now);

  // Step 4: confidence decay (R-spec-6 Phase 3; sequential after Step 3).
  // Circuit breaker: applyConfidenceDecay returns [] when CONFIDENCE_ENABLED=false.
  // tenantFilter (F-R76-1): production omits (corpus-wide); tests pass TEST_TENANT.
  const confidenceDecays = await applyConfidenceDecay(neo4j, now, config, tenantFilter);

  // Write audit log for all transitions (lifecycle + confidence in same pass)
  const allTransitions = [...verifiedToActive, ...supersededToArchived, ...confidenceDecays];
  if (allTransitions.length > 0) {
    await writeAuditLog(allTransitions, neo4j);
  }

  return {
    verifiedToActive,
    supersededToArchived,
    disputedNodesObserved,
    confidenceDecays,
    runTime,
  };
}
