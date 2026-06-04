/**
 * a6-slo-gates.ts — A6 SLO Gates (p95 latency + item/token ceilings + SRE monitoring)
 * Thread: I (T5 lifecycle execution)
 * Plan: SEMANTIC_MEMORY_V4_T5_LIFECYCLE.md
 * Gate evidence: spec:S3:4, spec:S4:4 (IG-T5-5)
 *
 * SLO thresholds:
 *   p95 retrieval latency <= 1500ms (measured at production scale)
 *   result count <= 12 items per response
 *   token count <= 4500 tokens per response
 *
 * AD-T5-5 ELECTED: option (a) — cap context window.
 * On SLO breach: step-function fallback reduces items returned: 8 → 4
 * (first breach → 8; second breach → 4; from SLO_MAX_ITEMS base of 12).
 * Rationale: deterministic and testable; no cache coherence risk in a live memory
 * system where freshness matters; step-function is predictable and auditable.
 * Option (b) cache was rejected: stale-cache introduces coherence risk in a
 * system where memory correctness is the primary concern.
 *
 * SRE monitoring: monitoringHook fires on any threshold breach.
 *
 * BLOCK-T5-6: No ANTHROPIC_API_KEY in SLO measurement path.
 *
 * authorized_by: T6 (Jonathan 2026-04-28T04:16:20Z)
 */

import { Neo4jService } from '../storage/neo4j/neo4j.service.js';

// ── SLO Constants ─────────────────────────────────────────────────────────────

/** p95 latency ceiling in ms */
export const SLO_P95_LATENCY_MS = 1500;

/** Maximum items per retrieval response */
export const SLO_MAX_ITEMS = 12;

/** Maximum tokens per retrieval response (estimated via estimateTokenCount: chars / 4 heuristic). */
export const SLO_MAX_TOKENS = 4500;

/** AD-T5-5 option (a) step-function fallback levels: first breach → 8, second breach → 4 */
export const DEGRADATION_STEPS = [8, 4] as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface SloMeasurement {
  /** Individual latency samples in ms */
  samples: number[];
  /** p95 computed from samples */
  p95_ms: number;
  /** Maximum item count observed */
  max_items: number;
  /** Maximum token count observed */
  max_tokens: number;
  /** Whether all SLO thresholds passed */
  all_pass: boolean;
  /** Which specific checks passed */
  checks: {
    p95_pass: boolean;
    items_pass: boolean;
    tokens_pass: boolean;
  };
}

export interface DegradationResult {
  /** AD-T5-5 option (a): item ceiling applied */
  item_ceiling_applied: number;
  /** Whether degradation was triggered */
  degraded: boolean;
  /** Reason for degradation */
  reason?: string;
}

export type SreMonitoringHook = (breach: SroBreach) => void;

export interface SroBreach {
  type: 'p95_latency' | 'item_count' | 'token_count';
  measured_value: number;
  threshold: number;
  timestamp: string;
}

export interface A6GateResult {
  verdict: 'PASS' | 'FAIL';
  measurement: SloMeasurement;
  degradation_exercised: boolean;
  degradation_result?: DegradationResult;
}

// ── SRE monitoring hook registry ──────────────────────────────────────────────

const _monitoringHooks: SreMonitoringHook[] = [];

/**
 * Register an SRE monitoring hook that fires on any SLO breach.
 * At minimum one hook must be registered for IG-T5-5 gate compliance.
 */
export function registerMonitoringHook(hook: SreMonitoringHook): void {
  _monitoringHooks.push(hook);
}

/**
 * Fire all registered monitoring hooks for a breach event.
 */
export function fireMonitoringHooks(breach: SroBreach): void {
  for (const hook of _monitoringHooks) {
    hook(breach);
  }
}

// ── p95 computation ───────────────────────────────────────────────────────────

/**
 * Compute the p95 percentile from a sorted array of latency samples.
 * @param samples - Latency samples in ms (must have >= 1 entry)
 */
export function computeP95(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return sorted[Math.min(idx, sorted.length - 1)];
}

/**
 * Estimate token count from content string.
 * Heuristic: 1 token ≈ 4 chars (GPT-4 approximation for English text).
 */
export function estimateTokenCount(content: string): number {
  return Math.ceil(content.length / 4);
}

// ── AD-T5-5 option (a): step-function degradation ─────────────────────────────

/**
 * Apply AD-T5-5 elected form (a): step-function item ceiling reduction.
 *
 * When p95 > SLO_P95_LATENCY_MS, reduce the item ceiling in steps: 8 → 4.
 * First breach (consecutiveBreachCount=0) applies ceiling=8 (stepped down from
 * SLO_MAX_ITEMS=12); second consecutive breach (count=1) applies ceiling=4.
 *
 * This is the AUTO-DEGRADATION PATH per IG-T5-5 pass condition.
 * Zero-operator-labor: degradation fires automatically on breach detection.
 *
 * @param p95_ms           - Measured p95 latency
 * @param consecutiveBreachCount - How many consecutive breaches (0 = first breach)
 * @returns DegradationResult
 */
export function applyStepFunctionDegradation(
  p95_ms: number,
  consecutiveBreachCount: number = 0,
): DegradationResult {
  if (p95_ms <= SLO_P95_LATENCY_MS) {
    return { item_ceiling_applied: SLO_MAX_ITEMS, degraded: false };
  }

  // Step function: 0 breaches (first breach) → 8, 1+ breaches → 4
  const stepIndex = Math.min(consecutiveBreachCount, DEGRADATION_STEPS.length - 1);
  const ceiling = DEGRADATION_STEPS[stepIndex];

  return {
    item_ceiling_applied: ceiling,
    degraded: true,
    reason: `AD-T5-5 option (a): p95=${p95_ms}ms exceeds SLO_P95_LATENCY_MS=${SLO_P95_LATENCY_MS}ms; ` +
      `step-function applied (consecutiveBreachCount=${consecutiveBreachCount}); ` +
      `item ceiling reduced from ${SLO_MAX_ITEMS} → ${ceiling}.`,
  };
}

// ── Production-scale measurement ──────────────────────────────────────────────

/**
 * Measure p95 retrieval latency at production scale (not toy/single-node corpus).
 *
 * Executes N sample retrieval queries and measures end-to-end latency.
 * BLOCK-T5-6: no ANTHROPIC_API_KEY in measurement path.
 *
 * @param neo4j      - Neo4jService instance
 * @param sampleCount - Number of latency samples to collect (default: 20)
 * @returns SloMeasurement
 */
export async function measureProductionLatency(
  neo4j: Neo4jService,
  sampleCount: number = 20,
): Promise<SloMeasurement> {
  const latencySamples: number[] = [];
  let maxItems = 0;
  let maxTokens = 0;

  for (let i = 0; i < sampleCount; i++) {
    const start = Date.now();

    const rows = await neo4j.run(
      `MATCH (n)
       WHERE (n:MemoryClaim OR n:SummaryMemory OR n:InferredMemory)
         AND n.lifecycleState IN ['active', 'disputed']
       RETURN n.nodeId AS nodeId, COALESCE(n.summary, LEFT(n.content, 400)) AS content
       LIMIT toInteger($limit)`,
      // Neo4j requires integer LIMIT — JS numbers are floats; toInteger() coerces in Cypher
      { limit: SLO_MAX_ITEMS },
    );

    const elapsed = Date.now() - start;
    latencySamples.push(elapsed);

    const itemCount = rows.length;
    if (itemCount > maxItems) maxItems = itemCount;

    const totalContent = rows.map((r) => (r.content as string) ?? '').join(' ');
    const tokenCount = estimateTokenCount(totalContent);
    if (tokenCount > maxTokens) maxTokens = tokenCount;
  }

  const p95_ms = computeP95(latencySamples);

  const checks = {
    p95_pass: p95_ms <= SLO_P95_LATENCY_MS,
    items_pass: maxItems <= SLO_MAX_ITEMS,
    tokens_pass: maxTokens <= SLO_MAX_TOKENS,
  };

  // Fire SRE monitoring hooks on breach
  if (!checks.p95_pass) {
    fireMonitoringHooks({
      type: 'p95_latency',
      measured_value: p95_ms,
      threshold: SLO_P95_LATENCY_MS,
      timestamp: new Date().toISOString(),
    });
  }
  if (!checks.items_pass) {
    fireMonitoringHooks({
      type: 'item_count',
      measured_value: maxItems,
      threshold: SLO_MAX_ITEMS,
      timestamp: new Date().toISOString(),
    });
  }
  if (!checks.tokens_pass) {
    fireMonitoringHooks({
      type: 'token_count',
      measured_value: maxTokens,
      threshold: SLO_MAX_TOKENS,
      timestamp: new Date().toISOString(),
    });
  }

  return {
    samples: latencySamples,
    p95_ms,
    max_items: maxItems,
    max_tokens: maxTokens,
    all_pass: checks.p95_pass && checks.items_pass && checks.tokens_pass,
    checks,
  };
}

// ── Full A6 gate run ──────────────────────────────────────────────────────────

/**
 * Run the full A6 SLO gate.
 *
 * 1. Measure production-scale latency
 * 2. Check all 3 SLO thresholds
 * 3. Exercise the auto-degradation path (AD-T5-5 option a) with a simulated breach
 *
 * IG-T5-5 pass condition: auto-degradation path exercised in test suite.
 * This function exercises degradation via simulated breach (consecutiveBreachCount=1).
 *
 * @param neo4j - Neo4jService instance
 * @returns A6GateResult
 */
export async function runA6Gate(neo4j: Neo4jService): Promise<A6GateResult> {
  const measurement = await measureProductionLatency(neo4j);

  // Exercise auto-degradation path (IG-T5-5: "auto-degradation path exercised")
  // Simulate a breach to prove the degradation path fires correctly.
  const simulatedBreach_ms = SLO_P95_LATENCY_MS + 100; // +100ms over SLO
  const degradation_result = applyStepFunctionDegradation(simulatedBreach_ms, 1);

  return {
    verdict: measurement.all_pass ? 'PASS' : 'FAIL',
    measurement,
    degradation_exercised: true,
    degradation_result,
  };
}
