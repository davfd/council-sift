/**
 * ingest-bulk.ts — P-4 bulk ingest product API (iter9 Tier 9.3 M8 9.3b-1)
 * Thread: K (iter9 Tier 9.3)
 * Plan: SEMANTIC_MEMORY_V4_ITER9_TIER9_3 milestone iter9-T93-M8
 *
 * Batch ingest: accepts an array of event objects and writes each as a MemoryClaim via
 * direct Cypher MERGE, bypassing classify() entirely. Designed for bulk workflows:
 *   - Chat history imports
 *   - Migrations from other stores
 *   - High-throughput batch pipelines where deterministic classification isn't needed
 *
 * Authorization: T11 (Jonathan 2026-05-05) + R-iter9-tier9.3-consolidation-preflight 5/5 2026-05-28
 */

import { randomUUID } from 'crypto';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { getProjectRoot } from '../tenant.js';

export type IngestBulkEvent = {
  topic: string;
  content: string;
  tenant_id?: string;
  event_time?: string;
  created_at_override?: string;
};

export type IngestBulkResult = {
  written: number;
};

/**
 * handleIngestBulk — bulk ingest handler (P-4).
 *
 * Writes each event as a MemoryClaim via Cypher MERGE on nodeId.
 * Bypasses classify() entirely — all writes land as :MemoryClaim with
 * memory_type='MemoryClaim' and classification_path='bulk-ingest'.
 *
 * Tenant isolation: each event uses its own tenant_id (or falls back to the
 * global project_root default). Events with different tenant_ids may coexist
 * in the same batch.
 *
 * event_time: when event_time is provided, it is stored on the node as n.event_time.
 * created_at_override: when provided, overrides the write timestamp (retro-ingest).
 *
 * Returns { written: N } where N is the count of successfully written events.
 * Partial failures are logged to stderr and do not abort the batch.
 */
export async function handleIngestBulk(
  params: { events: IngestBulkEvent[] },
  neo4j: Neo4jService,
): Promise<IngestBulkResult> {
  let written = 0;

  for (const event of params.events) {
    const project_root = event.tenant_id ?? getProjectRoot();
    const created_at = event.created_at_override ?? new Date().toISOString();
    const event_time = event.event_time ?? event.created_at_override ?? null;
    const nodeId = randomUUID();

    try {
      await neo4j.run(
        `MERGE (n:MemoryClaim { nodeId: $nodeId })
         ON CREATE SET
           n.content            = $content,
           n.summary            = $summary,
           n.memory_type        = 'MemoryClaim',
           n.topic              = $topic,
           n.project_root       = $project_root,
           n.created_at         = $created_at,
           n.event_time         = $event_time,
           n.lifecycleState     = 'active',
           n.verificationState  = 'unverified',
           n.source_status      = 'unverifiable',
           n.classification_path = 'bulk-ingest',
           n.auto_capture       = false,
           n.visibility         = 'council-shared',
           n.ingestTime         = $created_at`,
        {
          nodeId,
          content: event.content,
          summary: event.content.slice(0, 400) + (event.content.length > 400 ? '...' : ''),
          topic: event.topic,
          project_root,
          created_at,
          event_time,
        },
      );
      written++;
    } catch (err) {
      process.stderr.write(`[ingest-bulk] failed to write event (topic=${event.topic}): ${err}\n`);
    }
  }

  return { written };
}
