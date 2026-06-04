#!/usr/bin/env node
/**
 * index.ts — claw-memory MCP Server Entry Point (Wave B: 7 tools + T5: 8th tool + T9: 9th tool + R-spec-3: 10th tool)
 * Thread: G (iter6-execution) + Thread H (Wave B execution) + Thread I (T5 lifecycle) + T9 (claw-memory extensions)
 * Plan: SEMANTIC_MEMORY_V4_ITER6_WAVE_A.md + SEMANTIC_MEMORY_V4_WAVE_B.md + SEMANTIC_MEMORY_V4_T5_LIFECYCLE.md
 *     + SEMANTIC_MEMORY_V4_T9_EXTENSIONS.md
 * Gate evidence: spec:S1:2, spec:S1:3, spec:IG1, spec:S2:4, spec:IG2, spec:S3:6 (IG-T5-7)
 *
 * FC2 verdict: fresh-ts-server (option a) — @modelcontextprotocol/sdk + McpServer + StdioServerTransport
 * Registers NL primitive tools (BLOCK-T9-3 supersession + R-spec-3 corroborate count = 10 (4+3+1+1+1)):
 *   Wave A (4): remember, recall, forget, what_do_you_know_about
 *   Wave B (3): supersede, mark-wrong, list-sources
 *   T5    (1): recall_at_time (tool #8 — wraps retrieve.ts asOf; BLOCK-T5-5: recall.ts + retrieve.ts unmodified)
 *   T9    (1): list_memories (tool #9 — paginated MATCH with visibility filter; T9.2)
 *   R-spec-3 (1): corroborate (tool #10 — operator escape hatch per BLOCK-T5-12; wraps manualWriteVR)
 * authorized_by: Jonathan 2026-04-22T19:52:52Z (iter6 NEW CHARTER — Wave A)
 *              + Jonathan 2026-04-26T00:36:59Z (T4 — Wave B charter; 3 new tools)
 *              + Jonathan 2026-04-28T04:16:20Z (T6 — T5 Lifecycle Charter; recall_at_time as 8th tool)
 *              + Jonathan 2026-04-29T01:45:25Z (T9 — claw-memory Architecture Extensions; list_memories as 9th tool;
 *                visibility/owner_seat schema; source_identity/tenant_id in recall inputSchema; created_at_override)
 *              + Jonathan 2026-05-22 (R-spec-3 5/5 — corroborate as 10th tool; BLOCK-T5-12 escape hatch surface)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { handleRemember } from '../handlers/remember.js';
import { handleRecall } from '../handlers/recall.js';
import { handleForget } from '../handlers/forget.js';
import { handleWhatDoYouKnowAbout } from '../handlers/what-do-you-know-about.js';
import { handleSupersede } from '../handlers/supersede.js';
import { handleMarkWrong } from '../handlers/mark-wrong.js';
import { handleListSources } from '../handlers/list-sources.js';
import { handleRecallAtTime } from '../handlers/recall-at-time.js';
import { handleListMemories } from '../handlers/list-memories.js';
// G6 P0-M2: decay cron import — registered at startup (hourly cadence per d3-3-decay.ts)
// Location: mcp/index.ts ONLY — NOT src/index.ts (BLOCK-EXT-4 hand-maintained barrel)
// authorized_by: P0 grant 2026-05-11
import { runDecayCron } from '../core/d3-3-decay.js';
// R-spec-3 5/5 (2026-05-22): corroborate tool — BLOCK-T5-12 operator escape hatch surface.
// Wraps manualWriteVR() so operators can write VRs with out-of-band evidence (priority bootstrap
// before Layer-B-only witnessSeats accumulation reaches threshold via natural recall patterns).
// authorized_by: R-spec-3 5/5 + operator 2026-05-22
import { manualWriteVR } from '../core/d3-5-verification-record.js';
// iter9 Tier 9.3 M8 (9.3b-1): P-4 ingest_bulk product API — bulk ingest bypassing classify().
// authorized_by: T11 (Jonathan 2026-05-05) + R-iter9-tier9.3-consolidation-preflight 5/5 2026-05-28
import { handleIngestBulk } from '../handlers/ingest-bulk.js';

const neo4j = new Neo4jService();

const server = new McpServer({
  name: 'claw-memory',
  version: '0.1.0',
});

// Tool: remember — store a memory (S1:3 stub → finalized per FC4; D-W8 auto-capture Wave B)
// T9.1 S1:0: visibility + owner_seat added to inputSchema
// T9.4 S2:3: created_at_override added to inputSchema (retro-ingest enablement)
// authorized_by: Jonathan 2026-04-29T01:45:25Z (T9 — claw-memory Architecture Extensions)
server.registerTool(
  'remember',
  {
    title: 'Remember',
    description: 'Store a memory for future recall',
    inputSchema: {
      content: z.string().describe('The content to remember'),
      source_artifact_ref: z.string().optional().describe('Source artifact path (optional)'),
      source_identity: z.string().optional().describe('Source identity (e.g., operator:example or council-seat:raguel)'),
      conversation_role: z.enum(['user', 'assistant', 'tool']).optional().describe(
        'D-W8 auto-capture: conversation role triggers FC3 category+threshold binding when present',
      ),
      visibility: z.enum(['council-shared', 'seat-private']).optional().describe(
        'T9.1: Visibility scope — council-shared (all seats; default) or seat-private (owner_seat only)',
      ),
      owner_seat: z.string().optional().describe(
        'T9.1: Seat ID of the memory owner. Required semantically when visibility = seat-private.',
      ),
      created_at_override: z.string().optional().describe(
        'T9.4: ISO-8601 timestamp for retro-ingest; overrides write time when present. For retro-ingest only.',
      ),
      // G7a P0-M4: sessionUuid for OBSERVED_IN edge + auto-anchor evaluation chain (R20 5/5 mandate; A-ZADT-R16-1).
      // Pass consistent value across all calls within one conversation — enables cross-session corroboration.
      // ABSENT = no OBSERVED_IN write (G7 auto-anchor disabled for this write); safe degradation.
      // PROHIBITED: do NOT generate a fresh UUID per call (defeats OBSERVED_IN session grouping permanently).
      // authorized_by: P0 grant 2026-05-11 (R20 5/5 ratified 2026-05-13)
      sessionUuid: z.string().optional().describe(
        'G7a: Stable session UUID for OBSERVED_IN edge; pass consistent value across calls within one conversation. Absent = no OBSERVED_IN write (G7 auto-anchor disabled for this write).',
      ),
      formal_deposit: z.boolean().optional().describe(
        'Strict formal Council deposit gate. Requires source_identity, owner_seat, expected_memory_type, and sessionUuid; rejects ambiguous auto-capture by default.',
      ),
      expected_memory_type: z.enum(['MemoryClaim', 'SummaryMemory', 'InferredMemory']).optional().describe(
        'Expected memory type for formal deposits. council-cc formal deposits use MemoryClaim.',
      ),
      writer_path: z.string().optional().describe(
        'Audit label for the write surface, e.g. council-cc, seat-direct, or operator.',
      ),
      allow_formal_auto_capture: z.boolean().optional().describe(
        'Explicit override allowing conversation_role on a formal deposit. Defaults false.',
      ),
    },
  },
  async (params: {
    content: string;
    source_artifact_ref?: string;
    source_identity?: string;
    conversation_role?: 'user' | 'assistant' | 'tool';
    visibility?: 'council-shared' | 'seat-private';
    owner_seat?: string;
    created_at_override?: string;
    sessionUuid?: string;
    formal_deposit?: boolean;
    expected_memory_type?: 'MemoryClaim' | 'SummaryMemory' | 'InferredMemory';
    writer_path?: string;
    allow_formal_auto_capture?: boolean;
  }) => {
    const result = await handleRemember(params, neo4j);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.structured) + '\n\n' + result.prose,
        },
      ],
    };
  },
);

// Tool: recall — retrieve memories by topic (S1:3)
// T9.1 S1:2: source_identity + tenant_id exposed in inputSchema (previously dead params in handler signature)
// F1 Raphael hardening: mode parameter added for semantic dispatch opt-in (Raphael Stage 5 2026-05-01)
// authorized_by: Jonathan 2026-04-29T01:45:25Z (T9) + Jonathan 2026-04-30T21:33:01Z (T7 — iter8 charter E4)
server.registerTool(
  'recall',
  {
    title: 'Recall',
    description: 'Recall memories about a topic',
    inputSchema: {
      topic: z.string().describe('The topic to recall memories about'),
      source_identity: z.string().optional().describe(
        'T9.1: Caller identity for visibility enforcement (e.g., council-seat:raguel). Prefix-stripped to derive caller_seat.',
      ),
      tenant_id: z.string().optional().describe(
        'T9.1: Tenant ID for multi-tenant isolation. Overrides project_root derivation when supplied.',
      ),
      mode: z.enum(['text', 'auto', 'lexical']).optional().describe(
        'F1+P-5: Retrieval mode. "auto" (default; post-T93 close 2026-05-30 per R-recall-default-mode-fix preflight) = three-way union: text-CONTAINS + Lucene lexical (P-5a cap ≤20) + semantic (when OPENAI_API_KEY present). "text" = text-CONTAINS only (explicit opt-in for narrow keyword matching). "lexical" = Lucene fulltext db.index.fulltext.queryNodes only (replaces CONTAINS; requires m010-fulltext-index.cypher ONLINE). R-recall-auto-x-lexical 5/5 2026-05-28 + R-recall-auto-mode-design 5/5 2026-05-27.',
      ),
      sessionUuid: z.string().optional().describe(
        'CF-G7c-G8 R37 5/5 (Option (a) + expanded Touch 4): per-callSeat session UUID for recall-time OBSERVED_IN edge writes. When present, each recalled nodeId MERGEs an OBSERVED_IN edge to the Session, enabling cross-session corroboration accumulation for G7c (DoctrineAnchor) + G8 (VerificationRecord) thresholds.',
      ),
      rerank: z.boolean().optional().describe(
        'P-3 Tier 9.2: cross-encoder reranking. When true AND candidate count > 15, apply Xenova/ms-marco-MiniLM-L-6-v2 ONNX reranker post-retrieval; returns top-15 sorted by descending relevance. Local inference; zero API cost. rerank=false/undefined or ≤15 candidates: no-op passthrough.',
      ),
      sort: z.enum(['temporal', 'relevance']).optional().describe(
        'iter9 Tier 9.3 M4 (9.3a-3): sort order for recall results. "temporal" = ORDER BY n.created_at DESC (most recent first). "relevance" or undefined = current behavior (text-match order, default unchanged).',
      ),
    },
  },
  async (params: { topic: string; source_identity?: string; tenant_id?: string; mode?: 'text' | 'auto' | 'lexical'; sessionUuid?: string; rerank?: boolean; sort?: 'temporal' | 'relevance' }) => {
    const result = await handleRecall(params, neo4j);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.structured) + '\n\n' + result.prose,
        },
      ],
    };
  },
);

// Tool: forget — archive a memory (S1:3)
server.registerTool(
  'forget',
  {
    title: 'Forget',
    description: 'Archive a memory so it no longer appears in recalls',
    inputSchema: {
      nodeId: z.string().optional().describe('NodeId of the memory to archive (optional if topic provided)'),
      topic: z.string().optional().describe('Topic to find and archive (optional if nodeId provided)'),
    },
  },
  async (params: { nodeId?: string; topic?: string }) => {
    const result = await handleForget(params, neo4j);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.structured) + '\n\n' + result.prose,
        },
      ],
    };
  },
);

// Tool: what_do_you_know_about — retrieval + summary surface (S1:3)
server.registerTool(
  'what_do_you_know_about',
  {
    title: 'What Do You Know About',
    description: 'Get a summary of everything remembered about a topic',
    inputSchema: {
      topic: z.string().describe('The topic to summarize knowledge about'),
      tenant_id: z.string().optional().describe(
        'T9.1: Tenant ID for multi-tenant isolation. Overrides project_root derivation when supplied.',
      ),
      source_identity: z.string().optional().describe(
        'T9.1: Caller identity for visibility enforcement (e.g., council-seat:raguel). Prefix-stripped to derive caller_seat.',
      ),
    },
  },
  async (params: { topic: string; tenant_id?: string; source_identity?: string }) => {
    const result = await handleWhatDoYouKnowAbout(params, neo4j);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.structured) + '\n\n' + result.prose,
        },
      ],
    };
  },
);

// ── Wave B tools (spec:S2:4) ────────────────────────────────────────────────

// Tool: supersede — mark one memory as superseding another (Wave B)
server.registerTool(
  'supersede',
  {
    title: 'Supersede',
    description: 'Mark one memory as superseding (replacing) an older memory',
    inputSchema: {
      sourceNodeId: z.string().describe('NodeId of the NEW memory that supersedes the old one'),
      targetNodeId: z.string().describe('NodeId of the OLD memory being superseded'),
      rationale: z.string().optional().describe('Optional rationale for the supersession'),
    },
  },
  async (params: { sourceNodeId: string; targetNodeId: string; rationale?: string }) => {
    const result = await handleSupersede(params, neo4j);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.structured) + '\n\n' + result.prose,
        },
      ],
    };
  },
);

// Tool: mark-wrong — mark a memory as disputed (Wave B, G2 P0-M3)
// F2 P0-M3: corrected description — disputed memories DO appear in recall (recall.ts:143 filter ['active','disputed']).
// F3 P0-M3: expose contradictingNodeId in inputSchema — G1 non-orphan ConflictRecord path was unreachable via MCP.
// A-ZADT-R16-1 governing standard: TS-handler accepts param + MCP schema omits = HARDENING_REQUIRED (M4+ applies).
server.registerTool(
  'mark-wrong',
  {
    title: 'Mark Wrong',
    description: 'Mark a memory as disputed. Disputed memories remain visible in recall results. Use list-memories with lifecycleState=["disputed"] to enumerate them explicitly.',
    inputSchema: {
      nodeId: z.string().describe('NodeId of the memory to mark as disputed'),
      reason: z.string().optional().describe('Optional explanation of why the memory is wrong'),
      contradictingNodeId: z.string().optional().describe('NodeId of a memory contradicting this one. When provided, both nodes are marked disputed and a ConflictRecord with CONFLICTS_WITH edges to both is created (G1 non-orphan path). When absent, orphan ConflictRecord is created with contradictingNodeId IS NULL.'),
    },
  },
  async (params: { nodeId: string; reason?: string; contradictingNodeId?: string }) => {
    const result = await handleMarkWrong({
      nodeId: params.nodeId,
      reason: params.reason,
      contradictingNodeId: params.contradictingNodeId,
    }, neo4j);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.structured) + '\n\n' + result.prose,
        },
      ],
    };
  },
);

// Tool: list-sources — list all source artifacts for a topic (Wave B)
server.registerTool(
  'list-sources',
  {
    title: 'List Sources',
    description: 'List all source artifacts (provenance) for memories matching a topic',
    inputSchema: {
      topic: z.string().describe('The topic to list source artifacts for'),
    },
  },
  async (params: { topic: string }) => {
    const result = await handleListSources(params, neo4j);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.structured) + '\n' + JSON.stringify(result.sources) + '\n\n' + result.prose,
        },
      ],
    };
  },
);

// ── T5 tool (spec:S3:6; BLOCK-T9-3 supersession of BLOCK-T5-7: total count = 9) ────────────────

// Tool: recall_at_time — recall memory state as of a point in time (T5)
// BLOCK-T5-5: recall.ts and retrieve.ts are NOT modified; this handler wraps
// retrieve.ts asOf capability via the point-in-time.ts reconstructAt() function.
// BLOCK-T9-3: After registering recall_at_time + list_memories, total MCP tool count = 9 (4+3+1+1=9).
// authorized_by: T6 (Jonathan 2026-04-28T04:16:20Z)
//              + T9 (Jonathan 2026-04-29T01:45:25Z) — count supersession BLOCK-T5-7→BLOCK-T9-3
server.registerTool(
  'recall_at_time',
  {
    title: 'Recall At Time',
    description: 'Recall memory state as of a specific point in time (ISO-8601 timestamp)',
    inputSchema: {
      topic: z.string().describe('The topic to search for in memory content'),
      asOf: z.string().describe('ISO-8601 timestamp — recall memory state as of this time (e.g., 2026-04-01T12:00:00Z)'),
      scopeNodeIds: z.array(z.string()).optional().describe('Optional scope node IDs for IN_SCOPE filtering'),
      tenant_id: z.string().optional().describe('Optional tenant ID for multi-tenant filtering'),
    },
  },
  async (params: { topic: string; asOf: string; scopeNodeIds?: string[]; tenant_id?: string }) => {
    const result = await handleRecallAtTime(params, neo4j);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.structured) + '\n\n' + result.prose,
        },
      ],
    };
  },
);

// ── T9 tool (T9.2; BLOCK-T9-3: count = 9 (4+3+1+1=9)) ─────────────────────────────────────────

// Tool: list_memories — paginated memory listing with visibility + lifecycle filters (T9.2)
// BLOCK-T9-3: This is the ONLY additional tool-count change authorized by T9 grant.
//             After registering this tool, total MCP tool count = 9 (4+3+1+1=9).
// authorized_by: T9 (Jonathan 2026-04-29T01:45:25Z — claw-memory Architecture Extensions; list_memories as 9th tool)
server.registerTool(
  'list_memories',
  {
    title: 'List Memories',
    description: 'List all memories scoped to the current project with optional filters and pagination',
    inputSchema: {
      lifecycleState: z.array(z.string()).optional().describe(
        'Filter by lifecycle state(s) (e.g., ["active", "disputed"]). Defaults to all states.',
      ),
      visibility: z.enum(['council-shared', 'seat-private']).optional().describe(
        'T9.1: Filter by visibility scope.',
      ),
      owner_seat: z.string().optional().describe(
        'T9.1: Filter by owner seat ID (for seat-private memories).',
      ),
      source_identity: z.string().optional().describe(
        'T9.1: Caller identity for visibility enforcement (e.g., council-seat:raguel).',
      ),
      limit: z.number().optional().describe('Maximum number of results to return (default: 20).'),
      offset: z.number().optional().describe('Number of results to skip for pagination (default: 0).'),
      topic: z.string().optional().describe(
        'P-1 (Tier 9.1): Optional topic filter — case-insensitive substring match on memory content.',
      ),
    },
  },
  async (params: {
    lifecycleState?: string[];
    visibility?: 'council-shared' | 'seat-private';
    owner_seat?: string;
    source_identity?: string;
    limit?: number;
    offset?: number;
    topic?: string;
  }) => {
    const result = await handleListMemories(params, neo4j);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.structured) + '\n\n' + result.prose,
        },
      ],
    };
  },
);

// ── R-spec-3 5/5 corroborate tool (BLOCK-T5-12 escape hatch; tool #10) ────────────────────────

// Tool: corroborate — operator/harness-driven VR write (R-spec-3 escape hatch path).
// BLOCK-T5-12: "Operator CLI is escape hatch only" — auto-path is Layer-B-only witnessSeats
// accumulation via OBSERVED_IN.calling_seat. This tool covers cases where the natural recall
// pattern hasn't yet produced ≥2 distinct witness seats but an operator has out-of-band evidence.
// verifierId must pass checkAuthority() in promote-orchestrator.ts — harness:* or reviewer:*
// prefixes only; arbitrary identities are rejected (T9.1 authority gate, NOT bypassed by this tool).
// authorized_by: R-spec-3 5/5 + operator 2026-05-22
server.registerTool(
  'corroborate',
  {
    title: 'Corroborate',
    description:
      'Operator/harness escape hatch: write a VerificationRecord to a target memory with out-of-band evidence. Auto-path (witnessSeats via OBSERVED_IN.calling_seat) is preferred; use this for priority bootstrap. verifierId MUST be harness:* or reviewer:* (T9.1 authority gate).',
    inputSchema: {
      targetNodeId: z.string().describe('NodeId of the MemoryClaim to corroborate'),
      verifierId: z
        .string()
        .describe(
          'Operator identity — MUST be harness:* or reviewer:* (e.g., reviewer:example). Other prefixes will be rejected by checkAuthority().',
        ),
      evidenceSummary: z
        .string()
        .describe('Rationale for the corroboration — becomes VR.evidenceSummary (non-empty)'),
      scopeNames: z
        .array(z.string())
        .min(1)
        .describe(
          'Scope names for IN_SCOPE edges (≥1 required per §1.5). Typically the target MC scope (e.g., ["scope-council-deliberations-may-2026"]).',
        ),
    },
  },
  async (params: {
    targetNodeId: string;
    verifierId: string;
    evidenceSummary: string;
    scopeNames: string[];
  }) => {
    const result = await manualWriteVR(
      params.targetNodeId,
      params.verifierId,
      params.scopeNames,
      neo4j,
      params.evidenceSummary,
    );
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result),
        },
      ],
    };
  },
);

// ── iter9 Tier 9.3 M8 (9.3b-1): P-4 ingest_bulk tool ────────────────────────

// Tool: ingest_bulk — batch ingest events as MemoryClaims, bypassing classify()
// For bulk workflows: chat history imports, migrations, high-throughput pipelines.
// Tenant isolation: each event uses its own tenant_id (or global project_root default).
// authorized_by: T11 (Jonathan 2026-05-05) + R-iter9-tier9.3-consolidation-preflight 5/5 2026-05-28
server.registerTool(
  'ingest_bulk',
  {
    title: 'Ingest Bulk',
    description: 'BYPASSES governance — does NOT invoke ontology classifier, F5 admit-list, sessionUuid chain (G7a/G7b/G7c), or ConflictRecord detection (d3-1). Use only for content that does NOT require conflict detection or supersession chain integrity. For governance-tracked writes, use `remember` instead.',
    inputSchema: {
      events: z.array(
        z.object({
          topic: z.string().describe('Topic/category for this memory item'),
          content: z.string().describe('Memory content to store'),
          tenant_id: z.string().optional().describe('Tenant ID for multi-tenant isolation. Overrides project_root.'),
          event_time: z.string().optional().describe('ISO-8601 timestamp of when the event occurred (n.event_time on node).'),
          created_at_override: z.string().optional().describe('ISO-8601 timestamp override for retro-ingest; overrides write time.'),
        }),
      ).describe('Array of event objects to ingest as MemoryClaims'),
    },
  },
  async (params: { events: Array<{ topic: string; content: string; tenant_id?: string; event_time?: string; created_at_override?: string }> }) => {
    const result = await handleIngestBulk(params, neo4j);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result),
        },
      ],
    };
  },
);

// ── E5 startup banner: semantic retrieval mode disclosure ─────────────────────
// Fires unconditionally at startup (before transport.connect()) per spec:S5:0.
// Operator §10 #3: silence-degradation explicitly rejected — mode MUST be named.
// authorized_by: T7 (Jonathan 2026-04-30T21:33:01Z — iter8 charter E5; spec:S5:0)
if (process.env.OPENAI_API_KEY) {
  process.stderr.write('[claw-memory] semantic retrieval: ENABLED (OPENAI_API_KEY present; vector-similarity recall active)\n');
} else {
  process.stderr.write('[claw-memory] semantic retrieval: FALLBACK to text-pattern (OPENAI_API_KEY absent; vector-similarity disabled)\n');
}

// G6 P0-M2: Register decay cron BEFORE server.connect — hourly cadence per d3-3-decay.ts comment block.
// Fires without operator action (BLOCK-T5-12 zero-operator-labor mandate).
// Errors are logged to stderr and swallowed — a single cron failure must not crash the MCP server.
// authorized_by: P0 grant 2026-05-11
const DECAY_CRON_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
// F2 Raphael Stage 5: capture handle so SIGTERM can clearInterval before neo4j.close().
// Pre-fix (Gabriel): bare setInterval call — handle discarded; in-flight runDecayCron at SIGTERM
//   would fail against closed driver; error swallowed by .catch(), leaving a silent crash class.
const decayCronInterval = setInterval(() => {
  runDecayCron(neo4j).catch((err) =>
    process.stderr.write(`[decay-cron] error: ${err}\n`),
  );
}, DECAY_CRON_INTERVAL_MS);
process.stderr.write('[claw-memory] decay cron registered (hourly)\n');

// Connect and start
const transport = new StdioServerTransport();
await server.connect(transport);

process.on('SIGTERM', async () => {
  clearInterval(decayCronInterval); // F2: stop new cron invocations BEFORE closing driver
  await neo4j.close();
  process.exit(0);
});
