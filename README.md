# Council-SIFT

> **An adversarial verification Council for autonomous DFIR.**
> It secures the *reasoning* — refuting unsupported findings against the real evidence and forcing the
> analyst to self-correct **before** a human ever signs off.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Platform: SIFT / Linux](https://img.shields.io/badge/platform-SANS%20SIFT%20%2F%20Linux-blue)
![Frameworks: Claude Code + OpenClaw](https://img.shields.io/badge/agents-Claude%20Code%20%2B%20OpenClaw-orange)
![Status: FIND EVIL! submission](https://img.shields.io/badge/SANS-FIND%20EVIL!-red)

Council-SIFT extends **Protocol SIFT**'s autonomous incident response with a multi-agent **Council**
that wraps a forensic **analyst** (Claude Code on the SANS SIFT Workstation). The analyst drafts
findings; the Council's verifier seats (OpenClaw / Claude-Agent-SDK agents, each grounded in a
deterministic check) try to **refute** every finding against the actual tool output. Unsupported or
mis-read claims are caught and recorded, the analyst **self-corrects without a human**, and every
surviving finding ships with a hash-chained **Council Receipt** that lets anyone re-trace the claim to
the exact tool execution and re-verify it.

> **For a judge skimming — the three things to know:**
> 1. **The engine is a genuine live agent, not scripted.** 9 real autonomous Claude Code investigations
>    across disk **and** memory ([`AGENTIC.md`](execution-logs/AGENTIC.md), full transcripts). The
>    `analyst/*_demo.sh` scripts are a *separate, no-API-key replay harness* — the real runs are the agent's
>    own tool choices and findings, nothing hardcoded.
> 2. **The one number to scope correctly:** on the injected-class regression benchmark
>    ([`eval/bench_real.mjs`](eval/bench_real.mjs)), Council **OFF lets 85/85 injected unsupported claims
>    reach the human; Council ON lets 0 through, with 0 false positives on that template-scoped supported set.**
> 3. **We report our misses.** On the blind/non-circular red-team, the deterministic floor catches only ~⅔ of
>    *unseen* hallucinations at ~94% precision (3 false positives in that run; the LLM panel lifts recall) — see [Accuracy & honesty](#accuracy--honesty).
>
> Council-SIFT is **complementary** to a human HMAC-approval step (such as the reference Valhuntir
> submission): it feeds that step only findings that already survived verification. It secures the
> **correctness** of the reasoning — *why a finding deserved approval* — the layer left to the human today.

> ⚠️ **What this is and isn't.** Council-SIFT is a *verification layer*, not a one-click oracle. It runs
> on **two tiers**: (1) a **deterministic floor** — reproducible by any judge with no API key, whose
> refutations are mechanically verifiable ("the cited token `185.220.101.45` is not in the tool output")
> and whose regression-benchmark precision is **FP=0 on the injected-class supported set**; the blind red-team
> floor is the honest unseen signal (~67% recall, ~94% precision, 3 FP); and (2) an **additive LLM skeptic
> panel** (OpenClaw / Claude-Agent-SDK) that lifts recall on over-reads no regex can enumerate. The panel
> can **only ever *add* a bounce to a finding the floor already passed — it can never rescue a refuted one**
> — and a bounce requires a **≥2-of-3 independent-skeptic majority**, so one trigger-happy LLM cannot reject
> a real finding. The floor sets the deterministic baseline; the panel raises recall. It does not replace
> the human examiner — it raises the floor on what reaches them.
>
> **We red-teamed our own floor.** An evasion suite phrased to *dodge* the seat vocabulary
> ([`eval/adversarial_evasions.mjs`](eval/adversarial_evasions.mjs)) is now a **regression test**: it
> covers substring exploits, synonym over-reads, hedge bypasses, zero-token citations, interpretation-only
> fabricated tokens, PID/process-name mismatches, scope overreach, and RFC1918/external contradictions.
> The current hardened floor catches **52/52 with FP=0 on 24 natural-prose guards**.
> Honest: this suite was used to harden the seats, so it is not the held-out benchmark.
>
> **The held-out, non-circular number** comes from [`eval/blind_redteam.mjs`](eval/blind_redteam.mjs): an
> *independent* LLM attacker writes 130 fresh findings the seats were never tuned on (57 supported · 73
> hallucinated), the detector is **frozen**, and the deterministic floor scores **~65–69% recall at
> ~93–96% precision** — i.e. the floor catches ~two-thirds of *unseen* hallucinations with very few false
> flags, and the report names the ones it misses. That residual is what the LLM panel
> ([`eval/skeptic_live_demo.mjs`](eval/skeptic_live_demo.mjs)) is designed to lift; panel claims should be
> read as additive recall evidence, not as a global FP=0 guarantee.

---

## 🔴 Live autonomous agent — across disk *and* memory (the primary execution engine)

The Council is the novel verification layer, but the **execution engine is a genuine Claude Code agent.**
Driven by [`analyst/autorun.sh`](analyst/autorun.sh), it reads its contract, **chooses its own tools**,
drafts its **own** findings, submits them to the Council, and **self-corrects on every bounce — no human,
nothing hardcoded.** We ran it across evidence types and cases:

| Case | Evidence | Findings | Verified | Self-corrected | Agent-found artifact |
|---|---|---:|---:|---:|---|
| SRL18-DC-DISK | disk / MFT | 8 | 4 | **4** | `ntds.dit` domain credential dump staged in `C:\temp` (`ntdsutil ifm`) |
| SRL18-FILE-DISK | disk / MFT | 6 | 5 | 1 | `StarFury.zip` exfil archive (+ deleted RAR subtree, MFT carving) |
| ROCBA-DISK | disk | 5 | 5 | 0 | Stark Research Labs IP-theft files in `fredr`'s profile |
| SRL18-WKSTN-MEM | memory (8 vol3 plugins) | 4 | 4 | 0 | LISTENING backdoor socket; `subject_srv.ex` Wow64 process |
| SRL18-RD-NET | memory / network | 8 | 5 | **3** | `subject_srv.ex` backdoor `0.0.0.0:3262`; suspicious `powershell.exe` |
| ROCBA-MEM | memory | 3 | 3 | 0 | `svchost.exe` socket ownership; 118 inbound TCPv4 records |
| SRL2015-NFURY | memory **+** disk | 9 | 8 | 1 | PyInstaller malware, recycled `svchost.exe` masquerade, `winclient.reg` persistence |
| SRL-LIVE | memory | 1 | 1 | 0 | disciplined first pass — picked `subject_srv.ex` over the obvious `Rar.exe` |
| SRL-LIVE2 | memory / network | 2 | 1 | 1 | corrected an internal-IP "C2" over-read live; re-ran the tool itself |

**9 genuine runs · 46 drafted findings · 36 Council-verified · 10 live self-corrections · disk *and* memory ·
3 cases (SRL-2018, ROCBA, SRL-2015).** Real redacted transcripts (tool calls + timestamps + token usage), per-case
investigative narratives, and hash-chained receipts — indexed in
**[`execution-logs/AGENTIC.md`](execution-logs/AGENTIC.md)** with narratives in [`reports/`](reports/).
The deterministic `*_demo.sh` scripts are a separate **no-API-key reproducibility harness**, not the agent.

### One finding, end to end (what the loop actually does)

On the SRL-2018 file-server memory image, the agent ran `vol3 windows.psscan` and drafted:

> **observation:** `vol3 windows.psscan shows Rar.exe PID 2524 (parent 6352) … on the file server`
> **interpretation:** *"Rar.exe **exfiltrated the stolen SRL data to the attacker's external C2 server**"* · **confidence:** HIGH · **cited_tokens:** `2524`, `Rar.exe`, `6352`

The Council **bounced it** — two seats, independently:
- **Tool-semantics:** *a process listing (psscan) cannot establish network activity; netscan is required to claim C2.*
- **Inference:** *attribution to a specific actor cannot be drawn from one artifact.*

The analyst read the objection and **self-corrected with no human**, re-filing only what the evidence supports:

> **interpretation:** *"Rar.exe is an archiving utility; its execution is a **data-staging indicator that warrants disk/timeline correlation** — exfiltration is **NOT** established from a process listing alone"* · **confidence:** MEDIUM

→ all seats SUPPORTED → **COUNCIL_VERIFIED** + a hash-chained Receipt. `csift trace --rerun F-analyst-SRL-MEM-002`
(requires the isolated Neo4j graph at `bolt://localhost:7690`; see [Setup](#setup-step-by-step) steps 2–4)
re-executes the recorded `vol3` command and confirms the output hash matches. *(On disk, the file-server run
then found the actual `StarFury.zip` exfil archive — corroborating the staged-archiving read on a second evidence type.)*

---

## ✅ Submission compliance (FIND EVIL!) — where each required item lives

| Required item | Location / status |
|---|---|
| Public code repository | this repo (push public before submitting — see [`PUBLISH.md`](PUBLISH.md): purge `eval/corpus/` from history first) |
| **Open-source license (MIT)** | [`LICENSE`](LICENSE) — MIT, detected by GitHub → shown in **About** |
| README with setup | this file → **[Setup](#setup-step-by-step)** |
| Step-by-step run instructions against evidence | **[Setup](#setup-step-by-step)** + **[Run the demos](#run-the-demos)** |
| Text description (features/functionality) | this README + [`ARCHITECTURE.md`](ARCHITECTURE.md) + [`NOVELTY.md`](NOVELTY.md) |
| Demonstration video (<5 min, terminal, self-correction) | **record + link before submitting** — script/runbook: [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) |
| Architecture diagram | [`docs/architecture.svg`](docs/architecture.svg) + mermaid in [`ARCHITECTURE.md`](ARCHITECTURE.md) and below |
| Evidence Dataset Documentation | [`evidence-docs/EVIDENCE.md`](evidence-docs/EVIDENCE.md) |
| Accuracy Report | [`accuracy-report/bench_real_report.md`](accuracy-report/bench_real_report.md) (`node eval/bench_real.mjs` regenerates, at scale on real evidence) |
| Agent Execution Logs | **[`execution-logs/AGENTIC.md`](execution-logs/AGENTIC.md)** — index of **9 genuine autonomous runs** (real stream-json transcripts: tool calls + timestamps + token usage); structured per-case logs via `node eval/export_execution_log.mjs <case>` |
| Analytical reasoning (structured investigative narrative, not a raw log) | [`reports/`](reports/) — `node eval/narrative_report.mjs <case>` renders verified findings as analyst prose (confidence, what the evidence does *not* support, self-correction record, receipt links) |

**Success metric (per the organizers): *fewer hallucinated findings than Protocol SIFT's baseline.***
We measure it directly on **real tool output from all three official scenarios** (ROCBA + SRL-2015 +
SRL-2018, dozens of hosts): **Council-OFF = the Protocol SIFT baseline** lets every injected
unsupported claim reach the human; **Council-ON** catches all 85 injected unsupported claims with
**zero false positives on that injected-class supported set**. The blind red-team report separately shows
~67% recall / ~94% precision (3 FP), so these numbers are scoped, not a global accuracy claim. See [`accuracy-report/bench_real_report.md`](accuracy-report/bench_real_report.md) — regenerate
with `node eval/bench_real.mjs`.

---

## How we hit the judging criteria

| Criterion | How Council-SIFT addresses it |
|---|---|
| **Autonomous Execution Quality** | The analyst (Claude Code) drafts → Council refutes → analyst **self-corrects with no human** → re-review → Receipt. Demonstrated on synthetic + official disk + official memory. |
| **IR Accuracy** | Findings split into observation / interpretation / confidence; hallucinations are **caught and recorded** (not silently dropped); 4 distinct error classes detected (below). Benchmarked **at scale on real evidence across all 3 official scenarios** — 0 FP on the injected-class supported set, with blind red-team precision reported separately (see the Accuracy Report). |
| **Breadth & Depth** | Depth over breadth: deep on **memory (Volatility 3)** and **disk (Sleuth Kit)** against the official ROCBA + SRL-2018 datasets, with an evidence-type-agnostic Council. |
| **Constraint Implementation** | An **architectural, default-deny** identity kernel enforced **live at `bin/sift`**: a command runs only if every binary is on the read-only allowlist — everything else (`shred`, `truncate`, `parted`, `cp`/`mv` over an image, `find -delete`, `sed -i`, an obfuscated `rm`, an unknown binary) is refused *before* execution, with dual-use + obfuscation guards. Plus HMAC-scoped capabilities, no self-approval, prompt-injection refusal, tamper-evident audit. Evidence is **also** mounted read-only (OS-enforced backstop). **12/12 bypass suite** — incl. the exact bypasses a reviewer used. |
| **Audit Trail Quality** | Every finding → `DERIVED_FROM` tool-execution node (+ `output_sha256`); `csift trace` re-hashes the stored output, and `csift trace --rerun` is the stronger optional check for concrete recorded commands/evidence paths (canonical demo: `F-analyst-SRL-MEM-002`); timestamped execution logs; hash-chained Receipts. |
| **Usability & Documentation** | One-command demos; reproducible core needs no API key; clean, seed-free MIT repo; this README. |

**Mandatory Project Requirements:** self-correction without a human ✓ · accuracy traceable to
artifact/offset/log ✓ · structured investigative narrative (not a raw log) ✓ — generated from the
verification substrate by `node eval/narrative_report.mjs <case>` → [`reports/<case>.md`](reports/): an
analyst-style report (reasoned prose, confidence, *what the evidence does **not** support*, the
self-correction record, each claim linked to its receipt plus `trace`/rerun checks where the recorded
command is concrete), distinct from the raw
[`execution-logs/`](execution-logs/) event streams.

---

## Architecture

```mermaid
flowchart LR
  EV["Evidence<br/>disk · memory · logs"] --> TOOLS["SIFT tools<br/>vol3 · plaso · Sleuth Kit · yara"]
  TOOLS --> ANALYST["Analyst agent<br/>(Claude Code)"]
  ANALYST -- "tool calls via bin/sift" --> KERNEL["Identity Kernel (live at bin/sift)<br/>default-deny tool gate · HMAC caps · refusals · hash-chain audit"]
  KERNEL --> BRIDGE["csift bridge<br/>record · trace · refute"]
  BRIDGE --> MEM[("claw-memory-core<br/>Neo4j @7690<br/>MemoryClaim · ToolExecution<br/>ConflictRecord · Receipt")]
  MEM --> COUNCIL["Council seats<br/>Citation · Tool-semantics<br/>Contradiction · Inference · Synthesis"]
  COUNCIL -- "REFUTE → ConflictRecord" --> ANALYST
  COUNCIL -- "VERIFIED" --> RECEIPT["Council Receipt<br/>(hash-chained)"]
  RECEIPT -. "COUNCIL_VERIFIED only" .-> HUMAN["Human examiner<br/>(HMAC approve)"]
```

Full diagram + data flow: [`ARCHITECTURE.md`](ARCHITECTURE.md) · vector image: [`docs/architecture.svg`](docs/architecture.svg).

## The loop (bloodstream)

```
evidence → analyst drafts a 4-part finding (observation / interpretation / confidence / evidence-pointer)
         → stored in claw-memory-core with DERIVED_FROM provenance + output_sha256
         → Council seats try to REFUTE it
         → if refuted: ConflictRecord + bounce → analyst SELF-CORRECTS (no human)
         → if it survives: hash-chained Council Receipt
         → `trace` re-resolves the pointer and re-hashes the tool output (integrity)
```

---

## What we proved (on real evidence)

| Demo | Evidence | Outcome |
|---|---|---|
| `analyst/rocba_demo.sh` | **Official ROCBA** `rocba-cdrive.e01` (real NTFS, Sleuth Kit, zero-copy) | Fabricated "BitLocker container @ inode 999999" → **Citation refutes** (absent) → self-correct → **VERIFIED** → trace integrity VERIFIED |
| `analyst/srl_memory_demo.sh` | **Official SRL-2018** `base-file-memory.img` (real **Volatility 3 psscan**) | "Rar.exe → exfiltrated to the attacker's C2" → **caught by Tool-semantics + Inference** → self-correct → **VERIFIED** |
| `analyst/rocba_questions_demo.sh` | **Official ROCBA** `Users/fredr` (real `fls`) | Works the case's *Key Questions*; "8.4 GB → 185.220.101.45" **refuted**; evidence-grounded brief (open questions stay open) |
| `analyst/sift_demo.sh` | synthetic ext4 image in SIFT (real `fls`) | inode-99 rootkit claim refuted → self-correct → VERIFIED |
| `eval/bench_real.mjs` | **real** Sleuth Kit + vol3 output, **all 3 official scenarios** (ROCBA + SRL-2015 + SRL-2018, many hosts) | Council **OFF: every injected unsupported claim reaches review → ON: caught**; **FP=0 on the injected-class supported set** — see the Accuracy Report |
| `eval/ablation.mjs` | small labelled sanity set (memory/disk/hash) | Council **OFF 6/6 → ON 0/6** |
| `eval/adversarial_evasions.mjs` | red-team regression suite phrased to dodge the seat vocabulary + substring/zero-token/PID/scope/RFC1918 exploits | hardened floor **52/52 caught, 0/24 FP** (regression test, not held-out) |
| `eval/gate_redteam.py` | broad live-gate red-team — 52 evidence-destruction attempts across 9 evasion classes (encoding/eval, indirection, interpreters, wrappers, path-prefixed, quoting, archive-extract, tool-native writes, redirects) | **all 52 refused, 0 false-denies** |
| `eval/blind_redteam.mjs` | **held-out, non-circular** — independent LLM attacker, frozen detector, 130 unseen findings | deterministic floor **~65–69% recall @ ~93–96% precision** (the floor's *true* recall; misses listed) |
| `eval/skeptic_panel_test.mjs` | additive-panel gate logic (mocked votes, no API key) | 2/3→bounce · 1/3→pass · abstains w/o auth · additive-only |
| `eval/skeptic_live_demo.mjs` | **live** LLM panel on second-order evasions that pass the hardened floor | majority **bounces over-reads the floor missed**; **0 FP** on disciplined findings |
| `tests/test_bypass.py` | identity kernel | **12/12** (self-approve blocked, evidence prompt-injection refused, forged/expired/scope caps, tamper-evident audit) |

---

## Setup (step by step)

**Prerequisites**
- **Docker** (for the isolated Neo4j), **Node ≥ 20**, **Python ≥ 3.10**.
- For the SIFT demos: a **SANS SIFT Workstation** you can reach over SSH, and (for the official-evidence
  demos) the HACKATHON-2026 datasets. The repo never contains evidence.

```bash
# 1. clone
git clone <your-fork-url> council-sift && cd council-sift

# 2. isolated Neo4j (its own graph — never your other graphs)
docker run -d --name councilsift-neo4j -p 7690:7687 -p 7476:7474 \
  -e NEO4J_AUTH=neo4j/councilsiftpw -e NEO4J_PLUGINS='["apoc"]' neo4j:5.26-community

# 3. build the audit-substrate engine
cd claw-memory-core && npm install --legacy-peer-deps --no-audit && npm run build && cd ..

# 4. point the engine at the isolated graph
printf 'NEO4J_URI=bolt://localhost:7690\nNEO4J_USER=neo4j\nNEO4J_PASSWORD=councilsiftpw\n' > claw-memory-core/.env

# 5. apply the schema (runs cypher-shell inside the container — no host install needed)
bash scripts/migrate.sh
```

### Run the demos

**Core verification — no SIFT/API key required (runs anywhere):**
```bash
set -a; source claw-memory-core/.env; set +a
node eval/smoke_lifecycle.mjs        # substrate: deposit → refute → ConflictRecord → corrected claim
node eval/ablation.mjs               # quick sanity ablation (small labelled set)
node eval/adversarial_evasions.mjs   # red-team regression: 52/52 caught, 0/24 FP (token-boundary + narrowed hedging + Tier 2 scope/PID/RFC1918 checks)
node eval/skeptic_panel_test.mjs     # additive-panel gate logic with mocked votes (2/3→bounce, 1/3→pass)
python3 tests/test_bypass.py         # identity-kernel bypass suite (12/12)
# Pure no-SIFT checks stop here. `trace --rerun` needs a demo receipt plus SIFT wrapper/evidence path.
```

**Forensic demos — point the analyst at your SIFT Workstation.** Edit `bin/sift` so it SSHes to your
SIFT box (the wrapper is a thin `ssh … "$@"`), then:
```bash
export PATH="$PWD/bin:$PATH"
bash analyst/sift_demo.sh            # synthetic image, real Sleuth Kit, full self-correction loop
# official evidence (mount read-only first; nothing is copied):
#   launch the SIFT VM with: -virtfs local,path=<EVIDENCE_DIR>,mount_tag=evidence,security_model=none,readonly=on
bash scripts/mount_evidence.sh
bash analyst/rocba_demo.sh           # official ROCBA disk (Sleuth Kit)
bash analyst/srl_memory_demo.sh      # official SRL-2018 memory (Volatility 3)
# after the memory demo records F-analyst-SRL-MEM-002 in the isolated graph:
node bridge/csift.mjs trace --rerun F-analyst-SRL-MEM-002
# Receipt rerun honesty: council/receipts/manifest.json labels placeholder/prose-command receipts
# as STORED_OUTPUT_ONLY; `trace --rerun` reports NOT_RERUNNABLE for those instead of pretending they rerun.
# at-scale Accuracy Report on REAL evidence (needs the corpus pulled from SIFT — see evidence-docs):
#   node eval/bench_real.mjs
bash analyst/rocba_questions_demo.sh # official ROCBA "Key Questions" + evidence-grounded brief
```

**Live autonomous analyst (genuine self-correction) — needs an authenticated Claude Code.** This is the
**primary execution engine** and how the 9 indexed runs in [`AGENTIC.md`](execution-logs/AGENTIC.md) were
produced (the agent reads [`analyst/CLAUDE.md`](analyst/CLAUDE.md), **chooses its own tools**, drafts its
**own** findings — nothing hardcoded):
```bash
export PATH="$PWD/bin:$PATH"
# Headless — reproduce/extend a genuine run (real Claude Code stream-json captured to execution-logs/AGENTIC-<CASE>.jsonl):
analyst/autorun.sh SRL18-DC-DISK "Triage the DC C-drive E01 at <path> for compromise/persistence; submit findings to the Council."
analyst/process_run.sh SRL18-DC-DISK   # redact transcript → investigative narrative (reports/) → structured execution log → trace
# Interactive — drive the same agent yourself in a Claude Code session:
bash analyst/run.sh                    # launches Claude Code with analyst/CLAUDE.md + sift/csift/council on PATH
#   then prompt: "Case DEMO. Evidence: <path>. Investigate and submit findings to the Council; self-correct on any bounce."
```
*(The deterministic `*_demo.sh` scripts above are a separate no-API-key reproducibility harness with
**hardcoded** findings — they re-play the loop for a judge without credentials. `autorun.sh` is the **real
agent**: tool choices and findings are the model's own.)*

**Additive LLM skeptic panel (lifts recall on over-reads no regex catches):**
```bash
# Enable the panel on the live review path — it runs ONLY after the deterministic floor passes,
# bounces only on a ≥2/3 skeptic majority, and abstains (no effect) without an authenticated `claude`:
COUNCIL_LLM_SKEPTIC=1 node council/council.mjs review <finding_id>
node eval/skeptic_live_demo.mjs              # live: panel bounces second-order evasions the floor passed, 0 FP
node eval/blind_redteam.mjs                  # held-out non-circular recall: independent LLM attacker, frozen floor (~65-69% recall @ ~93-96% precision)
node eval/blind_rescore.mjs                  # offline detector-regression gate over the persisted blind corpus (no live attacker; fails on recall/FP regression)
node council/run_agentic.mjs <finding_id>    # OpenClaw seat narration view (Claude Agent SDK if authenticated)
```

---

## Components

| Path | Role |
|---|---|
| `claw-memory-core/` | Seed-free Neo4j audit substrate (MemoryClaim / ToolExecution / ConflictRecord / VerificationRecord / CouncilReceipt; append-only; `content_sha256`; provenance edges). Vendored foundation. |
| `identity-kernel/` | Architectural guardrail — HMAC-scoped/expiring capabilities, forbidden-tool + prompt-injection refusal, bilateral approval, tamper-evident hash-chained audit. `kernel.py` (layered gateway), `dfir_gateway.py` (the DFIR policy: read/high-authority/forbidden tool sets + relations), `authorize.py` (the **live** `--scan-command` gate `bin/sift` calls). |
| `council/seats.mjs` | The deterministic verifier seats (**precision floor**) — token-boundary citation, tool semantics, contradiction, inference, and scope. |
| `council/llm_skeptic.mjs` | The **additive** LLM skeptic panel — 3 independent lenses, ≥2/3 majority, abstains with no auth. |
| `council/council.mjs` | Review loop: deterministic floor → (if passed) additive LLM panel → bounce or hash-chained Receipt. |
| `council/run_agentic.mjs` | Agentic (OpenClaw / Claude-Agent-SDK) seats, grounded in the same checks. |
| `council/agents/` | OpenClaw seat definitions (persona + mandate + grounding tool). |
| `analyst/CLAUDE.md` | The analyst's **operating contract** — the 4-part finding discipline (observation vs interpretation vs confidence + `cited_tokens`) and the self-correct-on-bounce loop that make findings refutable. |
| `analyst/autorun.sh`, `analyst/process_run.sh` | **The genuine live agent** — headless launcher that ran the 9 indexed investigations + the post-processor (redact → narrative → execution log). |
| `analyst/run.sh`, `analyst/*_demo.sh` | Interactive agent launcher + the deterministic (hardcoded-finding) reproducibility demos. |
| `bridge/csift.mjs` | `record-finding` / `trace [--rerun]` / `refute` / `list` over the engine (`--rerun` independently re-executes the recorded tool command). |
| `bin/` | `sift` (live identity-kernel gate) / `csift` / `council` PATH wrappers for the agent. |
| `eval/` | `smoke_lifecycle` · `ablation` (incl. the timestomp **Contradiction** case) · `bench_real` (at-scale injected bench) · **`blind_redteam.mjs`** (held-out non-circular floor recall) · `blind_rescore.mjs` (current detector over persisted blind corpus) · `adversarial_evasions.mjs` (floor regression, 52/52) · `gate_redteam.py` (52/52 live-gate refusals) · `skeptic_panel_test`/`skeptic_live_demo` (panel) · `vigia_score.mjs` (external benchmark) · `narrative_report.mjs` · `redact_agentic.mjs` · `export_execution_log.mjs`. |
| `tests/test_bypass.py` | Identity-kernel bypass suite (12/12). |
| `evidence-docs/`, `accuracy-report/`, `execution-logs/`, `docs/` | The submission deliverables. |

## The forensic seats

| Seat | Refutation question | Verdict |
|---|---|---|
| **Citation** | Does every evidence token the claim *cites* appear in the tool output? | `UNSUPPORTED` (lists the absent/fabricated token) |
| **Tool-semantics** | Is the tool read correctly? (psscan ≠ C2, Shimcache ≠ execution…) — negation-aware | `MISREAD_TOOL` |
| **Contradiction** | Is there a disproving artifact? (e.g. timestomp `$SI` vs `$FN`) | `CONTRADICTED` |
| **Inference** | Does the interpretation over-reach? (attribution / intent / causation / unjustified certainty) | `UNSUPPORTED` |
| **Scope** | Does one artifact get stretched into all-hosts / environment-wide / organization-wide impact? | `UNSUPPORTED` |
| **Synthesis** | Adjudicate the panel → disposition | `COUNCIL_VERIFIED` \| `BOUNCE_FOR_CORRECTION` |

The five refutation seats above are the **deterministic floor** (`council/seats.mjs`, no API key). On top
sits the **additive LLM skeptic panel** (`council/llm_skeptic.mjs`), consulted **only on findings the
floor already passed**:

| Tier | What it does | Guarantee |
|---|---|---|
| **Deterministic floor** | The 5 refutation seats + Synthesis above; mechanical refutations | Reproducible; FP=0 on the injected-class regression supported set; blind red-team precision reported separately |
| **LLM skeptic panel** (additive) | 3 independent skeptics (tool-semantics / inference / scope lenses) catch over-reads with no regex trigger | **Only adds** a bounce to a floor-passed finding (never rescues); needs a **≥2/3 majority**; panel recall/FP is measured separately |

## Accuracy & honesty

The [Accuracy Report](accuracy-report/bench_real_report.md) is regenerated by `node eval/bench_real.mjs`
from **real Sleuth Kit + Volatility 3 output captured across the official ROCBA + SRL-2015 + SRL-2018
images (dozens of hosts)** — findings are grounded in real artifacts; ground truth = token
present-vs-absent in the real output. It ships with explicit **honesty notes**:
- **Precision / FP-rate on the injected-class regression set:** across the template-scoped supported findings,
  the Council raised **zero** false flags. The blind red-team report is the unseen precision signal and
  records 3 FP in that run; do not read the regression FP=0 as a global guarantee.
- **Recall on the injected set is by-construction** (its hallucination classes map onto the seats) — so
  that number is **not** a substitute for an external key. We therefore keep the hardened floor regression
  suite ([`eval/adversarial_evasions.mjs`](eval/adversarial_evasions.mjs)): evasions phrased to dodge the seat
  vocabulary now pass at **52/52 caught, 0/24 FP**. Honestly, that suite was used to harden the seats, so
  it is a **regression test, not a held-out benchmark**.
- **The non-tuned recall signal is the additive LLM panel.** On second-order evasions that pass even the
  hardened floor, a ≥2/3 skeptic majority bounces them — demonstrated **live**
  ([`eval/skeptic_live_demo.mjs`](eval/skeptic_live_demo.mjs)): it caught over-reads the floor passed
  while flagging **0/n** disciplined findings. Gate logic is proven deterministically with mocked votes
  ([`eval/skeptic_panel_test.mjs`](eval/skeptic_panel_test.mjs), no API key).
- **External benchmark (supporting evidence, scoped):** scored against community `vigia-cases`, but this path is
  a live LLM specificity-prompt comparison (`eval/vigia_score.mjs`), **not** the deterministic `runSeats`
  verifier. The `score_against` tier has 3 cases, all MALICE ground truth; both Council-OFF and Council-ON
  reached 100% verdict accuracy there, so the Council delta is ~0. False-positive gate PASS (VIGIA-REAL-005);
  IOC recall 85%; see [`accuracy-report/vigia_external_report.md`](accuracy-report/vigia_external_report.md).
- The benchmark itself **surfaced and fixed a real gap** (a netscan "connection = exfiltration to C2"
  over-read, often to loopback/internal IPs) — which is how it should be used.

## Novelty & provenance

`claw-memory-core` and the identity-kernel mechanism are a **pre-existing, seed-free, MIT foundation**
(documented in [`NOVELTY.md`](NOVELTY.md)). The **new hackathon work** is the DFIR claim schema, the
verifier seats, the self-correction loop against SIFT tools, the Council Receipt, the DFIR
identity envelope + bypass suite, the ablation, and the official-evidence integration. **No sealed
framework internals appear anywhere in this repository**, and the graph is an isolated instance.

## License

MIT — see [`LICENSE`](LICENSE).

## Acknowledgments

Built for the SANS **FIND EVIL!** hackathon, on the SANS SIFT Workstation and Protocol SIFT.
MITRE ATT&CK is a trademark of The MITRE Corporation; SIFT Workstation is a product of the SANS Institute.
