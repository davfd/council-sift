/**
 * telemetry.ts — MEM-TELEMETRY(7) D-W12 event emission module (Wave B)
 * Thread: H (Wave B execution)
 * Plan: SEMANTIC_MEMORY_V4_WAVE_B.md
 * Gate evidence: spec:S5:1, spec:IG5
 *
 * Emits structured telemetry events at all 7 handler entry points.
 * Emission is synchronous (no async I/O). Output to stderr for smoke observability.
 * Format: [MEM-TELEMETRY] <event_type> <ts>
 *
 * Schema reference: iter7/telemetry-schema.md
 * authorized_by: T1+T2+T3+T4 (Wave B charter)
 */

// ── Event type discriminated union (7 event types per D-W12 MEM-TELEMETRY(7)) ──

export interface MemRememberWriteEvent {
  event: 'mem_remember_write';
  memory_type: string;
  source_status: string;
  auto_capture: boolean;
  conversation_role?: string;
  confidence: number | null;
  ts: string;
}

export interface MemRecallQueryEvent {
  event: 'mem_recall_query';
  topic: string;
  ts: string;
}

export interface MemForgetArchiveEvent {
  event: 'mem_forget_archive';
  topic?: string;
  nodeId?: string;
  ts: string;
}

export interface MemWhatDoYouKnowQueryEvent {
  event: 'mem_what_do_you_know_query';
  topic: string;
  ts: string;
}

export interface MemSupersedeWriteEvent {
  event: 'mem_supersede_write';
  sourceNodeId: string;
  targetNodeId: string;
  ts: string;
}

export interface MemMarkWrongWriteEvent {
  event: 'mem_mark_wrong_write';
  nodeId: string;
  ts: string;
}

export interface MemListSourcesQueryEvent {
  event: 'mem_list_sources_query';
  topic: string;
  ts: string;
}

export interface MemListMemoriesQueryEvent {
  event: 'mem_list_memories_query';
  visibility?: string;
  limit: number;
  offset: number;
  ts: string;
}

/**
 * Item 21 (R71 council-only convergent): G7b bypass — emitted when remember() is
 * called WITHOUT sessionUuid by a valid F5 prefix caller. F5 chain still wires
 * DERIVED_FROM/IN_SCOPE on RawEvent, but G7b OBSERVED_IN edge skipped → MC cannot
 * reach G7c crystallization or G8 corroboration. R71 5/5 council convergent: warn
 * (not gate; gating would be breaking API change per Jeremiel R71). Structured
 * event format enables grep-based audit of bypass callers.
 *
 * authorized_by: R71 5/5 council 2026-05-20 (forcing-convergence component of Item 21)
 */
export interface MemRememberBypassEvent {
  event: 'mem_remember_bypass';
  reason: 'no_session_uuid';
  owner_seat: string;
  nodeId: string;
  ts: string;
}

/** Discriminated union of all MEM-TELEMETRY event types (D-W12 base 7 + list_memories T9.2 + R71 bypass) */
export type TelemetryEvent =
  | MemRememberWriteEvent
  | MemRecallQueryEvent
  | MemForgetArchiveEvent
  | MemWhatDoYouKnowQueryEvent
  | MemSupersedeWriteEvent
  | MemMarkWrongWriteEvent
  | MemListSourcesQueryEvent
  | MemListMemoriesQueryEvent
  | MemRememberBypassEvent;

// ── Emission function ─────────────────────────────────────────────────────────

/**
 * Emit a telemetry event to stderr.
 * Synchronous — no async I/O. Non-blocking.
 * Format: [MEM-TELEMETRY] <event_type> <ts> | <json_payload>
 */
export function emitTelemetry(event: TelemetryEvent): void {
  const line = `[MEM-TELEMETRY] ${event.event} ${event.ts} | ${JSON.stringify(event)}`;
  process.stderr.write(line + '\n');
}
