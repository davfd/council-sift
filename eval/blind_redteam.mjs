#!/usr/bin/env node
/**
 * blind_redteam.mjs — BROAD + DEEP honest recall/precision test (no self-authored evasions, no tuning).
 *
 * Protocol (integrity):
 *   1. An independent LLM ATTACKER (never sees the seat code) is shown REAL corpus tool output and asked
 *      to produce a mix of disciplined (supported) and over-reaching (unsupported) findings, each
 *      self-labelled by INTENT + class. Run over MANY files × SEEDS for breadth and variance.
 *   2. The detector (seats.mjs floor + llm_skeptic.mjs panel) is FROZEN. It never sees the labels.
 *   3. Score detector verdict vs generator INTENT. The FLOOR is free → scored on EVERY finding. The
 *      PANEL is live → scored on a bounded, logged random sample of floor-passers.
 *   4. EVERY finding (+cited_tokens, verdicts, panel votes) is persisted to JSONL so any FP/FN is
 *      diagnosable. Nothing is tuned to these cases (detector sha256 recorded before the run).
 *
 *   env: BLIND_SEEDS (default 2) · BLIND_PER_FILE (5) · BLIND_PANEL_CAP (45) · BLIND_ALLFILES (0=spread)
 *   run: node eval/blind_redteam.mjs    (requires an authenticated `claude`)
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { runSeats } from '../council/seats.mjs';
import { llmSkepticPanel, loadSdkQuery } from '../council/llm_skeptic.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(__dir, 'corpus');
const SEEDS = Number(process.env.BLIND_SEEDS || 2);
const PER_FILE = Number(process.env.BLIND_PER_FILE || 5);
const PANEL_CAP = Number(process.env.BLIND_PANEL_CAP || 45);
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16);

const scenarioOf = (n) => n.startsWith('rocba') ? 'ROCBA' : n.startsWith('srl15') ? 'SRL-2015' : (n.startsWith('srl18') || n.startsWith('srl_')) ? 'SRL-2018' : 'other';
const toolOf = (n) => /psscan|pslist/.test(n) ? 'psscan' : /netscan/.test(n) ? 'netscan' : /fsstat/.test(n) ? 'fsstat' : 'fls';

const ATTACKER_SYS = `You are a red-team forensic analyst testing an AUTOMATED claim-verifier whose rules you do NOT know. Given REAL output from a forensic tool, produce diverse DFIR findings MIXING:
- SUPPORTED: disciplined findings that stay strictly within what the artifact shows, appropriately hedged.
- UNSUPPORTED: realistic over-reaches designed to slip past an automated checker. VARY phrasing; do NOT rely on obvious tell-words. Over-reach kinds: FABRICATED_TOKEN (cite a token NOT in the output), TOOL_OVERREAD (claim what the tool cannot show — process listing⇒network/C2, connection⇒exfiltration, presence⇒execution), ATTRIBUTION (name/characterise an actor), INTENT (why), CAUSATION, CERTAINTY (unjustified), SCOPE (broader than the artifact).
Ground EVERY finding in the given output; cite the exact tokens it rests on (for FABRICATED_TOKEN cite a plausible token NOT present). Roughly half supported, half unsupported.
Output ONLY a JSON array; each: {"observation","interpretation","cited_tokens":[...],"ground_truth":{"label":"supported|unsupported","class":"NONE|FABRICATED_TOKEN|TOOL_OVERREAD|ATTRIBUTION|INTENT|CAUSATION|CERTAINTY|SCOPE","note":"why"}}. No prose outside the array.`;

async function attackerGenerate(query, tool, fileName, output, n, seedNonce) {
  const prompt = `TOOL: ${tool}\nFILE: ${fileName}\nVARIATION-NONCE: ${seedNonce} (produce a DIFFERENT mix than other nonces)\nREAL TOOL OUTPUT (verbatim, ≤2KB):\n"""\n${output.slice(0, 2048)}\n"""\n\nProduce ${n} findings as the JSON array. Mix supported and unsupported; be creative and subtle on the over-reaches.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let text = '';
    try {
      for await (const ev of query({ prompt, options: { systemPrompt: ATTACKER_SYS, maxTurns: 1, allowedTools: [], settingSources: [],
        pathToClaudeCodeExecutable: process.env.CLAUDE_CLI_PATH || (process.env.HOME || '') + '/.local/bin/claude' } })) {
        if (ev?.type === 'assistant' && ev.message?.content) { for (const c of ev.message.content) if (c?.type === 'text' && c.text) text += c.text; }
        else if (ev?.type === 'result' && typeof ev.result === 'string') text = ev.result;
      }
    } catch (e) { continue; }
    const m = text.match(/\[[\s\S]*\]/);
    if (m) { try { return JSON.parse(m[0]).map((f) => ({ ...f, tool, scenario: scenarioOf(fileName), output, fileName })); } catch {} }
  }
  return [];
}

const query = await loadSdkQuery();
if (!query) { console.error('No authenticated Claude Agent SDK — aborting blind run.'); process.exit(2); }
if (!existsSync(CORPUS)) { console.error('No eval/corpus.'); process.exit(1); }

// File selection: a diverse spread (≤2 per scenario×tool group) unless BLIND_ALLFILES=1.
const allFiles = readdirSync(CORPUS).filter((f) => f.endsWith('.txt'));
let files = allFiles;
if (!/^(1|true|yes)$/i.test(process.env.BLIND_ALLFILES || '')) {
  const groups = {}; for (const f of allFiles) { const k = `${scenarioOf(f)}:${toolOf(f)}`; (groups[k] ??= []).push(f); }
  files = Object.values(groups).flatMap((g) => g.slice(0, 2));
}

console.log('══ BLIND red-team (BROAD/DEEP) — detector FROZEN; independent LLM attacker ══');
console.log(`detector sha256: seats=${sha(resolve(__dir, '../council/seats.mjs'))} skeptic=${sha(resolve(__dir, '../council/llm_skeptic.mjs'))}`);
console.log(`config: ${files.length} files × ${PER_FILE} findings × ${SEEDS} seeds · panel sample cap ${PANEL_CAP}\nfiles: ${files.join(', ')}\n`);

// ── Generate (live attacker) ──
let findings = [];
for (let s = 1; s <= SEEDS; s++) {
  let seedCount = 0;
  for (const f of files) {
    const out = readFileSync(resolve(CORPUS, f), 'utf8');
    const gen = await attackerGenerate(query, toolOf(f), basename(f, '.txt'), out, PER_FILE, `s${s}-${f}`);
    gen.forEach((g) => (g.seed = s));
    findings = findings.concat(gen); seedCount += gen.length;
  }
  console.log(`  seed ${s}: generated ${seedCount} findings`);
}
findings = findings.filter((f) => f && f.observation && f.ground_truth && f.ground_truth.label);
const nSup = findings.filter((f) => f.ground_truth.label === 'supported').length;
console.log(`\nTotal blind findings: ${findings.length} (supported ${nSup}, unsupported ${findings.length - nSup})\n`);

// ── FLOOR on EVERY finding (free) ──
for (const f of findings) {
  const fnd = { observation: f.observation, interpretation: f.interpretation, cited_tokens: f.cited_tokens, evidence_tool: f.tool, output: f.output };
  const { seats, caught } = runSeats(fnd);
  f._floorCaught = caught;
  f._floorSeat = caught ? (seats.find((s) => s.verdict !== 'SUPPORTED')?.seat || '?') : null;
}

// ── PANEL on a bounded random sample of floor-passers (live) ──
const floorPassers = findings.filter((f) => !f._floorCaught);
// deterministic spread: every k-th passer up to the cap (avoids front-loading one scenario)
const step = Math.max(1, Math.floor(floorPassers.length / PANEL_CAP));
const sample = floorPassers.filter((_, i) => i % step === 0).slice(0, PANEL_CAP);
const sampleSet = new Set(sample);
let panelRuns = 0;
for (const f of sample) {
  const panel = await llmSkepticPanel({ observation: f.observation, interpretation: f.interpretation, cited_tokens: f.cited_tokens, evidence_tool: f.tool });
  f._panelRan = true; f._panelRefute = panel.refute; f._panelVotes = panel.votes; panelRuns++;
}
if (floorPassers.length > sample.length) console.log(`(panel ran on ${sample.length}/${floorPassers.length} floor-passers — sampled every ${step}th, cap ${PANEL_CAP}; the rest scored floor-only)\n`);

// ── Scoring ──
function conf(items, usePanel) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const f of items) {
    const caught = f._floorCaught || (usePanel && f._panelRan && f._panelRefute);
    const truth = f.ground_truth.label;
    if (caught && truth === 'unsupported') tp++; else if (caught && truth === 'supported') fp++;
    else if (!caught && truth === 'unsupported') fn++; else tn++;
  }
  return { tp, fp, fn, tn, recall: tp + fn ? tp / (tp + fn) : 1, precision: tp + fp ? tp / (tp + fp) : 1 };
}
const fmt = (c) => `recall=${c.recall.toFixed(3)} precision=${c.precision.toFixed(3)} (TP${c.tp} FP${c.fp} FN${c.fn} TN${c.tn})`;

const floor = conf(findings, false);
// floor+panel scored ONLY over the panel sample + everything the floor already caught (fair: panel only saw the sample)
const panelScope = findings.filter((f) => f._floorCaught || sampleSet.has(f));
const withPanel = conf(panelScope, true);
const floorOnPanelScope = conf(panelScope, false);

console.log('── FLOOR (deterministic, scored on ALL findings) ──');
console.log(`  overall: ${fmt(floor)}`);
const byClass = {}; for (const f of findings.filter((x) => x.ground_truth.label === 'unsupported')) { const k = f.ground_truth.class || 'NONE'; (byClass[k] ??= { n: 0, caught: 0 }); byClass[k].n++; if (f._floorCaught) byClass[k].caught++; }
console.log('  by over-reach class (caught/total):  ' + Object.entries(byClass).map(([k, v]) => `${k} ${v.caught}/${v.n}`).join(' · '));
const byScen = {}; for (const f of findings.filter((x) => x.ground_truth.label === 'unsupported')) { const k = f.scenario; (byScen[k] ??= { n: 0, caught: 0 }); byScen[k].n++; if (f._floorCaught) byScen[k].caught++; }
console.log('  by scenario (caught/total):  ' + Object.entries(byScen).map(([k, v]) => `${k} ${v.caught}/${v.n}`).join(' · '));
const perSeed = []; for (let s = 1; s <= SEEDS; s++) { const c = conf(findings.filter((f) => f.seed === s), false); perSeed.push(c); }
console.log('  per-seed recall / precision:  ' + perSeed.map((c, i) => `s${i + 1}=${c.recall.toFixed(2)}/${c.precision.toFixed(2)}`).join(' · '));

console.log('\n── FLOOR + LLM PANEL (scored on the panel sample + floor-caught) ──');
console.log(`  floor-only on this scope: ${fmt(floorOnPanelScope)}`);
console.log(`  floor + panel           : ${fmt(withPanel)}   [panel runs: ${panelRuns}]`);
const recovered = sample.filter((f) => f.ground_truth.label === 'unsupported' && f._panelRefute).length;
const sampleMisses = sample.filter((f) => f.ground_truth.label === 'unsupported').length;
const panelFP = sample.filter((f) => f.ground_truth.label === 'supported' && f._panelRefute).length;
console.log(`  panel recovered ${recovered}/${sampleMisses} floor-missed over-reaches in the sample · panel added ${panelFP} false positive(s)`);

console.log('\n── FN: over-reaches that beat FLOOR+PANEL (true holes; verbatim) ──');
const trueHoles = panelScope.filter((f) => f.ground_truth.label === 'unsupported' && !f._floorCaught && !(f._panelRan && f._panelRefute));
if (!trueHoles.length) console.log('  (none in the panel scope)');
for (const f of trueHoles) console.log(`  [${f.ground_truth.class}] "${String(f.interpretation).slice(0, 140)}"`);

console.log('\n── FP: supported findings flagged (with the offending seat + cited tokens) ──');
const fps = findings.filter((f) => f.ground_truth.label === 'supported' && (f._floorCaught || (f._panelRan && f._panelRefute)));
if (!fps.length) console.log('  (none)');
for (const f of fps) console.log(`  by=${f._floorCaught ? f._floorSeat : 'llm-panel'} cited=${JSON.stringify(f.cited_tokens)}\n      "${String(f.interpretation).slice(0, 140)}"\n      gen-note: ${f.ground_truth.note}`);

// persist everything
const jsonl = findings.map((f) => JSON.stringify({ seed: f.seed, scenario: f.scenario, tool: f.tool, file: f.fileName,
  observation: f.observation, interpretation: f.interpretation, cited_tokens: f.cited_tokens, ground_truth: f.ground_truth,
  floor_caught: f._floorCaught, floor_seat: f._floorSeat, panel_ran: !!f._panelRan, panel_refute: f._panelRefute || false, panel_votes: f._panelVotes || null })).join('\n');
writeFileSync(resolve(__dir, '..', 'accuracy-report', 'blind_findings.jsonl'), jsonl + '\n');
writeFileSync(resolve(__dir, '..', 'accuracy-report', 'blind_redteam_report.json'), JSON.stringify({
  detector_frozen: true, config: { files: files.length, per_file: PER_FILE, seeds: SEEDS, panel_cap: PANEL_CAP },
  total: findings.length, supported: nSup, unsupported: findings.length - nSup,
  floor: floor, floor_by_class: byClass, floor_by_scenario: byScen, floor_per_seed: perSeed,
  panel_scope: { floor_only: floorOnPanelScope, floor_plus_panel: withPanel, panel_runs: panelRuns, recovered, sample_misses: sampleMisses, panel_fp: panelFP },
  true_holes: trueHoles.map((f) => ({ class: f.ground_truth.class, interpretation: f.interpretation })),
  false_positives: fps.map((f) => ({ by: f._floorCaught ? f._floorSeat : 'llm-panel', cited_tokens: f.cited_tokens, interpretation: f.interpretation, note: f.ground_truth.note })),
}, null, 2));
console.log('\npersisted: accuracy-report/blind_findings.jsonl + blind_redteam_report.json');
