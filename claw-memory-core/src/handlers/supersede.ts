/**
 * supersede.ts — supersede NL primitive handler (Wave B)
 * Thread: H (Wave B execution)
 * Plan: SEMANTIC_MEMORY_V4_WAVE_B.md
 * Gate evidence: spec:S2:1, spec:IG2
 *
 * Routes through D3.6 SUPERSEDES extension in point-in-time.ts (Call WB-3).
 * MUST NOT implement SUPERSEDES semantics independently.
 * Returns StructuredMemoryPayload with all 6 required fields including source_status.
 *
 * authorized_by: T1+T2+T3+T4 (Wave B charter)
 */

import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { writeSupersedesEdge } from '../core/point-in-time.js';
import { emitTelemetry } from '../telemetry/index.js';
import type { StructuredMemoryPayload } from './recall.js';

export async function handleSupersede(
  params: {
    sourceNodeId: string;       // The NEW node that supersedes
    targetNodeId: string;       // The OLD node being superseded
    rationale?: string;         // Optional explanation
    tenant_id?: string;
  },
  neo4j: Neo4jService,
): Promise<{ structured: StructuredMemoryPayload; prose: string }> {
  // H13 R65 hygiene: dropped dead `const project_root = params.tenant_id ?? getProjectRoot();`
  // computed but never referenced — writeSupersedesEdge derives tenant via the contested
  // node's project_root and does not accept a tenant parameter here.
  const created_at = new Date().toISOString();

  emitTelemetry({
    event: 'mem_supersede_write',
    sourceNodeId: params.sourceNodeId,
    targetNodeId: params.targetNodeId,
    ts: created_at,
  });

  // Route through D3.6 SUPERSEDES extension (Call WB-3 compliance)
  // R55 Item 8: thread params.rationale → writeSupersedesEdge → SupersessionAudit.reason
  // for G5 provenance completeness (previously SA nodes had reason=NULL).
  const result = await writeSupersedesEdge(params.sourceNodeId, params.targetNodeId, neo4j, params.rationale);

  const status_map = {
    written: 'verifiable',
    already_exists: 'verifiable',
    source_not_found: 'unverifiable',
    target_not_found: 'unverifiable',
  } as const;

  const source_status = status_map[result.status];

  const structured: StructuredMemoryPayload = {
    content: `Supersede: ${params.sourceNodeId} → ${params.targetNodeId} (status: ${result.status}${result.supersededAt ? '; supersededAt: ' + result.supersededAt : ''})`,
    source_artifact_ref: null,
    created_at,
    lifecycleState: 'active',
    memory_type: 'MemoryClaim',
    source_status,
    confidence_score: undefined,
    ...(source_status === 'unverifiable' ? { reason: 'artifact_moved_or_deleted' } : {}),
  };

  const prose = result.status === 'written'
    ? `Memory superseded. The older memory (${params.targetNodeId}) is now superseded by ${params.sourceNodeId}.`
    : result.status === 'already_exists'
      ? `Supersession already recorded between these nodes.`
      : `Supersession could not be recorded: ${result.status}.`;

  return { structured, prose };
}
