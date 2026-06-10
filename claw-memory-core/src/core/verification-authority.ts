/**
 * verification-authority.ts — Semantic Memory V4 Verification Authority Check
 * Thread: D (iter3-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER3_CLASSIFY.md
 * Gate evidence: spec:S4:0, spec:IG5
 *
 * AD3/Call 3: VerificationRecord write authority = verification harness or human reviewer
 * per time-governance-v4.md §1.3 line 35 ("Population authority: The verification
 * harness or human reviewer, recorded at the moment of verdict emission").
 *
 * REJECTS identities acting under council.interpretation_authority.
 * §4.2 scope = MemoryClaim/SummaryMemory/InferredMemory writes ONLY.
 * VerificationRecord is NOT in §4.2 scope.
 *
 * Accepted identity classes:
 *   - 'harness:*'   — verification harness (e.g., 'harness:a1')
 *   - 'reviewer:*'  — human reviewer (e.g., 'reviewer:raguel')
 *
 * Rejected identity classes (explicit Call 3 enforcement):
 *   - 'council.interpretation_authority' (exact match)
 *   - Any identity prefixed with 'council.' (interpretation authority delegation)
 */

export interface AuthorityCheckInput {
  verifierId: string;
  scope: string;
}

/**
 * Check whether a given verifierId is authorized to write VerificationRecords.
 *
 * Returns true ONLY for verification harness or human reviewer identity classes
 * per time-governance-v4.md §1.3 line 35.
 *
 * Returns false for council.interpretation_authority and all non-verifier identity classes.
 *
 * @param input - verifierId and scope context
 * @returns boolean — true if authorized, false if not
 */
export function checkAuthority(input: AuthorityCheckInput): boolean {
  const { verifierId } = input;

  // Call 3 EXPLICIT REJECTION: council.interpretation_authority governs
  // MemoryClaim/SummaryMemory/InferredMemory writes (§4.2), NOT VerificationRecord.
  if (verifierId === 'council.interpretation_authority') {
    return false;
  }

  // Reject any identity acting under council.interpretation_authority delegation
  if (verifierId.startsWith('council.')) {
    return false;
  }

  // Accept verification harness identity class (§1.3 line 35)
  if (verifierId.startsWith('harness:')) {
    return true;
  }

  // Accept human reviewer identity class (§1.3 line 35)
  if (verifierId.startsWith('reviewer:')) {
    return true;
  }

  // All other identity classes are not authorized for VerificationRecord writes
  return false;
}
