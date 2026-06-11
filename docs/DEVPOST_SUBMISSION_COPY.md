# Devpost Submission Copy — Council-SIFT

> Paste-ready Devpost text. Fill the public demo-video URL before submitting.

## Project title

Council-SIFT

## Tagline

Autonomous DFIR agents that investigate through SIFT, self-correct on adversarial Council review, and emit auditable evidence receipts.

## Short description

Council-SIFT extends Protocol SIFT with an autonomous incident-response loop: an analyst agent runs read-only forensic tools, drafts findings, an adversarial Council verifies or refutes each claim against cited tool output, and only supported claims become hash-chained receipts and structured reports.

## What it does

Council-SIFT is a verification layer for autonomous digital forensics and incident response on the SANS SIFT Workstation. It does not replace the human examiner. It catches unsupported agent findings before a human is asked to trust them.

The loop is:

1. The analyst agent examines real evidence with SIFT tools such as Sleuth Kit, Volatility 3, Plaso/log2timeline, and psort.
2. The analyst drafts a finding with observation, interpretation, confidence, and provenance.
3. Five deterministic Council seats try to refute the claim for citation grounding, tool semantics, contradictions, inference boundaries, and scope boundaries; Synthesis aggregates those verdicts into verify-or-bounce.
4. Unsupported claims bounce back to the analyst and are recorded as self-corrections.
5. Supported claims receive hash-chained Council receipts.
6. Reports and execution logs let a practitioner trace every finding back to the exact tool execution and output hash.

The demo’s central example is official SRL-2018 memory evidence: a plausible `Rar.exe` process-listing overclaim is rejected because `psscan` cannot establish C2/exfiltration by itself; the agent narrows the finding to a staging indicator and records the corrected receipt.

## How we built it

- **Agentic execution:** Claude Code / OpenClaw-style analyst loop, with `analyst/autorun.sh` producing genuine autonomous investigations and `analyst/*_demo.sh` providing no-key reproducibility harnesses.
- **SIFT integration:** `bin/sift` gates forensic commands before execution and dispatches read-only SIFT tooling through the SIFT workstation wrapper.
- **Identity kernel:** default-deny authorization, HMAC-scoped and expiring capabilities, no analyst self-approval, forbidden-tool refusal, prompt-injection refusal, and tamper-evident audit events.
- **MCP-backed memory/review layer:** a 10-tool `claw-memory-core` Model Context Protocol server backed by Neo4j stores claims, tool executions, conflicts, receipts, and content hashes.
- **Council verifier:** deterministic refutation seats check citation grounding, tool semantics, contradiction, inference boundaries, and scope boundaries; Synthesis aggregates those seat verdicts into verify-or-bounce. An optional additive LLM skeptic panel can bounce second-order overreads after the deterministic floor passes.
- **Receipt and report pipeline:** `csift capture`, `record-finding`, `trace`, narrative report generation, accuracy reports, and structured agent logs make every claim reviewable.

## Challenges we ran into

- **Forensic claims are tempting to overstate.** A process listing can show that `Rar.exe` existed, but not prove C2, exfiltration, intent, or actor identity. Council-SIFT makes those inference boundaries explicit.
- **Prompt guardrails are not enough.** The evidence-protection layer had to be architectural: destructive commands are refused before execution, and evidence is mounted read-only as an OS-level backstop.
- **Reproducibility and official evidence conflict.** The official evidence is large and cannot be redistributed, so the repo separates no-PII reproducibility demos from real-evidence benchmark reports and public redacted logs.
- **Accuracy metrics need scope.** The injected-class benchmark shows the Council catches 85/85 unsupported injected findings with 0 false positives on the supported injected-class set, but the report also preserves blind red-team misses and false positives rather than claiming universal perfection.

## Accomplishments that we’re proud of

- A complete self-correction loop on real SRL-2018 evidence: wrong claim → Council bounce → agent self-correction → verified receipt.
- Public logs indexing 9 genuine autonomous runs across ROCBA, SRL-2015, and SRL-2018: 46 drafted findings, 36 verified findings, and 10 live self-corrections across disk, memory, and network telemetry.
- An at-scale real-output accuracy report: Council OFF lets 85/85 unsupported claims reach review; Council ON lets 0/85 reach the human on that benchmark.
- Architectural evidence integrity: destructive SIFT commands are refused by `bin/sift`; bypass tests cover self-approval, evidence prompt injection, forged/expired/scope capabilities, shell-token evasions, and tamper-evident audit behavior.
- Traceability from narrative report back to exact tool execution, receipt, output hash, and rerun status.

## What we learned

Autonomy is not only tool use. In DFIR, autonomy must include disciplined refusal: knowing what a tool output does **not** prove. The useful agent is not the one that writes the most confident report; it is the one whose claims can survive contact with the evidence.

## What’s next

- Package a cleaner native SIFT/OVA path after the hackathon, while preserving the current wrapper as the simplest judge-runnable route.
- Expand endpoint/log/remote MCP examples beyond the current disk, memory, timeline, and memory-derived network telemetry coverage.
- Add more held-out external benchmarks with stronger answer keys.
- Continue hardening the additive LLM skeptic panel and make its recall/false-positive envelope measurable separately from the deterministic floor.

## Built with

- SANS SIFT Workstation / Linux terminal
- Model Context Protocol (MCP), via `@modelcontextprotocol/sdk`
- Claude Code / OpenClaw-style agentic analyst loop
- Node.js / TypeScript
- Python
- Neo4j
- Volatility 3
- Sleuth Kit
- Plaso / log2timeline / psort
- Hash-chained Council receipts

## Required links / artifacts

- Public repo: https://github.com/davfd/council-sift — before final submission, verify public `main` contains the polished packet commit/artifacts
- Demo video: **paste final public video URL before submitting**
- Architecture diagram: `docs/architecture.png` and `docs/architecture.svg`
- Evidence documentation: `evidence-docs/EVIDENCE.md`
- Accuracy report: `accuracy-report/bench_real_report.md`
- Agent execution logs: `execution-logs/AGENTIC.md`
- Devpost/operator packet: `docs/SUBMISSION_PACKET.md`
- Recording cue card: `docs/FINAL_RECORDING_CUE_CARD.md`

## Try-it-out / judging instructions

The public repo README contains the full setup. The short path:

1. Clone `https://github.com/davfd/council-sift`.
2. Start the isolated Neo4j container on ports 7690/7476.
3. Build `claw-memory-core` and run `scripts/migrate.sh`.
4. Run no-key checks: `node eval/smoke_lifecycle.mjs`, `node eval/ablation.mjs`, `node eval/adversarial_evasions.mjs`, `node eval/trusted_execution_test.mjs`, `node eval/skeptic_panel_test.mjs`, and `python3 tests/test_bypass.py`.
5. If a SIFT workstation and official evidence are available, set `SIFT_WRAPPER`, mount evidence read-only, run `bash analyst/srl_memory_demo.sh`, and trace the verified finding.

Operator note: if preparing from `/home/exor/council-sift-recording`, push the current polished `HEAD` before using the public GitHub URL as the artifact source. During the Council audit, public `main` lagged the local packet; verify with `git rev-parse HEAD` and `git ls-remote origin refs/heads/main` before final submission.

## Key judging points

### Autonomous Execution Quality

The analyst agent selects tools, drafts claims, receives Council refutations, and self-corrects without human intervention. Public logs distinguish genuine autonomous runs from deterministic no-key replay demos.

### IR Accuracy

Findings are split into observation, interpretation, confidence, and provenance. Unsupported claims are caught and preserved as self-correction evidence instead of being silently hidden. The accuracy report includes false positives, false negatives, blind red-team notes, and honesty caveats.

### Breadth and Depth

Council-SIFT covers official ROCBA, SRL-2015, and SRL-2018 evidence across disk, memory, timeline correlation, and memory-derived network telemetry. No standalone PCAP payload analysis is claimed because no PCAP/PCAPNG/CAP files were found in the mounted official evidence scan.

### Constraint Implementation

The identity kernel is architectural, not prompt-only. It refuses destructive commands before execution, enforces scoped capabilities, blocks analyst self-approval, rejects evidence prompt-injection attempts, and preserves read-only evidence boundaries.

### Audit Trail Quality

Every verified finding links to a receipt, tool execution reference, output hash, and narrative report. `csift trace` re-resolves stored evidence pointers; `trace --rerun` reruns concrete recorded commands where available and labels non-rerunnable placeholders honestly.

### Usability and Documentation

The repo includes setup instructions, architecture docs, evidence documentation, accuracy reports, execution logs, demo scripts, and an operator submission packet.
