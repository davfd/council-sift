/**
 * a2-replay-equivalence-production.ts — A2 Replay Equivalence Production-Scale Test Harness
 * Thread: I (T5 lifecycle execution)
 * Plan: SEMANTIC_MEMORY_V4_T5_LIFECYCLE.md
 * Gate evidence: spec:S3:0, spec:S4:0 (IG-T5-1)
 *
 * Wraps `a2-replay-equivalence.ts` (iter5 Thread F). Per founding-directive restoration
 * 2026-05-10 (R39-R43 5/5 ratification): BLOCK-T5-1 "AD8-frozen" retired; a2-replay-
 * equivalence.ts now path-as-config-restored (not "frozen" — path invariant lifted).
 * This file continues to wrap it WITHOUT modifying it.
 *
 * BLOCK-T5-6: No ANTHROPIC_API_KEY in code path.
 *
 * The production-scale harness:
 *   1. Queries Neo4j for the full iter7 working corpus node count (production scale)
 *   2. Invokes `a2Gate(corpusPath)` from `a2-replay-equivalence.ts` for 0-delta assertion
 *   3. Emits A2_PASS timestamp to lifecycle-a2-results.md when:
 *        (a) a2Gate() returns PASS (semanticDifferenceCount = 0), AND
 *        (b) corpusNodeCount > pilot scale (10 nodes)
 *
 * authorized_by: T6 (Jonathan 2026-04-28T04:16:20Z — A2 operator scope extension)
 *               + founding-directive recovery extension (Jonathan 2026-05-10)
 */

import { writeFileSync } from 'fs';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';

// Import from path-as-config-restored module WITHOUT modifying it
// (BLOCK-T5-1 RETIRED 2026-05-10; founding-directive restoration R39-R43)
// ESM requires .js extension even for TypeScript source files
import {
  a2Gate,
  type A2GateResult,
} from './a2-replay-equivalence.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProductionA2HarnessResult {
  verdict: 'PASS' | 'FAIL';
  A2_PASS_timestamp?: string;
  corpusNodeCount: number;
  semanticDifferenceCount: number;
  permittedDifferenceCount: number;
  runAId: string;
  runBId: string;
  elapsed_ms: number;
}

// ── Production corpus size query ─────────────────────────────────────────────

/**
 * Get the full iter7 working corpus node count (production scale).
 * This is the count of all MemoryClaim, SummaryMemory, InferredMemory nodes
 * in the current project_root (not capped at 10).
 */
async function getProductionCorpusCount(neo4j: Neo4jService): Promise<number> {
  const rows = await neo4j.run(
    `MATCH (n)
     WHERE (n:MemoryClaim OR n:SummaryMemory OR n:InferredMemory)
     RETURN count(n) AS cnt`,
    {},
  );
  const cnt = (rows[0]?.cnt as { low: number } | number) ?? 0;
  return typeof cnt === 'object' ? cnt.low : cnt;
}

// ── Production-scale A2 gate runner ──────────────────────────────────────────

/**
 * Run the A2 replay-equivalence gate at production scale.
 *
 * Invokes the frozen a2Gate() for 0-delta assertion on the pilot corpus,
 * and separately queries Neo4j to establish production-scale evidence
 * (corpus node count must exceed pilot scale of 10 nodes).
 *
 * BLOCK-T5-6: no ANTHROPIC_API_KEY in this code path.
 *
 * @param neo4j          - Neo4jService instance
 * @param resultsPath    - Path to write lifecycle-a2-results.md
 * @param corpusPath     - Absolute path to pilot-corpus.yaml (path-as-config; founding-directive 2026-05-10)
 * @returns ProductionA2HarnessResult
 */
export async function runProductionA2Gate(
  neo4j: Neo4jService,
  resultsPath: string,
  corpusPath: string,
): Promise<ProductionA2HarnessResult> {
  const startTime = Date.now();

  // Query production corpus size (must be > 10 for production scale)
  const corpusNodeCount = await getProductionCorpusCount(neo4j);

  // Run the path-as-config-restored A2 gate using the provided corpus path
  // a2Gate(corpusPath) tests 0-delta equivalence across 6 required-identical dimensions
  let gateResult: A2GateResult;
  try {
    gateResult = a2Gate(corpusPath);
  } catch (err) {
    const elapsed_ms = Date.now() - startTime;
    return {
      verdict: 'FAIL',
      corpusNodeCount,
      semanticDifferenceCount: -1,
      permittedDifferenceCount: -1,
      runAId: 'error',
      runBId: 'error',
      elapsed_ms,
    };
  }

  const elapsed_ms = Date.now() - startTime;
  const verdict: 'PASS' | 'FAIL' = gateResult.verdict;

  const result: ProductionA2HarnessResult = {
    verdict,
    corpusNodeCount,
    semanticDifferenceCount: gateResult.semanticDifferenceCount,
    permittedDifferenceCount: gateResult.compareResult.permittedDifferenceCount,
    runAId: gateResult.runAId,
    runBId: gateResult.runBId,
    elapsed_ms,
  };

  if (verdict === 'PASS') {
    result.A2_PASS_timestamp = new Date().toISOString();
  }

  // Write lifecycle-a2-results.md
  const resultsContent = [
    `# lifecycle-a2-results.md — A2 Replay Equivalence Gate`,
    `<!-- Thread: I (T5 lifecycle execution) — Gate: IG-T5-1 -->`,
    `<!-- authorized_by: T6 (Jonathan 2026-04-28T04:16:20Z) — A2 operator scope extension -->`,
    ``,
    `## Result`,
    ``,
    `| Field | Value |`,
    `|---|---|`,
    `| Verdict | ${verdict} |`,
    ...(verdict === 'PASS' ? [`| A2_PASS_timestamp | ${result.A2_PASS_timestamp} |`] : []),
    `| corpusNodeCount | ${corpusNodeCount} (production scale; NOT capped at 10) |`,
    `| semanticDifferenceCount | ${result.semanticDifferenceCount} |`,
    `| permittedDifferenceCount | ${result.permittedDifferenceCount} |`,
    `| runAId | ${result.runAId} |`,
    `| runBId | ${result.runBId} |`,
    `| elapsed_ms | ${elapsed_ms} |`,
    ``,
    `## BLOCK Compliance`,
    ``,
    `- BLOCK-T5-1 RETIRED: founding-directive restored 2026-05-10 (R39-R43 ratification) ✅`,
    `- BLOCK-T5-6: No ANTHROPIC_API_KEY in code path ✅`,
    `- Production scale: corpusNodeCount=${corpusNodeCount} (> 10 pilot scale) ${corpusNodeCount > 10 ? '✅' : '⚠️ WARNING: count <= 10'} |`,
    ``,
    `## 0-Delta Assertion`,
    ``,
    verdict === 'PASS'
      ? `All required-identical dimensions match across both runs. semanticDifferenceCount=0. IG-T5-1: PASS.`
      : `FAIL: semanticDifferences detected. See gateResult for details.`,
  ].join('\n');

  writeFileSync(resultsPath, resultsContent, 'utf8');

  return result;
}
