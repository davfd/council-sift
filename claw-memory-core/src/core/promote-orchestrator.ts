/**
 * promote-orchestrator.ts — Semantic Memory V4 Stage 3 Promote Orchestrator
 * Thread: D (iter3-execution) + H (iter7 Wave B v3 dissolution) + I (T5 lifecycle)
 * Plan: SEMANTIC_MEMORY_V4_ITER3_CLASSIFY.md / SEMANTIC_MEMORY_V4_WAVE_B.md /
 *       SEMANTIC_MEMORY_V4_T5_LIFECYCLE.md
 * Gate evidence: spec:S4:1, spec:IG5, spec:S4:2 (Wave B), spec:IG4 (Wave B),
 *               spec:S3:11 (T5), spec:S4:5 (T5 partial)
 *
 * Wave B (iter7) v3 ceiling dissolution: F7 ceiling DISSOLVED per ceiling-dissolution-record.md.
 * T5 lifecycle (iter7 Thread I): third gate path added — satisfiesAutoVRGate for system
 * cross-session ratification (D3.5 VerificationRecord auto-VR path).
 *
 * VerificationRecord required properties (schema-contracts-v4.md §1.5 — 10 total):
 *   nodeId, verificationTime, ingestTime, verifierId, targetNodeId,
 *   verdict, evidenceSummary, lifecycleState, provenanceEdges, scopeEdges
 *
 * AD4 AND-gate (THREE-PATH — T5 extension; AD-T5-3 option (i) elected):
 *
 * Verifier-identity tiers: satisfiesAutoVRGate (system-cross-session) <
 *   satisfiesV3Gate (calibration evidence) <= satisfiesLegacyGate (operator A1).
 * AD-T5-3 option (i) elected T5 Stage 2.
 *
 *   LEGACY PATH (iter3/iter5 — kappa+rawAgreement):
 *     IF VR.verdict === 'confirmed'
 *        AND a1HarnessResult !== null
 *        AND a1HarnessResult.kappa >= 0.85
 *        AND a1HarnessResult.rawAgreement >= 0.90
 *     THEN write target.verificationState = 'verified' + target.verificationTime (R-spec-axes 5/5 2026-05-23)
 *
 *   V3 INTEGRITY-EVIDENCE PATH (Wave B developer-side calibration):
 *     IF VR.verdict === 'confirmed'
 *        AND calibrationEvidence !== null
 *        AND calibrationEvidence.citationAccuracy >= 0.85
 *        AND calibrationEvidence.fabricationSignalsAbsent === true
 *        AND calibrationEvidence.confidenceStdev > 0.05
 *     THEN write target.verificationState = 'verified' + target.verificationTime (R-spec-axes 5/5 2026-05-23)
 *
 *   T5 AUTO-VR PATH (system cross-session ratification — D3.5):
 *     IF vrCalibrationEvidence !== null
 *        AND vrCalibrationEvidence.sessionCount >= 3
 *        AND vrCalibrationEvidence.distinctSourceCount >= 2
 *        AND vrCalibrationEvidence.openConflict === false
 *        AND vrCalibrationEvidence.sourceStability === true
 *        AND vrCalibrationEvidence.verifierId === 'system-cross-session-ratification'
 *     THEN write target.verificationState = 'verified' + target.verificationTime (R-spec-axes 5/5 2026-05-23)
 *
 *   ELSE leave target.verificationState unchanged (ceiling_held)
 *
 * R-spec-axes 5/5 (2026-05-23): epistemic state lives on `verificationState` (orthogonal to
 * lifecycleState). Pre-axes the destination field was lifecycleState='verified'; the change
 * was made because supersession (a temporal lifecycleState operation) silently erased the
 * epistemic state on the legacy single-field schema. Now: lifecycleState stays 'active' on
 * promotion; supersede() only touches lifecycleState; verificationState persists across
 * temporal transitions.
 *
 * CEILING NOTE (Wave B post-dissolution): Transitioning to verificationState='verified'
 * is now permitted via ANY of the three gate paths. The Call 1 ceiling is dissolved per
 * iter7/ceiling-dissolution-record.md (F7 dissolution; A1_PASS_timestamp
 * 2026-04-27T23:42:00.000Z; 5/5 council unanimous ratification).
 * Authorized by: T1+T2+T3+T4 + 5/5 v3 council unanimous ratification 2026-04-27
 *              + T6 (Jonathan 2026-04-28T04:16:20Z) for T5 auto-VR path.
 */

import { v5 as uuidv5 } from 'uuid';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { NAMESPACE_UUID, deriveScopeNodeId } from './nodeid.js';
import { checkAuthority } from './verification-authority.js';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * VR Calibration Evidence — required for verified promotion via T5 cross-session
 * ratification path (lifecycle-thresholds-v4.md §1.1.T5).
 *
 * AD-T5-2 ELECTED: option (a) — direct-promotion via satisfiesAutoVRGate.
 * AD-T5-3 ELECTED: option (i) — three-path gate with verifier-identity tiers.
 *
 * This interface is the T5 extension. It is DISTINCT from CalibrationEvidence (Wave B v3).
 * Do NOT pass CalibrationEvidence here — the types differ.
 *
 * All 5 fields are required (Guard 6 — Jophiel round-2; lifecycle-thresholds-v4.md §1.1.T5):
 *   sessionCount        - Must be >= 3
 *   distinctSourceCount - Must be >= 2 (same-source repetition does not satisfy)
 *   openConflict        - Must be false (VR blocked if any open ConflictRecord exists)
 *   sourceStability     - Must be true (no source superseded during capture window)
 *   verifierId          - Must be 'system-cross-session-ratification' (Guard 4 routing key)
 *
 * Authorized by: T6 (Jonathan 2026-04-28T04:16:20Z); §3.2 RATIFIED 5/5 round-2 2026-04-28.
 */
export interface VRCalibrationEvidence {
  /** Session count across qualifying captures — must be >= 3 (Guard 1) */
  sessionCount: number;
  /**
   * Distinct source count — must be >= 2; same-source does NOT satisfy (Guard 1).
   *
   * R-spec-3 5/5 Layer-B-only redefinition (2026-05-22): "distinct source" =
   * distinct s.calling_seat from (mc)-[:OBSERVED_IN]->(s:Session). Under the council
   * model, agent identity is the unit of independent corroboration, not provenance URI.
   * Equals new Set(witnessSeats).size. See witnessSeats below.
   */
  distinctSourceCount: number;
  /** Whether any open ConflictRecord targets this claim — must be false (Guard 2) */
  openConflict: boolean;
  /** Whether all cited sources are stable (not superseded) during capture window — must be true (Guard 3) */
  sourceStability: boolean;
  /** Routing key for satisfiesAutoVRGate — must be 'system-cross-session-ratification' (Guards 4 + 5) */
  verifierId: string;
  /**
   * Distinct calling_seat identities that have observed this claim via OBSERVED_IN sessions.
   * R-spec-3 5/5 Layer-B-only (2026-05-22): source-of-truth array for Guard 1 distinct-source
   * count. Written to VR node as vr.witnessSeats for permanent graph-queryable audit.
   * Optional for backward compat with non-auto-VR paths (manualWriteVR escape hatch).
   */
  witnessSeats?: string[];
}

/** A1 harness result — required for verified promotion via legacy kappa+rawAgreement path (lifecycle-thresholds-v4.md §1.1) */
export interface A1HarnessResult {
  kappa: number;           // Cohen's kappa; must be >= 0.85 for promotion
  rawAgreement: number;    // Raw agreement ratio; must be >= 0.90 for promotion
  harnessRunId: string;    // Audit reference for the harness run
}

/**
 * V3 calibration evidence — required for verified promotion via the Wave B
 * integrity-evidence dissolution path (iter7 ceiling-dissolution-record.md).
 *
 * Used when a1HarnessResult is unavailable (single-rater corpus; kappa undefined).
 * All four integrity signals must PASS for the v3 gate to open.
 *
 * fabricationSignalsAbsent is a composite boolean:
 *   true  = timestamp variance (all rated_at unique + non-uniform spacing)
 *           + UUID v5 format (all nodeId entries match ^[...]-5[...]-$)
 *           + nodeId provenance (all nodeIds graph-resolvable) — all three PASS
 *   false = any of the three sub-checks FAIL
 *
 * Authorized by: T1+T2+T3+T4 + 5/5 v3 council unanimous ratification 2026-04-27.
 * Source proposal: _drafts/council-proposals/d-w11-redesign-2026-04-27-v3.md
 */
export interface CalibrationEvidence {
  a1PassTimestamp: string;           // ISO8601 — A1_PASS_timestamp from a1-prime-results.md
  citationAccuracy: number;          // Must be >= 0.85 (e.g., 0.906 = 29/32 correct)
  fabricationSignalsAbsent: boolean; // Composite: timestamp variance + UUID v5 + nodeId provenance
  confidenceStdev: number;           // Must be > 0.05 (e.g., σ ≈ 0.1040 for real classifier output)
}

/** VerificationRecord input — all 10 §1.5 required properties must be provided by caller */
export interface VerificationRecordInput {
  verifierId: string;       // Identity of verifying agent (must pass checkAuthority)
  targetNodeId: string;     // UUID of node being verified
  verdict: 'confirmed' | 'rejected' | 'inconclusive';
  evidenceSummary: string;  // Explicit statement of evidence reviewed
  scopeNames: string[];     // Scope names for IN_SCOPE edges (at least 1 required)
}

export interface PromoteResult {
  status: 'promoted' | 'authority_rejected' | 'ceiling_held';
  verificationRecordNodeId?: string;
  /** Temporal axis state of target post-promotion (R-spec-axes 5/5 2026-05-22). */
  targetLifecycleState?: string;
  /** Epistemic axis state of target post-promotion (R-spec-axes 5/5 2026-05-22). */
  targetVerificationState?: string;
  reason?: string;
}

// ── NodeId derivation for VerificationRecord ─────────────────────────────────

/**
 * Derive a deterministic nodeId for a VerificationRecord.
 *
 * R-spec-3 R2 4/5 (2026-05-22): verificationTime DROPPED from the MERGE key. Pre-fix,
 * each promoteOrchestrate() call produced a unique vrNodeId because verificationTime
 * differs per call — under G8 this would yield O(sessions × MCs) duplicate VR nodes
 * after Guard 1 becomes reachable. Post-fix: one canonical VR per
 * (verifierId, targetNodeId). Refresh timestamp via ON MATCH SET vr.verificationTime.
 *
 * Manual VRs (different verifierId) remain distinct from the system auto-VR.
 */
function deriveVRNodeId(verifierId: string, targetNodeId: string): string {
  const canonical = JSON.stringify({ verifierId, targetNodeId });
  return uuidv5(canonical, NAMESPACE_UUID);
}

// ── Standalone gate functions (exported for testability) ─────────────────────

/**
 * T5 AUTO-VR gate predicate (Guard 5 + Guard 6 — AD-T5-3 option i; AD-T5-2 option a).
 *
 * Evaluates whether a VRCalibrationEvidence payload satisfies the cross-session
 * ratification criteria per lifecycle-thresholds-v4.md §1.1.T5.
 *
 * Exported as a standalone function for testability (spec:S3:11 Guard 5 test).
 * Also called inline inside promoteOrchestrate().
 *
 * Criteria (all must be true):
 *   - sessionCount >= 3
 *   - distinctSourceCount >= 2
 *   - openConflict === false
 *   - sourceStability === true
 *   - verifierId === 'system-cross-session-ratification'
 *
 * authorized_by: T6 (Jonathan 2026-04-28T04:16:20Z)
 */
export function satisfiesAutoVRGate(evidence: VRCalibrationEvidence | null | undefined): boolean {
  if (!evidence) return false;
  return (
    evidence.sessionCount >= 3 &&
    evidence.distinctSourceCount >= 2 &&
    evidence.openConflict === false &&
    evidence.sourceStability === true &&
    evidence.verifierId === 'system-cross-session-ratification'
  );
}

// ── Promote orchestrator ─────────────────────────────────────────────────────

/**
 * Promote a target memory node by creating a VerificationRecord + VERIFIES edge.
 *
 * Authority validation: only harness:* or reviewer:* verifierIds are accepted (AD3/Call 3).
 * council.interpretation_authority is REJECTED — it governs MemoryClaim/SummaryMemory/
 * InferredMemory writes only (§4.2), NOT VerificationRecord (§1.3).
 *
 * AD4 AND-gate (dual-path — Wave B v3 dissolution):
 *   LEGACY path: VR.verdict='confirmed' + a1HarnessResult with kappa >= 0.85 + rawAgreement >= 0.90
 *   V3 path:     VR.verdict='confirmed' + calibrationEvidence with citationAccuracy >= 0.85
 *                + fabricationSignalsAbsent === true + confidenceStdev > 0.05
 *   Either path open → write verificationState='verified' + verificationTime on target (R-spec-axes 5/5 2026-05-23; pre-axes was lifecycleState='verified').
 *   Neither path open → ceiling_held (VerificationRecord still written; no epistemic transition).
 *
 * Wave B note: calibrationEvidence is OPTIONAL for backward compatibility — existing callers
 * that omit it (passing a1HarnessResult: null only) continue to receive ceiling_held exactly
 * as before. No existing callers require changes (F1 Raphael hardening — iter7 Wave B v3).
 *
 * @param targetNodeId           - UUID of node being verified
 * @param verificationRecordInput - All 10 §1.5 VR properties provided by caller
 * @param a1HarnessResult        - Legacy A1 harness result (null for v3 single-rater calibration)
 * @param calibrationEvidence    - V3 integrity-evidence dissolution signal (optional; Wave B only)
 * @param vrCalibrationEvidence  - T5 cross-session ratification evidence (optional; T5 D3.5 only)
 * @param neo4j                  - Neo4jService instance
 * @returns PromoteResult
 */
export async function promoteOrchestrate({
  targetNodeId,
  verificationRecordInput,
  a1HarnessResult,
  calibrationEvidence,
  vrCalibrationEvidence,
  neo4j,
}: {
  targetNodeId: string;
  verificationRecordInput: VerificationRecordInput;
  a1HarnessResult: A1HarnessResult | null;
  calibrationEvidence?: CalibrationEvidence | null;
  vrCalibrationEvidence?: VRCalibrationEvidence | null;
  neo4j: Neo4jService;
}): Promise<PromoteResult> {
  const { verifierId, verdict, evidenceSummary, scopeNames } = verificationRecordInput;

  // Step 1: Validate VerificationRecord write authority (AD3/Call 3)
  // Only harness:* or reviewer:* identity classes are accepted — UNLESS this is the
  // T5 auto-VR system path (verifierId = 'system-cross-session-ratification').
  //
  // T5 AUTO-VR BYPASS: the system-cross-session-ratification path is self-authorizing
  // via the satisfiesAutoVRGate guard set (D3.5). checkAuthority() is bypassed because
  // 'system-cross-session-ratification' is not a human reviewer or harness identity —
  // it is the automated system path that obtains its authority from the VRCalibrationEvidence
  // payload satisfying all 6 §3.2 guards (lifecycle-thresholds-v4.md §1.1.T5).
  // Authorized: T6 (Jonathan 2026-04-28T04:16:20Z) + §3.2 RATIFIED 5/5 round-2.
  const isSystemCrossSessionPath = verifierId === 'system-cross-session-ratification';

  if (!isSystemCrossSessionPath) {
    const authorityGranted = checkAuthority({ verifierId, scope: scopeNames[0] ?? '' });
    if (!authorityGranted) {
      return {
        status: 'authority_rejected',
        reason: `verifierId '${verifierId}' is not authorized to write VerificationRecords. ` +
          'Accepted identity classes: harness:* (verification harness) or reviewer:* (human reviewer) ' +
          'per time-governance-v4.md §1.3 line 35. ' +
          'council.interpretation_authority governs MemoryClaim/SummaryMemory/InferredMemory writes ' +
          'only (§4.2) and is NOT a valid VerificationRecord write authority (Call 3). ' +
          "For system cross-session ratification use verifierId='system-cross-session-ratification' " +
          'with VRCalibrationEvidence (T5 D3.5 path).',
      };
    }
  }

  // Step 2: Validate VR schema — all 10 §1.5 required properties
  // (the VRInput object carries all of them; nodeId + timestamps are derived here)
  // R-spec-3 R2 4/5: deriveVRNodeId no longer takes verificationTime (one canonical VR per claim).
  const verificationTime = new Date().toISOString();
  const ingestTime = verificationTime;
  const vrNodeId = deriveVRNodeId(verifierId, targetNodeId);

  if (!evidenceSummary || evidenceSummary.trim().length === 0) {
    return {
      status: 'authority_rejected',
      reason: 'evidenceSummary must be non-empty (schema-contracts-v4.md §1.5)',
    };
  }

  if (scopeNames.length === 0) {
    return {
      status: 'authority_rejected',
      reason: 'scopeEdges: at least 1 IN_SCOPE edge required for VerificationRecord (schema-contracts-v4.md §1.5)',
    };
  }

  // Step 3: Create VerificationRecord node + VERIFIES edge (single transaction)
  const driver = neo4j.getDriver();
  const session = driver.session();

  try {
    await session.executeWrite(async (tx) => {
      // Create VerificationRecord node with all 10 §1.5 required properties:
      // nodeId, verificationTime, ingestTime, verifierId, targetNodeId,
      // verdict, evidenceSummary, lifecycleState, provenanceEdges (via VERIFIES edge),
      // scopeEdges (via IN_SCOPE edges)
      // R-spec-3 R2 5/5 audit fields (sessionCount, distinctSourceCount, witnessSeats):
      // denormalize VRCalibrationEvidence onto VR node for permanent graph-queryable audit.
      // R-spec-3 R2 4/5 deriveVRNodeId fix: ON MATCH refreshes verificationTime + audit
      // fields when the system re-runs auto-VR on a previously-verified claim.
      const auditSessionCount = vrCalibrationEvidence?.sessionCount ?? null;
      const auditDistinctSourceCount = vrCalibrationEvidence?.distinctSourceCount ?? null;
      const auditWitnessSeats = vrCalibrationEvidence?.witnessSeats ?? null;
      // F-R76-2 (R-spec-axes implementation): project_root inherited from target node
      // via MATCH so VR survives setDifferenceTeardown tenant guard (mirrors DecayAuditLog
      // pattern at d3-3-decay.ts:467). Closes class-fix gap missed by Item 17→27.
      await tx.run(
        `MATCH (tgt {nodeId: $targetNodeId})
         MERGE (vr:VerificationRecord {nodeId: $vrNodeId})
         ON CREATE SET
           vr.verificationTime    = $verificationTime,
           vr.ingestTime          = $ingestTime,
           vr.verifierId          = $verifierId,
           vr.targetNodeId        = $targetNodeId,
           vr.verdict             = $verdict,
           vr.evidenceSummary     = $evidenceSummary,
           vr.lifecycleState      = 'active',
           vr.sessionCount        = $auditSessionCount,
           vr.distinctSourceCount = $auditDistinctSourceCount,
           vr.witnessSeats        = $auditWitnessSeats,
           vr.project_root        = tgt.project_root
         ON MATCH SET
           vr.verificationTime    = $verificationTime,
           vr.evidenceSummary     = $evidenceSummary,
           vr.sessionCount        = coalesce($auditSessionCount, vr.sessionCount),
           vr.distinctSourceCount = coalesce($auditDistinctSourceCount, vr.distinctSourceCount),
           vr.witnessSeats        = coalesce($auditWitnessSeats, vr.witnessSeats),
           vr.project_root        = coalesce(vr.project_root, tgt.project_root)`,
        {
          vrNodeId,
          verificationTime,
          ingestTime,
          verifierId,
          targetNodeId,
          verdict,
          evidenceSummary,
          auditSessionCount,
          auditDistinctSourceCount,
          auditWitnessSeats,
        },
      );

      // VERIFIES edge — provenance edge for VerificationRecord (§1.5 provenanceEdges)
      await tx.run(
        `MATCH (vr:VerificationRecord {nodeId: $vrNodeId})
         MATCH (target {nodeId: $targetNodeId})
         MERGE (vr)-[:VERIFIES]->(target)`,
        { vrNodeId, targetNodeId },
      );

      // IN_SCOPE edges — §1.5 scopeEdges (at least 1 required)
      // Item 29 (R-spec-3 5/5 + R74 audit gap): MERGE by scopeName (semantic key) —
      // mirrors Item 28 fix on scope-resolver.ts + supersession-manager.ts. This third
      // Scope-MERGE site was dormant (VR count = 0) until G8 wired by R-spec-3; first VR
      // write would otherwise recreate the F-BAR-3 duplicate. Caught by Raguel + Barachiel
      // independently during R-spec-3 R1 primary-source reads.
      for (const scopeName of scopeNames) {
        const fallbackScopeNodeId = deriveScopeNodeId(scopeName);
        const scRows = await tx.run(
          `MERGE (sc:Scope {scopeName: $scopeName})
           ON CREATE SET sc.nodeId = $fallbackScopeNodeId, sc.createdAt = datetime()
           ON MATCH SET sc.project_root = coalesce(sc.project_root, null)
           RETURN sc.nodeId AS nodeId`,
          { scopeName, fallbackScopeNodeId },
        );
        const resolvedScopeNodeId =
          (scRows.records[0]?.get('nodeId') as string | undefined) ?? fallbackScopeNodeId;
        await tx.run(
          `MATCH (vr:VerificationRecord {nodeId: $vrNodeId})
           MATCH (sc:Scope {nodeId: $scopeNodeId})
           MERGE (vr)-[:IN_SCOPE]->(sc)`,
          { vrNodeId, scopeNodeId: resolvedScopeNodeId },
        );
      }
    });
  } finally {
    await session.close();
  }

  // Step 4: AD4 AND-gate — THREE-PATH (T5 extension; AD-T5-3 option i elected)
  //
  // Verifier-identity tiers: satisfiesAutoVRGate (system-cross-session) <
  //   satisfiesV3Gate (calibration evidence) <= satisfiesLegacyGate (operator A1).
  // AD-T5-3 option (i) elected T5 Stage 2.
  //
  // LEGACY PATH (iter3/iter5 — kappa+rawAgreement; lifecycle-thresholds-v4.md §1.1):
  //   1. VR.verdict === 'confirmed'
  //   2. a1HarnessResult !== null
  //   3. a1HarnessResult.kappa >= 0.85 AND a1HarnessResult.rawAgreement >= 0.90
  //
  // V3 INTEGRITY-EVIDENCE PATH (Wave B developer-side calibration — iter7):
  //   1. VR.verdict === 'confirmed'
  //   2. calibrationEvidence !== null
  //   3. calibrationEvidence.citationAccuracy >= 0.85
  //   4. calibrationEvidence.fabricationSignalsAbsent === true
  //   5. calibrationEvidence.confidenceStdev > 0.05
  //
  // T5 AUTO-VR PATH (system cross-session ratification — D3.5; T5 lifecycle Thread I):
  //   1. vrCalibrationEvidence !== null
  //   2. vrCalibrationEvidence.sessionCount >= 3
  //   3. vrCalibrationEvidence.distinctSourceCount >= 2
  //   4. vrCalibrationEvidence.openConflict === false
  //   5. vrCalibrationEvidence.sourceStability === true
  //   6. vrCalibrationEvidence.verifierId === 'system-cross-session-ratification'
  //   (Note: verdict='confirmed' is set by D3.5 before calling this function)
  //
  // ANY path open → shouldPromoteToVerified = true → write verificationState='verified' + verificationTime (R-spec-axes 5/5 2026-05-23; pre-axes was lifecycleState='verified')
  // NO path open → ceiling_held (VerificationRecord written; no epistemic transition)
  //
  // F1 hardening (Raphael — iter7 Wave B v3): v3 path added per ceiling-dissolution-record.md.
  // T5 extension: auto-VR path added per T6 grant 2026-04-28T04:16:20Z + §3.2 RATIFIED 5/5.
  const satisfiesLegacyGate =
    verdict === 'confirmed' &&
    a1HarnessResult !== null &&
    a1HarnessResult.kappa >= 0.85 &&
    a1HarnessResult.rawAgreement >= 0.90;

  const satisfiesV3Gate =
    verdict === 'confirmed' &&
    calibrationEvidence != null &&
    calibrationEvidence.citationAccuracy >= 0.85 &&
    calibrationEvidence.fabricationSignalsAbsent === true &&
    calibrationEvidence.confidenceStdev > 0.05;

  // T5 AUTO-VR GATE (Guard 5 — Zadkiel AD-T5-3 option i; Guard 6 — Jophiel AD-T5-2 option a)
  // satisfiesAutoVRGate: cross-session ratification path per lifecycle-thresholds-v4.md §1.1.T5
  // Uses the exported satisfiesAutoVRGate() function for testability (spec:S3:11 Guard 5)
  const satisfiesAutoVRGateResult = satisfiesAutoVRGate(vrCalibrationEvidence);

  const shouldPromoteToVerified = satisfiesLegacyGate || satisfiesV3Gate || satisfiesAutoVRGateResult;

  if (shouldPromoteToVerified) {
    // Wave B: this branch is reached via EITHER the legacy kappa+rawAgreement path
    // (a1HarnessResult non-null) OR the v3 integrity-evidence path (calibrationEvidence
    // non-null with all four signals passing). F7 ceiling dissolved per
    // ceiling-dissolution-record.md; authorized T1+T2+T3+T4 + 5/5 council 2026-04-27.
    const promoteSession = driver.session();
    try {
      await promoteSession.executeWrite(async (tx) => {
        // R-spec-axes 5/5 (2026-05-22): epistemic state goes on verificationState,
        // NOT lifecycleState. lifecycleState stays 'active' (temporal) so supersede()
        // can no longer silently erase the verified epistemic state.
        // verificationTime mirrored on MC so applyVerificationStateDecay can fire 180d later.
        await tx.run(
          `MATCH (n {nodeId: $targetNodeId})
           SET n.verificationState = 'verified',
               n.verificationTime  = $verificationTime`,
          { targetNodeId, verificationTime },
        );
      });
    } finally {
      await promoteSession.close();
    }

    return {
      status: 'promoted',
      verificationRecordNodeId: vrNodeId,
      targetLifecycleState: 'active',
      targetVerificationState: 'verified',
    };
  }

  // Ceiling held — VerificationRecord written, but no verified transition.
  // None of the three paths (legacy, v3, auto-VR) was satisfied.
  const ceilingReason = verdict !== 'confirmed'
    ? 'AD4 AND-gate (three-path): verdict is not confirmed; no verified transition.'
    : a1HarnessResult == null && calibrationEvidence == null && vrCalibrationEvidence == null
      ? 'AD4 AND-gate (three-path): no evidence provided. Provide one of: ' +
        '(legacy) a1HarnessResult with kappa>=0.85 + rawAgreement>=0.90; ' +
        '(v3) calibrationEvidence with citationAccuracy>=0.85 + fabricationSignalsAbsent=true + confidenceStdev>0.05; ' +
        "(T5) vrCalibrationEvidence with sessionCount>=3 + distinctSourceCount>=2 + openConflict=false + sourceStability=true + verifierId='system-cross-session-ratification'."
      : vrCalibrationEvidence != null
        ? `AD4 AND-gate (T5 auto-VR path attempted): vrCalibrationEvidence present but gate not satisfied. ` +
          `sessionCount=${vrCalibrationEvidence.sessionCount} (need >=3), ` +
          `distinctSourceCount=${vrCalibrationEvidence.distinctSourceCount} (need >=2), ` +
          `openConflict=${vrCalibrationEvidence.openConflict} (need false), ` +
          `sourceStability=${vrCalibrationEvidence.sourceStability} (need true), ` +
          `verifierId='${vrCalibrationEvidence.verifierId}' (need 'system-cross-session-ratification').`
        : calibrationEvidence != null
          ? `AD4 AND-gate (v3 path attempted): calibrationEvidence present but gate not satisfied. ` +
            `citationAccuracy=${calibrationEvidence.citationAccuracy} (need >=0.85), ` +
            `fabricationSignalsAbsent=${calibrationEvidence.fabricationSignalsAbsent} (need true), ` +
            `confidenceStdev=${calibrationEvidence.confidenceStdev} (need >0.05).`
          : `AD4 AND-gate (legacy path attempted): a1HarnessResult present but gate not satisfied. ` +
            `kappa=${a1HarnessResult!.kappa} (need >=0.85), ` +
            `rawAgreement=${a1HarnessResult!.rawAgreement} (need >=0.90).`;

  return {
    status: 'ceiling_held',
    verificationRecordNodeId: vrNodeId,
    targetLifecycleState: 'active',  // target remains active — no transition
    reason: ceilingReason,
  };
}
