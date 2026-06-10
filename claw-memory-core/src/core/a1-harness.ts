/**
 * a1-harness.ts — Semantic Memory V4 A1 Loop-Convergence Consistency Gate
 * Thread: F (iter5-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER5_A1HARNESS.md
 * Gate evidence: spec:S4:3, spec:IG3, spec:IG4
 *
 * Orchestrates the A1 gate per validation-harness-v4.md §1.6 (7 sub-items a–g):
 *   (a) Loop-convergence framing (reflexive memory system)
 *   (b) Content-independence superseded / process-independence retained
 *   (c) Sequential independent labeling (jonathan + council-formal-verdict)
 *   (d) Convergence dimension: type assignment + required properties
 *   (e) Boundary clause: does NOT certify semantic correctness
 *   (f) Operator-vs-council scope (Jonathan=Rater-1, council=Rater-2)
 *   (g) Substitution acknowledgment (iter4 two-human-raters superseded)
 *
 * AD1: sequential-independence invariant — both raters finalized before comparison.
 * AD3: kappa via kappa-computer.ts over all 10 nodes as single population.
 * AD4: sub-threshold protocol ordered steps:
 *   Step 1: document each disagreement by nodeType AND policy section (FIRST)
 *   Step 2: cluster check (≥2 same policy section → BLOCK) BEFORE expansion
 *   Step 3: if scatter → corpus expansion to 15 nodes (no re-rating before expansion)
 * AD5: A1_PASS_timestamp emitted as ISO-8601 on PASS (Call 1 enforcement).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as yamlParse } from 'yaml';
import { canCompare, getLabels } from './corpus-rater.js';
import { computeKappa, type KappaResult } from './kappa-computer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Constants ────────────────────────────────────────────────────────────────

/** Rater IDs for the A1 gate (AD1 §1.6 sub-item f) */
const RATER_IDS = ['jonathan', 'council-formal-verdict'] as const;

/** Kappa threshold per lifecycle-thresholds-v4.md §1.1 */
const KAPPA_THRESHOLD = 0.85;

/** Raw agreement threshold per lifecycle-thresholds-v4.md §1.1 */
const RAW_THRESHOLD = 0.90;

// ── Types ────────────────────────────────────────────────────────────────────

export interface A1HarnessOptions {
  /** Path to pilot-corpus.yaml (required; path-as-config per founding directive 2026-05-10) */
  pilotCorpusPath: string;
  /** Path to gate-results-v4.md (required; path-as-config per founding directive 2026-05-10) */
  gateResultsPath: string;
  /** Override path to ratings directory (optional; forwarded to corpus-rater; default = `process.cwd()/ratings/` per iter9 standalone, 2026-05-24) */
  ratingsPath?: string;
}

/** Per-node disagreement documentation — AD4 Step 1 (Raguel SO-R12) */
export interface DisagreementDoc {
  nodeId: string;
  /** MemoryClaim | SummaryMemory | InferredMemory */
  nodeType: string;
  /** classification-policy.yaml section at issue for this nodeType */
  policySection: string;
  jonathanLabel: 'correct' | 'incorrect';
  councilLabel: 'correct' | 'incorrect';
}

/** AD4 Step 2 cluster analysis result */
export interface ClusterCheck {
  /** true if ≥2 disagreements share the same policy section */
  hasCluster: boolean;
  clusterSection?: string;
  clusterCount?: number;
  recommendation: string;
}

export type A1HarnessStatus =
  | 'WAITING_FOR_RATERS'        // sequential-independence invariant: not all raters finalized
  | 'PASS'                       // kappa ≥ 0.85 AND raw ≥ 0.90
  | 'FAIL_POLICY_CLUSTER_BLOCK'  // AD4 Step 2: cluster detected → BLOCK
  | 'FAIL_EXPANSION_NEEDED';     // AD4 Step 3: scatter → corpus expansion to 15

export interface A1HarnessResult {
  status: A1HarnessStatus;
  kappa?: number;
  rawAgreement?: number;
  corpusSize?: number;
  agreementCount?: number;
  /** ISO-8601 timestamp emitted ONLY on PASS (AD5 — defines prospective ceiling dissolution boundary) */
  A1_PASS_timestamp?: string;
  disagreements?: DisagreementDoc[];
  clusterCheck?: ClusterCheck;
  reason?: string;
}

// ── Path helpers removed ───────────────────────────────────────────────────────
// defaultPilotCorpusPath() and defaultGateResultsPath() removed per founding-directive
// restoration 2026-05-10 (R39-R43 5/5 ratification). Both paths are now required params
// of A1HarnessOptions — callers must supply explicit absolute paths (path-as-config).

// ── Policy section resolver ───────────────────────────────────────────────────

/**
 * Return the classification-policy.yaml section at issue for a given nodeType.
 * Used in AD4 Step 1 disagreement documentation (Raguel SO-R12).
 */
function policySectionForType(nodeType: string): string {
  switch (nodeType) {
    case 'MemoryClaim':
      return 'classification-policy.yaml §MemoryClaim (required: claimantId, claimText, lifecycleState, provenanceEdges[DERIVED_FROM], scopeEdges[IN_SCOPE])';
    case 'SummaryMemory':
      return 'classification-policy.yaml §SummaryMemory (required: producedBy, summaryText, versionOrdinal, priorVersionId, lifecycleState, provenanceEdges[SUMMARIZES], scopeEdges[IN_SCOPE])';
    case 'InferredMemory':
      return 'classification-policy.yaml §InferredMemory (required: producedBy, inferenceText, confidenceScore[policy-declared 0.75], versionOrdinal, priorVersionId, lifecycleState, provenanceEdges[INFERRED_FROM], scopeEdges[IN_SCOPE])';
    default:
      return `classification-policy.yaml §${nodeType} (unrecognized type)`;
  }
}

// ── Main harness function ─────────────────────────────────────────────────────

/**
 * Execute the A1 loop-convergence consistency gate.
 *
 * Enforces sequential-independence invariant, computes Cohen's kappa
 * via kappa-computer.ts, and implements the AD4 sub-threshold protocol
 * in strict step order.
 *
 * On PASS: A1_PASS_timestamp is emitted (ISO-8601) and gate-results-v4.md
 * is updated with the §1.5 A1 entry (AD5 Call 1 enforcement).
 *
 * @param options - optional path overrides for testing
 * @returns A1HarnessResult
 */
export function executeA1Harness(options: A1HarnessOptions): A1HarnessResult {
  const corpusPath = options.pilotCorpusPath;
  const gateResultsPath = options.gateResultsPath;

  // ── Load pilot corpus ─────────────────────────────────────────────────────
  const raw = readFileSync(corpusPath, 'utf-8');
  const corpus = yamlParse(raw) as { corpus_nodes: Array<Record<string, unknown>> };

  const corpusIds = new Set(corpus.corpus_nodes.map((n) => n.node_id as string));
  const nodeTypeMap = new Map(
    corpus.corpus_nodes.map((n) => [n.node_id as string, n.expected_type as string]),
  );

  // ── Step 0: Sequential-independence invariant (AD1) ──────────────────────
  // Verify BOTH raters have finalized labels for ALL corpus nodes before any
  // comparison is permitted (§1.6 sub-item c; reveal-only-after-all-raters-finalize).
  const compareCheck = canCompare(corpusIds, [...RATER_IDS], options.ratingsPath);

  if (!compareCheck.canCompare) {
    return {
      status: 'WAITING_FOR_RATERS',
      corpusSize: corpusIds.size,
      reason:
        `Sequential-independence invariant (AD1 §1.6-c): comparison blocked — ` +
        `${compareCheck.reason}. ` +
        `Both raters must finalize all ${corpusIds.size} node labels before kappa computation proceeds.`,
    };
  }

  // ── Step 1: Retrieve labels — reveal-only-after-all-raters-finalize ───────
  // getLabels() enforces the invariant internally and throws if violated.
  const jonathanRaw = getLabels('jonathan', corpusIds, [...RATER_IDS], options.ratingsPath);
  const councilRaw = getLabels('council-formal-verdict', corpusIds, [...RATER_IDS], options.ratingsPath);

  // Convert 'correct'/'incorrect' → boolean for kappa computation
  // (true = correct type label AND required properties satisfied per AD3)
  const raterALabels = new Map<string, boolean>();
  for (const [id, label] of jonathanRaw) {
    raterALabels.set(id, label === 'correct');
  }

  const raterBLabels = new Map<string, boolean>();
  for (const [id, label] of councilRaw) {
    raterBLabels.set(id, label === 'correct');
  }

  // ── Step 2: Compute kappa (AD3 — all nodes as single population) ──────────
  // Single population of all corpus nodes (NOT per-type — n=3-4 per type
  // is statistically indefensible per AD3).
  const kappaResult: KappaResult = computeKappa(raterALabels, raterBLabels, corpusIds);

  // ── Step 3: Evaluate PASS / FAIL ──────────────────────────────────────────
  const passed = kappaResult.pass_threshold_check.overall_pass;

  if (passed) {
    // ── PASS path: emit A1_PASS_timestamp (AD5 — Call 1 enforcement) ────────
    // This timestamp defines the prospective ceiling dissolution boundary.
    // Nodes with createdAt > A1_PASS_timestamp are promotion-eligible.
    // Retroactive promotion of pre-A1-PASS nodes is permanently prohibited.
    const A1_PASS_timestamp = new Date().toISOString();

    _writeA1GateEntry(
      {
        kappa: kappaResult.kappa,
        rawAgreement: kappaResult.raw_agreement,
        corpusSize: kappaResult.corpus_size,
      },
      'PASS',
      A1_PASS_timestamp,
      gateResultsPath,
    );

    return {
      status: 'PASS',
      kappa: kappaResult.kappa,
      rawAgreement: kappaResult.raw_agreement,
      corpusSize: kappaResult.corpus_size,
      agreementCount: kappaResult.agreement_count,
      A1_PASS_timestamp,
    };
  }

  // ── FAIL path: AD4 sub-threshold protocol (ordered steps) ────────────────

  // AD4 Step 1: Document each disagreement node by nodeType AND policy section
  // (Raguel SO-R12: policy-section documentation FIRST — BEFORE cluster check)
  const disagreements: DisagreementDoc[] = kappaResult.disagreement_nodes.map((nodeId) => {
    const nodeType = nodeTypeMap.get(nodeId) ?? 'Unknown';
    return {
      nodeId,
      nodeType,
      policySection: policySectionForType(nodeType),
      jonathanLabel: jonathanRaw.get(nodeId) ?? 'incorrect',
      councilLabel: councilRaw.get(nodeId) ?? 'incorrect',
    };
  });

  // AD4 Step 2: Cluster check — BEFORE any corpus expansion decision
  // ≥2 disagreements on the SAME policy section → policy-ambiguity flag + BLOCK
  // (Expansion is only appropriate for sampling-variance; cluster = policy problem)
  const sectionCounts = new Map<string, number>();
  for (const d of disagreements) {
    sectionCounts.set(d.policySection, (sectionCounts.get(d.policySection) ?? 0) + 1);
  }

  let clusterSection: string | undefined;
  let clusterCount = 0;
  for (const [section, count] of sectionCounts) {
    if (count >= 2 && count > clusterCount) {
      clusterSection = section;
      clusterCount = count;
    }
  }

  const hasCluster = clusterSection !== undefined;
  const clusterCheck: ClusterCheck = {
    hasCluster,
    clusterSection,
    clusterCount: hasCluster ? clusterCount : undefined,
    recommendation: hasCluster
      ? `BLOCK: ≥2 disagreements cluster on '${clusterSection}' (${clusterCount} nodes). ` +
        `Policy revision required before corpus expansion — this is a policy-ambiguity issue, ` +
        `not sampling variance. Corpus expansion would not resolve ambiguous policy wording.`
      : `No cluster detected (disagreements scatter across policy sections). ` +
        `Proceed to AD4 Step 3: corpus expansion from ${kappaResult.corpus_size} to 15 nodes ` +
        `(D1.1a/b composition: ≥4 ambiguity probes retained; all 15 sourced from loop output). ` +
        `No re-rating before expansion (anchoring-bias prevention per AD4).`,
  };

  if (hasCluster) {
    // BLOCK: policy cluster — emit FAIL gate result
    _writeA1GateEntry(
      {
        kappa: kappaResult.kappa,
        rawAgreement: kappaResult.raw_agreement,
        corpusSize: kappaResult.corpus_size,
      },
      'FAIL',
      undefined,
      gateResultsPath,
    );

    return {
      status: 'FAIL_POLICY_CLUSTER_BLOCK',
      kappa: kappaResult.kappa,
      rawAgreement: kappaResult.raw_agreement,
      corpusSize: kappaResult.corpus_size,
      agreementCount: kappaResult.agreement_count,
      disagreements,
      clusterCheck,
      reason:
        `AD4 Step 2 BLOCK: policy cluster on '${clusterSection}' (${clusterCount} disagreements). ` +
        `Policy revision required before corpus expansion. ` +
        `Emit a1-block-report.md with clustering evidence and iter6 policy-revision item.`,
    };
  }

  // AD4 Step 3: Scatter → corpus expansion to 15 nodes
  // No re-rating of original corpus before expansion (AD4 anchoring-bias prevention)
  _writeA1GateEntry(
    {
      kappa: kappaResult.kappa,
      rawAgreement: kappaResult.raw_agreement,
      corpusSize: kappaResult.corpus_size,
    },
    'FAIL',
    undefined,
    gateResultsPath,
  );

  return {
    status: 'FAIL_EXPANSION_NEEDED',
    kappa: kappaResult.kappa,
    rawAgreement: kappaResult.raw_agreement,
    corpusSize: kappaResult.corpus_size,
    agreementCount: kappaResult.agreement_count,
    disagreements,
    clusterCheck,
    reason:
      `AD4 Step 3: disagreements scatter across policy sections — this is sampling variance. ` +
      `Expand pilot corpus from ${kappaResult.corpus_size} to 15 nodes ` +
      `(D1.1a/b: ≥4 ambiguity probes; all loop-output; no synthetic). ` +
      `No re-rating before expansion (anchoring-bias prevention per AD4). ` +
      `Full re-rate of 15-node corpus after expansion.`,
  };
}

// ── Gate results writer ───────────────────────────────────────────────────────

/**
 * Write (or update) the §1.5 A1 entry in gate-results-v4.md.
 *
 * The A1_PASS_timestamp field is ONLY written on PASS verdict.
 * This timestamp defines the AD5 prospective ceiling dissolution boundary.
 */
function _writeA1GateEntry(
  metrics: { kappa: number; rawAgreement: number; corpusSize: number },
  verdict: 'PASS' | 'FAIL',
  a1PassTimestamp: string | undefined,
  gateResultsPath: string,
): void {
  const passTimestampRow = a1PassTimestamp
    ? `| A1_PASS_timestamp | ${a1PassTimestamp} |`
    : '';

  const a1Entry = `## §1.5 A1 Gate Result

<!-- authorized_by: Jonathan 2026-04-22T00:19:17Z (decision delegation) + Jonathan 2026-04-22T00:24:36Z (iter5 + iter6 execution) -->

| Field | Value |
|---|---|
| Gate ID | A1 |
| Measured kappa | ${metrics.kappa} |
| Measured raw agreement | ${metrics.rawAgreement} |
| Number of independent reviewers | 2 (Jonathan + council formal consensus) |
| Number of corpus items labeled | ${metrics.corpusSize} |
| Verdict | **${verdict}** |
${passTimestampRow}

- Kappa threshold: ≥ ${KAPPA_THRESHOLD} → ${metrics.kappa >= KAPPA_THRESHOLD ? '✓ MET' : '✗ NOT MET'} (kappa = ${metrics.kappa})
- Raw agreement threshold: ≥ ${RAW_THRESHOLD} → ${metrics.rawAgreement >= RAW_THRESHOLD ? '✓ MET' : '✗ NOT MET'} (raw = ${metrics.rawAgreement})
${a1PassTimestamp
  ? `\n> **A1_PASS_timestamp: ${a1PassTimestamp}**\n` +
    `> AD5: This timestamp defines the prospective ceiling dissolution boundary.\n` +
    `> Nodes with createdAt > this value are promotion-eligible.\n` +
    `> Retroactive promotion of pre-A1-PASS nodes is permanently prohibited (Call 1 enforcement).`
  : ''}
`;

  let content: string;
  if (existsSync(gateResultsPath)) {
    const existing = readFileSync(gateResultsPath, 'utf-8');
    if (existing.includes('## §1.5 A1 Gate Result')) {
      // Replace existing A1 entry (preserve everything before it and after §2)
      content = existing.replace(
        /## §1\.5 A1 Gate Result[\s\S]*?(?=## §2|$)/,
        a1Entry + '\n',
      );
    } else {
      content = existing + '\n' + a1Entry;
    }
  } else {
    content =
      `# gate-results-v4.md — Semantic Memory V4 Gate Results\n` +
      `<!-- authorized_by: Jonathan 2026-04-22T00:19:17Z (decision delegation) ` +
      `+ Jonathan 2026-04-22T00:24:36Z (iter5 + iter6 execution) -->\n\n` +
      a1Entry;
  }

  writeFileSync(gateResultsPath, content, 'utf-8');
}
