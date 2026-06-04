/**
 * property-validator.ts — Semantic Memory V4 RawEvent Property Validator
 * Thread: C (iter2-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER2_INGEST.md
 * Gate IG1 evidence: validates all 6 required RawEvent properties per
 * schema-contracts-v4.md §1.1 and §2.1 invalid-state definitions.
 *
 * executable-path-v4.md §3.1: On validation failure, a failure record
 * must be written containing all 6 required fields.
 */

import { randomUUID } from 'crypto';

/** Valid lifecycleState values for RawEvent per schema-contracts-v4.md §1.1 */
const VALID_LIFECYCLE_STATES = new Set(['active', 'superseded', 'archived']);

/** Input type for RawEvent validation — all fields required by the spec */
export interface RawEventInput {
  nodeId?: string;
  eventTime?: string;
  ingestTime?: string;
  source?: string;
  rawContent?: string;
  lifecycleState?: string;
  [key: string]: unknown;
}

/** Successful validation result */
export interface ValidationSuccess {
  valid: true;
}

/** Failure record — all 6 fields per executable-path-v4.md §3.1 */
export interface ValidationFailure {
  valid: false;
  failureType: 'validation';
  attemptedOperation: 'ingest';
  nodeId: string | undefined;
  failedChecks: string[];
  failureTime: string;
  pipelineRunId: string;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Validate a RawEvent input against schema-contracts-v4.md §1.1 and §2.1.
 *
 * Checks:
 *   1. nodeId present
 *   2. eventTime present
 *   3. ingestTime present
 *   4. source present
 *   5. rawContent present and non-blank (§2.1: rawContent absent or blank is invalid)
 *   6. lifecycleState present and ∈ {active, superseded, archived} (§2.1: values outside declared enum are invalid)
 *
 * Provenance edge cardinality (HAS_SOURCE ≥1) and scope edge cardinality (IN_SCOPE ≥1)
 * are enforced at the orchestrator level (raw-event-ingester.ts steps 3–5) because
 * they depend on resolved identity and scope nodes, not on the input object properties.
 *
 * On any failure: returns a ValidationFailure with all 6 §3.1 audit fields populated.
 * nodeId in the failure record is the value from the input (may be undefined if absent).
 */
export function validateRawEvent(event: RawEventInput): ValidationResult {
  const failedChecks: string[] = [];

  // Check all 6 required properties
  if (event.nodeId === undefined || event.nodeId === null || event.nodeId === '') {
    failedChecks.push('nodeId: required property absent or empty');
  }

  if (event.eventTime === undefined || event.eventTime === null || event.eventTime === '') {
    failedChecks.push('eventTime: required property absent or empty');
  }

  if (event.ingestTime === undefined || event.ingestTime === null || event.ingestTime === '') {
    failedChecks.push('ingestTime: required property absent or empty');
  }

  if (event.source === undefined || event.source === null || event.source === '') {
    failedChecks.push('source: required property absent or empty');
  }

  // rawContent: absent or blank is invalid per §2.1
  if (event.rawContent === undefined || event.rawContent === null) {
    failedChecks.push('rawContent: required property absent');
  } else if (event.rawContent.trim().length === 0) {
    failedChecks.push('rawContent: blank value is invalid (§2.1)');
  }

  // lifecycleState: must be present and in {active, superseded, archived}
  if (event.lifecycleState === undefined || event.lifecycleState === null || event.lifecycleState === '') {
    failedChecks.push('lifecycleState: required property absent or empty');
  } else if (!VALID_LIFECYCLE_STATES.has(event.lifecycleState)) {
    failedChecks.push(
      `lifecycleState: value '${event.lifecycleState}' is outside declared enum {active, superseded, archived} (§2.1)`,
    );
  }

  if (failedChecks.length === 0) {
    return { valid: true };
  }

  // Validation failure — all 6 §3.1 fields required
  return {
    valid: false,
    failureType: 'validation',
    attemptedOperation: 'ingest',
    nodeId: event.nodeId as string | undefined,
    failedChecks,
    failureTime: new Date().toISOString(),
    pipelineRunId: randomUUID(),
  };
}
