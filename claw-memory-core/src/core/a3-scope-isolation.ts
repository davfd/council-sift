/**
 * a3-scope-isolation.ts — A3 Scope Isolation CI Gate
 * Thread: I (T5 lifecycle execution)
 * Plan: SEMANTIC_MEMORY_V4_T5_LIFECYCLE.md
 * Gate evidence: spec:S3:1, spec:S4:1 (IG-T5-2)
 *
 * Generates red-team probes AUTOMATICALLY from the scope schema.
 * CI gate fails if any probe returns cross-scope data.
 *
 * BLOCK-T5-6: No ANTHROPIC_API_KEY in CI gate code path.
 *
 * Probe generation is schema-driven — probes are derived programmatically
 * from the list of active project_root values in the graph. This is automatic
 * (not hand-authored).
 *
 * Zero-operator-labor: gate fires automatically; no operator input required.
 *
 * authorized_by: T6 (Jonathan 2026-04-28T04:16:20Z)
 */

import { Neo4jService } from '../storage/neo4j/neo4j.service.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScopeProbe {
  /** The project_root being probed — should be isolated */
  targetProjectRoot: string;
  /** Other project_root values that must NOT appear in query results */
  forbiddenProjectRoots: string[];
}

export interface ProbeResult {
  probe: ScopeProbe;
  /** true = probe PASSED (0 cross-scope data returned) */
  passed: boolean;
  leakageCount: number;
  leakedNodeIds?: string[];
}

export interface A3GateResult {
  verdict: 'PASS' | 'FAIL';
  probeCount: number;
  passedCount: number;
  failedCount: number;
  probeResults: ProbeResult[];
  leakageDetected: boolean;
}

// ── Schema-derived probe generation ──────────────────────────────────────────

/**
 * Generate red-team probes automatically from the scope schema.
 *
 * Probes are derived from the set of distinct project_root values in the graph.
 * For each project_root, a probe asserts that querying it returns ONLY nodes
 * belonging to that project_root (0 cross-scope nodes).
 *
 * Probe count >= minimum derived from scope schema (Uriel verifies against actual schema).
 *
 * @param neo4j - Neo4jService instance
 * @returns ScopeProbe[] — auto-generated from live graph schema
 */
export async function generateProbesFromSchema(neo4j: Neo4jService): Promise<ScopeProbe[]> {
  // Get all distinct project_root values from the graph (schema-derived)
  const rows = await neo4j.run(
    `MATCH (n)
     WHERE n.project_root IS NOT NULL
     RETURN DISTINCT n.project_root AS project_root`,
    {},
  );

  const projectRoots = rows.map((r) => r.project_root as string).filter(Boolean);

  if (projectRoots.length === 0) {
    // No project roots in schema — return empty probe set (gate vacuously passes)
    return [];
  }

  // Generate one probe per project_root
  // Each probe: query THIS project_root; confirm NO other project_root nodes appear
  return projectRoots.map((targetRoot) => ({
    targetProjectRoot: targetRoot,
    forbiddenProjectRoots: projectRoots.filter((r) => r !== targetRoot),
  }));
}

// ── Probe execution ───────────────────────────────────────────────────────────

/**
 * Execute a single scope isolation probe.
 *
 * Simulates a D-W8 auto-capture query for the target project_root and asserts
 * that no nodes from forbidden project_roots appear in the results.
 *
 * @param probe - The probe to execute
 * @param neo4j - Neo4jService instance
 * @returns ProbeResult
 */
export async function executeProbe(probe: ScopeProbe, neo4j: Neo4jService): Promise<ProbeResult> {
  if (probe.forbiddenProjectRoots.length === 0) {
    // Only one project_root in schema — no cross-scope risk; probe passes vacuously
    return { probe, passed: true, leakageCount: 0 };
  }

  // Query: within the target scope, are any forbidden-scope nodes accessible?
  const rows = await neo4j.run(
    `MATCH (n)
     WHERE n.project_root = $targetRoot
       AND (n:MemoryClaim OR n:SummaryMemory OR n:InferredMemory)
       AND n.lifecycleState IN ['active', 'disputed']
     WITH n
     MATCH (leaked)
     WHERE leaked.project_root IN $forbiddenRoots
       AND (leaked:MemoryClaim OR leaked:SummaryMemory OR leaked:InferredMemory)
       AND (leaked)-[:DERIVED_FROM*0..3]-(n)
     RETURN leaked.nodeId AS leakedNodeId
     LIMIT 50`,
    {
      targetRoot: probe.targetProjectRoot,
      forbiddenRoots: probe.forbiddenProjectRoots,
    },
  );

  const leakedNodeIds = rows.map((r) => r.leakedNodeId as string).filter(Boolean);

  return {
    probe,
    passed: leakedNodeIds.length === 0,
    leakageCount: leakedNodeIds.length,
    ...(leakedNodeIds.length > 0 ? { leakedNodeIds } : {}),
  };
}

// ── CI gate ───────────────────────────────────────────────────────────────────

/**
 * Run the A3 scope isolation CI gate.
 *
 * Auto-generates probes from schema, executes each probe, and fails the gate
 * if any probe detects cross-scope leakage.
 *
 * CI gate wiring: this function throws if leakage is detected (CI fail behavior).
 * Zero-operator-labor: no operator input required.
 * BLOCK-T5-6: no ANTHROPIC_API_KEY in code path.
 *
 * @param neo4j - Neo4jService instance
 * @returns A3GateResult
 * @throws Error if leakage detected (CI gate fail)
 */
export async function runA3Gate(neo4j: Neo4jService): Promise<A3GateResult> {
  // Generate probes automatically from schema
  const probes = await generateProbesFromSchema(neo4j);

  if (probes.length === 0) {
    return {
      verdict: 'PASS',
      probeCount: 0,
      passedCount: 0,
      failedCount: 0,
      probeResults: [],
      leakageDetected: false,
    };
  }

  // Execute all probes
  const probeResults = await Promise.all(probes.map((p) => executeProbe(p, neo4j)));

  const failedResults = probeResults.filter((r) => !r.passed);
  const leakageDetected = failedResults.length > 0;

  const result: A3GateResult = {
    verdict: leakageDetected ? 'FAIL' : 'PASS',
    probeCount: probes.length,
    passedCount: probeResults.filter((r) => r.passed).length,
    failedCount: failedResults.length,
    probeResults,
    leakageDetected,
  };

  // CI gate behavior: throw on leakage (gate fails the CI pipeline)
  if (leakageDetected) {
    const failedProbes = failedResults
      .map((r) => `${r.probe.targetProjectRoot}: ${r.leakageCount} leaked nodes`)
      .join('; ');
    throw new Error(
      `A3 scope isolation CI GATE FAILED: cross-scope leakage detected. ` +
      `Failed probes: ${failedProbes}`,
    );
  }

  return result;
}
