export type TestEnvMap = NodeJS.ProcessEnv | Record<string, string | undefined>;

const GRAPH_KEYS = ['NEO4J_URI', 'NEO4J_USER', 'NEO4J_PASSWORD', 'NEO4J_DATABASE'] as const;

type GraphKey = (typeof GRAPH_KEYS)[number];

function read(env: TestEnvMap, key: string): string | undefined {
  const value = env[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function write(env: TestEnvMap, key: string, value: string | undefined): void {
  if (value !== undefined) {
    env[key] = value;
  }
}

export function isLiveCouncilNeo4jUri(uri: string | undefined): boolean {
  if (!uri) return false;

  try {
    const parsed = new URL(uri);
    const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const port = parsed.port || (parsed.protocol === 'bolt:' || parsed.protocol === 'neo4j:' ? '7687' : '');
    return port === '7688' && ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(host);
  } catch {
    return /^(bolt|neo4j):\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):7688(?:\/|$)/i.test(uri);
  }
}

export interface ApplyTestNeo4jTargetResult {
  uri?: string;
  source: 'TEST_NEO4J_URI' | 'NEO4J_URI' | 'unset';
}

/**
 * Apply the Neo4j routing rules for Vitest.
 *
 * TEST_NEO4J_* wins when present, so destructive suites can point at an
 * isolated disposable database/container. If no TEST_NEO4J_URI is present,
 * repo-local NEO4J_* values are loaded for compatibility, but the live Council
 * graph on bolt://localhost:7688 is refused unless an explicit override is set.
 */
export function applyTestNeo4jTarget(
  env: TestEnvMap,
  loaded: Record<string, string | undefined> = {},
): ApplyTestNeo4jTargetResult {
  const explicitTestUri = read(env, 'TEST_NEO4J_URI') ?? read(loaded, 'TEST_NEO4J_URI');

  if (explicitTestUri) {
    write(env, 'NEO4J_URI', explicitTestUri);
    write(env, 'NEO4J_USER', read(env, 'TEST_NEO4J_USER') ?? read(loaded, 'TEST_NEO4J_USER') ?? read(env, 'NEO4J_USER') ?? read(loaded, 'NEO4J_USER'));
    write(env, 'NEO4J_PASSWORD', read(env, 'TEST_NEO4J_PASSWORD') ?? read(loaded, 'TEST_NEO4J_PASSWORD') ?? read(env, 'NEO4J_PASSWORD') ?? read(loaded, 'NEO4J_PASSWORD'));
    write(env, 'NEO4J_DATABASE', read(env, 'TEST_NEO4J_DATABASE') ?? read(loaded, 'TEST_NEO4J_DATABASE') ?? read(env, 'NEO4J_DATABASE') ?? read(loaded, 'NEO4J_DATABASE'));
  } else {
    for (const key of GRAPH_KEYS) {
      write(env, key, read(loaded, key));
    }
  }

  const uri = read(env, 'NEO4J_URI');
  if (isLiveCouncilNeo4jUri(uri) && read(env, 'CLAW_MEMORY_ALLOW_LIVE_NEO4J_TESTS') !== 'true') {
    throw new Error(
      [
        '[vitest-env-setup] Refusing to run claw-memory tests against the live Council memory graph',
        `NEO4J_URI=${uri}`,
        'Set TEST_NEO4J_URI to a disposable Neo4j target, or set CLAW_MEMORY_ALLOW_LIVE_NEO4J_TESTS=true only for an explicitly accepted destructive-risk run.',
      ].join('\n'),
    );
  }

  return {
    uri,
    source: explicitTestUri ? 'TEST_NEO4J_URI' : uri ? 'NEO4J_URI' : 'unset',
  };
}
