/**
 * smoke_lifecycle.mjs — P0 clean-room gate for Council-SIFT.
 *
 * Proves the claw-memory-core substrate + the objection/dispute machinery work
 * end-to-end on the ISOLATED graph (bolt 7690), using the REAL compiled engine
 * (Neo4jService + handleMarkWrong/autoWriteConflictRecord) — decoupled from both
 * Leonardo (7687) and the live council (7688).
 *
 * Flow: deposit finding F1 → deposit corrected finding F2 → seat REFUTES F1 via the
 * real mark_wrong handler (contradicted by F2) → assert F1=disputed, a ConflictRecord
 * was written referencing F1, and the corrected F2 stands active.
 *
 * Run:  set -a; source claw-memory-core/.env; set +a; node eval/smoke_lifecycle.mjs
 */
import { createHash, randomUUID } from 'node:crypto';
import { Neo4jService } from '../claw-memory-core/dist/storage/neo4j/neo4j.service.js';
import { handleMarkWrong } from '../claw-memory-core/dist/handlers/mark-wrong.js';

const TENANT = '/case/SMOKE-0001';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const emit = (...a) => console.log('[smoke]', ...a);

async function deposit(svc, id, content) {
  await svc.run(
    `MERGE (n:MemoryClaim {nodeId:$id, project_root:$t})
     ON CREATE SET n.content=$c, n.content_sha256=$h, n.source_identity='agent:analyst',
       n.owner_seat='seat:synthesis', n.lifecycleState='active', n.verificationState='unverified',
       n.memory_type='MemoryClaim', n.created_at=$ts`,
    { id, t: TENANT, c: content, h: sha(content), ts: new Date().toISOString() },
  );
}

async function main() {
  const uri = process.env.NEO4J_URI || '';
  if (!uri.includes('7690')) {
    throw new Error(`REFUSING: NEO4J_URI must be the isolated 7690 graph, got "${uri}" (never 7687/7688)`);
  }
  const svc = new Neo4jService();
  emit('connected to isolated graph:', uri);

  const F1 = randomUUID();
  const F2 = randomUUID();
  const claim1 = 'Process p.exe (PID 8260) is malicious because it is in C:\\Windows\\Temp\\perfmon';
  const claim2 = 'p.exe (PID 8260) parent is cmd.exe (PID 5948); maliciousness requires corroboration beyond path';

  await deposit(svc, F1, claim1);
  emit('DEPOSIT  F1 (active)         :', F1);
  await deposit(svc, F2, claim2);
  emit('DEPOSIT  F2 corrected (active):', F2);

  const mw = await handleMarkWrong(
    {
      nodeId: F1,
      reason: 'Citation seat: Temp-path alone does not establish maliciousness — claim unsupported; analyst superseded it with F2',
      tenant_id: TENANT,
      // orphan refute: only the unsupported finding (F1) is disputed; the corrected F2 stands active
    },
    svc,
  );
  emit('REFUTE   F1 (mark_wrong)     :', mw.structured.lifecycleState);

  const f1 = await svc.run(`MATCH (n:MemoryClaim {nodeId:$id}) RETURN n.lifecycleState AS s`, { id: F1 });
  const f2 = await svc.run(`MATCH (n:MemoryClaim {nodeId:$id}) RETURN n.lifecycleState AS s`, { id: F2 });
  const cr = await svc.run(
    `MATCH (cr:ConflictRecord)
     WHERE cr.contestedNodeId=$id OR cr.nodeA=$id OR cr.nodeB=$id
        OR (cr)-[:CONFLICTS_WITH]-(:MemoryClaim {nodeId:$id})
     RETURN cr.nodeId AS cr, cr.resolutionState AS rs LIMIT 1`,
    { id: F1 },
  );

  const f1state = f1[0]?.s, f2state = f2[0]?.s, crId = cr[0]?.cr, crState = cr[0]?.rs;
  emit('VERIFY   F1=', f1state, '| ConflictRecord=', crId, '(' + crState + ') | F2=', f2state);

  const ok = f1state === 'disputed' && !!crId && f2state === 'active';

  // cleanup the smoke tenant
  await svc.run(`MATCH (n) WHERE n.project_root=$t DETACH DELETE n`, { t: TENANT });
  await svc.run(`MATCH (cr:ConflictRecord) WHERE cr.nodeId=$cr DETACH DELETE cr`, { cr: crId ?? '' });
  try { await svc.close?.(); } catch {}

  emit(ok
    ? 'SMOKE PASS ✓  deposit → refute → ConflictRecord → corrected-claim lifecycle works on the isolated graph'
    : 'SMOKE FAIL ✗');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('[smoke] ERROR', e); process.exit(1); });
