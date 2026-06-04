/**
 * what-do-you-know-about.ts — what_do_you_know_about NL primitive handler
 * Thread: G (iter6-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER6_WAVE_A.md
 * Gate evidence: spec:S4:4, spec:IG4
 *
 * Retrieval + summary surface. source_status on every item (BLOCK-20, Call 4).
 * Inline prose MUST NOT contain 'MemoryClaim', 'SummaryMemory', 'InferredMemory' (BLOCK-14).
 * authorized_by: Jonathan 2026-04-22T19:52:52Z (iter6 NEW CHARTER)
 */

import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { handleRecall } from './recall.js';
import type { StructuredMemoryPayload } from './recall.js';
import { emitTelemetry } from '../telemetry/index.js';

export async function handleWhatDoYouKnowAbout(
  params: {
    topic: string;
    source_identity?: string;
    tenant_id?: string;
  },
  neo4j: Neo4jService,
): Promise<{ structured: StructuredMemoryPayload[]; prose: string }> {
  const ts = new Date().toISOString();

  // D-W12 MEM-TELEMETRY: emit at handler entry (spec:S5:1, spec:IG5)
  emitTelemetry({ event: 'mem_what_do_you_know_query', topic: params.topic, ts });

  // Delegate to recall for retrieval (same query, same source_status guarantees)
  const recallResult = await handleRecall(params, neo4j);
  const structured = recallResult.structured;

  // Prose MUST NOT mention 'MemoryClaim', 'SummaryMemory', or 'InferredMemory' (BLOCK-14)
  let prose: string;
  if (structured.length === 0) {
    prose = `I don't have any stored knowledge about "${params.topic}".`;
  } else {
    const summary = structured.map((s) => s.content).join('\n- ');
    prose =
      `Here is what I know about "${params.topic}":\n- ${summary}\n\n` +
      `${structured.length} item${structured.length === 1 ? '' : 's'} found.`;
  }

  return { structured, prose };
}
