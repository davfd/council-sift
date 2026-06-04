/**
 * exclusion-filter.ts — Semantic Memory V4 Retrieval Exclusion Filter
 * Thread: E (iter4-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER4_RETRIEVE.md
 * Gate evidence: spec:S5:1, spec:S6:6, spec:IG6
 *
 * Enforces all 4 default exclusions per executable-path-v4.md §5:
 *
 *   (1) private — ABSOLUTE: nodes caller lacks IN_SCOPE for. No query-parameter override.
 *   (2) superseded — ABSOLUTE in current-recall. PiT override: if supersessionTime > asOf,
 *       include node (it was valid at asOf per time-governance §1.4, §2.1-§2.2).
 *   (3) low-confidence inference — InferredMemory with confidenceScore < 0.60 excluded.
 *       EXACT threshold: 0.59 excluded, 0.60 included. Override-eligible per-scope only.
 *   (4) out-of-scope — ABSOLUTE: no IN_SCOPE edge matching caller's authorized scopes.
 *
 * Each exclusion emits a structured filter-audit log entry.
 */

// MemoryNode extracted to types/index.ts per EXT-M6 (PN-EXT-2 types consolidation).
// Re-exported here to preserve call-site `from './exclusion-filter.js'` imports.
import type { MemoryNode } from '../types/index.js';
export type { MemoryNode };

export interface FilterAuditEntry {
  nodeId: string;
  excludedBy: 'private' | 'superseded' | 'low_confidence' | 'out_of_scope';
  reason: string;
  asOf?: string;
}

export interface FilterResult {
  included: MemoryNode[];
  excluded: MemoryNode[];
  auditLog: FilterAuditEntry[];
}

/**
 * Apply all 4 default exclusion rules to a candidate node set.
 *
 * @param nodes        - candidate memory nodes to filter
 * @param asOf         - ISO-8601 point-in-time (optional; if absent, current-recall mode)
 * @returns FilterResult with included/excluded sets and structured audit log
 */
export function applyExclusionFilters(
  nodes: MemoryNode[],
  asOf?: string,
): FilterResult {
  const included: MemoryNode[] = [];
  const excluded: MemoryNode[] = [];
  const auditLog: FilterAuditEntry[] = [];

  for (const node of nodes) {
    const exclusion = _checkExclusions(node, asOf);
    if (exclusion) {
      excluded.push(node);
      auditLog.push({
        nodeId: node.nodeId,
        excludedBy: exclusion.type,
        reason: exclusion.reason,
        asOf,
      });
    } else {
      included.push(node);
    }
  }

  return { included, excluded, auditLog };
}

/** Check all 4 exclusion rules; return first matching exclusion or null if none */
function _checkExclusions(
  node: MemoryNode,
  asOf?: string,
): { type: FilterAuditEntry['excludedBy']; reason: string } | null {

  // ── Exclusion (1): private ────────────────────────────────────────────────
  // ABSOLUTE — no query-parameter override. Caller must have explicit IN_SCOPE.
  if (node.isPrivate) {
    return {
      type: 'private',
      reason: `node ${node.nodeId} is in a private scope the caller lacks IN_SCOPE authorization for (§5 row 1 — absolute, no query-parameter override)`,
    };
  }

  // ── Exclusion (4): out-of-scope ───────────────────────────────────────────
  // ABSOLUTE — no IN_SCOPE edge matching caller's authorized scopes.
  // Checked before (2) and (3) since scope is prerequisite for any result.
  const hasMatchingScope = node.scopeNodeIds.some((sid) =>
    node.callerScopeNodeIds.includes(sid),
  );
  if (!hasMatchingScope) {
    return {
      type: 'out_of_scope',
      reason: `node ${node.nodeId} has no IN_SCOPE edge matching caller's authorized scopes (§5 row 4 — absolute)`,
    };
  }

  // ── Exclusion (2): superseded ─────────────────────────────────────────────
  // ABSOLUTE in current-recall (asOf absent).
  // PiT override: if supersessionTime > asOf, node was valid at asOf — INCLUDE it.
  if (node.lifecycleState === 'superseded') {
    if (!asOf) {
      // Current-recall: superseded nodes always excluded (absolute)
      return {
        type: 'superseded',
        reason: `node ${node.nodeId} has lifecycleState=superseded; excluded from current-recall results (§5 row 2 — absolute in current-recall)`,
      };
    }
    // PiT mode: check supersessionTime > asOf
    if (node.supersessionTime && node.supersessionTime <= asOf) {
      // supersessionTime <= asOf means it was already superseded at asOf — exclude
      return {
        type: 'superseded',
        reason: `node ${node.nodeId} supersessionTime=${node.supersessionTime} <= asOf=${asOf}; node was superseded before the query timestamp (§5 row 2 PiT semantics)`,
      };
    }
    // supersessionTime > asOf: node was valid at asOf — include (no return = include)
  }

  // ── Exclusion (3): low-confidence inference ───────────────────────────────
  // InferredMemory with confidenceScore < 0.60 excluded.
  // EXACT threshold: 0.59 excluded, 0.60 included (strict less-than).
  const isInferred = node.labels.includes('InferredMemory');
  if (isInferred && node.confidenceScore !== undefined) {
    if (node.confidenceScore < 0.60) {
      // Strict less-than: 0.59 excluded, 0.60 included
      return {
        type: 'low_confidence',
        reason: `InferredMemory node ${node.nodeId} confidenceScore=${node.confidenceScore.toFixed(2)} < 0.60; excluded by default (§5 row 3 — exact threshold: 0.59 excluded, 0.60 included)`,
      };
    }
  }

  return null; // node passes all exclusion checks — include it
}
