/**
 * list-sources.ts — list-sources NL primitive handler (Wave B)
 * Thread: H (Wave B execution)
 * Plan: SEMANTIC_MEMORY_V4_WAVE_B.md
 * Gate evidence: spec:S2:3, spec:IG2
 *
 * Returns all source_artifact_ref values from memory nodes whose content
 * matches the given topic. Surfaces provenance for operator review.
 * MUST NOT modify any iter1-5 frozen production module.
 * Returns StructuredMemoryPayload with all 6 required fields including source_status.
 *
 * authorized_by: T1+T2+T3+T4 (Wave B charter)
 */

import { existsSync } from 'fs';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { getProjectRoot } from '../tenant.js';
import { emitTelemetry } from '../telemetry/index.js';
import type { StructuredMemoryPayload } from './recall.js';

export interface SourceEntry {
  nodeId: string;
  source_artifact_ref: string | null;
  source_status: 'verifiable' | 'unverifiable';
  memory_type: string;
  content_snippet: string;
}

export async function handleListSources(
  params: {
    topic: string;
    tenant_id?: string;
  },
  neo4j: Neo4jService,
): Promise<{ structured: StructuredMemoryPayload; sources: SourceEntry[]; prose: string }> {
  const project_root = params.tenant_id ?? getProjectRoot();
  const created_at = new Date().toISOString();

  emitTelemetry({
    event: 'mem_list_sources_query',
    topic: params.topic,
    ts: created_at,
  });

  const rows = await neo4j.run(
    `MATCH (n)
     WHERE (n:MemoryClaim OR n:SummaryMemory OR n:InferredMemory)
       AND n.project_root = $project_root
       AND n.lifecycleState = 'active'
       AND toLower(n.content) CONTAINS toLower($topic)
     RETURN n.nodeId AS nodeId,
            n.source_artifact_ref AS source_artifact_ref,
            n.memory_type AS memory_type,
            n.content AS content
     ORDER BY n.created_at DESC`,
    { project_root, topic: params.topic },
  );

  const sources: SourceEntry[] = rows.map((row) => {
    const ref = row.source_artifact_ref as string | null;
    const source_status: 'verifiable' | 'unverifiable' =
      ref && existsSync(ref) ? 'verifiable' : 'unverifiable';
    const content = (row.content as string) ?? '';
    return {
      nodeId: row.nodeId as string,
      source_artifact_ref: ref,
      source_status,
      memory_type: (row.memory_type as string) ?? 'MemoryClaim',
      content_snippet: content.length > 80 ? content.slice(0, 80) + '…' : content,
    };
  });

  const source_status: 'verifiable' | 'unverifiable' = sources.length > 0 ? 'verifiable' : 'unverifiable';

  const structured: StructuredMemoryPayload = {
    content: `Sources for topic "${params.topic}": ${sources.length} node(s) found`,
    source_artifact_ref: null,
    created_at,
    lifecycleState: 'active',
    memory_type: 'SummaryMemory',
    source_status,
    confidence_score: undefined,
    ...(source_status === 'unverifiable' && sources.length === 0
      ? { reason: 'no_source_provided' }
      : {}),
  };

  const prose = sources.length === 0
    ? `No sources found for topic "${params.topic}".`
    : `Found ${sources.length} source(s) for topic "${params.topic}".`;

  return { structured, sources, prose };
}
