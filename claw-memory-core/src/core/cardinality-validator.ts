/**
 * cardinality-validator.ts — Semantic Memory V4 Generic Cardinality Validator
 * Thread: D (iter3-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER3_CLASSIFY.md
 * Gate evidence: spec:S3:0, spec:IG2
 *
 * AD7: Generic validator for all non-RawEvent memory node types.
 * Accepts {nodeType, provenanceEdges[], scopeEdges[]}.
 * Rejects if provenanceEdges.length < 1 OR scopeEdges.length < 1.
 * Returns 6-field audit record per executable-path-v4.md §3.1 on failure.
 *
 * Validation failure record fields (§3.1):
 *   failureType, attemptedOperation, nodeId, failedChecks, failureTime, pipelineRunId
 */

import { randomUUID } from 'crypto';

export type MemoryNodeType =
  | 'MemoryClaim'
  | 'SummaryMemory'
  | 'InferredMemory'
  | 'VerificationRecord'
  | 'DoctrineAnchor'
  | 'ConflictRecord';

export interface EdgeInput {
  type: string;
  targetNodeId: string;
}

export interface CardinalityInput {
  nodeType: MemoryNodeType;
  nodeId?: string;
  provenanceEdges: EdgeInput[];
  scopeEdges: EdgeInput[];
}

/** Successful cardinality check */
export interface CardinalitySuccess {
  valid: true;
}

/** Cardinality failure — all 6 fields per executable-path-v4.md §3.1 */
export interface CardinalityFailure {
  valid: false;
  failureType: 'validation';
  attemptedOperation: 'classify';
  nodeId: string | undefined;
  failedChecks: string[];
  failureTime: string;
  pipelineRunId: string;
}

export type CardinalityResult = CardinalitySuccess | CardinalityFailure;

/**
 * Validate cardinality for a non-RawEvent memory node.
 *
 * Enforces schema-contracts-v4.md §3.1 (min provenance >= 1) and
 * §3.2 (min scope >= 1) for all 6 non-RawEvent memory types.
 *
 * @param input - Node type, provisional nodeId, provenance edges, scope edges
 * @returns CardinalityResult — valid: true on pass, or 6-field failure record on reject
 */
export function validateCardinality(input: CardinalityInput): CardinalityResult {
  const failedChecks: string[] = [];

  // §3.1: At least 1 provenance edge required
  if (input.provenanceEdges.length < 1) {
    failedChecks.push(
      `provenanceEdges: zero provenance edges for ${input.nodeType}; ` +
        'minimum is 1 (schema-contracts-v4.md §3.1)',
    );
  }

  // §3.2: At least 1 scope edge required
  if (input.scopeEdges.length < 1) {
    failedChecks.push(
      `scopeEdges: zero IN_SCOPE edges for ${input.nodeType}; ` +
        'minimum is 1 (schema-contracts-v4.md §3.2)',
    );
  }

  if (failedChecks.length === 0) {
    return { valid: true };
  }

  // All 6 §3.1 fields required on failure
  return {
    valid: false,
    failureType: 'validation',
    attemptedOperation: 'classify',
    nodeId: input.nodeId,
    failedChecks,
    failureTime: new Date().toISOString(),
    pipelineRunId: randomUUID(),
  };
}
