/**
 * identity-registry.ts — Semantic Memory V4 Identity Registry Loader
 * Thread: C (iter2-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER2_INGEST.md
 * AD5: YAML registry at claw-memory/config/semantic-memory/identity-registry.yaml
 *
 * Zod-validated loader. Loads YAML on first access, caches in memory.
 * loadRegistry(path?) allows explicit path override for tests.
 */

import { readFileSync } from 'fs';
import { resolve as resolvePath, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { parse } from 'yaml';

/**
 * OBS-J-FC3-01 / OBS-Z-FC3-01 Wave B extension: 'system' added to support D-W8
 * auto-capture writes where conversation_role === 'tool' maps to category 'system'
 * (FC3 binding: tool→system/0.70). Authorization: T4 (Wave B charter) → S1:0.
 * Modification is NOT on the AD8 frozen list; extend is authorized.
 * Consumers: identity-resolver.ts, alias-resolver.ts, raw-event-ingester.ts —
 * all import IdentityType from here and will pick up the extended union automatically.
 * DO NOT create a shadow identity-types.ts; all imports resolve through this canonical file.
 */
export type IdentityType = 'operator' | 'seat' | 'agent' | 'user' | 'system';

/** Zod schema: each registry entry must have stable_id matching the canonical format */
const RegistryEntrySchema = z.object({
  stable_id: z
    .string()
    .regex(
      /^(operator|seat|agent|user):[a-z0-9_-]+$/,
      'stable_id must match /^(operator|seat|agent|user):[a-z0-9_-]+$/',
    ),
  aliases: z.array(z.string()),
});

/** Zod schema: top-level registry structure */
const RegistrySchema = z.object({
  operators: z.array(RegistryEntrySchema),
  seats: z.array(RegistryEntrySchema),
  agents: z.array(RegistryEntrySchema),
  users: z.array(RegistryEntrySchema),
});

type RegistryData = z.infer<typeof RegistrySchema>;

/** In-memory cache */
let registry: RegistryData | null = null;

/**
 * Alias lookup map: type → (alias → canonical stable_id)
 * Built once when registry is loaded.
 */
const aliasMap = new Map<IdentityType, Map<string, string>>();

function buildAliasMap(data: RegistryData): void {
  aliasMap.clear();

  const typeArrays: Array<[IdentityType, RegistryData['operators']]> = [
    ['operator', data.operators],
    ['seat', data.seats],
    ['agent', data.agents],
    ['user', data.users],
  ];

  for (const [type, entries] of typeArrays) {
    const typeMap = new Map<string, string>();
    for (const entry of entries) {
      // stable_id maps to itself (canonical lookup by stable_id)
      typeMap.set(entry.stable_id, entry.stable_id);
      // Each alias (case-sensitive and lowercase) maps to stable_id
      for (const alias of entry.aliases) {
        typeMap.set(alias, entry.stable_id);
        typeMap.set(alias.toLowerCase(), entry.stable_id);
      }
    }
    aliasMap.set(type, typeMap);
  }
}

/**
 * Default registry YAML path — resolved relative to this source file.
 * Path: claw-memory/src/core/identity-registry.ts
 *       → ../../config/semantic-memory/identity-registry.yaml
 * Up 2 from src/core/ to claw-memory/, then into config/semantic-memory/
 * (Internal path-resolution helper;
 * post-relocation 2026-05-10 the file is 1 directory shallower so 2-up is correct.)
 */
function getDefaultRegistryPath(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    return resolvePath(__dirname, '../../config/semantic-memory/identity-registry.yaml');
  } catch {
    // Fallback to process.cwd() when import.meta.url is unavailable (CJS context)
    return resolvePath(process.cwd(), 'config/semantic-memory/identity-registry.yaml');
  }
}

/**
 * Load and validate the identity registry YAML.
 * Caches the result in memory after the first call.
 *
 * @param path - Optional explicit path to the YAML file. Overrides default.
 */
export function loadRegistry(path?: string): void {
  const yamlPath = path ?? getDefaultRegistryPath();
  const content = readFileSync(yamlPath, 'utf-8');
  const raw = parse(content) as unknown;
  registry = RegistrySchema.parse(raw);
  buildAliasMap(registry);
}

/**
 * Resolve an alias to its canonical stable_id for a given identity type.
 * Lazy-loads the registry on first call if not already loaded.
 *
 * @param alias - The alias, display name, or stable_id to resolve
 * @param type  - The identity type to look up within
 * @returns canonical stable_id string, or null if not found in registry
 */
export function resolve(alias: string, type: IdentityType): string | null {
  if (!registry) {
    loadRegistry();
  }
  const typeMap = aliasMap.get(type);
  if (!typeMap) return null;
  // Exact match first, then lowercase
  return typeMap.get(alias) ?? typeMap.get(alias.toLowerCase()) ?? null;
}
