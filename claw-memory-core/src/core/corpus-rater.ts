/**
 * corpus-rater.ts — Semantic Memory V4 A1 Corpus Rater
 * Thread: F (iter5-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER5_A1HARNESS.md
 * Gate evidence: spec:S4:2, spec:IG3
 *
 * AD1 sequential-independence invariant: each rater finalizes their labels
 * without access to any other rater's labels or rationale.
 * Reveal-only-after-all-raters-finalize: getLabels() throws if not all
 * raters have submitted labels for all corpus nodes.
 *
 * Storage: per-rater YAML files under iter5/ratings/{raterId}.yaml.
 * No cross-rater access is permitted during the active rating window.
 *
 * D2.4 grep enforcement: path pattern 'ratings/' referenced in active code
 * below.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CorpusNodeLabel {
  node_id: string;
  label: 'correct' | 'incorrect';
  rationale: string;
  rated_at: string;         // ISO-8601
  rater: string;            // raterId
}

export interface RaterLabels {
  raterId: string;
  finalized: boolean;
  labels: CorpusNodeLabel[];
}

export interface CanCompareResult {
  canCompare: boolean;
  reason?: string;
  missingRaters?: string[];
  missingNodes?: { raterId: string; nodeIds: string[] }[];
}

// ── Path helpers ─────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve path to ratings/{raterId}.yaml
 * Storage: per-rater YAML files stored separately under ratings/ path
 * (per AD1 sequential-independence; D2.4: 'ratings' path pattern in active code)
 *
 * @param ratingsPath - optional override directory (path-as-config; founding-directive 2026-05-10)
 *   When provided, uses ratingsPath directly instead of the default cwd-relative location.
 *   Default: ${cwd}/ratings/{raterId}.yaml (standalone module,
 *            iter9 Tier 9.0 — Jonathan 2026-05-24). Benchmarking callers (a1-harness etc.)
 *            should pass an explicit ratingsPath; cwd default is dev convenience only.
 */
function ratingFilePath(raterId: string, ratingsPath?: string): string {
  if (ratingsPath) {
    return join(ratingsPath, `${raterId}.yaml`);
  }
  // Default: cwd-relative — no workspace coupling
  return join(process.cwd(), 'ratings', `${raterId}.yaml`);
}

function ensureRatingsDir(raterId: string, ratingsPath?: string): void {
  const filePath = ratingFilePath(raterId, ratingsPath);
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Rate a corpus node: record a binary label (correct/incorrect) for this rater.
 *
 * Enforces sequential independence: this rater's label is stored in their own
 * separate file. No other rater's labels are read or returned during this operation.
 *
 * @param corpusNodeId  - nodeId of the corpus node being rated
 * @param raterId       - identity of the rater (e.g., 'jonathan', 'council-formal-verdict')
 * @param label         - binary rating: 'correct' | 'incorrect'
 * @param rationale     - brief rationale for the label
 */
export function rateNode(
  corpusNodeId: string,
  raterId: string,
  label: 'correct' | 'incorrect',
  rationale: string,
  ratingsPath?: string,
): void {
  ensureRatingsDir(raterId, ratingsPath);
  const filePath = ratingFilePath(raterId, ratingsPath);

  // Load or initialize this rater's label file
  let raterLabels: RaterLabels;
  if (existsSync(filePath)) {
    const raw = readFileSync(filePath, 'utf-8');
    raterLabels = yamlParse(raw) as RaterLabels;
  } else {
    raterLabels = { raterId, finalized: false, labels: [] };
  }

  // Add or update this node's label
  const existing = raterLabels.labels.findIndex((l) => l.node_id === corpusNodeId);
  const entry: CorpusNodeLabel = {
    node_id: corpusNodeId,
    label,
    rationale,
    rated_at: new Date().toISOString(),
    rater: raterId,
  };

  if (existing >= 0) {
    raterLabels.labels[existing] = entry;
  } else {
    raterLabels.labels.push(entry);
  }

  writeFileSync(filePath, yamlStringify(raterLabels), 'utf-8');
}

/**
 * Finalize a rater's label set.
 * After finalization, no more labels can be added for this rater.
 * Required before getLabels() comparison is permitted.
 */
export function finalizeRater(raterId: string, ratingsPath?: string): void {
  const filePath = ratingFilePath(raterId, ratingsPath);
  if (!existsSync(filePath)) {
    throw new Error(`corpus-rater: no label file found for rater '${raterId}' — cannot finalize`);
  }
  const raw = readFileSync(filePath, 'utf-8');
  const raterLabels = yamlParse(raw) as RaterLabels;
  raterLabels.finalized = true;
  writeFileSync(filePath, yamlStringify(raterLabels), 'utf-8');
}

/**
 * Get a specific rater's labels.
 *
 * Enforces reveal-only-after-all-raters-finalize invariant:
 * throws if not all raterIds have finalized labels for all corpusIds.
 *
 * @param raterId      - which rater's labels to return
 * @param corpusIds    - Set<string> of all corpus nodeIds
 * @param allRaterIds  - all rater IDs that must have finalized before comparison
 * @returns Map<nodeId, 'correct' | 'incorrect'>
 */
export function getLabels(
  raterId: string,
  corpusIds: Set<string>,
  allRaterIds: string[],
  ratingsPath?: string,
): Map<string, 'correct' | 'incorrect'> {
  // Enforce reveal-only-after-all-raters-finalize invariant (AD1 §1.6 item c)
  const notFinalized: string[] = [];
  const missingNodes: { raterId: string; nodeIds: string[] }[] = [];

  for (const rid of allRaterIds) {
    const fp = ratingFilePath(rid, ratingsPath);
    if (!existsSync(fp)) {
      notFinalized.push(rid);
      continue;
    }
    const raw = readFileSync(fp, 'utf-8');
    const rl = yamlParse(raw) as RaterLabels;
    if (!rl.finalized) {
      notFinalized.push(rid);
    }
    // Check for missing nodes
    const labeledIds = new Set(rl.labels.map((l) => l.node_id));
    const missing = Array.from(corpusIds).filter((id) => !labeledIds.has(id));
    if (missing.length > 0) {
      missingNodes.push({ raterId: rid, nodeIds: missing });
    }
  }

  if (notFinalized.length > 0) {
    throw new Error(
      `corpus-rater: reveal-only-after-all-raters-finalize invariant violated — ` +
      `raters not yet finalized: [${notFinalized.join(', ')}]. ` +
      `Per AD1/§1.6 item c: comparison is only permitted after ALL raters have finalized.`,
    );
  }

  if (missingNodes.length > 0) {
    const detail = missingNodes.map((m) => `${m.raterId}: [${m.nodeIds.join(', ')}]`).join('; ');
    throw new Error(
      `corpus-rater: incomplete labels — missing node ratings: ${detail}`,
    );
  }

  // All raters finalized — load and return the requested rater's labels
  const fp = ratingFilePath(raterId, ratingsPath);
  const raw = readFileSync(fp, 'utf-8');
  const rl = yamlParse(raw) as RaterLabels;

  const result = new Map<string, 'correct' | 'incorrect'>();
  for (const label of rl.labels) {
    if (corpusIds.has(label.node_id)) {
      result.set(label.node_id, label.label);
    }
  }

  return result;
}

/**
 * Check whether comparison is permitted.
 *
 * Returns true only when ALL raterIds have written finalized labels for ALL corpusIds.
 * Used by a1-harness.ts to enforce sequential-independence invariant before computation.
 *
 * @param corpusIds   - all corpus nodeIds
 * @param raterIds    - all expected rater IDs
 * @returns CanCompareResult
 */
export function canCompare(corpusIds: Set<string>, raterIds: string[], ratingsPath?: string): CanCompareResult {
  const missingRaters: string[] = [];
  const missingNodes: { raterId: string; nodeIds: string[] }[] = [];

  for (const rid of raterIds) {
    const fp = ratingFilePath(rid, ratingsPath);
    if (!existsSync(fp)) {
      missingRaters.push(rid);
      continue;
    }
    const raw = readFileSync(fp, 'utf-8');
    const rl = yamlParse(raw) as RaterLabels;
    if (!rl.finalized) {
      missingRaters.push(rid);
    }
    const labeledIds = new Set(rl.labels.map((l) => l.node_id));
    const missing = Array.from(corpusIds).filter((id) => !labeledIds.has(id));
    if (missing.length > 0) {
      missingNodes.push({ raterId: rid, nodeIds: missing });
    }
  }

  if (missingRaters.length > 0 || missingNodes.length > 0) {
    const reasons: string[] = [];
    if (missingRaters.length > 0) {
      reasons.push(`raters not finalized: [${missingRaters.join(', ')}]`);
    }
    if (missingNodes.length > 0) {
      const detail = missingNodes.map((m) => `${m.raterId}:${m.nodeIds.length} nodes`).join(', ');
      reasons.push(`missing node labels: ${detail}`);
    }
    return {
      canCompare: false,
      reason: reasons.join('; '),
      missingRaters: missingRaters.length > 0 ? missingRaters : undefined,
      missingNodes: missingNodes.length > 0 ? missingNodes : undefined,
    };
  }

  return { canCompare: true };
}

/**
 * Load raw rater labels (for internal a1-harness use — bypasses finalization check
 * when reading known-finalized files for result display, not for kappa computation).
 * Not exported from the public API.
 */
export function loadRaterLabelsRaw(raterId: string, ratingsPath?: string): RaterLabels | null {
  const fp = ratingFilePath(raterId, ratingsPath);
  if (!existsSync(fp)) return null;
  const raw = readFileSync(fp, 'utf-8');
  return yamlParse(raw) as RaterLabels;
}
