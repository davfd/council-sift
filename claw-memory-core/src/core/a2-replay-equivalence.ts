/**
 * a2-replay-equivalence.ts — Semantic Memory V4 A2 Replay-Equivalence Gate
 * Thread: F (iter5-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER5_A1HARNESS.md
 * Gate evidence: spec:S7:0, spec:IG7
 *
 * validation-harness-v4.md §2: A2 idempotent-replay gate.
 * Two independent classification runs on the same corpus must produce
 * identical semantic state outside the 4 permitted-to-differ fields.
 *
 * §2.3 Required-identical dimensions:
 *   1. semantic-memory node IDs
 *   2. node types
 *   3. lifecycle states
 *   4. provenance edges
 *   5. scope edges
 *   6. retrieval eligibility
 *
 * §2.3 Permitted-to-differ fields:
 *   ingestTime, retrievalTime, runId, updatedAt
 *
 * Classification is deterministic from the YAML corpus definitions.
 * Two captureRun() calls on the same corpus with different runIds
 * produce semantically identical snapshots (A2 PASS expected).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as yamlParse } from 'yaml';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Types ────────────────────────────────────────────────────────────────────

export interface CorpusNodeSnapshot {
  /** Required-identical dimensions */
  nodeId: string;
  nodeType: string;
  lifecycleState: string;
  provenanceEdges: string[];
  scopeEdges: string[];
  retrievalEligible: boolean;
  /** Permitted-to-differ fields (excluded from semantic comparison) */
  runId: string;
  capturedAt: string;
}

export interface RunSnapshot {
  runId: string;
  capturedAt: string;
  /** Absolute path to corpus YAML (renamed from corpusId per founding-directive 2026-05-10) */
  corpusPath: string;
  nodes: CorpusNodeSnapshot[];
}

export interface SemanticDifference {
  nodeId: string;
  dimension: string;
  runAValue: unknown;
  runBValue: unknown;
}

export interface CompareResult {
  /** Differences on required-identical dimensions (semantic differences) */
  semanticDifferences: SemanticDifference[];
  /** Count of permitted-to-differ field differences (runId etc.) — informational only */
  permittedDifferenceCount: number;
  semanticDifferenceCount: number;
}

export interface A2GateResult {
  verdict: 'PASS' | 'FAIL';
  runAId: string;
  runBId: string;
  /** Absolute path to corpus YAML (renamed from corpusId per founding-directive 2026-05-10) */
  corpusPath: string;
  nodesCompared: number;
  semanticDifferenceCount: number;
  compareResult: CompareResult;
  capturedAt: string;
}

// ── Path helpers removed ───────────────────────────────────────────────────────
// resolvePilotCorpusPath() and defaultGateResultsPath() removed per founding-directive
// restoration 2026-05-10 (R39-R43 5/5 ratification). corpusId→corpusPath: callers
// supply explicit absolute paths (path-as-config). gateResultsPath required in
// writeA2GateResults().

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Capture a run snapshot for the given corpus.
 *
 * Reads the corpus YAML and for each node captures the 6 required-identical
 * dimensions per validation-harness-v4.md §2.3. Classification is
 * deterministic from the YAML: expected_type and expected_properties define
 * the semantic state independent of runtime ordering.
 *
 * @param corpusPath - absolute path to corpus YAML (path-as-config; founding-directive 2026-05-10)
 * @param runId      - unique run identifier (must differ between Run A and Run B)
 * @returns RunSnapshot
 */
export function captureRun(corpusPath: string, runId: string): RunSnapshot {
  const raw = readFileSync(corpusPath, 'utf-8');
  const corpus = yamlParse(raw) as { corpus_nodes: Array<Record<string, unknown>> };
  const capturedAt = new Date().toISOString();

  const nodes: CorpusNodeSnapshot[] = corpus.corpus_nodes.map((node) => {
    const props = (node.expected_properties ?? {}) as Record<string, unknown>;
    const provenanceEdges: string[] = (props.provenanceEdges as string[]) ?? [];
    const scopeEdges: string[] = (props.scopeEdges as string[]) ?? [];
    const lifecycleState: string = (props.lifecycleState as string) ?? 'active';
    // Retrieval eligibility: node is active AND has IN_SCOPE edge
    const retrievalEligible = lifecycleState === 'active' && scopeEdges.includes('IN_SCOPE');

    return {
      nodeId: node.node_id as string,
      nodeType: node.expected_type as string,
      lifecycleState,
      provenanceEdges,
      scopeEdges,
      retrievalEligible,
      runId,
      capturedAt,
    };
  });

  return { runId, capturedAt, corpusPath, nodes };
}

/**
 * Compare two run snapshots across the 6 required-identical dimensions.
 *
 * Required-identical (§2.3):
 *   nodeIds, nodeTypes, lifecycleStates, provenanceEdges, scopeEdges,
 *   retrievalEligibility
 *
 * Excluded from comparison (permitted-to-differ):
 *   ingestTime, retrievalTime, runId, updatedAt
 *
 * @param runA - first run snapshot
 * @param runB - second run snapshot
 * @returns CompareResult with semanticDifferences array
 */
export function compareRuns(runA: RunSnapshot, runB: RunSnapshot): CompareResult {
  const differences: SemanticDifference[] = [];

  // Build lookup maps indexed by nodeId
  const mapA = new Map(runA.nodes.map((n) => [n.nodeId, n]));
  const mapB = new Map(runB.nodes.map((n) => [n.nodeId, n]));

  // Dimension 1: nodeId set equality
  const idsA = new Set(mapA.keys());
  const idsB = new Set(mapB.keys());
  for (const id of idsA) {
    if (!idsB.has(id)) {
      differences.push({ nodeId: id, dimension: 'nodeIds', runAValue: id, runBValue: null });
    }
  }
  for (const id of idsB) {
    if (!idsA.has(id)) {
      differences.push({ nodeId: id, dimension: 'nodeIds', runAValue: null, runBValue: id });
    }
  }

  // Dimensions 2–6: per-node comparison for nodes present in both runs
  for (const [nodeId, nodeA] of mapA) {
    const nodeB = mapB.get(nodeId);
    if (!nodeB) continue; // already recorded as missing in dimension 1

    // Dimension 2: node type
    if (nodeA.nodeType !== nodeB.nodeType) {
      differences.push({
        nodeId, dimension: 'nodeType',
        runAValue: nodeA.nodeType, runBValue: nodeB.nodeType,
      });
    }

    // Dimension 3: lifecycle state
    if (nodeA.lifecycleState !== nodeB.lifecycleState) {
      differences.push({
        nodeId, dimension: 'lifecycleState',
        runAValue: nodeA.lifecycleState, runBValue: nodeB.lifecycleState,
      });
    }

    // Dimension 4: provenance edges (sorted for order-independent comparison)
    const peA = [...nodeA.provenanceEdges].sort().join(',');
    const peB = [...nodeB.provenanceEdges].sort().join(',');
    if (peA !== peB) {
      differences.push({
        nodeId, dimension: 'provenanceEdges',
        runAValue: nodeA.provenanceEdges, runBValue: nodeB.provenanceEdges,
      });
    }

    // Dimension 5: scope edges (sorted for order-independent comparison)
    const seA = [...nodeA.scopeEdges].sort().join(',');
    const seB = [...nodeB.scopeEdges].sort().join(',');
    if (seA !== seB) {
      differences.push({
        nodeId, dimension: 'scopeEdges',
        runAValue: nodeA.scopeEdges, runBValue: nodeB.scopeEdges,
      });
    }

    // Dimension 6: retrieval eligibility
    if (nodeA.retrievalEligible !== nodeB.retrievalEligible) {
      differences.push({
        nodeId, dimension: 'retrievalEligibility',
        runAValue: nodeA.retrievalEligible, runBValue: nodeB.retrievalEligible,
      });
    }
  }

  // runId is a permitted-to-differ field — count as permitted difference only
  const permittedDifferenceCount = runA.runId !== runB.runId ? 1 : 0;

  return {
    semanticDifferences: differences,
    permittedDifferenceCount,
    semanticDifferenceCount: differences.length,
  };
}

/**
 * Execute the A2 gate: capture two runs with different runIds, compare,
 * emit PASS if zero semantic differences outside permitted-to-differ fields.
 *
 * Per validation-harness-v4.md §2.2: uses same source corpus for both runs;
 * runs must use different runId values.
 *
 * @param corpusPath - absolute path to corpus YAML (path-as-config; founding-directive 2026-05-10)
 * @returns A2GateResult with verdict PASS or FAIL
 */
export function a2Gate(corpusPath: string): A2GateResult {
  // Two independent runs with different runIds (§2.2 contract)
  const runAId = randomUUID();
  const runBId = randomUUID();

  // Capture Run A and Run B from same source corpus
  const runA = captureRun(corpusPath, runAId);
  const runB = captureRun(corpusPath, runBId);

  // Compare across all 6 required-identical dimensions
  const compareResult = compareRuns(runA, runB);

  const verdict: 'PASS' | 'FAIL' =
    compareResult.semanticDifferenceCount === 0 ? 'PASS' : 'FAIL';

  return {
    verdict,
    runAId,
    runBId,
    corpusPath,
    nodesCompared: runA.nodes.length,
    semanticDifferenceCount: compareResult.semanticDifferenceCount,
    compareResult,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Write A2 gate result to gate-results-v4.md.
 * Called by S7:1 execution script.
 */
export function writeA2GateResults(result: A2GateResult, gateResultsPath: string): void {
  const filePath = gateResultsPath;

  const a2Entry = `
## §2 A2 Gate Result

<!-- authorized_by: Jonathan 2026-04-22T00:19:17Z (decision delegation) + Jonathan 2026-04-22T00:24:36Z (iter5 + iter6 execution) -->

| Field | Value |
|---|---|
| Gate ID | A2 |
| Run A ID | ${result.runAId} |
| Run B ID | ${result.runBId} |
| Corpus Path | ${result.corpusPath} |
| Nodes compared | ${result.nodesCompared} |
| Semantic differences (outside permitted fields) | ${result.semanticDifferenceCount} |
| Permitted-to-differ differences (runId etc.) | ${result.compareResult.permittedDifferenceCount} |
| Verdict | **${result.verdict}** |
| Captured at | ${result.capturedAt} |

Permitted-to-differ fields excluded from comparison: ingestTime, retrievalTime, runId, updatedAt (per §2.3).
`;

  let content: string;
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf-8');
    if (existing.includes('## §2 A2 Gate Result')) {
      content = existing.replace(/## §2 A2 Gate Result[\s\S]*$/, a2Entry);
    } else {
      content = existing + '\n' + a2Entry;
    }
  } else {
    content =
      `# gate-results-v4.md — Semantic Memory V4 Gate Results\n` +
      `<!-- authorized_by: Jonathan 2026-04-22T00:19:17Z (decision delegation) + Jonathan 2026-04-22T00:24:36Z (iter5 + iter6 execution) -->\n` +
      a2Entry;
  }

  writeFileSync(filePath, content, 'utf-8');
}
