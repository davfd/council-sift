/**
 * list-memories.ts — list_memories MCP primitive handler (T9.2)
 * Thread: T9 (claw-memory Architecture Extensions)
 * Plan: SEMANTIC_MEMORY_V4_T9_EXTENSIONS.md
 * Gate evidence: spec:S3:1 (task:S3:1), gate:S5:1 (IG-T9-2)
 *
 * Paginated Cypher MATCH scoped to project_root with optional filter params.
 * Returns StructuredMemoryPayload[].
 * Visibility filter uses caller_seat derived from source_identity (PN-5(a) path (ii)).
 *
 * BLOCK-T9-3: This handler is the only new tool addition authorized by T9 grant.
 *             Total tool count after registration = 9 (4+3+1+1=9).
 * authorized_by: Jonathan 2026-04-29T01:45:25Z (T9 — claw-memory Architecture Extensions; T9.2 list_memories)
 */

// BLOCK-iter8-1 E0 call site (b): import { existsSync } from 'fs' REMOVED; classifySource replaces inline existsSync block at lines 105-110.
// authorized_by: T7 (Jonathan 2026-04-30T21:33:01Z — iter8 charter E0 call site b; spec:S1:2)
// + 5/5 council Round 1 RATIFIED 2026-05-01T00:51-00:53Z UTC (Jophiel+Jeremiel+Barachiel+Raguel+Zadkiel)
import { classifySource } from '../core/source-classifier.js';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { getProjectRoot } from '../tenant.js';
import { emitTelemetry } from '../telemetry/index.js';
import type { StructuredMemoryPayload } from './recall.js';

export async function handleListMemories(
  params: {
    lifecycleState?: string[];
    visibility?: 'council-shared' | 'seat-private';
    owner_seat?: string;
    source_identity?: string;
    limit?: number;
    offset?: number;
    tenant_id?: string;
    topic?: string;
  },
  neo4j: Neo4jService,
): Promise<{ structured: StructuredMemoryPayload[]; prose: string }> {
  const project_root = params.tenant_id ?? getProjectRoot();
  const limit = Math.max(1, Math.min(100, params.limit ?? 20));
  const offset = Math.max(0, params.offset ?? 0);
  const ts = new Date().toISOString();

  emitTelemetry({
    event: 'mem_list_memories_query',
    ...(params.visibility ? { visibility: params.visibility } : {}),
    ...(params.topic ? { topic_filter: true } : {}),
    limit,
    offset,
    ts,
  });

  // PN-5(a) path (ii): derive caller_seat from source_identity via prefix-stripping
  // Fail-closed: absent or non-prefixed → caller_seat null → seat-private OR-branch false
  const caller_seat = params.source_identity?.startsWith('council-seat:')
    ? params.source_identity.slice('council-seat:'.length)
    : undefined;

  // Build lifecycle state filter — default to all meaningful states when absent
  const stateFilter = params.lifecycleState && params.lifecycleState.length > 0
    ? params.lifecycleState
    : ['active', 'disputed', 'superseded', 'archived', 'incorrect'];

  // Build visibility filter clause
  let visibilityClause: string;
  if (params.visibility === 'council-shared') {
    // Caller explicitly wants only council-shared memories
    visibilityClause = `AND n.visibility = 'council-shared'`;
  } else if (params.visibility === 'seat-private') {
    // Caller explicitly wants only seat-private memories (scoped to caller_seat if derivable)
    visibilityClause = caller_seat
      ? `AND n.visibility = 'seat-private' AND n.owner_seat = $caller_seat`
      : `AND n.visibility = 'seat-private' AND n.owner_seat = $owner_seat`;
  } else {
    // No explicit filter: apply T9.1 visibility enforcement (same as recall WHERE clause)
    visibilityClause = `AND (n.visibility = 'council-shared' OR (n.visibility = 'seat-private' AND n.owner_seat = $caller_seat) OR n.visibility IS NULL)`;
  }

  // P-1 (Tier 9.1): optional topic filter — case-insensitive CONTAINS match on content
  const topicClause = params.topic
    ? 'AND toLower(n.content) CONTAINS toLower($topic)'
    : '';

  const rows = await neo4j.run(
    `MATCH (n)
     WHERE (n:MemoryClaim OR n:SummaryMemory OR n:InferredMemory)
       AND n.project_root = $project_root
       AND n.lifecycleState IN $stateFilter
       ${params.owner_seat ? 'AND n.owner_seat = $owner_seat' : ''}
       ${visibilityClause}
       ${topicClause}
     RETURN n.nodeId AS nodeId,
            n.content AS content,
            n.source_artifact_ref AS source_artifact_ref,
            n.created_at AS created_at,
            n.lifecycleState AS lifecycleState,
            n.memory_type AS memory_type,
            n.confidence_score AS confidence_score,
            n.visibility AS visibility,
            n.owner_seat AS owner_seat,
            labels(n) AS labels
     ORDER BY n.created_at DESC
     SKIP toInteger($offset)
     LIMIT toInteger($limit)`,
    {
      project_root,
      stateFilter,
      caller_seat: caller_seat ?? null,
      owner_seat: params.owner_seat ?? null,
      offset,
      limit,
      topic: params.topic ?? null,
    },
  );

  const structured: StructuredMemoryPayload[] = rows.map((row) => {
    const source_artifact_ref = (row.source_artifact_ref as string | null) ?? null;
    // E0 call site (b): classifySource replaces inline existsSync block; URL-scheme refs now return reason:'remote_url_provenance_only'
    const { source_status, reason } = classifySource(source_artifact_ref ?? undefined);

    // Resolve memory_type from labels or stored property
    const labels = (row.labels as string[]) ?? [];
    const VALID_TYPES = ['MemoryClaim', 'SummaryMemory', 'InferredMemory'] as const;
    type ValidType = (typeof VALID_TYPES)[number];
    const memory_type: ValidType = labels.find(
      (l): l is ValidType => (VALID_TYPES as readonly string[]).includes(l),
    ) ?? ((row.memory_type as string) as ValidType) ?? 'MemoryClaim';

    // G2 P0-M3: pass 'disputed' through so explicit filtering by callers works.
    // NOTE: recall.ts:169-170 retains 'disputed'→'active' mapping (I7 by-design until G8).
    // Until G8/M4 introduces conflict_flag surfacing, same node may show 'disputed' via
    // list-memories and 'active' via recall. Expected sequence gap; not a bug.
    const lifecycleState = row.lifecycleState as 'active' | 'superseded' | 'archived' | 'incorrect' | 'disputed';

    const payload: StructuredMemoryPayload = {
      content: row.content as string,
      source_artifact_ref,
      created_at: (row.created_at as string) ?? ts,
      lifecycleState,
      memory_type,
      source_status,
      ...(typeof row.confidence_score === 'number' ? { confidence_score: row.confidence_score } : {}),
      ...(reason !== undefined ? { reason } : {}),
      nodeId: row.nodeId as string,
    };
    return payload;
  });

  // Prose MUST NOT mention 'MemoryClaim', 'SummaryMemory', or 'InferredMemory' (BLOCK-14)
  const prose = structured.length === 0
    ? `No memories found for the given filters (offset: ${offset}, limit: ${limit}).`
    : `Found ${structured.length} memor${structured.length === 1 ? 'y' : 'ies'} (offset: ${offset}, limit: ${limit}).`;

  return { structured, prose };
}
