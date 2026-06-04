/**
 * classification-policy.ts — Semantic Memory V4 Classification Policy Loader
 * Thread: D (iter3-execution) + E (iter4-execution, extend in-place)
 * Plan: SEMANTIC_MEMORY_V4_ITER3_CLASSIFY.md + SEMANTIC_MEMORY_V4_ITER4_RETRIEVE.md
 * Gate evidence: spec:S2:1, spec:S2:2, spec:S3:3, spec:IG1
 *
 * AD2/Call 2: resolveTypes returns string[] (plural array).
 * Singular memory_type form is prohibited.
 * AD4/Call 4 (iter4): confidenceScore is policy-declared for InferredMemory rules.
 * Runtime confidence computation is prohibited.
 *
 * Zod-validated YAML loader with in-memory cache.
 * loadPolicy(path?) allows explicit path override for tests.
 *
 * iter4 additions:
 *   - confidenceScore field added to rule schema (required when InferredMemory present)
 *   - resolveMemoryTypes() helper with extended return shape (types + confidenceScore)
 *   - resolveTypes() iter3 signature retained for regression compatibility
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { parse } from 'yaml';

/** Zod schema for a single classification rule — iter4: adds optional confidenceScore */
const ClassificationRuleSchema = z.object({
  source_pattern: z.string().min(1, 'source_pattern must be non-empty'),
  memory_types: z
    .array(z.string().min(1))
    .min(1, 'memory_types must be a non-empty array (Call 2: plural array required)'),
  confidenceScore: z.number().min(0).max(1).optional(),
});

/** Zod schema for a single unlisted_source_defaults entry (iter6 Wave A / FC3) */
const UnlistedDefaultSchema = z.object({
  confidenceScore: z.number().min(0).max(1),
  status: z.enum(['provisional', 'active']),
  recalibration_trigger: z.string().min(1),
});

/** Zod schema for the unlisted_source_defaults block (iter6 Wave A / FC3) */
const UnlistedSourceDefaultsSchema = z
  .object({
    unlisted_operator: UnlistedDefaultSchema.optional(),
    unlisted_agent: UnlistedDefaultSchema.optional(),
    unlisted_system: UnlistedDefaultSchema.optional(),
  })
  .optional();

/** Zod schema for the full classification policy file */
const ClassificationPolicySchema = z.object({
  rules: z.array(ClassificationRuleSchema),
  unlisted_source_defaults: UnlistedSourceDefaultsSchema,
});

type ClassificationPolicy = z.infer<typeof ClassificationPolicySchema>;

/** Extended resolution result including confidenceScore (iter4 / Call 4) */
export interface MemoryTypeResolution {
  memory_types: string[];
  confidenceScore?: number; // policy-declared; present when any type is InferredMemory
}

/** In-memory cache */
let policy: ClassificationPolicy | null = null;
let policyPath: string | null = null;

/**
 * Default policy YAML path — resolved relative to this source file.
 * claw-memory/src/core/ → ../../config/semantic-memory/
 * (2 levels up from src/core/ reaches claw-memory root; config/semantic-memory/ from there)
 *
 * Standalone module (iter9 Tier 9.0 — operator authorized 2026-05-24):
 * the policy YAML ships INSIDE claw-memory, not from any host. Override via explicit path arg.
 */
function getDefaultPolicyPath(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    return resolve(__dirname, '../../config/semantic-memory/classification-policy.yaml');
  } catch {
    return resolve(process.cwd(), 'config/semantic-memory/classification-policy.yaml');
  }
}

/**
 * Load and validate the classification policy YAML.
 * Caches the result in memory. Calling again with the same path is a no-op.
 *
 * @param path - Optional explicit path to the YAML file. Overrides default.
 */
export function loadPolicy(path?: string): void {
  const yamlPath = path ?? getDefaultPolicyPath();
  // Re-load if path changes (test override support)
  if (policy !== null && policyPath === yamlPath) return;
  const content = readFileSync(yamlPath, 'utf-8');
  const raw = parse(content) as unknown;
  policy = ClassificationPolicySchema.parse(raw);
  policyPath = yamlPath;
}

/**
 * Resolve the memory_types[] array for a given source pattern.
 * Returns an empty array if no rule matches (zero-match is valid per AD2).
 * Iterates ALL matching rules (source may appear in multiple rules, e.g. for
 * different memory_types) and merges the types.
 *
 * Lazy-loads the policy on first call if not already loaded.
 *
 * @param source - The source identifier string (e.g., 'seat:raguel')
 * @returns string[] — merged array of memory type names for this source (iter3 signature retained)
 */
export function resolveTypes(source: string): string[] {
  if (!policy) {
    loadPolicy();
  }
  // Collect all matching rules (source may match multiple rules with different types)
  const matchingRules = policy!.rules.filter((r) => r.source_pattern === source);
  if (matchingRules.length === 0) return [];
  // Merge all memory_types from matching rules (de-duplicate)
  const allTypes = matchingRules.flatMap((r) => r.memory_types);
  return [...new Set(allTypes)];
}

/**
 * Resolve memory types with extended metadata (iter4 / Call 4).
 * Returns all matching rules with their confidenceScore where applicable.
 * Used by classifier.ts to obtain policy-declared confidenceScore for InferredMemory.
 *
 * @param source - The source identifier string (e.g., 'seat:michael')
 * @returns MemoryTypeResolution[] — one entry per matching rule, preserving confidenceScore
 */
export function resolveMemoryTypes(source: string): MemoryTypeResolution[] {
  if (!policy) {
    loadPolicy();
  }
  const matchingRules = policy!.rules.filter((r) => r.source_pattern === source);
  return matchingRules.map((r) => ({
    memory_types: r.memory_types,
    confidenceScore: r.confidenceScore,
  }));
}

/** Infer the unlisted category for a source identity string (FC3 §2 algorithm) */
function inferUnlistedCategory(sourceIdentity: string): 'unlisted_operator' | 'unlisted_agent' | 'unlisted_system' {
  if (sourceIdentity.startsWith('operator:') || sourceIdentity.startsWith('user:'))
    return 'unlisted_operator';
  if (sourceIdentity.startsWith('seat:') || sourceIdentity.startsWith('agent:'))
    return 'unlisted_agent';
  return 'unlisted_system'; // catch-all — unrecognized prefix
}

/**
 * Resolve the unlisted_source_defaults confidenceScore for a given source identity.
 * Returns null if source has an explicit rule (use resolveTypes/resolveMemoryTypes instead).
 * Returns the provisional confidenceScore from unlisted_source_defaults when source has no explicit rule.
 *
 * @param source - The source identifier string
 * @returns number | null — confidenceScore from unlisted_source_defaults, or null if not applicable
 */
export function resolveUnlistedConfidenceScore(source: string): number | null {
  if (!policy) {
    loadPolicy();
  }
  // Only apply unlisted defaults when source has NO explicit rule
  const hasExplicitRule = policy!.rules.some((r) => r.source_pattern === source);
  if (hasExplicitRule) return null;

  const defaults = policy!.unlisted_source_defaults;
  if (!defaults) return null;

  const category = inferUnlistedCategory(source);
  const entry = defaults[category];
  return entry?.confidenceScore ?? null;
}
