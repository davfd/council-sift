/**
 * selection-rationale.ts — Semantic Memory V4 Selection Rationale Composer
 * Thread: E (iter4-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER4_RETRIEVE.md
 * Gate evidence: spec:S5:2, spec:IG5
 *
 * AD3: Selection rationale names ≥1 tracked criterion.
 * The 4 tracked criteria keywords (per executable-path-v4.md §4 row 4):
 *   recency / lifecycle state (lifecycleState) / confidenceScore / scope match (scopeMatch)
 *
 * composeRationale() returns a string naming at least 1 tracked criterion.
 * If the composed string names zero tracked criteria, the item is REJECTED
 * with an error thrown (per AD1 explainability contract).
 */

export interface RationaleContext {
  nodeId: string;
  lifecycleState: string;
  confidenceScore?: number;
  ingestTime?: string;           // used for recency ranking
  scopeMatch?: string;           // which scope authorized this result
  rankPosition?: number;         // position in ranked result set (1 = top)
  comparisonSetSize?: number;    // total candidates before ranking
}

/** The 4 tracked criteria keywords that must appear verbatim in rationale strings */
const TRACKED_CRITERIA_KEYWORDS = ['recency', 'lifecycleState', 'confidenceScore', 'scopeMatch'] as const;

/**
 * Compose a selection rationale string for a retrieval result item.
 * The rationale must name ≥1 of the 4 tracked criteria keywords.
 * Throws an error if no tracked criterion can be named.
 *
 * @param node         - node being returned
 * @param queryContext - query context (scope, filters)
 * @param comparisonSet - candidate nodes (for relative ranking context)
 * @returns Rationale string naming ≥1 tracked criterion
 * @throws Error if rationale would name zero tracked criteria
 */
export function composeRationale(
  node: RationaleContext,
  queryContext: { scope: string; asOf?: string; lifecycleFilter?: string[] },
  comparisonSet: RationaleContext[],
): string {
  const parts: string[] = [];

  // ── Criterion 1: recency ─────────────────────────────────────────────────
  if (node.ingestTime) {
    const isRecent = _isMoreRecentThan(node.ingestTime, comparisonSet);
    if (isRecent) {
      parts.push(`recency: node ingestTime=${node.ingestTime} is among the most recent in this scope`);
    } else {
      parts.push(`recency: node ingestTime=${node.ingestTime}`);
    }
  }

  // ── Criterion 2: lifecycleState ──────────────────────────────────────────
  if (node.lifecycleState) {
    parts.push(`lifecycleState: ${node.lifecycleState}`);
  }

  // ── Criterion 3: confidenceScore ─────────────────────────────────────────
  if (node.confidenceScore !== undefined) {
    parts.push(`confidenceScore: ${node.confidenceScore}`);
  }

  // ── Criterion 4: scopeMatch ──────────────────────────────────────────────
  if (queryContext.scope) {
    parts.push(`scopeMatch: authorized by scope ${queryContext.scope}`);
  }

  const rationale = parts.join('; ');

  // Reject if no tracked criteria appear in the rationale
  const hasTrackedCriterion = TRACKED_CRITERIA_KEYWORDS.some((kw) => rationale.includes(kw));
  if (!hasTrackedCriterion || rationale.trim().length === 0) {
    throw new Error(
      `selection-rationale: rationale for node ${node.nodeId} names zero tracked criteria — item REJECTED. ` +
      `Tracked criteria: ${TRACKED_CRITERIA_KEYWORDS.join(', ')}. ` +
      `Per executable-path-v4.md §4 row 4, selectionRationale must reference at least one criterion.`,
    );
  }

  return rationale;
}

/** Check if a node's ingestTime is more recent than the median of the comparison set */
function _isMoreRecentThan(ingestTime: string, comparisonSet: RationaleContext[]): boolean {
  if (comparisonSet.length === 0) return true;
  const times = comparisonSet
    .map((n) => n.ingestTime)
    .filter((t): t is string => t !== undefined)
    .sort();
  if (times.length === 0) return true;
  const median = times[Math.floor(times.length / 2)];
  return ingestTime >= median;
}
