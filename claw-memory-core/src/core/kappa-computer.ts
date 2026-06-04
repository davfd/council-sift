/**
 * kappa-computer.ts — Semantic Memory V4 A1 Kappa Computation
 * Thread: F (iter5-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER5_A1HARNESS.md
 * Gate evidence: spec:S4:1, spec:IG3, spec:IG4
 *
 * AD3 + AD14: Cohen's kappa via simple-statistics over all 10 nodes
 * as a single population (NOT per-type — n=3-4 per type is statistically
 * indefensible per AD3).
 *
 * Binary scoring: correct = correct type label AND required properties per
 * classification-policy.yaml satisfied. A node with correct type but absent
 * required properties scores "incorrect".
 *
 * Call 4 enforcement: confidenceScore is policy-declared only. No runtime
 * heuristic confidence computation is performed here.
 *
 * D2.4 grep-enforcement: simple-statistics import is in active (non-comment)
 * code below.
 */

import * as ss from 'simple-statistics'; // AD14 D2.4 active-code import

// ── Types ────────────────────────────────────────────────────────────────────

/** Binary label: true = correct, false = incorrect */
export type BinaryLabel = boolean;

/** Threshold check result per lifecycle-thresholds-v4.md §1.1 */
export interface PassThresholdCheck {
  kappa_pass: boolean;       // kappa >= 0.85
  raw_pass: boolean;         // raw_agreement >= 0.90
  overall_pass: boolean;     // AND of both (AD4 AND-gate basis)
}

/** Result of kappa computation */
export interface KappaResult {
  kappa: number;                          // Cohen's kappa [-1.0, 1.0]
  raw_agreement: number;                  // raw agreement [0.0, 1.0]
  disagreement_nodes: string[];           // nodeIds where raters disagreed
  pass_threshold_check: PassThresholdCheck;
  /** Number of nodes in corpus (single population per AD3) */
  corpus_size: number;
  /** Number of agreements */
  agreement_count: number;
}

// ── Cohen's kappa formula ────────────────────────────────────────────────────
/**
 * Compute Cohen's kappa for binary classification (correct / incorrect).
 *
 * Formula (binary):
 *   P_o = observed agreement = (agreements) / n
 *   P_e = expected agreement = p_A * p_B + (1-p_A) * (1-p_B)
 *     where p_A = proportion raterA labels = true
 *           p_B = proportion raterB labels = true
 *   kappa = (P_o - P_e) / (1 - P_e)
 *
 * Uses simple-statistics for proportion computations (AD14).
 * All 10 nodes treated as a single population (AD3 — not per-type).
 *
 * @param raterALabels  - Map<nodeId, boolean> — Rater-1 binary labels
 * @param raterBLabels  - Map<nodeId, boolean> — Rater-2 binary labels
 * @param corpusIds     - Set<string> of all corpus nodeIds (defines population)
 * @returns KappaResult
 */
export function computeKappa(
  raterALabels: Map<string, BinaryLabel>,
  raterBLabels: Map<string, BinaryLabel>,
  corpusIds: Set<string>,
): KappaResult {
  const ids = Array.from(corpusIds);
  const n = ids.length;

  if (n === 0) {
    throw new Error('computeKappa: corpus is empty — cannot compute kappa on zero nodes');
  }

  // Validate all corpus IDs have labels from both raters
  for (const id of ids) {
    if (!raterALabels.has(id)) {
      throw new Error(`computeKappa: raterA missing label for node ${id}`);
    }
    if (!raterBLabels.has(id)) {
      throw new Error(`computeKappa: raterB missing label for node ${id}`);
    }
  }

  // Build binary arrays for computation
  const aLabels = ids.map((id) => (raterALabels.get(id)! ? 1 : 0));
  const bLabels = ids.map((id) => (raterBLabels.get(id)! ? 1 : 0));

  // Track disagreements
  const disagreement_nodes: string[] = [];
  let agreement_count = 0;
  for (let i = 0; i < n; i++) {
    if (aLabels[i] === bLabels[i]) {
      agreement_count++;
    } else {
      disagreement_nodes.push(ids[i]);
    }
  }

  // P_o — observed agreement
  const P_o = agreement_count / n;

  // Use simple-statistics for proportion computation (AD14 / D2.4 active-code enforcement)
  // ss.mean() computes the proportion of true (1.0) labels in the binary array
  const p_A = ss.mean(aLabels);  // proportion raterA labels 'correct'
  const p_B = ss.mean(bLabels);  // proportion raterB labels 'correct'

  // P_e — chance agreement for binary classification
  const P_e = p_A * p_B + (1 - p_A) * (1 - p_B);

  // Cohen's kappa
  let kappa: number;
  if (P_e === 1.0) {
    // Perfect chance agreement → undefined; treat as 0 (no agreement beyond chance)
    kappa = 0;
  } else {
    kappa = (P_o - P_e) / (1 - P_e);
  }

  // Round to 4 decimal places for display
  kappa = Math.round(kappa * 10000) / 10000;
  const raw_agreement = Math.round(P_o * 10000) / 10000;

  const pass_threshold_check: PassThresholdCheck = {
    kappa_pass: kappa >= 0.85,
    raw_pass: raw_agreement >= 0.90,
    overall_pass: kappa >= 0.85 && raw_agreement >= 0.90,
  };

  return {
    kappa,
    raw_agreement,
    disagreement_nodes,
    pass_threshold_check,
    corpus_size: n,
    agreement_count,
  };
}
