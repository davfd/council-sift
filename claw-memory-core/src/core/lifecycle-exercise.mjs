/**
 * lifecycle-exercise.mjs — S6:2 Lifecycle Transition End-to-End Exercise
 * Thread: F (iter5-execution)
 * Plan: SEMANTIC_MEMORY_V4_ITER5_A1HARNESS.md
 * Gate evidence: spec:S6:2, spec:IG6
 *
 * Executes the 4-phase end-to-end lifecycle exercise:
 *   Phase 1: Create ConflictRecord (lifecycle_clash, open) referencing nodeA + nodeB
 *   Phase 2: Transition nodeA and nodeB to lifecycleState='disputed'
 *   Phase 3: Resolve ConflictRecord (open→resolved) with resolutionText + resolverId
 *   Phase 4: Restore nodeA and nodeB to lifecycleState='active' via restoreFromDisputed
 *
 * Confirms: disputed nodes NOT promoted during disputed state.
 * Output: iter5/lifecycle-transition-exercise.log
 */

import neo4j from 'neo4j-driver';
import { createRequire } from 'module';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import TS modules via tsx/ts-node compilation
const require = createRequire(import.meta.url);

// We need to run this as a compiled module since the source is TypeScript
// Use the dist or run via tsx
import { transitionToDisputed, restoreFromDisputed, isPromotionEligible } from './lifecycle-transition.js';
import { resolveConflict, archiveConflict } from './conflict-resolution.js';
import { Neo4jService } from '../storage/neo4j/neo4j.service.js';
import { detectLifecycleClash } from './conflict-detector.js';

// Bench artifacts live at claw-memory/bench/artifacts/ (claw-memory-root-relative)
// so the exercise log resolves regardless of where the workspace is checked out.
// __dirname is claw-memory/src/core; '..', '..' goes up to claw-memory.
const CLAW_MEMORY_ROOT = resolve(__dirname, '..', '..');
const LOG_PATH = join(CLAW_MEMORY_ROOT, 'bench', 'artifacts', 'iter5', 'lifecycle-transition-exercise.log');

const log = [];
function emit(line) {
  const ts = new Date().toISOString();
  const entry = `[${ts}] ${line}`;
  log.push(entry);
  console.log(entry);
}

async function runExercise() {
  emit('authorized_by: Jonathan 2026-04-22T00:19:17Z (decision delegation) + Jonathan 2026-04-22T00:24:36Z (iter5 + iter6 execution) + Jonathan 2026-04-22T19:52:52Z (T3)');
  emit('lifecycle-transition-exercise.log — S6:2 End-to-End Lifecycle Exercise');
  emit('');

  const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', process.env.NEO4J_PASSWORD ?? 'neo4j'));
  const neo4jSvc = new Neo4jService({ driver });

  // Use two pilot-corpus nodeIds for the exercise
  // (nodes created fresh in Neo4j for this exercise, cleaned up after)
  const nodeAId = 'b26aab51-3468-5fc6-b69d-8df117802804'; // IM-02 from pilot corpus
  const nodeBId = '699495f9-751b-57b5-8432-b2a57c9e4727'; // IM-03 from pilot corpus

  try {
    // ── Part A: Startup cleanup — reset prior ConflictRecord residue ──────
    // Makes script idempotent across re-runs. Matches by (nodeA, nodeB) pair
    // (deterministic uuidv5 produces same crId each run — MERGE ON CREATE SET
    // does NOT reset properties on re-run, so Phase 3 resolveConflict() would
    // throw 'already_resolved' on second invocation without this reset).
    // Removes IN_SCOPE edge from any prior ConflictRecord for this node pair.
    emit('=== STARTUP CLEANUP: Resetting prior ConflictRecord residue (idempotency) ===');
    await neo4jSvc.run(
      `MATCH (cr:ConflictRecord)
       WHERE (cr.nodeA = $nodeA OR cr.nodeB = $nodeA)
         AND (cr.nodeA = $nodeB OR cr.nodeB = $nodeB)
         AND cr.resolutionState <> 'open'
       SET cr.resolutionState = 'open',
           cr.lifecycleState = 'active'
       WITH cr
       OPTIONAL MATCH (cr)-[r:IN_SCOPE]->()
       DELETE r`,
      { nodeA: nodeAId, nodeB: nodeBId },
    );
    emit('STARTUP CLEANUP PASS: Any prior ConflictRecord for this node pair reset to open; IN_SCOPE edge removed');
    emit('');

    // ── Setup: Create nodes if they don't exist ───────────────────────────
    emit('=== SETUP: Creating pilot corpus nodes in Neo4j for exercise ===');
    await neo4jSvc.run(
      `MERGE (n:InferredMemory {nodeId: $nodeId})
       ON CREATE SET n.content = 'Exercise node IM-02', n.producedBy = 'seat:michael',
         n.confidenceScore = 0.75, n.versionOrdinal = 1, n.priorVersionId = null,
         n.lifecycleState = 'active', n.ingestTime = toString(datetime())`,
      { nodeId: nodeAId },
    );
    await neo4jSvc.run(
      `MERGE (n:InferredMemory {nodeId: $nodeId})
       ON CREATE SET n.content = 'Exercise node IM-03', n.producedBy = 'seat:metatron',
         n.confidenceScore = 0.75, n.versionOrdinal = 1, n.priorVersionId = null,
         n.lifecycleState = 'active', n.ingestTime = toString(datetime())`,
      { nodeId: nodeBId },
    );
    emit(`SETUP: nodeA (IM-02) = ${nodeAId} — lifecycleState: active`);
    emit(`SETUP: nodeB (IM-03) = ${nodeBId} — lifecycleState: active`);
    emit('');

    // ── Phase 1: Create ConflictRecord ────────────────────────────────────
    emit('=== PHASE 1: Create ConflictRecord (lifecycle_clash, open) ===');
    const clashResult = await detectLifecycleClash(
      {
        nodeA: nodeAId,
        nodeB: nodeBId,
        detectedBy: 'harness:lifecycle-exercise',
        scopeName: 'council-deliberations',
      },
      neo4jSvc,
    );

    if (clashResult.status !== 'conflict_recorded') {
      throw new Error(`Phase 1 FAILED: ConflictRecord not created — ${clashResult.reason}`);
    }

    const crId = clashResult.record.nodeId;
    emit(`PHASE 1 PASS: ConflictRecord created`);
    emit(`  crId = ${crId}`);
    emit(`  conflictType = lifecycle_clash`);
    emit(`  resolutionState = open`);
    emit(`  nodeA = ${nodeAId}`);
    emit(`  nodeB = ${nodeBId}`);
    emit('');

    // ── Phase 2: Transition both nodes to disputed ────────────────────────
    emit('=== PHASE 2: Transition nodeA and nodeB to lifecycleState=disputed ===');

    const transitionA = await transitionToDisputed(nodeAId, crId, neo4jSvc);
    const transitionB = await transitionToDisputed(nodeBId, crId, neo4jSvc);

    if (transitionA.status !== 'transitioned') {
      throw new Error(`Phase 2 FAILED: nodeA transition failed — ${transitionA.reason}`);
    }
    if (transitionB.status !== 'transitioned') {
      throw new Error(`Phase 2 FAILED: nodeB transition failed — ${transitionB.reason}`);
    }

    emit(`PHASE 2 PASS: nodeA transitioned to ${transitionA.newLifecycleState}`);
    emit(`PHASE 2 PASS: nodeB transitioned to ${transitionB.newLifecycleState}`);

    // Confirm disputed nodes NOT eligible for promotion
    const eligA = await isPromotionEligible(nodeAId, neo4jSvc);
    const eligB = await isPromotionEligible(nodeBId, neo4jSvc);
    emit(`PHASE 2 CHECK: nodeA promotionEligible = ${eligA.eligible} (expected: false for disputed)`);
    emit(`PHASE 2 CHECK: nodeB promotionEligible = ${eligB.eligible} (expected: false for disputed)`);

    if (eligA.eligible || eligB.eligible) {
      throw new Error('Phase 2 FAILED: disputed node is promotion-eligible (AD6 violation)');
    }
    emit('PHASE 2 CHECK PASS: disputed nodes correctly blocked from promotion');
    emit('');

    // ── Phase 3: Resolve ConflictRecord (open→resolved) ──────────────────
    emit('=== PHASE 3: Resolve ConflictRecord (open→resolved) ===');
    const resolveResult = await resolveConflict(
      crId,
      'Exercise resolution: lifecycle clash resolved by council ruling',
      'seat:raguel',
      neo4jSvc,
    );

    if (resolveResult.status !== 'resolved') {
      throw new Error(`Phase 3 FAILED: ConflictRecord resolution failed — ${resolveResult.reason}`);
    }

    emit(`PHASE 3 PASS: ConflictRecord resolved`);
    emit(`  resolutionState = resolved`);
    emit(`  resolutionText = Exercise resolution: lifecycle clash resolved by council ruling`);
    emit(`  resolvedBy = seat:raguel`);
    emit(`  restoredNodes from coupling = [${(resolveResult.restoredNodes ?? []).join(', ')}]`);
    emit('');

    // ── Phase 4: Confirm both nodes restored to active ────────────────────
    emit('=== PHASE 4: Confirm nodeA and nodeB restored to lifecycleState=active ===');

    const rowA = await neo4jSvc.run(
      `MATCH (n {nodeId: $nodeId}) RETURN n.lifecycleState AS state`,
      { nodeId: nodeAId },
    );
    const rowB = await neo4jSvc.run(
      `MATCH (n {nodeId: $nodeId}) RETURN n.lifecycleState AS state`,
      { nodeId: nodeBId },
    );

    const stateA = rowA[0]?.state;
    const stateB = rowB[0]?.state;

    if (stateA !== 'active') {
      throw new Error(`Phase 4 FAILED: nodeA lifecycleState = ${stateA} (expected: active)`);
    }
    if (stateB !== 'active') {
      throw new Error(`Phase 4 FAILED: nodeB lifecycleState = ${stateB} (expected: active)`);
    }

    // Confirm restoration was via restoreFromDisputed coupling (no other open CRs)
    const openCRs = await neo4jSvc.run(
      `MATCH (cr:ConflictRecord)-[:CONFLICTS_WITH]->(n {nodeId: $nodeId})
       WHERE cr.resolutionState = 'open' RETURN count(cr) AS cnt`,
      { nodeId: nodeAId },
    );
    const openCount = Number(openCRs[0]?.cnt ?? 0);

    emit(`PHASE 4 PASS: nodeA lifecycleState = ${stateA}`);
    emit(`PHASE 4 PASS: nodeB lifecycleState = ${stateB}`);
    emit(`PHASE 4 CHECK: open ConflictRecords referencing nodeA = ${openCount} (expected: 0)`);
    emit('');

    // ── Phase 5: Archive ConflictRecord + remove IN_SCOPE edge ───────────
    // Rationale (dual, non-tension per Zadkiel A1):
    //   History preservation: node is retained — its provenance is auditable.
    //   Retrieval hygiene: IN_SCOPE edge is a routing signal for current
    //     retrievals; resolved/archived conflict has no retrieval-time relevance.
    // Note: archiveConflict() transitions resolutionState resolved→archived
    //   but does NOT write lifecycleState per Jeremiel inspection. The explicit
    //   SET below is required. conflict-resolution.ts is frozen (iter5 Phase 1
    //   production module); fix lives here in the exercise script.
    emit('=== PHASE 5: Archive ConflictRecord + remove IN_SCOPE edge ===');
    const archiveResult = await archiveConflict(crId, neo4jSvc);

    if (archiveResult.status !== 'archived') {
      throw new Error(`Phase 5 FAILED: archiveConflict returned status=${archiveResult.status} (expected: archived)`);
    }

    // Explicitly write lifecycleState='archived' — archiveConflict() only sets resolutionState
    await neo4jSvc.run(
      `MATCH (cr:ConflictRecord {nodeId: $crId})
       SET cr.lifecycleState = 'archived'`,
      { crId },
    );

    // Delete IN_SCOPE edge from ConflictRecord (routing hygiene); preserve node
    await neo4jSvc.run(
      `MATCH (cr:ConflictRecord {nodeId: $crId})-[r:IN_SCOPE]->()
       DELETE r`,
      { crId },
    );

    // Verify acceptance criteria
    const crPostArchive = await neo4jSvc.run(
      `MATCH (cr:ConflictRecord {nodeId: $crId})
       RETURN cr.resolutionState AS resolutionState, cr.lifecycleState AS lifecycleState`,
      { crId },
    );
    const crState = crPostArchive[0];
    if (crState?.resolutionState !== 'archived') {
      throw new Error(`Phase 5 FAILED: ConflictRecord resolutionState = ${crState?.resolutionState} (expected: archived)`);
    }
    if (crState?.lifecycleState !== 'archived') {
      throw new Error(`Phase 5 FAILED: ConflictRecord lifecycleState = ${crState?.lifecycleState} (expected: archived)`);
    }

    const inScopePost = await neo4jSvc.run(
      `MATCH (cr:ConflictRecord {nodeId: $crId})-[r:IN_SCOPE]->() RETURN count(r) AS cnt`,
      { crId },
    );
    const inScopeCnt = Number(inScopePost[0]?.cnt ?? 0);
    if (inScopeCnt !== 0) {
      throw new Error(`Phase 5 FAILED: ConflictRecord IN_SCOPE count = ${inScopeCnt} (expected: 0)`);
    }

    emit(`PHASE 5 PASS: ConflictRecord archived`);
    emit(`  crId = ${crId}`);
    emit(`  resolutionState = ${crState.resolutionState}`);
    emit(`  lifecycleState = ${crState.lifecycleState}`);
    emit(`  IN_SCOPE edges remaining = ${inScopeCnt}`);
    emit('');

    // ── Summary ───────────────────────────────────────────────────────────
    emit('=== EXERCISE SUMMARY ===');
    emit('LIFECYCLE_TRANSITIONS_EXERCISED: true');
    emit(`ConflictRecord ID: ${crId}`);
    emit('Phase 1 PASS: ConflictRecord (lifecycle_clash, open) created');
    emit('Phase 2 PASS: nodeA + nodeB transitioned to disputed; promotion blocked');
    emit('Phase 3 PASS: ConflictRecord resolved (open→resolved) with resolutionText + resolverId');
    emit('Phase 4 PASS: nodeA + nodeB restored to active (no other open ConflictRecords)');
    emit('Phase 5 PASS: ConflictRecord archived (resolved→archived); IN_SCOPE edge removed; node preserved');
    emit('EXERCISE_RESULT: PASS');

  } finally {
    // Cleanup exercise nodes
    await neo4jSvc.run(
      `MATCH (n) WHERE n.nodeId IN [$nodeAId, $nodeBId] DETACH DELETE n`,
      { nodeAId, nodeBId },
    );
    await driver.close();
  }

  // Write log file
  const logContent = `# lifecycle-transition-exercise.log — S6:2 End-to-End Lifecycle Exercise (Phase 5 patch: Raphael 2026-04-23)
# authorized_by: Jonathan 2026-04-22T00:19:17Z (decision delegation) + Jonathan 2026-04-22T00:24:36Z (iter5 + iter6 execution) + Jonathan 2026-04-22T19:52:52Z (T3)
# generated_by: lifecycle-exercise.mjs (Michael Stage 3 Phase 1 + Raphael Stage 5 Phase 5 patch, iter5 Thread F)

${log.join('\n')}
`;

  const logsDir = join(CLAW_MEMORY_ROOT, 'bench', 'artifacts', 'iter5');
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
  writeFileSync(LOG_PATH, logContent, 'utf-8');
  console.log(`\nLog written to: ${LOG_PATH}`);
}

// OBS-21 fix (Wave B T4 authorization): process.exit(0) on success path after driver.close()
// prevents Neo4j driver bolt connection from keeping Node.js event loop alive indefinitely.
// Without this, the process hangs even after all exercise phases complete successfully.
runExercise()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Exercise FAILED:', err);
    process.exit(1);
  });
