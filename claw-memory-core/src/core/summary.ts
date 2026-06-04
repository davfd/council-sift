/**
 * summary.ts — Bounded per-claim excerpt generation
 *
 * SLO context (a6-slo-gates.ts SLO_MAX_TOKENS = 4500 with SLO_MAX_ITEMS = 12):
 *   Budget per item: 4500 tokens / 12 items = 375 tokens/item.
 *   At ~4 chars/token: 1500 chars/item theoretical max.
 *   Including 11-char join(' ') separator overhead in measureProductionLatency:
 *     12 × N chars + 11 ≤ 18000 → N ≤ 1499 chars (zero margin)
 *
 * SUMMARY_MAX_CHARS = 400 chosen for 73% SLO headroom:
 *   12 × 400 + 11 = 4811 chars / 4 = 1203 tokens (vs 4500 budget)
 *
 * Council R2 convergence 2026-05-11:
 *   - 4/5 seats (Jeremiel, Zadkiel, Jophiel, Raguel) chose 400; Barachiel 500.
 *   - Simple slice + '...' suffix (sentence-boundary withdrawn by Jophiel).
 *   - Deterministic, BLOCK-6 + BLOCK-T5-6 compliant (zero API key dependency).
 *
 * Used by:
 *   - remember.ts (write-time, populates `summary` property on MemoryClaim)
 *   - recall.ts COALESCE fallback (`LEFT(n.content, 400)` for 1,460 pre-existing nodes)
 *   - a6-slo-gates.ts measurement query (same COALESCE pattern)
 *
 * authorized_by: Jonathan 2026-05-11 (R2 5/5 convergence ratification)
 */

/**
 * Maximum length of the bounded summary slice, in characters.
 * Output may be up to SUMMARY_MAX_CHARS + 3 when truncated (slice + '...' suffix).
 * Token budget arithmetic: 12 × 403 + 11 (join separators) = 4847 chars = 1212 tokens.
 * SLO headroom: 73% under SLO_MAX_TOKENS = 4500.
 */
export const SUMMARY_MAX_CHARS = 400;

/**
 * Generate a bounded summary excerpt from content.
 *
 * Deterministic prefix-slice with '...' suffix when truncated.
 * Output guarantee: output.length <= SUMMARY_MAX_CHARS + 3 (suffix overhead).
 *
 * When content.length <= SUMMARY_MAX_CHARS, returns content unchanged (summary === content).
 *
 * @param content - Full memory content
 * @returns Bounded excerpt (≤ 403 chars)
 */
export function generateSummary(content: string): string {
  if (content.length <= SUMMARY_MAX_CHARS) return content;
  return content.slice(0, SUMMARY_MAX_CHARS) + '...';
}
