#!/usr/bin/env tsx
/**
 * orphan-sweep.ts — Admin CLI for orphaned tenant node cleanup (iter9 Tier 9.3 M12 9.3c-1)
 * Thread: K (iter9 Tier 9.3)
 * Plan: SEMANTIC_MEMORY_V4_ITER9_TIER9_3 milestone iter9-T93-M12
 *
 * Closes CF-T92-3 (fresh-corpus-crash-orphan-tenant): cleans up orphaned MemoryClaim nodes
 * from crashed B2 fresh-corpus runs (iter9-bench-{qid}-{runId} prefix pattern).
 *
 * Usage:
 *   npm run orphan-sweep -- --dry-run --prefix=iter9-bench-
 *   npm run orphan-sweep -- --prefix=iter9-bench-              # wet run (deletes)
 *   npm run orphan-sweep -- --prefix=/tmp/my-test-tenant       # any prefix
 *
 * --dry-run: logs candidate count + matching project_root values without deleting.
 * --prefix=<pattern>: filter by project_root STARTS WITH <pattern>.
 *                     Default: '' (matches all tenants — use with caution).
 *
 * authorized_by: T11 (Jonathan 2026-05-05) + R-iter9-tier9.3-consolidation-preflight 5/5 2026-05-28
 */

import neo4j from 'neo4j-driver';
import { Neo4jService, resolveNeo4jConfig } from '../storage/neo4j/neo4j.service.js';

// ── Core handler (testable; imported by tests/orphan-sweep.test.ts) ──────────

export type OrphanSweepResult = {
  candidateCount: number;
  deletedCount: number;
  dryRun: boolean;
  prefix: string;
};

/**
 * runOrphanSweep — core orphan-sweep logic.
 *
 * Pass condition: returns { candidateCount, deletedCount, dryRun, prefix }.
 *   - dryRun=true: candidateCount reflects matches; deletedCount=0 (no deletes).
 *   - dryRun=false: candidateCount=deletedCount (all candidates deleted).
 *
 * Fail condition: neo4j.run() throws (connectivity, auth, etc.)
 */
export async function runOrphanSweep(
  opts: { dryRun: boolean; prefix: string },
  neo4j: Neo4jService,
): Promise<OrphanSweepResult> {
  const { dryRun, prefix } = opts;

  // Count candidates matching the prefix
  const countRows = await neo4j.run(
    `MATCH (n:MemoryClaim)
     WHERE n.project_root STARTS WITH $prefix
     RETURN count(n) AS cnt`,
    { prefix },
  );
  const candidateCount = Number(countRows[0]?.cnt ?? 0);

  if (dryRun) {
    process.stderr.write(`[orphan-sweep] dry-run: found ${candidateCount} MemoryClaim nodes with project_root STARTS WITH "${prefix}"\n`);
    return { candidateCount, deletedCount: 0, dryRun: true, prefix };
  }

  // Wet run: DETACH DELETE
  await neo4j.run(
    `MATCH (n:MemoryClaim)
     WHERE n.project_root STARTS WITH $prefix
     DETACH DELETE n`,
    { prefix },
  );
  process.stderr.write(`[orphan-sweep] wet-run: deleted ${candidateCount} MemoryClaim nodes with project_root STARTS WITH "${prefix}"\n`);
  return { candidateCount, deletedCount: candidateCount, dryRun: false, prefix };
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const prefixArg = args.find((a) => a.startsWith('--prefix='));
  const prefix = prefixArg ? prefixArg.slice('--prefix='.length) : '';

  if (prefix === '' && !dryRun) {
    process.stderr.write('[orphan-sweep] WARNING: no --prefix specified on wet run. This will target ALL MemoryClaim nodes.\n');
    process.stderr.write('[orphan-sweep] Re-run with --dry-run first to verify scope.\n');
    process.exit(1);
  }

  const { uri: neo4jUrl, user: neo4jUser, password: neo4jPass } = resolveNeo4jConfig();

  const driver = neo4j.driver(neo4jUrl, neo4j.auth.basic(neo4jUser, neo4jPass));
  const neo4jService = new Neo4jService({ driver });

  try {
    const result = await runOrphanSweep({ dryRun, prefix }, neo4jService);
    if (dryRun) {
      process.stdout.write(JSON.stringify({ dryRun: true, candidateCount: result.candidateCount, prefix }) + '\n');
    } else {
      process.stdout.write(JSON.stringify({ dryRun: false, deletedCount: result.deletedCount, prefix }) + '\n');
    }
  } finally {
    await driver.close();
  }
}

// Only execute main() when running as CLI script (not when imported as a module by tests).
// argv[1] contains the script path when run directly; vitest passes its own binary path.
if (process.argv[1]?.includes('orphan-sweep')) {
  main().catch((err) => {
    process.stderr.write(`[orphan-sweep] fatal: ${err}\n`);
    process.exit(1);
  });
}
