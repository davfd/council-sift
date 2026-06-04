/**
 * index.ts — claw-memory public API barrel
 * Thread: J (extraction Tier E.2)
 * Plan: SEMANTIC_MEMORY_V4_EXTRACTION
 * Gate evidence: spec:S7:0 (EXT-M7 barrel; BLOCK-EXT-4 hand-maintained)
 *
 * BLOCK-EXT-4: This file is hand-maintained. NO auto-generation tooling.
 * BLOCK-EXT-5: discipline-only; no exports beyond charter §2 surface + QUERIES
 *              (QUERIES exported for downstream consumers;
 *               technically beyond charter §2 but necessary for zero-grep gate).
 *
 * Charter §2 public surface (lines 87-106):
 *   - 10 handler entry points
 *   - Neo4jService (storage)
 *   - 3 types (MemoryClaim, MemoryNode, StructuredMemoryPayload)
 *   - telemetry namespace
 *
 * authorized_by: E1 grant Jonathan 2026-05-05 + BLOCK-EXT-4 (hand-maintained)
 */

// ── Handlers ─────────────────────────────────────────────────────────────────
export { handleRecall } from './handlers/recall.js';
export { handleRemember } from './handlers/remember.js';
export { handleForget } from './handlers/forget.js';
export { handleWhatDoYouKnowAbout } from './handlers/what-do-you-know-about.js';
export { handleSupersede } from './handlers/supersede.js';
export { handleMarkWrong } from './handlers/mark-wrong.js';
export { handleListSources } from './handlers/list-sources.js';
export { handleRecallAtTime } from './handlers/recall-at-time.js';
export { handleListMemories } from './handlers/list-memories.js';
// iter9 Tier 9.3 M8 (9.3b-1): P-4 ingest_bulk product API — batch ingest bypassing classify().
// authorized_by: T11 (Jonathan 2026-05-05) + R-iter9-tier9.3-consolidation-preflight 5/5 2026-05-28
export { handleIngestBulk } from './handlers/ingest-bulk.js';
export type { IngestBulkEvent, IngestBulkResult } from './handlers/ingest-bulk.js';
export { handleSemanticRecall } from './handlers/semantic_recall.js';

// ── Storage ───────────────────────────────────────────────────────────────────
// Neo4jService: primary claw-memory export (Q-EXT-2). QUERIES also exported
// for consumers of these internal modules (src/mcp/*, src/core/verification/*, etc.) that
// import QUERIES from neo4j.service.ts — required for IG-EXT-M8 compliance.
export { Neo4jService, QUERIES } from './storage/neo4j/neo4j.service.js';

// ── Types ─────────────────────────────────────────────────────────────────────
export type { MemoryClaim, MemoryNode, StructuredMemoryPayload } from './types/index.js';

// ── Telemetry ─────────────────────────────────────────────────────────────────
export * as telemetry from './telemetry/index.js';

// ── Templates ─────────────────────────────────────────────────────────────────
// iter9 Tier 9.3 M1 (9.3a-7): retrieval-agent prompt skeleton as exported product artifact.
// Production consumers: import RETRIEVAL_AGENT_SYSTEM_PROMPT + buildRetrievalAgentMessages.
// BLOCK-T93-2: must be exported barrel surface (not docs-only).
// authorized_by: T11 (Jonathan 2026-05-05) + R-iter9-tier9.3-consolidation-preflight 5/5 2026-05-28
export { RETRIEVAL_AGENT_SYSTEM_PROMPT, buildRetrievalAgentMessages } from './templates/retrieval-agent.js';

// ── Internal utilities (required by retrieve.ts post-extraction per PN-EXT-1) ─
// These are not in charter §2 public surface but are needed for downstream
// consumers (retrieve.ts + ingest-benchmark-tenants.ts) to compile post-move.
// Raphael Stage 5 will verify compile correctness.
export { NAMESPACE_UUID, deriveRawEventNodeId } from './core/nodeid.js';
export { parseRetrievalQuery } from './core/retrieval-query.js';
export type { RetrievalQuery } from './core/retrieval-query.js';
export { applyExclusionFilters } from './core/exclusion-filter.js';
export type { FilterAuditEntry, FilterResult } from './core/exclusion-filter.js';
export { composeRationale } from './core/selection-rationale.js';
export type { RationaleContext } from './core/selection-rationale.js';
export { reconstructAt } from './core/point-in-time.js';
export type { PiTNode } from './core/point-in-time.js';
// R52 5/5 — required by retrieve.ts for cross-tenant filter on PiT path
export { getProjectRoot } from './tenant.js';
// retrieve — public-API export
export { retrieve } from './core/retrieve.js';
export type { RetrievalItem, RetrievalAuditRecord, RetrievalResponse } from './core/retrieve.js';
