/**
 * d3-5-verification-record.ts — D3.5 VerificationRecord Auto-VR (Cross-Session Ratification)
 * Thread: I (T5 lifecycle execution)
 * Plan: SEMANTIC_MEMORY_V4_T5_LIFECYCLE.md
 * Gate evidence: spec:S3:11, spec:S4:5 (partial), spec:IG-T5-6, spec:IG-T5-8
 *
 * AD-T5-2 ELECTED: option (a) — direct-promotion via satisfiesAutoVRGate path in
 * promote-orchestrator.ts. D3.5 writes VR AND calls promoteOrchestrate() with
 * VRCalibrationEvidence payload. R-spec-axes 5/5 (2026-05-23): target's
 * verificationState transitions to 'verified' (epistemic axis) if all 6 guards pass;
 * lifecycleState stays 'active' (temporal axis untouched).
 *
 * AD-T5-3 ELECTED: option (i) — promote-orchestrator.ts amended with three
 * discriminated paths: satisfiesLegacyGate, satisfiesV3Gate, satisfiesAutoVRGate.
 * JSDoc verifier-identity tier comment added to promote-orchestrator.ts.
 *
 * 6 §3.2 GUARDS (all enforced as code-level checks — NOT just documented):
 *   Guard 1 (distinct sources — Barachiel + Jophiel):
 *     distinctSourceCount >= 2 across sessionCount >= 3 qualifying sessions
 *   Guard 2 (no open conflict — Raguel #1):
 *     No ConflictRecord with resolutionState='open' targets this claim at VR-write time
 *   Guard 3 (source stability — Raguel #2):
 *     No cited source_artifact_ref superseded between earliest and latest capture
 *   Guard 4 (§1.1 reconciliation — Jeremiel):
 *     verifierId = 'system-cross-session-ratification' in the VR; §1.1.T5 governs
 *   Guard 5 (verifier-identity — Zadkiel, AD-T5-3 option i):
 *     promote-orchestrator.ts routes via satisfiesAutoVRGate path
 *   Guard 6 (calibrationEvidence payload — Jophiel, AD-T5-2 option a):
 *     VRCalibrationEvidence with all 5 fields present; satisfiesAutoVRGate criteria
 *
 * BLOCK-T5-10: lifecycle-thresholds-v4.md §1.1 amendment (authored Gabriel Stage 2)
 * is the prerequisite. D3.5 implementation file mtime MUST be later than the amendment.
 *
 * Zero-operator-labor (BLOCK-T5-12): auto-path requires no operator action.
 *   System monitors sessions → all 6 guards pass → VR written → promoteOrchestrate()
 *   called → verificationState='verified' (R-spec-axes 5/5 2026-05-23). Operator
 *   CLI is escape hatch only.
 *
 * authorized_by: T6 (Jonathan 2026-04-28T04:16:20Z)
 */

import { v5 as uuidv5 } from 'uuid';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { NAMESPACE_UUID } from './nodeid.js';
import {
  promoteOrchestrate,
  type VRCalibrationEvidence,
  type PromoteResult,
} from './promote-orchestrator.js';
import { hasOpenConflict } from './d3-1-conflict-record.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SessionCorpus {
  /**
   * Distinct sessionId values in which this claim was **active** — written at CREATE time
   * (G7b, remember.ts) OR at recall time (recall.ts + semantic_recall.ts post-R37 wiring).
   * R37 5/5 reframed OBSERVED_IN semantic from "captured" (CREATE-only) to "active in session".
   */
  sessionIds: string[];
  /**
   * Distinct source_artifact_ref values across qualifying sessions (DERIVED_FROM → RawEvent.source).
   *
   * R-spec-3 5/5 Layer-B-only (2026-05-22): NO LONGER used by Guard 1. Retained for Guard 3
   * (source stability) earliestCaptureTime/latestCaptureTime computation only. Guard 1 now
   * counts distinct calling_seat values via witnessSeats below (agent-identity independence,
   * not URI count). Provenance lives in DERIVED_FROM; corroboration lives in OBSERVED_IN.
   */
  sourceArtifactRefs: string[];
  /**
   * Distinct calling_seat values from (n)-[:OBSERVED_IN]->(s:Session WHERE s.calling_seat
   * IS NOT NULL). R-spec-3 5/5 Layer-B-only: this is the Guard 1 distinct-source axis.
   * Same seat × N recalls dedupes to 1 (Set-on-string). ≥2 distinct seats required for
   * Guard 1 to pass. Cold-start: empty array on existing corpus until callers populate
   * calling_seat via recall/remember post-R-spec-3.
   */
  witnessSeats: string[];
  /** The target nodeId being evaluated for auto-VR */
  nodeId: string;
  /** Earliest capture time across qualifying sessions */
  earliestCaptureTime: string;
  /** Latest capture time across qualifying sessions */
  latestCaptureTime: string;
}

export interface AutoVRResult {
  status:
    | 'promoted'
    | 'guard_1_failed'   // distinct sources < 2 or sessions < 3
    | 'guard_2_failed'   // open ConflictRecord exists
    | 'guard_3_failed'   // source superseded between captures
    | 'guard_4_ok'       // always passes (verifierId set by this module)
    | 'guard_5_ok'       // always passes (promote-orchestrator routes via satisfiesAutoVRGate)
    | 'guard_6_ok'       // always passes (payload built by this module)
    | 'ceiling_held'     // promote-orchestrator returned ceiling_held unexpectedly
    | 'authority_rejected'; // should not happen for system path
  nodeId: string;
  verificationRecordNodeId?: string;
  targetLifecycleState?: string;
  /** R-spec-axes 5/5 (2026-05-22): epistemic axis state post-promotion. */
  targetVerificationState?: string;
  failingGuard?: 1 | 2 | 3;
  reason?: string;
}

// ── Guard implementations ─────────────────────────────────────────────────────

/**
 * Guard 1: Distinct sources check.
 *
 * Requires >= 2 distinct witness seat identities across >= 3 qualifying sessions.
 * Same seat × N recalls does NOT satisfy guard 1 (Set-on-string deduplicates).
 *
 * R-spec-3 5/5 Layer-B-only (2026-05-22): "distinct source" redefined as distinct
 * calling_seat values from OBSERVED_IN → Session, not distinct re.source URIs from
 * DERIVED_FROM → RawEvent. The council model's unit of independent corroboration is
 * agent identity, not provenance URI. Layer A (re.source) is retained on SessionCorpus
 * for Guard 3 source-stability window computation only; it does NOT enter Guard 1.
 *
 * Bypass-eliminated: under the prior "union" design, same-seat self-recall produced
 * `new Set(["discord://msg-A", "seat:raguel"]).size = 2` (different string namespaces
 * never collide), giving false-positive Guard 1 passes. Layer-B-only enforces real
 * cross-seat independence: `new Set(["seat:raguel", "seat:raguel"]).size = 1` fails;
 * `new Set(["seat:raguel", "seat:jeremiel"]).size = 2` passes.
 *
 * Cold-start: pre-R-spec-3 OBSERVED_IN edges have calling_seat = NULL → witnessSeats
 * = [] → distinctSources = 0 → fail. Existing corpus accumulates witnesses naturally
 * as seats recall during normal operation. corroborate() MCP → manualWriteVR()
 * provides BLOCK-T5-12-compliant escape hatch for priority bootstrap.
 */
function checkGuard1(corpus: SessionCorpus): boolean {
  const distinctSessions = new Set(corpus.sessionIds).size;
  const distinctSources = new Set(corpus.witnessSeats.filter(Boolean)).size;
  return distinctSessions >= 3 && distinctSources >= 2;
}

/**
 * Guard 3: Source stability check.
 * Queries whether any cited source_artifact_ref has been superseded between
 * the earliest and latest qualifying capture times.
 */
async function checkGuard3(corpus: SessionCorpus, neo4j: Neo4jService): Promise<boolean> {
  if (corpus.sourceArtifactRefs.length === 0) return false;

  // Check if any cited source was superseded between earliest and latest capture
  const rows = await neo4j.run(
    `MATCH (n)
     WHERE n.source_artifact_ref IN $refs
       AND n.lifecycleState = 'superseded'
       AND n.supersessionTime >= $earliest
       AND n.supersessionTime <= $latest
     RETURN count(n) AS cnt`,
    {
      refs: corpus.sourceArtifactRefs,
      earliest: corpus.earliestCaptureTime,
      latest: corpus.latestCaptureTime,
    },
  );

  const cnt = (rows[0]?.cnt as { low: number } | number) ?? 0;
  const count = typeof cnt === 'object' ? cnt.low : cnt;
  // Guard 3 passes if NO source was superseded during the window
  return count === 0;
}

// ── Build VRCalibrationEvidence payload ───────────────────────────────────────

/**
 * Build the VRCalibrationEvidence payload for the promote-orchestrator satisfiesAutoVRGate.
 *
 * Guard 6 (AD-T5-2 option a): VRCalibrationEvidence payload attached at VR-write time.
 * All 5 fields: sessionCount, distinctSourceCount, openConflict, sourceStability, verifierId.
 */
function buildVRCalibrationEvidence(
  corpus: SessionCorpus,
  openConflict: boolean,
  sourceStability: boolean,
): VRCalibrationEvidence {
  // Guard 4: verifierId = 'system-cross-session-ratification' (Jeremiel guard)
  // Guard 5: this verifierId routes to satisfiesAutoVRGate in promote-orchestrator.ts
  // Guard 6: all 5 fields present (Jophiel round-2 guard)
  // R-spec-3 5/5 Layer-B-only (2026-05-22): distinctSourceCount + witnessSeats sourced
  // from corpus.witnessSeats (calling_seat values from OBSERVED_IN). The witnessSeats
  // array denormalizes onto vr.witnessSeats at promote-orchestrator.ts for permanent audit.
  const distinctWitnessSeats = Array.from(new Set(corpus.witnessSeats.filter(Boolean)));
  return {
    sessionCount: new Set(corpus.sessionIds).size,
    distinctSourceCount: distinctWitnessSeats.length,
    openConflict,
    sourceStability,
    verifierId: 'system-cross-session-ratification',
    witnessSeats: distinctWitnessSeats,
  };
}

// ── Main auto-VR function ─────────────────────────────────────────────────────

/**
 * Attempt auto-VR via cross-session ratification.
 *
 * Enforces all 6 §3.2 guards as code-level checks before writing the VR.
 * If any guard fails, returns immediately without writing.
 *
 * Zero-operator-labor: this function is called by the system after collecting
 * qualifying session data. No operator input required on the auto-path.
 *
 * Guard execution order: 1 → 2 → 3 → (4,5,6 handled by payload construction + promote-orchestrator)
 *
 * @param corpus  - Session corpus for the claim being evaluated
 * @param neo4j   - Neo4jService instance
 * @param scopeNames - Scope names for IN_SCOPE edges (at least 1 required)
 * @returns AutoVRResult
 */
export async function attemptAutoVR(
  corpus: SessionCorpus,
  neo4j: Neo4jService,
  scopeNames: string[] = ['default'],
): Promise<AutoVRResult> {
  const { nodeId } = corpus;

  // ── Guard 1: Distinct sources (Barachiel + Jophiel) ────────────────────────
  // R-spec-3 5/5 Layer-B-only: distinctSources = distinct calling_seat (witness identity).
  if (!checkGuard1(corpus)) {
    return {
      status: 'guard_1_failed',
      nodeId,
      failingGuard: 1,
      reason: `Guard 1 failed: requires sessionCount >= 3 AND distinct witness seats >= 2. ` +
        `Got sessions=${new Set(corpus.sessionIds).size}, witnessSeats=${new Set(corpus.witnessSeats.filter(Boolean)).size}`,
    };
  }

  // ── Guard 2: No open conflict (Raguel #1) ───────────────────────────────────
  const openConflict = await hasOpenConflict(nodeId, neo4j);
  if (openConflict) {
    return {
      status: 'guard_2_failed',
      nodeId,
      failingGuard: 2,
      reason: 'Guard 2 failed: open ConflictRecord exists targeting this claim; VR auto-write BLOCKED',
    };
  }

  // ── Guard 3: Source stability (Raguel #2) ───────────────────────────────────
  const sourceStable = await checkGuard3(corpus, neo4j);
  if (!sourceStable) {
    return {
      status: 'guard_3_failed',
      nodeId,
      failingGuard: 3,
      reason: 'Guard 3 failed: one or more cited sources superseded between earliest and latest qualifying capture',
    };
  }

  // ── Guards 4, 5, 6: Handled by VRCalibrationEvidence payload + promote-orchestrator ──
  // Guard 4: verifierId = 'system-cross-session-ratification' (Jeremiel)
  // Guard 5: satisfy satisfiesAutoVRGate in promote-orchestrator.ts (AD-T5-3 option i)
  // Guard 6: VRCalibrationEvidence all 5 fields present (Jophiel round-2, AD-T5-2 option a)
  const vrCalibrationEvidence = buildVRCalibrationEvidence(corpus, openConflict, sourceStable);

  // Write VR and call promote-orchestrator via satisfiesAutoVRGate path
  const evidenceSummary =
    `D3.5 cross-session ratification: ${vrCalibrationEvidence.sessionCount} sessions, ` +
    `${vrCalibrationEvidence.distinctSourceCount} distinct sources, ` +
    `sourceStability=${vrCalibrationEvidence.sourceStability}, ` +
    `openConflict=${vrCalibrationEvidence.openConflict}. ` +
    `lifecycle-thresholds-v4.md §1.1.T5 governs. ` +
    `Authorization: T6 2026-04-28T04:16:20Z.`;

  const promoteResult: PromoteResult = await promoteOrchestrate({
    targetNodeId: nodeId,
    verificationRecordInput: {
      // Guard 4: verifierId = 'system-cross-session-ratification'
      verifierId: 'system-cross-session-ratification',
      targetNodeId: nodeId,
      verdict: 'confirmed',
      evidenceSummary,
      scopeNames,
    },
    a1HarnessResult: null,
    calibrationEvidence: null,
    // Guard 6: VRCalibrationEvidence payload present with all 5 fields
    vrCalibrationEvidence,
    neo4j,
  });

  if (promoteResult.status === 'promoted') {
    return {
      status: 'promoted',
      nodeId,
      verificationRecordNodeId: promoteResult.verificationRecordNodeId,
      targetLifecycleState: promoteResult.targetLifecycleState,
      targetVerificationState: promoteResult.targetVerificationState,
    };
  }

  if (promoteResult.status === 'ceiling_held') {
    return {
      status: 'ceiling_held',
      nodeId,
      reason: promoteResult.reason,
    };
  }

  return {
    status: 'authority_rejected',
    nodeId,
    reason: promoteResult.reason,
  };
}

// ── Query helper: collect session corpus for a node ───────────────────────────

/**
 * Collect the session corpus for a memory node — used by the auto-VR evaluation loop.
 *
 * Uses two separate traversals with explicitly separate purposes:
 *   - OBSERVED_IN → Session nodes — sessionIds (R20 Jeremiel A-J-R20-2 fix; sessionId workaround).
 *     R37 5/5 (Option (a) + expanded Touch 4): OBSERVED_IN semantic = "active in session"
 *     (CREATE time via G7b/remember.ts OR recall time via recall.ts + semantic_recall.ts).
 *     Each distinct session in which the claim was created or recalled contributes one edge
 *     (MERGE-idempotent). NOT pure provenance — provenance lives in DERIVED_FROM below.
 *   - DERIVED_FROM → RawEvent nodes (for sourceArtifactRefs + eventTimes; direction corrected).
 *     This IS the provenance traversal — RawEvent.source + ingestTime answer "where created".
 *
 * Three pre-existing bugs fixed as part of G8 scope (R20 Raguel C-RAG-R20-2 + Jeremiel A-J-R20-2):
 *   Bug 1 (R20): Reversed DERIVED_FROM direction — `<-[:DERIVED_FROM*1..5]-` corrected to
 *     `-[:DERIVED_FROM]->`  (MemoryClaim-[:DERIVED_FROM]->RawEvent per F5 M3 wire).
 *   Bug 2 (R20): `re.sessionId` is not a RawEvent schema property — RawEvent does not store sessionId.
 *     Fixed via OBSERVED_IN traversal from MemoryClaim: `(n)-[:OBSERVED_IN]->(s:Session)`.
 *   Bug 3 (Gabriel-discovered): `re.source_artifact_ref` is not a RawEvent property — raw-event-ingester.ts
 *     stores as `e.source` (not `e.source_artifact_ref`). Without this fix, distinctSourceCount = 0
 *     always → Guard 1 always fails → G8 is permanently inert. Fixed to `re.source AS sourceRef`.
 *
 * @param nodeId - Target node
 * @param neo4j  - Neo4jService instance
 * @returns SessionCorpus for the node
 */
export async function collectSessionCorpus(
  nodeId: string,
  neo4j: Neo4jService,
): Promise<SessionCorpus> {
  // Bug 1 fix: direction corrected (-[:DERIVED_FROM]-> not <-[:DERIVED_FROM]-)
  // Bug 3 fix: re.source (not re.source_artifact_ref) — raw-event-ingester.ts ON CREATE SET e.source = $source
  const derivedRows = await neo4j.run(
    `MATCH (n {nodeId: $nodeId})-[:DERIVED_FROM]->(re:RawEvent)
     RETURN re.source AS sourceRef,
            re.eventTime AS eventTime
     ORDER BY re.eventTime ASC`,
    { nodeId },
  );

  // Bug 2 fix: sessionId via OBSERVED_IN traversal (not re.sessionId which is not a RawEvent property)
  const sessionRows = await neo4j.run(
    `MATCH (n {nodeId: $nodeId})-[:OBSERVED_IN]->(s:Session)
     RETURN s.nodeId AS sessionId`,
    { nodeId },
  );

  // R-spec-3 5/5 Layer-B-only (2026-05-22): witnessSeats = distinct s.calling_seat values
  // from OBSERVED_IN sessions. Feeds Guard 1 distinctSources. Agent-identity independence
  // is the unit of corroboration under the council model — NOT URI count from DERIVED_FROM.
  const witnessRows = await neo4j.run(
    `MATCH (n {nodeId: $nodeId})-[:OBSERVED_IN]->(s:Session)
     WHERE s.calling_seat IS NOT NULL
     RETURN DISTINCT s.calling_seat AS witnessSeat`,
    { nodeId },
  );

  const sessionIds = sessionRows.map((r) => r.sessionId as string).filter(Boolean);
  const sourceArtifactRefs = derivedRows.map((r) => r.sourceRef as string).filter(Boolean);
  const witnessSeats = witnessRows.map((r) => r.witnessSeat as string).filter(Boolean);

  const earliestCaptureTime = derivedRows.length > 0
    ? (derivedRows[0].eventTime as string) ?? new Date(0).toISOString()
    : new Date(0).toISOString();
  const latestCaptureTime = derivedRows.length > 0
    ? (derivedRows[derivedRows.length - 1].eventTime as string) ?? new Date().toISOString()
    : new Date().toISOString();

  return { nodeId, sessionIds, sourceArtifactRefs, witnessSeats, earliestCaptureTime, latestCaptureTime };
}

// ── CLI escape hatch: manual VR write ────────────────────────────────────────

/**
 * CLI escape hatch: operator or integration agent may write an explicit VR.
 *
 * This is the ESCAPE HATCH. The auto-path (attemptAutoVR) works without
 * operator intervention. This function allows operators to write VRs when
 * they have out-of-band evidence not captured by the session corpus.
 *
 * R-spec-3 5/5 (2026-05-22): exposed as the `corroborate` MCP tool — operator
 * endorsement path per BLOCK-T5-12 ("Operator CLI is escape hatch only").
 * Auto-VR via Layer-B-only witnessSeats accumulation is the primary path;
 * manualWriteVR is used when operators have out-of-band evidence the natural
 * recall pattern hasn't accumulated yet (e.g., priority bootstrap of existing corpus).
 *
 * @param nodeId           - Target node to verify
 * @param verifierId       - Operator identity (must pass checkAuthority in promote-orchestrator;
 *                           harness:* or reviewer:* prefix required)
 * @param scopeNames       - Scope names for IN_SCOPE edges (at least 1)
 * @param neo4j            - Neo4jService instance
 * @param evidenceSummary  - Optional operator-supplied rationale. Defaults to a generic
 *                           CLI-escape-hatch string when absent.
 * @returns PromoteResult from promote-orchestrator
 */
export async function manualWriteVR(
  nodeId: string,
  verifierId: string,
  scopeNames: string[],
  neo4j: Neo4jService,
  evidenceSummary?: string,
): Promise<PromoteResult> {
  return promoteOrchestrate({
    targetNodeId: nodeId,
    verificationRecordInput: {
      verifierId,
      targetNodeId: nodeId,
      verdict: 'confirmed',
      evidenceSummary:
        evidenceSummary?.trim() ||
        'Operator-initiated manual verification via CLI escape hatch (d3-5-verification-record.ts)',
      scopeNames,
    },
    a1HarnessResult: null,
    calibrationEvidence: null,
    vrCalibrationEvidence: null,
    neo4j,
  });
}
