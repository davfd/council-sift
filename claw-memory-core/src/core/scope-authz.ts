/**
 * scope-authz.ts — Semantic Memory V4 Scope Authorization Loader
 * Thread: D (iter3-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER3_CLASSIFY.md
 * Gate evidence: spec:S2:3, spec:S3:3, spec:IG4
 *
 * AD3/AD6 coupled mechanism: scope-authz is the gate through which
 * council.interpretation_authority delegation is conferred for classify
 * writes (MemoryClaim/SummaryMemory/InferredMemory).
 *
 * Zod-validated YAML loader with in-memory cache.
 * loadScopeAuthz(path?) allows explicit path override for tests.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { parse } from 'yaml';

/** Zod schema for a single authorization entry */
const AuthorizationEntrySchema = z.object({
  identity: z.string().min(1, 'identity must be non-empty'),
  authorized_scopes: z
    .array(z.string().min(1))
    .min(1, 'authorized_scopes must be a non-empty array'),
});

/** Zod schema for the full scope-authz file */
const ScopeAuthzSchema = z.object({
  authorizations: z.array(AuthorizationEntrySchema),
});

type ScopeAuthz = z.infer<typeof ScopeAuthzSchema>;

/** In-memory cache */
let authz: ScopeAuthz | null = null;
let authzPath: string | null = null;

/**
 * Default scope-authz YAML path — resolved relative to this source file.
 */
function getDefaultAuthzPath(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    return resolve(__dirname, '../../config/semantic-memory/scope-authz.yaml');
  } catch {
    return resolve(process.cwd(), 'config/semantic-memory/scope-authz.yaml');
  }
}

/**
 * Load and validate the scope-authz YAML.
 * Caches the result in memory. Calling again with the same path is a no-op.
 *
 * @param path - Optional explicit path to the YAML file. Overrides default.
 */
export function loadScopeAuthz(path?: string): void {
  const yamlPath = path ?? getDefaultAuthzPath();
  if (authz !== null && authzPath === yamlPath) return;
  const content = readFileSync(yamlPath, 'utf-8');
  const raw = parse(content) as unknown;
  authz = ScopeAuthzSchema.parse(raw);
  authzPath = yamlPath;
}

/**
 * Check whether an identity is authorized to write classify-derived nodes
 * to a given scope.
 *
 * AD3/AD6: scope-authz gates council.interpretation_authority delegation for
 * classify writes. Returns false if the identity is not in the allowlist
 * or the scope is not in the identity's authorized_scopes.
 *
 * Lazy-loads the authz config on first call if not already loaded.
 *
 * @param identity - The canonical identity string (e.g., 'seat:raguel')
 * @param scope    - The target scope name (e.g., 'council-deliberations')
 * @returns boolean — true if authorized, false if not
 */
export function isAuthorized(identity: string, scope: string): boolean {
  if (!authz) {
    loadScopeAuthz();
  }
  const entry = authz!.authorizations.find((a) => a.identity === identity);
  if (!entry) return false;
  return entry.authorized_scopes.includes(scope);
}

/**
 * Get all authorized scopes for an identity.
 *
 * @param identity - The canonical identity string
 * @returns string[] — list of authorized scope names, or empty array if not found
 */
export function getAuthorizedScopes(identity: string): string[] {
  if (!authz) {
    loadScopeAuthz();
  }
  const entry = authz!.authorizations.find((a) => a.identity === identity);
  return entry ? entry.authorized_scopes : [];
}
