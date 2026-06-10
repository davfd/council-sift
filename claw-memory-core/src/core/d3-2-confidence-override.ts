/**
 * d3-2-confidence-override.ts — D3.2 Low-Confidence Override
 * Thread: I (T5 lifecycle execution)
 * Plan: SEMANTIC_MEMORY_V4_T5_LIFECYCLE.md
 * Gate evidence: spec:S3:9, spec:S4:5 (partial), spec:IG-T5-6
 *
 * d3-2's RETRIEVAL ENRICHMENT auto-path does NOT modify confidence_score.
 * Low-confidence nodes are flagged via low_confidence_flag in the retrieval
 * response payload but are NOT promoted.
 *
 * R-spec-6 Phase 3 (2026-05-22) — Path A narrowing per R2 5/5 + R5 5/5:
 *   This invariant scopes to d3-2's auto-path (checkLowConfidence,
 *   enrichWithConfidenceFlag, isPromotionEligibleByConfidence) — read-only
 *   functions that surface the flag without writing. Two authorized confidence
 *   mutation paths exist:
 *     1. overrideConfidence() CLI escape hatch (this file, below) — operator-driven
 *     2. applyConfidenceDecay() in d3-3-decay.ts — automated decay cron, gated
 *        by CLAW_DECAY_CONFIDENCE_ENABLED=false default (R6-O4 circuit breaker)
 *   Both paths write DecayAuditLog entries via d3-3-decay.writeDecayAuditLog
 *   for the audit trail. Classifier output remains the ORIGIN value and is
 *   preserved immutably in n.original_confidence_score (lazy-init via coalesce
 *   on first mutation by either authorized path).
 *
 * Zero-operator-labor mandate (charter §4 / BLOCK-T5-12):
 *   Auto-path: low_confidence_flag is auto-surfaced in retrieval payload
 *   without operator action. Operator is never required to see the flag.
 *
 * CLI escape hatch: override-confidence <id> <value> — allows operator
 * to override the flag (not required on auto-path). R-spec-6 R5 Q5 R6-O8:
 * override writes a DecayAuditLog entry (triggeredBy='operator.override').
 *
 * authorized_by: T6 (Jonathan 2026-04-28T04:16:20Z) + R-spec-6 R2 5/5 + R5 5/5
 */

import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import {
  writeDecayAuditLog,
  CLAW_DECAY_CURVE_VERSION,
  type DecayTransition,
} from './d3-3-decay.js';

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Concrete confidence threshold below which low_confidence_flag = true.
 *
 * Value derivation: 0.70 chosen for threshold symmetry with the disputed-state
 * inter-reviewer floor established in lifecycle-thresholds-v4.md §1.2 ("raw
 * agreement falls below 0.70 across at least 2 independent reviewers"). Note:
 * §1.2 measures inter-reviewer raw agreement (cross-reviewer); this constant
 * measures individual classifier confidence (single-node) — different axes
 * that share the value by design symmetry. Maintains coherence between
 * confidence-flag enrichment and disputed-state lifecycle routing — a memory
 * whose individual confidence falls below the same threshold that triggers
 * cross-reviewer dispute is flagged at retrieval for operator-side awareness.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.70;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConfidenceCheckResult {
  /** Whether the node is below the low-confidence threshold */
  low_confidence_flag: boolean;
  /** Concrete threshold value used */
  threshold: number;
  /** Actual confidence score from the classifier (unmodified) */
  confidence_score: number | null;
}

export interface OverrideConfidenceInput {
  nodeId: string;
  /** Operator-supplied override value; must be in [0.0, 1.0] */
  override_value: number;
  overriddenBy: string;
}

export interface OverrideConfidenceResult {
  status: 'overridden' | 'not_found' | 'invalid_value';
  nodeId: string;
  prior_confidence?: number;
  new_confidence?: number;
}

// ── Core low-confidence check ─────────────────────────────────────────────────

/**
 * Check whether a memory node's confidence_score is below the low-confidence threshold.
 *
 * Classifier output stands: this function reads the score but does NOT modify it.
 * The low_confidence_flag is derived at read time; it does not change the stored score.
 *
 * Zero-operator-labor: flag auto-surfaced at retrieval time; no operator input needed.
 *
 * @param confidenceScore - The classifier-assigned confidence score (may be null)
 * @returns boolean — true if below threshold (low confidence), false otherwise
 */
export function checkLowConfidence(confidenceScore: number | null): boolean {
  // Classifier output stands — we only READ the score, never write it
  if (confidenceScore === null || confidenceScore === undefined) {
    // Nodes without a confidence score are not flagged (classifier did not assign one)
    return false;
  }

  return confidenceScore < LOW_CONFIDENCE_THRESHOLD;
}

/**
 * Enrich a retrieval payload node with low_confidence_flag.
 *
 * Called during retrieval to add the flag to a node. The classifier output
 * (confidence_score) is never modified — only the flag is added.
 *
 * Zero-operator-labor: enrichment requires no operator input.
 *
 * @param node - Retrieval node with optional confidence_score
 * @returns Same node with low_confidence_flag added
 */
export function enrichWithConfidenceFlag<T extends { confidence_score?: number | null }>(
  node: T,
): T & { low_confidence_flag: boolean } {
  return {
    ...node,
    low_confidence_flag: checkLowConfidence(node.confidence_score ?? null),
  };
}

/**
 * Check if a low-confidence node would be eligible for promotion.
 *
 * Returns false for low-confidence nodes — they are NOT promoted regardless
 * of other lifecycle conditions. Classifier output is final.
 *
 * @param confidenceScore - The node's classifier confidence score
 * @returns false if low-confidence (blocked from promotion); true otherwise
 */
export function isPromotionEligibleByConfidence(confidenceScore: number | null): boolean {
  if (confidenceScore === null) {
    // No confidence score — not blocked by this rule
    return true;
  }
  // Low-confidence nodes are NOT promoted
  return confidenceScore >= LOW_CONFIDENCE_THRESHOLD;
}

// ── CLI escape hatch: override-confidence ─────────────────────────────────────

/**
 * CLI escape hatch: override-confidence — operator may override the confidence score.
 *
 * This is the ESCAPE HATCH and is NOT required on the auto-path.
 * The auto-path (low_confidence_flag surfacing) works without operator intervention.
 * Operator may use this CLI function to override when they have out-of-band evidence
 * not captured by the classifier.
 *
 * Command alias: `override-confidence <nodeId> <value>` (CLI integration point).
 *
 * @param nodeId       - Node to override
 * @param overrideValue - New confidence score in [0.0, 1.0]
 * @param overriddenBy  - Identity of the operator
 * @param neo4j         - Neo4jService instance
 */
export async function overrideConfidence(
  nodeId: string,
  overrideValue: number,
  overriddenBy: string,
  neo4j: Neo4jService,
): Promise<OverrideConfidenceResult> {
  // Validate override value
  if (overrideValue < 0.0 || overrideValue > 1.0) {
    return { status: 'invalid_value', nodeId };
  }

  const rows = await neo4j.run(
    `MATCH (n {nodeId: $nodeId})
     RETURN n.confidence_score AS prior_confidence`,
    { nodeId },
  );

  if (rows.length === 0) {
    return { status: 'not_found', nodeId };
  }

  const prior_confidence = (rows[0].prior_confidence as number | null) ?? null;
  const overriddenAt = new Date().toISOString();

  // R-spec-6 R2 5/5 + R5 Q5 R6-O6: lazy-init original_confidence_score
  // alongside the override write so the classifier write-time value is preserved
  // immutably across both authorized mutation paths (override + decay cron).
  await neo4j.run(
    `MATCH (n {nodeId: $nodeId})
     SET n.original_confidence_score = coalesce(n.original_confidence_score, n.confidence_score),
         n.confidence_score = $overrideValue,
         n.confidence_overridden = true,
         n.confidence_overridden_by = $overriddenBy,
         n.confidence_overridden_at = $overriddenAt`,
    {
      nodeId,
      overrideValue,
      overriddenBy,
      overriddenAt,
    },
  );

  // R-spec-6 R5 Q5 R6-O8: write DecayAuditLog entry so operator overrides appear
  // in the same audit surface as automated decay. Non-fatal — audit log failure
  // must not block the override itself (which already succeeded above).
  try {
    const auditEntry: DecayTransition = {
      nodeId,
      priorState: 'active',
      newState: 'active',
      transitionTime: overriddenAt,
      triggeredBy: 'operator.override',
      confidence_before: prior_confidence ?? undefined,
      confidence_after: overrideValue,
      decay_amount: (prior_confidence ?? 0) - overrideValue,
      decay_curve_version: CLAW_DECAY_CURVE_VERSION,
    };
    await writeDecayAuditLog(auditEntry, neo4j);
  } catch {
    // Non-fatal: override succeeded; audit log failure does not block the operator action.
  }

  return {
    status: 'overridden',
    nodeId,
    prior_confidence: prior_confidence ?? undefined,
    new_confidence: overrideValue,
  };
}
