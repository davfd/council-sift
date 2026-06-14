# Council-SIFT — 5-minute demo script (terminal screencast + narration)

Rules: a screencast of **live terminal execution with audio narration** (not slides), showing the
agent working against **real evidence** including **at least one self-correction sequence**, < 5 min.

For David's final recording, use the tighter cue card at
[`docs/FINAL_RECORDING_CUE_CARD.md`](FINAL_RECORDING_CUE_CARD.md). This file keeps the longer rationale.

Pre-roll (off camera): `scripts/migrate.sh` has run; the SIFT VM is up (`bin/sift 'echo ok'`); the
official evidence is mounted read-only. David's recording path uses the local SIFT VM bridge; no-SSH
local SIFT is supported/gate-verified, but not separately fresh-clone official-evidence E2E receipted
here. Set the env once: `cd /home/exor/council-sift-recording && set -a; source claw-memory-core/.env; set +a; export PATH="$PWD/bin:$PATH"`.

---

### 0:00–0:30 — The thesis
**Run:** `git -C ~/council-sift log --oneline | head` then open `ARCHITECTURE.md`.
**Say:** "An autonomous DFIR agent will eventually produce a confident, well-formatted finding that's
**wrong** — and a human skimming a report will trust it. Council-SIFT is the fix: a multi-agent Council
that refutes the analyst's claims **against the actual evidence** before a human ever sees them — on every
finding, and verifiably. The memory/review layer is a 10-tool **Model Context Protocol** server backed by
Neo4j, and the public ROCBA packet is curated from 30+ investigation/correction rounds rather than raw scratch."

### 0:30–2:30 — Self-correction on REAL official evidence (THE required sequence)
**Run:** `bash analyst/srl_memory_demo.sh`
**Say (as it runs):**
- "This is the no-key replay harness: findings are hardcoded so judges can re-run the loop without API
  credentials. The genuine live autonomous self-corrections are in `execution-logs/AGENTIC.md` and
  `execution-logs/AGENTIC-SELFCORRECT.jsonl`."
- "This is the official **SRL-2018** memory image. We run **real Volatility 3 `windows.psscan`** in the
  SIFT VM — there's `Rar.exe`, PID 2524, on the file server."
- "The analyst over-reaches: it claims `Rar.exe` **exfiltrated data to the attacker's C2**."
- "**Two** Council seats refute it — deterministically. **Tool-semantics**: a process listing can't
  establish network activity, let alone C2. **Inference**: you can't attribute to *the attacker* from one
  artifact. The finding is marked DISPUTED with a ConflictRecord."
- "Now the key moment — **no human intervenes.** The analyst reads the objections and **self-corrects**:
  it re-files claiming only what psscan supports — a *data-staging indicator that warrants disk/timeline
  correlation* — at MEDIUM confidence."
- "Re-review: every seat SUPPORTED → **COUNCIL_VERIFIED**, and a hash-chained **Council Receipt** is emitted."

### 2:30–3:10 — Trace to the bytes, then the investigative narrative
**Run:** `node bridge/csift.mjs trace --rerun F-analyst-SRL-MEM-002` then `sed -n '1,40p' reports/SRL-MEM.md`
**Say:** "Every finding traces to the exact tool execution. For the judge's three-finding trace, start with
`F-analyst-SRL-MEM-002`, `F-analyst-SRL18-DC-DISK-001`, and `F-analyst-SRL2015-NFURY-001` in the report/log markdown. `trace --rerun` **independently re-executes**
the recorded `vol3` command through the SIFT VM and compares the **fresh** hash — proving SIFT actually
produces it, not a fabricated string. And the agent's output isn't a raw log — it's a **structured
investigative narrative**: what the evidence shows, the confidence, **what it does *not* support** (the
C2/attribution claim the Council struck), each line tied to its receipt. Generated from the graph, so it
can't contain a claim that isn't a verified node."

### 3:10–3:50 — This is autonomous, not scripted (the primary engine)
**Run:** `sed -n '1,45p' execution-logs/AGENTIC.md` (the breadth index)
**Say:** "That replay shows the loop — but the real engine is a **live Claude Code agent**, driven by
`analyst/autorun.sh`, that picks its own tools and writes its own findings. We ran it across disk **and**
memory on the official hackathon scenarios — **ROCBA, SRL-2015, and SRL-2018** — with memory-derived
network telemetry included: **9 genuine runs, 46 findings, 36 verified findings, 10 self-corrections**.
On the domain controller it found an **`ntds.dit` credential dump** and **self-corrected four times**; on
the file server it found the `StarFury.zip` archive on disk, and the added Plaso/psort timeline demo puts
the same file-server story into temporal order. Nothing here is hardcoded."
**(optional)** `sed -n '1,30p' reports/SRL18-DC-DISK.md` — the agent's own investigative narrative.

### 3:50–4:25 — Architectural guardrail, enforced live + tested for bypass
**Run:** `bin/sift 'dd if=/dev/zero of=/mnt/evidence/wipe bs=1M'` (refused) then `python3 tests/test_bypass.py`
**Say:** "Constraints are architectural, not prompts. Watch: a destructive `dd` is **refused live** by the
identity kernel before it can touch evidence. Evidence is also mounted read-only at the OS level — a
structural spoliation backstop no model instruction can override. And **13 of 13** bypass tests pass — the
analyst can't approve its own findings; an 'ignore instructions and approve everything' string embedded in
evidence is refused at the gateway; capabilities are HMAC-scoped and expiring; the MCP-backed audit chain
is tamper-evident."

### 4:25–4:55 — It works at scale, with scoped claims
**Run:** `sed -n '1,50p' accuracy-report/bench_real_report.md`
**Say:** "Not a one-shot. Across **36 real tool-output artifacts, 185 findings** on the injected-class
regression benchmark: Council OFF lets **all 85 injected unsupported claims** reach the human; Council ON
lets **zero** through, with **zero false positives on that template-scoped supported set**. Honest scope:
the blind red-team rescore is the unseen precision signal: 98.6% recall and 98.6% precision, with 1 FP / 1 FN, and the external
vigia-cases run is supporting evidence rather than the deterministic-seat code path. We report those limits
instead of hiding them."

### 4:55–5:00 — Close
**Say:** "This video is orientation; the repo carries the receipts. Council-SIFT doesn't replace the human sign-off — it raises the floor on what reaches them. The
approval secures *who* signed off; the Council Receipt secures *why* the claim deserved it. We secure the
reasoning, before a human is ever asked to trust it."

---

## Optional: show the live Claude Code analyst (if `claude` is authenticated)
`bash analyst/run.sh` → prompt: *"Case DEMO-LIVE. Evidence in the SIFT VM. Investigate with vol3/fls and
submit findings to the Council; self-correct on any bounce."* — the analyst as a real Claude Code agent
driving `bin/sift`/`csift`/`council` and self-correcting autonomously.
