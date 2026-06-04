/**
 * forget.ts — forget NL primitive handler
 * Thread: G (iter6-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER6_WAVE_A.md
 * Gate evidence: spec:S4:3, spec:IG4
 *
 * Archives node (lifecycleState: archived) via direct Neo4j SET.
 * History PRESERVED — NO DETACH DELETE (iter5 Raphael F-B01 precedent).
 * lifecycle-transition.ts handles disputed/restore transitions — not user-initiated archival.
 * Inline prose MUST NOT contain 'MemoryClaim', 'SummaryMemory', 'InferredMemory' (BLOCK-14).
 * authorized_by: Jonathan 2026-04-22T19:52:52Z (iter6 NEW CHARTER)
 *              + Jonathan 2026-04-29T01:45:25Z (T9 — claw-memory Architecture Extensions;
 *                visibility WHERE clause on pre-archive lookup S1:3 + direct-nodeId archive PN-5(c))
 */

import { existsSync } from 'fs';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { getProjectRoot } from '../tenant.js';
import { emitTelemetry } from '../telemetry/index.js';

export async function handleForget(
  params: {
    nodeId?: string;
    topic?: string;
    source_identity?: string;
    tenant_id?: string;
  },
  neo4j: Neo4jService,
): Promise<{
  structured: {
    nodeId: string;
    source_status: 'verifiable' | 'unverifiable';
    lifecycleState: string;
  };
  prose: string;
}> {
  const project_root = params.tenant_id ?? getProjectRoot();
  const ts = new Date().toISOString();

  // T9.1 S1:3: PN-5(a) path (ii) — derive caller_seat from source_identity via prefix-stripping.
  // Same logic as recall.ts change (c); shared pattern not re-implemented divergently.
  // Fail-closed: absent or non-prefixed source_identity → caller_seat undefined → seat-private branch false.
  const caller_seat = params.source_identity?.startsWith('council-seat:')
    ? params.source_identity.slice('council-seat:'.length)
    : undefined;

  // D-W12 MEM-TELEMETRY: emit at handler entry (spec:S5:1, spec:IG5)
  emitTelemetry({
    event: 'mem_forget_archive',
    ...(params.topic ? { topic: params.topic } : {}),
    ...(params.nodeId ? { nodeId: params.nodeId } : {}),
    ts,
  });

  let nodeId = params.nodeId;

  // If nodeId not provided, find by topic (first match in project_root)
  if (!nodeId && params.topic) {
    const findRows = await neo4j.run(
      `MATCH (n)
       WHERE (n:MemoryClaim OR n:SummaryMemory OR n:InferredMemory)
         AND n.project_root = $project_root
         AND n.lifecycleState IN ['active', 'disputed']
         AND n.content CONTAINS $topic
         AND (n.visibility = 'council-shared' OR (n.visibility = 'seat-private' AND n.owner_seat = $caller_seat) OR n.visibility IS NULL)
       RETURN n.nodeId AS nodeId
       LIMIT 1`,
      { project_root, topic: params.topic, caller_seat: caller_seat ?? null },
    );

    if (findRows.length === 0) {
      return {
        structured: {
          nodeId: '',
          source_status: 'unverifiable',
          lifecycleState: 'not_found',
        },
        prose: `No memory found matching "${params.topic}". Nothing was archived.`,
      };
    }

    nodeId = findRows[0].nodeId as string;
  }

  if (!nodeId) {
    return {
      structured: {
        nodeId: '',
        source_status: 'unverifiable',
        lifecycleState: 'not_found',
      },
      prose: 'No nodeId or topic provided. Nothing was archived.',
    };
  }

  // Archive by direct SET — user-initiated forget (not lifecycle_clash conflict)
  // History is preserved; node is NOT deleted (F-B01 precedent)
  // T9.1 S1:3 PN-5(c): symmetric visibility WHERE on direct-nodeId archive path (closes cross-seat
  // unilateral-archival gap — a caller with a known nodeId cannot archive a seat-private node from another seat)
  const archiveRows = await neo4j.run(
    `MATCH (n {nodeId: $nodeId})
     WHERE n.project_root = $project_root
       AND (n.visibility = 'council-shared' OR (n.visibility = 'seat-private' AND n.owner_seat = $caller_seat) OR n.visibility IS NULL)
     SET n.lifecycleState = 'archived'
     RETURN n.nodeId AS nodeId,
            n.source_artifact_ref AS source_artifact_ref,
            n.lifecycleState AS lifecycleState`,
    { nodeId, project_root, caller_seat: caller_seat ?? null },
  );

  if (archiveRows.length === 0) {
    return {
      structured: {
        nodeId,
        source_status: 'unverifiable',
        lifecycleState: 'not_found',
      },
      prose: `Memory with nodeId "${nodeId}" was not found in this project. Nothing was archived.`,
    };
  }

  const row = archiveRows[0];
  const source_artifact_ref = (row.source_artifact_ref as string | null) ?? null;
  const source_status: 'verifiable' | 'unverifiable' =
    source_artifact_ref && existsSync(source_artifact_ref) ? 'verifiable' : 'unverifiable';

  // Prose MUST NOT mention 'MemoryClaim', 'SummaryMemory', or 'InferredMemory' (BLOCK-14)
  const prose =
    "I've archived that memory. It won't appear in future recalls but history is preserved.";

  return {
    structured: {
      nodeId: row.nodeId as string,
      source_status,
      lifecycleState: row.lifecycleState as string,
    },
    prose,
  };
}
