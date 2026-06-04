/**
 * mark-wrong.ts — mark-wrong NL primitive handler (Wave B)
 * Thread: H (Wave B execution)
 * Plan: SEMANTIC_MEMORY_V4_WAVE_B.md
 * Gate evidence: spec:S2:2, spec:IG2
 *
 * Updates lifecycleState of target memory node to 'disputed' — a disputed-signal
 * state consistent with the existing lifecycle state machine.
 * MUST NOT modify any iter1-5 frozen production module including lifecycle.ts.
 * Returns StructuredMemoryPayload with all 6 required fields including source_status.
 *
 * authorized_by: T1+T2+T3+T4 (Wave B charter)
 */

import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { getProjectRoot } from '../tenant.js';
import { emitTelemetry } from '../telemetry/index.js';
import { autoWriteConflictRecord } from '../core/d3-1-conflict-record.js';
import type { StructuredMemoryPayload } from './recall.js';

export async function handleMarkWrong(
  params: {
    nodeId: string;             // Target node to mark as disputed (was: incorrect)
    reason?: string;            // Optional explanation
    tenant_id?: string;
    /** G1 P0-M3: optional contradicting node; null/absent = orphan conflict path */
    contradictingNodeId?: string;
  },
  neo4j: Neo4jService,
): Promise<{ structured: StructuredMemoryPayload; prose: string }> {
  const project_root = params.tenant_id ?? getProjectRoot();
  const created_at = new Date().toISOString();

  emitTelemetry({
    event: 'mem_mark_wrong_write',
    nodeId: params.nodeId,
    ts: created_at,
  });

  // G2 P0-M3: Update lifecycleState to 'disputed' (was: 'incorrect').
  // 'disputed' is included in recall.ts:143 filter (['active', 'disputed']) —
  // marked-wrong memories now re-surface in recall with conflict_flag=true.
  // 'incorrect' excluded from recall filter → marked-wrong memories vanished silently (pre-G2 defect).
  // Does NOT modify lifecycle.ts or lifecycle-transition.ts (frozen iter5 modules).
  // authorized_by: P0 grant 2026-05-11
  const updateResult = await neo4j.run(
    `MATCH (n {nodeId: $nodeId, project_root: $project_root})
     SET n.lifecycleState = 'disputed',
         n.markedWrongAt = $markedWrongAt,
         n.markedWrongReason = $reason
     RETURN n.nodeId AS nodeId, n.memory_type AS memory_type,
            n.content AS content, n.source_artifact_ref AS source_artifact_ref,
            n.lifecycleState AS lifecycleState, n.source_status AS source_status,
            n.source_status_reason AS source_status_reason`,
    {
      nodeId: params.nodeId,
      project_root,
      markedWrongAt: created_at,
      reason: params.reason ?? null,
    },
  );

  const found = updateResult.length > 0;
  // G3 P0-M2: derive source_status from retrieved node field, not presence/absence of result.
  // Old inversion: found ? 'verifiable' : 'unverifiable' — wrong for unverifiable nodes (e.g. discord://).
  // Fix: read n.source_status from query result (already in RETURN clause above).
  // authorized_by: P0 grant 2026-05-11
  const source_status: 'verifiable' | 'unverifiable' = found
    ? ((updateResult[0].source_status as 'verifiable' | 'unverifiable') ?? 'unverifiable')
    : 'unverifiable';

  // G1 P0-M3: wire autoWriteConflictRecord per AD-T5-1 option (b) — auto-path.
  // Called whenever the target node is found. No operator action required.
  // contradictingNodeId ?? null → orphan path if absent (ConflictRecord.contradictingNodeId IS NULL).
  // R65 Item 2: pass project_root so ConflictRecord survives cross-file test cleanup.
  // authorized_by: P0 grant 2026-05-11 (R10 council 5/5 unanimously elected option b)
  if (found) {
    await autoWriteConflictRecord(params.nodeId, params.contradictingNodeId ?? null, neo4j, project_root);
  }

  const structured: StructuredMemoryPayload = {
    content: found
      ? `Marked wrong: ${params.nodeId} (lifecycleState: disputed)`
      : `Node not found: ${params.nodeId}`,
    source_artifact_ref: null,
    created_at,
    lifecycleState: found ? 'disputed' : 'archived',
    memory_type: found ? ((updateResult[0].memory_type as 'MemoryClaim' | 'SummaryMemory' | 'InferredMemory') ?? 'MemoryClaim') : 'MemoryClaim',
    source_status,
    confidence_score: undefined,
    // F4 Raphael Stage 5: read reason from stored node field instead of hardcoded value.
    // Pre-fix (Gabriel G3): hardcoded 'artifact_moved_or_deleted' for all unverifiable nodes.
    // Fix: read n.source_status_reason from RETURN clause; fallback to hardcoded if null (pre-F3 nodes).
    ...(source_status === 'unverifiable' && updateResult[0]?.source_status_reason
      ? { reason: updateResult[0].source_status_reason as string }
      : source_status === 'unverifiable'
      ? { reason: 'artifact_moved_or_deleted' }
      : {}),
  };

  // G2 P0-M3: prose updated — 'disputed' nodes DO appear in recall (with conflict_flag=true).
  // authorized_by: P0 grant 2026-05-11
  const prose = found
    ? `Memory marked as disputed. It will appear in recall with conflict_flag=true.`
    : `Node not found in this project. No change made.`;

  return { structured, prose };
}
