/**
 * nodeid.ts — Semantic Memory V4 Deterministic Node ID Derivation
 * Thread: C (iter2-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER2_INGEST.md
 * AD1: UUID v5 over canonical JSON (sorted keys) of {source, eventTime, rawContent}
 * AD7: Namespace UUID LOCKED — 4e6b2f18-0a5c-4e1d-b2a9-0f7c3d8a4b12
 *
 * Stability requirement (FINDING-7, schema-contracts-v4.md §1.1 nodeId stability section):
 * nodeId MUST be deterministically derived from content hash or source key.
 * Random UUIDs are non-conformant and fail replay equivalence (Gate A2).
 *
 * Permitted-to-differ fields (executable-path-v4.md §2.2):
 * ingestTime is a permitted-to-differ field and MUST NOT be included in the
 * hash input set for deriveRawEventNodeId.
 */

import { v5 as uuidv5 } from 'uuid';

/**
 * Locked namespace UUID for semantic-memory-v4 nodeId derivation.
 * AD7: Do not change. Altering this UUID invalidates all previously derived nodeIds.
 */
export const NAMESPACE_UUID = '4e6b2f18-0a5c-4e1d-b2a9-0f7c3d8a4b12';

/**
 * Produce canonical JSON string with keys sorted alphabetically.
 * Key-order variance in the input object must NOT change the output.
 */
function canonicalJson(obj: Record<string, string>): string {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return JSON.stringify(sorted);
}

/**
 * Derive a deterministic nodeId for a RawEvent node.
 *
 * Hash input: exactly {source, eventTime, rawContent} — sorted keys.
 * ingestTime is explicitly excluded per executable-path-v4.md §2.2.
 * No sourceKey field. No other fields.
 *
 * @param input - The three required fields for RawEvent nodeId derivation
 * @returns RFC 4122 v5 UUID string matching ^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
 */
export function deriveRawEventNodeId(input: {
  source: string;
  eventTime: string;
  rawContent: string;
}): string {
  const canonical = canonicalJson({
    eventTime: input.eventTime,
    rawContent: input.rawContent,
    source: input.source,
  });
  return uuidv5(canonical, NAMESPACE_UUID);
}

/**
 * Derive a deterministic nodeId for an identity node (Seat, Agent, Operator, User).
 *
 * @param canonicalIdentifier - The canonical stable_id, e.g. "seat:raguel", "operator:example"
 * @returns RFC 4122 v5 UUID string
 */
export function deriveIdentityNodeId(canonicalIdentifier: string): string {
  return uuidv5(canonicalIdentifier, NAMESPACE_UUID);
}

/**
 * Derive a deterministic nodeId for a Scope node.
 *
 * @param scopeName - The scope name string, e.g. "council-deliberations"
 * @returns RFC 4122 v5 UUID string
 */
export function deriveScopeNodeId(scopeName: string): string {
  return uuidv5(scopeName, NAMESPACE_UUID);
}
