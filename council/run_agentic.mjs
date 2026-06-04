#!/usr/bin/env node
/**
 * run_agentic.mjs — the Council as live OpenClaw/Claude-Agent-SDK seats.
 *
 * Each seat is an agent (its persona = council/agents/<seat>.md) that narrates a deposit, but its
 * VERDICT is grounded in the same deterministic primitive used by the reproducible loop — the agent
 * reasons/narrates, it cannot hand-wave past the check. Seat deposits are persisted to claw-memory.
 *
 *   node council/run_agentic.mjs <finding_id>
 *
 * Modes (auto-detected): if an authenticated `claude` CLI + @anthropic-ai/claude-agent-sdk are
 * available → LLM-narrated seats. Otherwise → deterministic-narration fallback (always runs).
 *
 * Env: NEO4J_URI/USER/PASSWORD (isolated 7690).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Neo4jService } from '../claw-memory-core/dist/storage/neo4j/neo4j.service.js';
import { citationSeat, toolSemanticsSeat, contradictionSeat, inferenceSeat, synthesisSeat } from './seats.mjs';
import { guardIsolatedUri } from '../safety.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const die = (m) => { console.error('[council:agentic] ' + m); process.exit(1); };
const id = process.argv[2];
if (!id) die('usage: node council/run_agentic.mjs <finding_id>');
guardIsolatedUri(process.env.NEO4J_URI, die);

const SEAT_FILE = { 'seat:citation': 'citation.md', 'seat:tool-semantics': 'tool-semantics.md', 'seat:contradiction': 'contradiction.md', 'seat:synthesis': 'synthesis.md', 'seat:inference': 'inference.md' };
const persona = (seat) => { try { return readFileSync(resolve(__dir, 'agents', SEAT_FILE[seat] || 'citation.md'), 'utf8'); } catch { return seat; } };

// Resolve the Claude Agent SDK from the vendored core's node_modules (regardless of this file's dir).
async function loadSdk() {
  try {
    const req = createRequire(resolve(__dir, '../claw-memory-core/package.json'));
    const sdkPath = req.resolve('@anthropic-ai/claude-agent-sdk');
    const mod = await import(sdkPath);
    return mod.query || (mod.default && mod.default.query) || null;
  } catch { return null; }
}

async function narrate(query, seat, finding, det) {
  const factSheet =
    `FINDING ${finding.finding_id}\nobservation: ${finding.observation}\ninterpretation: ${finding.interpretation || '(none)'}\n` +
    `tool: ${finding.tool} ${finding.command}\ncited_tokens resolve / tool output considered.\n` +
    `YOUR DETERMINISTIC CHECK → verdict=${det.verdict}; ${det.reasoning}`;
  if (query) {
    try {
      let text = '';
      for await (const ev of query({
        prompt: `${factSheet}\n\nWrite your deposit as this seat: one line "Status: ${det.verdict}", then 2-3 sentences of reasoning in your voice. Do NOT change the Status.`,
        options: { systemPrompt: persona(seat), maxTurns: 1, allowedTools: [], settingSources: [],
          pathToClaudeCodeExecutable: process.env.CLAUDE_CLI_PATH || join(process.env.HOME || '', '.local/bin/claude') },
      })) {
        if (ev?.type === 'assistant' && ev.message?.content) {
          for (const c of ev.message.content) if (c?.type === 'text' && c.text) text += c.text;
        } else if (ev?.type === 'result' && typeof ev.result === 'string') {
          text = ev.result;
        }
      }
      if (text.trim()) return { mode: 'LLM', text: text.trim() };
    } catch { /* fall through to deterministic narration */ }
  }
  return { mode: 'det', text: `Status: ${det.verdict}\n${det.reasoning}` };
}

const svc = new Neo4jService();
const rows = await svc.run(
  `MATCH (n:MemoryClaim) WHERE n.finding_id=$id OR n.nodeId=$id
   OPTIONAL MATCH (n)-[:DERIVED_FROM]->(te:ToolExecution)
   RETURN n.finding_id AS finding_id, n.nodeId AS nodeId, n.project_root AS project_root,
          n.observation AS observation, n.interpretation AS interpretation, n.confidence AS confidence,
          n.cited_tokens AS cited_tokens, n.evidence_tool AS tool, n.evidence_command AS command,
          n.evidence_locator AS evidence_locator, te.output AS output LIMIT 1`, { id });
if (!rows.length) die('finding not found: ' + id);
const f = rows[0];

const query = await loadSdk();
console.log(`\n══ Agentic Council (OpenClaw seats) on ${f.finding_id} ══`);
console.log(query ? '(SDK present — seats narrate via the Claude Agent SDK if `claude` is authenticated)\n'
                  : '(SDK not resolvable — deterministic-narration fallback)\n');

const seatFns = [['seat:citation', citationSeat], ['seat:tool-semantics', toolSemanticsSeat],
                 ['seat:contradiction', contradictionSeat], ['seat:inference', inferenceSeat]];
const verdicts = [];
let usedLLM = false;
for (const [seat, fn] of seatFns) {
  const det = fn(f);
  verdicts.push(det);
  const dep = await narrate(query, seat, f, det);
  usedLLM = usedLLM || dep.mode === 'LLM';
  console.log(`── ${seat} [${dep.mode}] ──\n${dep.text}\n`);
  // persist the seat deposit to claw-memory (mirrors the OpenClaw deposit pattern)
  await svc.run(
    `MATCH (n:MemoryClaim {nodeId:$nid})
     CREATE (d:SeatDeposit {seat:$seat, verdict:$verdict, narration:$text, mode:$mode, finding_id:$fid})
     MERGE (d)-[:DEPOSITED_ON]->(n)`,
    { nid: f.nodeId, seat, verdict: det.verdict, text: dep.text, mode: dep.mode, fid: f.finding_id });
}
const synth = synthesisSeat(verdicts);
console.log(`── seat:synthesis ──\n${synth.verdict}: ${synth.reasoning}\n`);
console.log(`disposition: ${synth.verdict}  ·  narration mode: ${usedLLM ? 'LLM (agentic)' : 'deterministic fallback'}`);
try { await svc.close?.(); } catch {}
process.exit(0);
