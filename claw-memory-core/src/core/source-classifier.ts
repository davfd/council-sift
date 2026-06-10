/**
 * source-classifier.ts — E0 shared source-status classifier helper
 * Thread: J (iter8 semantic retrieval)
 * Plan: SEMANTIC_MEMORY_V4_ITER8
 * Gate evidence: spec:S1:0 (task:S1:0), gate:G0 (IG-iter8-E0)
 *
 * Extracts all inline existsSync-based source-status classification logic into
 * a single shared helper. Three call sites replaced: remember.ts, list-memories.ts,
 * recall.ts (BLOCK-iter8-1 E0 carve-out fourth bounded change).
 *
 * Four branches:
 *   undefined/null → unverifiable / no_source_provided
 *   URL scheme     → unverifiable / remote_url_provenance_only  (was: artifact_moved_or_deleted — E0 fix)
 *   existsSync=true → verifiable
 *   existsSync=false → unverifiable / artifact_moved_or_deleted
 *
 * authorized_by: T7 (Jonathan 2026-04-30T21:33:01Z — iter8 charter E0)
 *              + 5/5 council Round 1 RATIFIED 2026-05-01T00:51-00:53Z UTC
 *                (Jophiel+Jeremiel+Barachiel+Raguel+Zadkiel; remote-URL awareness)
 */

import { existsSync } from 'fs';

/**
 * Classify the source status of a memory artifact reference.
 *
 * Returns { source_status, reason? } per the FC4 / BLOCK-20 contract.
 *
 * Canonical reason values:
 *   - 'no_source_provided'          — ref absent or null
 *   - 'remote_url_provenance_only'  — ref is a URL scheme (discord://, http://, s3://, etc.);
 *                                     provenance cannot be verified locally; E0 behavioral fix
 *   - 'artifact_moved_or_deleted'   — ref is a filesystem path that does not resolve
 *   (no reason when source_status === 'verifiable')
 *
 * @param ref - source_artifact_ref value (may be undefined/null for absent refs)
 */
export function classifySource(ref?: string): { source_status: 'verifiable' | 'unverifiable'; reason?: string } {
  // Branch 1: absent ref
  if (ref === undefined || ref === null) {
    return { source_status: 'unverifiable' as const, reason: 'no_source_provided' };
  }

  // Branch 2: URL scheme — remote provenance; cannot verify locally (E0 behavioral fix)
  // Regex per spec: ^[a-z][a-z0-9+.-]*://  (discord://, http://, https://, s3://, etc.)
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(ref)) {
    return { source_status: 'unverifiable' as const, reason: 'remote_url_provenance_only' };
  }

  // Branch 3+4: filesystem path — check existence
  if (existsSync(ref)) {
    return { source_status: 'verifiable' as const };
  }

  // Branch 4: filesystem path not found
  return { source_status: 'unverifiable' as const, reason: 'artifact_moved_or_deleted' };
}
