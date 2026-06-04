import type { Driver } from 'neo4j-driver';

/**
 * FIND-B6-01: This guard intentionally has no NODE_ENV=test bypass branch.
 * Test-environment write bypass behavior is enforced at the Neo4jService layer
 * (`src/storage/neo4j/neo4j.service.ts`), not in this module.
 */

export class ProjectWriteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectWriteValidationError';
  }
}

function collectProjectIdsDeep(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 6 || value == null) return;

  if (typeof value === 'string') {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectProjectIdsDeep(item, out, depth + 1);
    return;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    for (const key of ['projectId', 'pid']) {
      const v = obj[key];
      if (typeof v === 'string' && v.trim().length > 0) {
        out.add(v.trim());
      }
    }

    for (const nested of Object.values(obj)) {
      collectProjectIdsDeep(nested, out, depth + 1);
    }
  }
}

function extractLiteralProjectIdsFromQuery(query: string): string[] {
  const ids = new Set<string>();

  // projectId: 'proj_...'
  const mapLiteral = /projectId\s*:\s*['"]([^'"]+)['"]/gi;
  for (let m = mapLiteral.exec(query); m; m = mapLiteral.exec(query)) {
    if (m[1]?.trim()) ids.add(m[1].trim());
  }

  // n.projectId = 'proj_...'
  const equalsLiteral = /\bprojectId\b\s*=\s*['"]([^'"]+)['"]/gi;
  for (let m = equalsLiteral.exec(query); m; m = equalsLiteral.exec(query)) {
    if (m[1]?.trim()) ids.add(m[1].trim());
  }

  return [...ids];
}

export function extractProjectIds(query: string, params: Record<string, unknown> = {}): string[] {
  const ids = new Set<string>();
  collectProjectIdsDeep(params, ids);

  for (const id of extractLiteralProjectIdsFromQuery(query)) {
    ids.add(id);
  }

  return [...ids];
}

export function extractProjectId(params: Record<string, unknown> = {}): string | undefined {
  const ids = extractProjectIds('', params);
  return ids[0];
}

function stripComments(query: string): string {
  return query
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim();
}

export function isWriteQuery(query: string): boolean {
  const q = stripComments(query);

  // Covers direct writes + APOC write procedures.
  return /\b(CREATE|MERGE|SET|DELETE|REMOVE|DETACH\s+DELETE|FOREACH)\b/i.test(q)
    || /\bCALL\s+apoc\.(?:create|merge|periodic\.iterate|refactor)\b/i.test(q);
}

export function isProjectScopedWriteQuery(query: string, params: Record<string, unknown> = {}): boolean {
  if (!isWriteQuery(query)) return false;
  return extractProjectIds(query, params).length > 0;
}

export async function validateProjectWrite(driver: Driver, projectId: string): Promise<void> {
  const trimmed = projectId?.trim();
  if (!trimmed) {
    throw new ProjectWriteValidationError('PROJECT_WRITE_BLOCKED: missing projectId for write operation');
  }

  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (p:Project {projectId: $projectId})
       RETURN coalesce(p.registered, false) AS registered
       LIMIT 1`,
      { projectId: trimmed },
    );

    const registered = result.records[0]?.get('registered');
    const isRegistered = registered === true;

    if (!isRegistered) {
      throw new ProjectWriteValidationError(
        `PROJECT_WRITE_BLOCKED: projectId '${trimmed}' is not registered (Project.registered=true required)`,
      );
    }
  } finally {
    await session.close();
  }
}
