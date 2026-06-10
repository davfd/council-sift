/**
 * tenant.ts — Project-Root Tenant Model
 * Thread: G (iter6-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER6_WAVE_A.md
 * Gate evidence: spec:S6:1, spec:IG6
 *
 * AD6: git rev-parse --show-toplevel PRIMARY; realpathSync fallback.
 * Call 3: resolved ONCE at session init (module load), LOCKED for session.
 * FC5: claw-memory:root sentinel for CWD=/ (MUST NOT use bare "/" as tenant_id).
 * authorized_by: Jonathan 2026-04-22T19:52:52Z (iter6 NEW CHARTER)
 */

import { execSync } from 'child_process';
import { realpathSync } from 'fs';

/** Sentinel for CWD=/ to prevent namespace collapse (FC5 §3; BLOCK-15) */
export const ROOT_SENTINEL = 'claw-memory:root';

/**
 * Resolve the project root for tenant isolation.
 * Primary: git rev-parse --show-toplevel
 * Fallback: realpathSync(process.cwd())
 * Edge case CWD=/: returns ROOT_SENTINEL 'claw-memory:root'
 * Edge case /tmp: standard rule (no sentinel)
 * Session lock: call this function once at module load, not per-command.
 */
export function resolveProjectRoot(): string {
  // Primary: git-aware resolution
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (gitRoot) return gitRoot;
  } catch {
    // Not a git repo — fall through
  }

  // Non-git fallback: absolute-resolved CWD
  const resolved = realpathSync(process.cwd());

  // Edge case: filesystem root → sentinel to prevent namespace collapse (BLOCK-15)
  if (resolved === '/') {
    process.stderr.write(
      '[claw-memory] Warning: CWD is /. Using sentinel tenant_id "claw-memory:root". ' +
      'All sessions launched from / share this namespace.\n',
    );
    return ROOT_SENTINEL;
  }

  // Standard non-git (including /tmp paths): use resolved path
  return resolved;
}

/**
 * Session-init lock (Call 3): resolved ONCE at MCP server startup.
 * This constant is the locked project root for the entire session.
 */
export const PROJECT_ROOT = resolveProjectRoot();

/** Get the locked project root (Call 3: same value throughout session) */
export function getProjectRoot(): string {
  return PROJECT_ROOT;
}
