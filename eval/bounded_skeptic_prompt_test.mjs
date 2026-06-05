#!/usr/bin/env node
import { llmSkepticPanel } from '../council/llm_skeptic.mjs';

let seenPrompt = '';
const query = async function* ({ prompt }) {
  seenPrompt = prompt;
  yield { type: 'result', result: '{"refute":false,"class":"NONE","reason":"supported"}' };
};

const bounded = {
  output_sha256: 'f'.repeat(64),
  excerpt_sha256: 'e'.repeat(64),
  total_chars: 50000,
  excerpt_chars: 137,
  max_chars: 400,
  excerpt: 'Offset(P) Name PID PPID\n0x9abc Rar.exe 2524 6352\n[... omitted 49863 chars; full output hash above ...]',
};

const result = await llmSkepticPanel({
  finding_id: 'F-analyst-SRL-MEM-002',
  observation: 'vol3 windows.psscan shows Rar.exe PID 2524',
  interpretation: 'Rar.exe is a staging indicator; exfiltration is not established from psscan alone',
  evidence_tool: 'vol3',
  evidence_locator: 'windows.psscan:PID=2524',
  cited_tokens: ['Rar.exe', '2524'],
  evidence_excerpt: bounded,
}, { query, lenses: [{ name: 'support', focus: 'support scope' }], threshold: 1 });

if (!result.ran || result.refute) throw new Error('mock panel should run and support');
if (!seenPrompt.includes('BOUNDED_EVIDENCE_EXCERPT')) throw new Error('skeptic prompt must label bounded evidence excerpt');
if (!seenPrompt.includes('Rar.exe 2524')) throw new Error('skeptic prompt must include bounded cited evidence line');
if (!seenPrompt.includes(bounded.output_sha256)) throw new Error('skeptic prompt must bind excerpt to full output hash');
if (seenPrompt.includes('50000') && !seenPrompt.includes('full output')) throw new Error('prompt should explain truncation/full-output boundary');

console.log('bounded_skeptic_prompt_test PASS');
