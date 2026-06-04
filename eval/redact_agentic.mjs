#!/usr/bin/env node
/**
 * redact_agentic.mjs — make the autonomous Claude Code transcripts safe for a PUBLIC repo.
 *
 * The live agent logs (execution-logs/AGENTIC-*.jsonl) contain verbatim Volatility/Sleuth Kit output
 * derived from the official organizer evidence (in the `tool_result` blocks). We do not redistribute
 * official-evidence-derived bulk output. This redactor:
 *   - keeps a FULL local copy (AGENTIC-*.raw.jsonl, git-ignored) for our own audit;
 *   - drops non-JSON lines (e.g. the "Warning: no stdin..." banner) so the file is valid JSONL;
 *   - replaces each tool_result body with a short excerpt + char count + sha256 (auditability without
 *     republishing the full official output);
 *   - PRESERVES the agent's own reasoning, the tool commands it ran, verdicts, and receipt references —
 *     i.e. the proof of autonomous self-correction stays intact.
 *
 *   node eval/redact_agentic.mjs execution-logs/AGENTIC-LIVE.jsonl execution-logs/AGENTIC-SELFCORRECT.jsonl
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sha = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');

// A line that looks like a forensic tool-output ROW (psscan/pslist kernel offset, TSK inode, netscan
// ip:port). We strip these from ANY text/thinking block so the agent's prose stays but bulk
// official-evidence rows do not get republished.
const TOOLROW = /0x[0-9a-fA-F]{6,}|\b\d+-\d+-\d+:|\b(?:\d{1,3}\.){3}\d{1,3}:\d{1,5}\b/;
function scrubToolRows(t) {
  if (typeof t !== 'string' || !(t.includes('\n') || t.includes('\\n'))) return t;
  const out = []; let run = 0;
  // split on real OR escaped (\n) newlines — the agent often serializes tool output into a JSON string
  // whose line breaks are literal backslash-n, which a plain '\n' split would miss.
  for (const ln of t.split(/\r?\n|\\n/)) {
    if (TOOLROW.test(ln)) { run++; continue; }
    if (run) { out.push(`…[${run} line(s) of official-evidence tool-output rows redacted]`); run = 0; }
    out.push(ln);
  }
  if (run) out.push(`…[${run} line(s) of official-evidence tool-output rows redacted]`);
  return out.join('\n');
}
// tool_result = verbatim tool output: strip the data rows (keep any column header/prose) + append a hash.
const redactToolOutput = (t) =>
  (typeof t !== 'string') ? t
    : `${scrubToolRows(t)}\n[official-evidence-derived tool output: ${t.length} chars; sha256=${sha(t)}]`;

// Catch-all: recursively strip tool-output ROWS from EVERY string anywhere in the event. Safe because
// scrubToolRows only removes lines matching the row pattern; single-line IDs/signatures are untouched.
function deepScrub(o) {
  if (Array.isArray(o)) {
    for (let i = 0; i < o.length; i++) { if (typeof o[i] === 'string') o[i] = scrubToolRows(o[i]); else deepScrub(o[i]); }
  } else if (o && typeof o === 'object') {
    for (const k of Object.keys(o)) { if (typeof o[k] === 'string') o[k] = scrubToolRows(o[k]); else deepScrub(o[k]); }
  }
}
function redactItem(item) {
  if (!item || typeof item !== 'object') return item;
  if (item.type === 'tool_result') {
    if (typeof item.content === 'string') item.content = redactToolOutput(item.content);
    else if (Array.isArray(item.content)) item.content = item.content.map((c) => (c && c.type === 'text') ? { ...c, text: redactToolOutput(c.text) } : c);
  } else if (item.type === 'text' && typeof item.text === 'string') {
    item.text = scrubToolRows(item.text);                    // agent prose, minus any pasted tool rows
  } else if (item.type === 'thinking' && typeof item.thinking === 'string') {
    item.thinking = scrubToolRows(item.thinking);
  } else if (item.type === 'tool_use' && item.input) {
    // strip any tool rows inlined into a command heredoc OR a written-file body; keep the logic
    if (typeof item.input.command === 'string') item.input.command = scrubToolRows(item.input.command);
    if (typeof item.input.content === 'string') item.input.content = scrubToolRows(item.input.content);
  }
  return item;
}

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node eval/redact_agentic.mjs <AGENTIC-*.jsonl> ...'); process.exit(1); }
for (const f of files) {
  const raw = f.replace(/\.jsonl$/, '.raw.jsonl');
  if (!existsSync(raw)) copyFileSync(f, raw);   // preserve the full transcript locally (git-ignored)
  const out = [];
  let dropped = 0, redacted = 0;
  for (const line of readFileSync(raw, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s) continue;
    if (!s.startsWith('{')) { dropped++; continue; }   // non-JSON banner line
    let o; try { o = JSON.parse(s); } catch { dropped++; continue; }
    if (o.message && Array.isArray(o.message.content)) {     // applies to user (tool_result) AND assistant (text/thinking)
      o.message.content = o.message.content.map((it) => { const before = JSON.stringify(it); const r = redactItem(it); if (JSON.stringify(r) !== before) redacted++; return r; });
    }
    // Claude Code also duplicates the raw tool output in a top-level tool_use_result field — scrub it too.
    if (o.tool_use_result && typeof o.tool_use_result === 'object') {
      for (const k of ['stdout', 'stderr', 'output']) {
        if (typeof o.tool_use_result[k] === 'string') { o.tool_use_result[k] = redactToolOutput(o.tool_use_result[k]); redacted++; }
      }
      const c = o.tool_use_result.content;  // content can be a string OR an array of {type:'text',text}
      if (typeof c === 'string') { o.tool_use_result.content = redactToolOutput(c); redacted++; }
      else if (Array.isArray(c)) o.tool_use_result.content = c.map((it) => (it && it.type === 'text' && typeof it.text === 'string') ? { ...it, text: redactToolOutput(it.text) } : it);
    }
    deepScrub(o);  // bulletproof catch-all: no tool-output row survives in any nested string
    out.push(JSON.stringify(o));
  }
  writeFileSync(f, out.join('\n') + '\n');
  console.log(`redacted ${f}: ${out.length} JSON lines, ${redacted} tool_result(s) excerpted, ${dropped} non-JSON line(s) dropped (full raw → ${raw})`);
}
