// safety.mjs — shared host-side runtime guards for Council-SIFT tools.
//   guardIsolatedUri — hard-refuse any Neo4j URI that is not the isolated LOCAL 7690 graph
//                      (proper host+port parse, not a substring match — '7690' could appear in a host).
//   assertSafeId      — reject identifiers before they reach a filename or a derived path.

export function guardIsolatedUri(rawUri, die) {
  const uri = String(rawUri || '');
  let ok = false;
  try {
    // bolt:// / neo4j:// (and +s variants) aren't URL-parseable schemes everywhere; map to http for parsing.
    const u = new URL(uri.replace(/^(bolt|neo4j)(\+s(sc)?)?:/i, 'http:'));
    ok = ['localhost', '127.0.0.1', '::1'].includes(u.hostname) && u.port === '7690';
  } catch { ok = false; }
  if (!ok) die(`REFUSING: NEO4J_URI must be the isolated LOCAL 7690 graph (bolt://localhost:7690), got "${uri}"`);
}

const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;
export function assertSafeId(id, die, label = 'identifier') {
  const s = String(id ?? '');
  if (!SAFE_ID.test(s)) die(`REFUSING: unsafe ${label} "${s}" (allowed: A-Za-z0-9._- , 1-128 chars; no path separators)`);
  return s;
}
