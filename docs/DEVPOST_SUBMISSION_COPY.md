# Devpost Submission Copy — Council-SIFT

> Fill the video URL before submitting. Repo is the clean public snapshot; the remaining operator-owned item is the final demo-video URL.

## Project title

Council-SIFT

## Tagline

Autonomous DFIR agents that investigate through SIFT, self-correct on adversarial Council review, and emit auditable evidence receipts.

## Short description

Council-SIFT extends Protocol SIFT with an agentic incident-response loop: an analyst agent runs read-only forensic tools, drafts findings, an adversarial Council verifies or refutes them against cited tool output, and only supported claims become hash-chained receipts and structured reports.

## Long description

Council-SIFT is a working autonomous DFIR system for the FIND EVIL! challenge. It uses Claude Code / an agentic framework as the primary execution engine, an MCP-backed `claw-memory-core` substrate for recall/remember/supersede-style audit memory, and a live identity kernel at `bin/sift` for forensic command execution. The kernel is default-deny: only read-only forensic tools and guarded utilities can run, destructive commands are refused before execution, capabilities are HMAC scoped and expiring, and the audit log is tamper-evident.

The core loop is:

1. evidence is examined with SIFT tools such as Sleuth Kit and Volatility; a bounded Plaso/psort reproducibility harness adds timeline corroboration for SRL-2018;
2. the analyst agent drafts a finding with observation, interpretation, confidence, and provenance;
3. Council seats check citation grounding, tool semantics, inference boundaries, and contradictions;
4. unsupported claims are bounced and recorded as self-corrections;
5. supported claims become Council-verified, hash-chained receipts;
6. reports and execution logs let a practitioner trace every finding back to exact tool execution and output hashes.

The demo shows a real self-correction on official SRL-2018 evidence: a process-listing overclaim about `Rar.exe` is rejected because `psscan` cannot establish C2/exfiltration by itself; the agent narrows the finding to a staging indicator and records the corrected receipt.

## Built with

- SANS SIFT Workstation / Linux terminal
- Model Context Protocol (MCP) via `@modelcontextprotocol/sdk` — 10 `claw-memory-core` tools
- Claude Code / agentic analyst loop
- Node.js / TypeScript
- Python
- Neo4j
- Volatility 3
- Sleuth Kit
- Plaso / log2timeline / psort
- Hash-chained Council receipts

## Required links

- Public repo: https://github.com/davfd/council-sift
- Demo video: operator-owned final URL to insert on Devpost before submission
- Architecture diagram: `docs/architecture.svg`
- Evidence documentation: `evidence-docs/EVIDENCE.md`
- Accuracy report: `accuracy-report/bench_real_report.md`
- Agent execution logs: `execution-logs/AGENTIC.md`
- Demo script: `docs/DEMO_SCRIPT.md`

## Key judging points

### Autonomous Execution Quality

The analyst agent selects tools, drafts claims, receives Council refutations, and self-corrects without human intervention. The logs include genuine autonomous runs, not just scripted toy output.

### IR Accuracy

Findings are split into observation, interpretation, confidence, and provenance. Unsupported claims are caught and preserved as evidence of self-correction instead of being silently hidden.

### Breadth and Depth

Council-SIFT goes deep on disk, memory, timeline, and memory-derived network telemetry over official challenge scenarios while preserving a general evidence-type-agnostic review loop. ROCBA was pursued through 30+ iterative Council-SIFT investigation/correction rounds; the public packet ships curated verified receipts and reports rather than raw scratch. The SRL-2018 path now includes a bounded Plaso/log2timeline + psort correlation of `StarFury.zip` and rare-earth file-server artifacts. Standalone PCAP payload analysis is not claimed because no PCAP/PCAPNG/CAP files were found in the mounted official evidence scan.

### Constraint Implementation

The live identity kernel is architectural, not prompt-only. It enforces default-deny tool authorization, refuses destructive and obfuscated commands, guards tool-native output paths, prevents analyst self-approval, and records tamper-evident audit events. The memory/review substrate includes a 10-tool Model Context Protocol server for `claw-memory-core` operations. Current bypass suite: 13/13 pass; live gate red-team: 52/52 destructive attempts refused, 20/20 legit forensic commands allowed.

### Audit Trail Quality

Every verified finding links to a receipt, tool execution reference, output hash, and narrative report. `csift trace` can re-resolve stored evidence pointers; `trace --rerun` reruns concrete recorded commands where available and labels non-rerunnable placeholders honestly.

### Usability and Documentation

The repo includes setup instructions, architecture docs, evidence documentation, accuracy reports, execution logs, demo scripts, and a publish checklist.

## Demo video checklist

Use `docs/DEMO_SCRIPT.md`:

1. Show README/architecture.
2. Say explicitly: MCP-backed memory layer, 10 MCP tools, and curated ROCBA receipts from 30+ investigation rounds.
3. Run `analyst/srl_memory_demo.sh`.
4. Show the Council bounce and corrected finding.
5. Run `node bridge/csift.mjs trace --rerun F-analyst-SRL-MEM-002` if local evidence path is available.
6. Show `python3 tests/test_bypass.py` and/or a destructive command refused by `bin/sift`.
7. Show `accuracy-report/bench_real_report.md` and `execution-logs/AGENTIC.md`.

Keep under five minutes with audio narration.
