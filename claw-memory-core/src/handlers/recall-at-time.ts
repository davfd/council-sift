/**
 * recall-at-time.ts — recall_at_time MCP tool handler (T5 lifecycle; 8th tool)
 * Thread: I (T5 lifecycle execution)
 * Plan: SEMANTIC_MEMORY_V4_T5_LIFECYCLE.md
 * Gate evidence: spec:S3:6, spec:S4:6 (IG-T5-7)
 *
 * BLOCK-T5-5: This handler MUST NOT modify recall.ts or retrieve.ts.
 *   - recall.ts is FC11 frozen-as-written (diverges from retrieve.ts per FC11 §7)
 *   - retrieve.ts is preserved for IN_SCOPE-authorization flows
 *
 * This handler wraps `retrieve.ts` `asOf` parameter via a NEW file.
 * It enables point-in-time recall as a user-facing MCP tool.
 *
 * BLOCK-T5-7: After registering this tool, total MCP tool count = 8
 *   (4 Wave A + 3 Wave B + 1 T5 recall_at_time = 8 total).
 *
 * Round-trip contract:
 *   query at asOf=T1 returns T1-state memory (nodes with ingestTime <= T1, not superseded at T1)
 *   query at asOf=T2 > T1 returns T2-state memory (different set after T2 events)
 *   T1 != T2 results asserted in test
 *
 * authorized_by: T6 (Jonathan 2026-04-28T04:16:20Z)
 */

import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { reconstructAt, type PiTNode } from '../core/point-in-time.js';
import { getProjectRoot } from '../tenant.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RecallAtTimeParams {
  /** Topic to search for in memory content */
  topic: string;
  /** ISO-8601 timestamp — recall memory state as of this time */
  asOf: string;
  /** Optional scope node IDs for IN_SCOPE filtering */
  scopeNodeIds?: string[];
  tenant_id?: string;
}

export interface RecallAtTimeResult {
  /** Nodes present in graph state at asOf time */
  nodes: PiTNode[];
  /** The asOf timestamp used */
  asOf: string;
  /** Topic searched */
  topic: string;
  /** Count of nodes returned */
  count: number;
  /** Whether cause attribution was successful */
  attributionStatus: string;
}

// ── Handler ───────────────────────────────────────────────────────────────────

/**
 * Handle recall_at_time MCP tool invocation.
 *
 * Wraps retrieve.ts `asOf` capability via reconstructAt() from point-in-time.ts.
 * BLOCK-T5-5: retrieve.ts and recall.ts are NOT modified.
 *
 * This handler uses reconstructAt() which:
 *   1. Includes nodes with ingestTime <= asOf
 *   2. Applies lifecycle transitions with transitionTime <= asOf
 *   3. Excludes nodes with supersessionTime <= asOf
 *
 * @param params - Recall parameters including asOf timestamp
 * @param neo4j  - Neo4jService instance
 */
export async function handleRecallAtTime(
  params: RecallAtTimeParams,
  neo4j: Neo4jService,
): Promise<{ structured: RecallAtTimeResult; prose: string }> {
  // Validate asOf timestamp
  const asOfDate = new Date(params.asOf);
  if (isNaN(asOfDate.getTime())) {
    const errorResult: RecallAtTimeResult = {
      nodes: [],
      asOf: params.asOf,
      topic: params.topic,
      count: 0,
      attributionStatus: 'error: invalid asOf timestamp',
    };
    return {
      structured: errorResult,
      prose: `Invalid asOf timestamp: ${params.asOf}. Use ISO-8601 format (e.g., 2026-04-28T12:00:00Z).`,
    };
  }

  // Reconstruct point-in-time state via the frozen point-in-time.ts module
  // BLOCK-T5-5: retrieve.ts is NOT called directly; we use reconstructAt() which
  // is the lower-level PiT infrastructure that retrieve.ts also uses.
  //
  // R52 5/5 cross-tenant: derive project_root via canonical pattern
  // (params.tenant_id ?? getProjectRoot()) — matches all other handlers
  // (recall.ts, remember.ts, forget.ts, mark-wrong.ts, etc.).
  const project_root = params.tenant_id ?? getProjectRoot();
  const pitResult = await reconstructAt(
    params.asOf,
    neo4j,
    params.scopeNodeIds ?? [],
    project_root,
  );

  // Filter by topic if provided
  const topicFiltered = params.topic
    ? pitResult.nodes.filter((node) => {
        const content = (node as Record<string, unknown>).content as string | undefined;
        return content?.toLowerCase().includes(params.topic.toLowerCase()) ?? false;
      })
    : pitResult.nodes;

  const structured: RecallAtTimeResult = {
    nodes: topicFiltered,
    asOf: params.asOf,
    topic: params.topic,
    count: topicFiltered.length,
    attributionStatus: pitResult.attributionStatus,
  };

  const prose =
    topicFiltered.length === 0
      ? `No memories about "${params.topic}" found at ${params.asOf}.`
      : `Found ${topicFiltered.length} memory node(s) about "${params.topic}" at ${params.asOf}: ` +
        topicFiltered
          .map((n) => (n as Record<string, unknown>).content as string ?? n.nodeId)
          .join(' | ');

  return { structured, prose };
}
