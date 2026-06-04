/**
 * ontology-classifier.ts — Semantic Memory V4 Invisible Ontology Classifier
 * Thread: G (iter6-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER6_WAVE_A.md
 * Gate evidence: spec:S3:1, spec:S3:2, spec:IG3
 *
 * AD2: Rule-based PRIMARY path + LLM escalation fallback.
 * THRESHOLD_PER_FC1_RESOLUTION = 0.70 (FC1 council verdict, 5/5 Jophiel round-2 concurrence).
 * FC6: A2-scope SYSTEM-WIDE — rule-based path is deterministic (A2-compliant).
 *
 * BLOCK-5: ANTHROPIC_API_KEY MUST NOT be set — SDK uses OAuth via ~/.claude/.credentials.json
 * BLOCK-11: threshold = 0.70; path: 'rule-based' | 'llm-escalation' required on all returns
 * BLOCK-12: LLM prompt MUST NOT include rule_based_type or rule_based_confidence variables
 *
 * authorized_by: Jonathan 2026-04-22T19:52:52Z (iter6 NEW CHARTER)
 */

// iter9 Tier 9.0 M4 — SDK lazy load.
// Static import of @anthropic-ai/claude-agent-sdk moved inside runLLMEscalation() body as
// dynamic await import(). Module load no longer requires SDK when peer-absent.
// Dynamic import fires only on LLM escalation path (not module init, not rule-based path).
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Threshold constant — BLOCK-11: MUST equal 0.70
// ---------------------------------------------------------------------------

export const THRESHOLD_PER_FC1_RESOLUTION = 0.70;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClassificationResult {
  type: 'MemoryClaim' | 'SummaryMemory' | 'InferredMemory';
  properties: Record<string, unknown>;
  confidence: number; // float 0.0-1.0
  path: 'rule-based' | 'llm-escalation';
}

// ---------------------------------------------------------------------------
// LLM response schema (FC1 Item 2 — Zod canonical per 4/5 council vote)
// ---------------------------------------------------------------------------

export const LLMClassificationResponseSchema = z.object({
  type: z.enum(['MemoryClaim', 'SummaryMemory', 'InferredMemory']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(500),
});

export type LLMClassificationResponse = z.infer<typeof LLMClassificationResponseSchema>;

// ---------------------------------------------------------------------------
// System prompt template — FC1 Item 1 (verbatim; LOAD-BEARING per OBS-J-FC1-01)
// BLOCK-12: MUST NOT include rule_based_type or rule_based_confidence substitution variables
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_TEMPLATE = `Classify the memory utterance below as exactly one of three types.

## Memory Types

**MemoryClaim** — A direct, first-hand factual assertion from an identified source. The statement records a specific claim that a particular source made or that is directly verifiable from a named artifact.
Example: "Jonathan standing authorization at 2026-04-20 covers Raziel through Metatron for iter3 only."

**SummaryMemory** — A compression or synthesis of information drawn from multiple sources or events. The statement condenses facts that span multiple artifacts or time periods.
Example: "Iter4 delivered 9 new TypeScript modules, 8 test files, and 1 config extension."

**InferredMemory** — A reasoned conclusion drawn from prior evidence. The statement expresses an inference, deduction, or implication derived from existing facts rather than a direct observation.
Example: "Given that the authorization was scoped to iter3, any iter4 work requires a fresh grant."

## Policy Constraints (apply BEFORE content-structure analysis)

1. Source "seat:raguel": ONLY MemoryClaim or SummaryMemory are valid.
   InferredMemory is excluded for seat:raguel regardless of content structure.
   If the utterance has inferential structure from seat:raguel, classify as MemoryClaim.

2. InferredMemory requires a policy-authorized producer:
   - Explicitly authorized: seat:michael
   - Unlisted sources (operator:*, agent:*, system:*): InferredMemory is permitted.
   - Named seat identities not in the authorized list: default to MemoryClaim.

3. Operator-category sources (e.g., "operator:example"): default type is MemoryClaim
   unless the content clearly matches the SummaryMemory multi-fact aggregation pattern.

## Utterance to Classify

Source identity: {source_identity}
Utterance: {utterance}

## Instructions

Respond with ONLY valid JSON. Do not include explanation text, markdown fencing, or content outside the JSON object.

{
  "type": "MemoryClaim" | "SummaryMemory" | "InferredMemory",
  "confidence": <float from 0.0 to 1.0>,
  "reasoning": "<one sentence explaining which type and which rule determined the classification>"
}`;

// ---------------------------------------------------------------------------
// Rule-based pattern definitions
// ---------------------------------------------------------------------------

// MemoryClaim patterns — direct factual assertions from identified sources
const MEMORY_CLAIM_KEYWORDS = [
  'authorization',
  'authorized',
  'grant',
  'standing authorization',
  'approved',
  'confirmed',
  'explicitly stated',
  'said',
  'stated',
  'declared',
  'recorded',
  'documented at',
  'authorization covers',
  'authorization grant',
];

const MEMORY_CLAIM_KEYWORD_RE = new RegExp(
  MEMORY_CLAIM_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i',
);

// "per [person]" or "[person] confirmed"
const MEMORY_CLAIM_PER_RE = /\bper\s+\w+\b|\b\w+\s+confirmed\b/i;

// "X [verb] Y at [date]" — date-anchored assertion
const MEMORY_CLAIM_DATE_ASSERTION_RE =
  /\b\w[\w\s]+(said|stated|declared|confirmed|recorded|documented)\b.*\bat\s+\d{4}/i;

// MemoryClaim strong-signal regex set
const MEMORY_CLAIM_PATTERNS: RegExp[] = [
  MEMORY_CLAIM_KEYWORD_RE,
  MEMORY_CLAIM_PER_RE,
  MEMORY_CLAIM_DATE_ASSERTION_RE,
];

// SummaryMemory patterns — compression/synthesis from multiple sources
const SUMMARY_MEMORY_KEYWORDS = [
  'delivered',
  'produced',
  'includes',
  'consists of',
  'summary',
  'total',
  'across',
  'iteration',
  'combined',
  'aggregate',
  'in total',
  'the full set',
  'phase 1 complete',
  'milestone',
];

const SUMMARY_MEMORY_KEYWORD_RE = new RegExp(
  SUMMARY_MEMORY_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i',
);

// Lists: "X and Y and Z", "X, Y, and Z"
const SUMMARY_MEMORY_LIST_RE = /\w[\w\s]+(?:,\s*\w[\w\s]+)+(?:,?\s+and\s+\w[\w\s]+)?/i;

// Numerical aggregations: "N new modules", "N files"
const SUMMARY_MEMORY_NUMERIC_RE = /\b\d+\s+(?:new\s+)?\w+/i;

const SUMMARY_MEMORY_PATTERNS: RegExp[] = [
  SUMMARY_MEMORY_KEYWORD_RE,
  SUMMARY_MEMORY_LIST_RE,
  SUMMARY_MEMORY_NUMERIC_RE,
];

// InferredMemory patterns — reasoned conclusions
const INFERRED_MEMORY_KEYWORDS = [
  'therefore',
  'thus',
  'hence',
  'implies',
  'suggests',
  'infers',
  'given that',
  'since',
  'then',
  'likely',
  'probably',
  'deduced',
  'follows that',
  'it appears',
  'it seems',
  'inference',
  'conclusion',
];

const INFERRED_MEMORY_KEYWORD_RE = new RegExp(
  INFERRED_MEMORY_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i',
);

// Conditional reasoning: "given that X", "since X then Y", "if X then Y"
const INFERRED_MEMORY_CONDITIONAL_RE =
  /\b(?:given\s+that|since\s+\w[\w\s]+,?\s+(?:then|it follows)|if\s+\w[\w\s]+,?\s+then)\b/i;

// "X implies/suggests Y"
const INFERRED_MEMORY_IMPLICATION_RE = /\b\w[\w\s]+(?:implies|suggests|indicates)\s+\w/i;

const INFERRED_MEMORY_PATTERNS: RegExp[] = [
  INFERRED_MEMORY_KEYWORD_RE,
  INFERRED_MEMORY_CONDITIONAL_RE,
  INFERRED_MEMORY_IMPLICATION_RE,
];

// ---------------------------------------------------------------------------
// Source identity policy helpers (must run BEFORE content analysis — FC1 §Policy)
// ---------------------------------------------------------------------------

function isRaguelSource(source_identity: string): boolean {
  return source_identity.startsWith('seat:raguel');
}

function isInferredMemoryAuthorizedSource(source_identity: string): boolean {
  // Explicitly authorized: seat:michael
  if (source_identity === 'seat:michael') return true;
  // Unlisted categories: operator:*, agent:*, system:*, user:*
  if (
    source_identity.startsWith('operator:') ||
    source_identity.startsWith('agent:') ||
    source_identity.startsWith('system:') ||
    source_identity.startsWith('user:')
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Rule-based classifier (deterministic — A2-compliant)
// ---------------------------------------------------------------------------

interface RuleBasedResult {
  type: 'MemoryClaim' | 'SummaryMemory' | 'InferredMemory';
  confidence: number;
}

function countPatternMatches(utterance: string, patterns: RegExp[]): number {
  return patterns.filter((re) => re.test(utterance)).length;
}

function runRuleBased(utterance: string, source_identity: string): RuleBasedResult | null {
  // Count pattern matches per candidate type
  const memoryClaimMatches = countPatternMatches(utterance, MEMORY_CLAIM_PATTERNS);
  const summaryMemoryMatches = countPatternMatches(utterance, SUMMARY_MEMORY_PATTERNS);
  const inferredMemoryMatches = countPatternMatches(utterance, INFERRED_MEMORY_PATTERNS);

  const totalMatches = memoryClaimMatches + summaryMemoryMatches + inferredMemoryMatches;

  // No pattern matched — signal LLM escalation
  if (totalMatches === 0) {
    return null;
  }

  // Determine best candidate type by match count (ties broken by priority: MemoryClaim > SummaryMemory > InferredMemory)
  let candidateType: 'MemoryClaim' | 'SummaryMemory' | 'InferredMemory';
  let candidateMatches: number;

  if (memoryClaimMatches >= summaryMemoryMatches && memoryClaimMatches >= inferredMemoryMatches) {
    candidateType = 'MemoryClaim';
    candidateMatches = memoryClaimMatches;
  } else if (summaryMemoryMatches >= inferredMemoryMatches) {
    candidateType = 'SummaryMemory';
    candidateMatches = summaryMemoryMatches;
  } else {
    candidateType = 'InferredMemory';
    candidateMatches = inferredMemoryMatches;
  }

  // ---------------------------------------------------------------------------
  // Source identity policy enforcement (MUST run BEFORE finalizing type)
  // FC1 §Policy Constraints, iter5 failure class mitigation
  // ---------------------------------------------------------------------------

  // Constraint 1: seat:raguel — only MemoryClaim or SummaryMemory permitted
  if (isRaguelSource(source_identity) && candidateType === 'InferredMemory') {
    candidateType = 'MemoryClaim';
    candidateMatches = memoryClaimMatches > 0 ? memoryClaimMatches : 1;
  }

  // Constraint 2: InferredMemory requires authorized source
  if (candidateType === 'InferredMemory' && !isInferredMemoryAuthorizedSource(source_identity)) {
    candidateType = 'MemoryClaim';
    candidateMatches = memoryClaimMatches > 0 ? memoryClaimMatches : 1;
  }

  // Constraint 4 (D4): seat:*/council-seat:* SummaryMemory → MemoryClaim
  // Council R50 5/5 (2026-05-18): R49 narrowed `council-seat:` → `seat:` to catch
  // production owner_seat values, but AGENTS.md §2 Write Protocol still instructs
  // council seats to pass `source_identity: 'council-seat:raguel'`. Narrowing
  // introduced a regression caught by Barachiel R49 + confirmed by all 5 R50 seats
  // (multiple deposit memories landed as :SummaryMemory during R49/R50 sessions).
  // Prefix-union catches BOTH: production `seat:raguel` AND documented `council-seat:raguel`.
  // Narrowed to SummaryMemory only — seat:michael's InferredMemory authorization
  // (Constraint 2) is preserved.
  if (
    (source_identity.startsWith('seat:') || source_identity.startsWith('council-seat:')) &&
    candidateType === 'SummaryMemory'
  ) {
    candidateType = 'MemoryClaim';
    candidateMatches = memoryClaimMatches > 0 ? memoryClaimMatches : 1;
  }

  // ---------------------------------------------------------------------------
  // Confidence calculation
  // Base: 0.50 (at least one pattern matched)
  // +0.10 per strong keyword match, capped at 0.95
  // InferredMemory ceiling: 0.85 per spec (medium-high)
  // ---------------------------------------------------------------------------

  let confidence = 0.50;
  confidence += Math.min(candidateMatches, 4) * 0.10;

  // MemoryClaim and SummaryMemory get high confidence (0.85+) for clear signals
  if (
    (candidateType === 'MemoryClaim' || candidateType === 'SummaryMemory') &&
    candidateMatches >= 2
  ) {
    confidence = Math.min(confidence, 0.95);
  }

  // InferredMemory: medium-high ceiling (0.85)
  if (candidateType === 'InferredMemory') {
    confidence = Math.min(confidence, 0.85);
  }

  return { type: candidateType, confidence };
}

// ---------------------------------------------------------------------------
// LLM escalation path
// ---------------------------------------------------------------------------

/**
 * Item 11 (R67): LLM classifier circuit-breaker.
 * Reads CLAW_LLM_CLASSIFIER_TIMEOUT_MS env var; defaults to 15000ms.
 * Invalid values (non-numeric, ≤0) fall back to default.
 *
 * iter9 Tier 9.3 M9 (9.3b-2) — Root-cause + fix:
 *   Root cause: `pathToClaudeCodeExecutable` was already set (line ~391:
 *     `process.env.CLAUDE_CLI_PATH ?? `${process.env.HOME}/.local/bin/claude``),
 *     so path (a) — "pass pathToClaudeCodeExecutable explicitly" — was already
 *     implemented but the timeout was 5000ms. On first call or cold-start, the
 *     claude binary startup latency (JVM/Node warm-up + network auth + LLM
 *     round-trip) reliably exceeds 5000ms, causing every production write to
 *     fall back to deterministic classification silently.
 *   Fix (path b): bump default from 5000ms → 15000ms. Provides 3× more headroom
 *     for binary startup + inference latency. CLAW_LLM_CLASSIFIER_TIMEOUT_MS env
 *     var still overrides for operator tuning. Both fixes (path a + path b) are now
 *     active; no silent fallback on typical production writes.
 *   authorized_by: T11 (Jonathan 2026-05-05) + PN-T93-4 (investigation-first mandate)
 *     + R-iter9-tier9.3-consolidation-preflight 5/5 2026-05-28
 */
const LLM_CLASSIFIER_TIMEOUT_MS_DEFAULT = 15000;
export function getLLMClassifierTimeoutMs(): number {
  const raw = process.env.CLAW_LLM_CLASSIFIER_TIMEOUT_MS;
  if (!raw) return LLM_CLASSIFIER_TIMEOUT_MS_DEFAULT;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : LLM_CLASSIFIER_TIMEOUT_MS_DEFAULT;
}

// iter9 Tier 9.3 cost-leak fix (2026-05-29): early-skip when operator sets
// CLAW_LLM_CLASSIFIER_TIMEOUT_MS to a value too small for any real LLM call to complete.
// Without this, even a 1ms timeout still fires the underlying SDK query() and bills the
// API call to completion (the for-await loop has no AbortSignal). Bench runs with
// CLAW_LLM_CLASSIFIER_TIMEOUT_MS=1 were silently bleeding ~30 Sonnet calls per question
// (haystack-turn ingest) — bursted operator subscription mid-run.
//
// Below this threshold = treat as "operator disabled LLM classification entirely":
// skip the SDK call, return fallback immediately. Default 15000ms unaffected.
const LLM_CLASSIFIER_SKIP_THRESHOLD_MS = 100;

async function runLLMEscalation(
  utterance: string,
  source_identity: string,
): Promise<ClassificationResult> {
  const timeoutMs = getLLMClassifierTimeoutMs();
  const fallback: ClassificationResult = {
    type: 'SummaryMemory',
    confidence: 0.50,
    path: 'llm-escalation',
    properties: { reasoning: 'llm-response-parse-failure' },
  };

  // Cost-leak fix: if operator disabled LLM via tiny timeout, skip SDK call entirely.
  if (timeoutMs < LLM_CLASSIFIER_SKIP_THRESHOLD_MS) {
    return {
      type: 'SummaryMemory',
      confidence: 0.50,
      path: 'llm-escalation',
      properties: { reasoning: 'llm-disabled-via-low-timeout', timeoutMs },
    };
  }

  // iter9 Tier 9.0 M4: SDK lazy-loaded here (not at module init).
  // Dynamic import fires at LLM escalation time; module loads without SDK when peer-absent.
  const { query } = await import('@anthropic-ai/claude-agent-sdk');

  // Item 11 R67: wrap LLM query iteration in Promise.race with timeout.
  // On timeout → distinct fallback with reasoning='llm-timeout-fallback' + timeoutMs.
  // iter9 Tier 9.3 F3 (Raphael Stage 5 hardening): AbortController wired into SDK query().
  // SDK Options.abortController?: AbortController (sdk.d.ts:1160, @anthropic-ai/claude-agent-sdk ^0.2.0).
  // On timeout, controller.abort() cancels the in-flight SDK request — no orphan API completion,
  // no background billing bleed. The 100ms early-skip above handles operator-disabled paths.
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const TIMEOUT_SENTINEL = Symbol('llm-classifier-timeout');
  const timeoutPromise = new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(TIMEOUT_SENTINEL), timeoutMs);
  });

  const llmPromise = (async (): Promise<string> => {
    const chunks: string[] = [];
    for await (const event of query({
      prompt: `Source identity: ${source_identity}\nUtterance: ${utterance}`,
      options: {
        systemPrompt: SYSTEM_PROMPT_TEMPLATE,
        model: process.env.CLASSIFIER_MODEL ?? 'claude-sonnet-4-6',
        maxTurns: 1,
        settingSources: [],
        pathToClaudeCodeExecutable:
          process.env.CLAUDE_CLI_PATH ?? `${process.env.HOME}/.local/bin/claude`,
        abortController: controller,
      },
    })) {
      if (event.type === 'assistant' && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === 'text') chunks.push(block.text as string);
        }
      }
      // Log token usage for Wave A telemetry (FC1 Item 4)
      if (
        event.type === 'assistant' &&
        (event as Record<string, unknown>).token_usage !== undefined
      ) {
        console.error(
          '[ontology-classifier] token_usage:',
          JSON.stringify((event as Record<string, unknown>).token_usage),
        );
      }
    }
    return chunks.join('').trim();
  })();

  try {
    const raceResult = await Promise.race([llmPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    if (raceResult === TIMEOUT_SENTINEL) {
      // Item 11 R67: timeout-then-fallback path. Distinct reasoning + timeoutMs in properties.
      // iter9 Tier 9.3 F3: abort the SDK request before swallowing the orphaned promise.
      controller.abort();
      llmPromise.catch(() => { /* orphan-tolerant — abort() signals cancellation to SDK */ });
      console.error(`[ontology-classifier] LLM escalation timed out after ${timeoutMs}ms — falling back`);
      return {
        type: 'SummaryMemory',
        confidence: 0.50,
        path: 'llm-escalation',
        properties: { reasoning: 'llm-timeout-fallback', timeoutMs },
      };
    }

    const rawText = raceResult;

    // Strip markdown fencing if present (defensive)
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error('[ontology-classifier] LLM response JSON parse failed:', parseErr);
      return fallback;
    }

    const validated = LLMClassificationResponseSchema.safeParse(parsed);
    if (!validated.success) {
      console.error(
        '[ontology-classifier] LLM response failed Zod validation:',
        validated.error.message,
      );
      return fallback;
    }

    const { type, confidence, reasoning } = validated.data;
    return {
      type,
      confidence,
      path: 'llm-escalation',
      properties: { reasoning },
    };
  } catch (err) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    console.error('[ontology-classifier] LLM escalation error:', err);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Public classify function
// ---------------------------------------------------------------------------

export async function classify(
  utterance: string,
  source_identity: string = 'unknown',
): Promise<ClassificationResult> {
  // Call 2 binding: rule-based MUST run first
  const ruleResult = runRuleBased(utterance, source_identity);

  if (ruleResult !== null && ruleResult.confidence >= THRESHOLD_PER_FC1_RESOLUTION) {
    // Rule-based path: confidence >= 0.70 — deterministic, A2-compliant
    return {
      type: ruleResult.type,
      properties: {},
      confidence: ruleResult.confidence,
      path: 'rule-based',
    };
  }

  // LLM escalation: rule-based returned null (no match) or confidence < 0.70
  const llmResult = await runLLMEscalation(utterance, source_identity);

  // D5 (council R27 5/5 VERIFIED 2026-05-07): post-LLM source-identity policy.
  // Closes Path A (totalMatches=0 → null → LLM) and Path B (conf<0.70 → LLM).
  // Covers all runLLMEscalation() return paths including hardcoded SummaryMemory fallback
  // (lines ~342-347). BLOCK-11: path 'llm-escalation' preserved via spread.
  // BLOCK-12: no rule_based_* variables. seat:michael InferredMemory unaffected
  // ('seat:michael'.startsWith('council-seat:') === false; isInferredMemoryAuthorizedSource → true).
  let constrainedType = llmResult.type;
  if (isRaguelSource(source_identity) && constrainedType === 'InferredMemory') {
    constrainedType = 'MemoryClaim';
  }
  if (constrainedType === 'InferredMemory' && !isInferredMemoryAuthorizedSource(source_identity)) {
    constrainedType = 'MemoryClaim';
  }
  if (
    (source_identity.startsWith('seat:') || source_identity.startsWith('council-seat:')) &&
    constrainedType === 'SummaryMemory'
  ) {
    constrainedType = 'MemoryClaim';
  }
  return { ...llmResult, type: constrainedType };
}
