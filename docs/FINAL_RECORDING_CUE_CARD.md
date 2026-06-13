# FINAL David recording cue card — Council-patched

Council verdict after reading the FIND EVIL website directly:

- Core video is right: **wrong claim → Council bounce → self-correction → receipt → guardrail**.
- Patch required and now included: show the **actual Accuracy Report**, explicitly name all 3 official scenarios, say evidence is read-only / spoliation-tested, and mention setup/re-run docs.

Record from David’s recording workspace:

```bash
cd /home/exor/council-sift-recording
export HOME=/home/exor
export SIFT_WRAPPER=/home/exor/sift-workstation/sift
export PATH="$PWD/bin:$PATH"
set -a; source claw-memory-core/.env; set +a
```

Note: this recording uses our local SIFT VM bridge. A judge can run the same gated path without SSH by cloning the repo directly inside SIFT and setting `SIFT_WRAPPER=$PWD/bin/sift-local`; `bin/sift` remains the authorization boundary in both modes.

Target: **under 5 minutes**. Terminal screencast + audio narration. No slides.

---

## Scene 1 — What this is / why judges should care — 0:00–0:35

**Show:**

```bash
sed -n '1,35p' README.md
```

**Say:**

> Hi judges. This is Council-SIFT: a verification layer for autonomous DFIR on SANS SIFT. It does not replace the human examiner. It catches unsupported agent findings before a human is asked to trust them.
>
> The novel contribution is an adversarial verification Council plus architectural guardrails that make autonomous findings traceable, refutable, and harder to hallucinate. The analyst cites real tool output; the Council tries to refute the claim; unsupported claims bounce back for self-correction; supported claims receive hash-chained receipts.
>
> The memory and review layer is a ten-tool Model Context Protocol server backed by Neo4j.

---

## Scene 2 — Architecture / trust boundaries — 0:35–0:55

**Show:**

```bash
sed -n '184,196p' README.md
```

**Say:**

> This is the loop: evidence goes through SIFT tools, the analyst drafts a finding, the identity kernel gates tool use, `csift` records provenance, the MCP-backed Neo4j memory layer stores it, and the Council verifies or bounces it. Only Council-verified findings move toward the human examiner.

---

## Scene 3 — Main demo: wrong claim gets corrected — 0:55–2:40

**Show:**

```bash
bash analyst/srl_memory_demo.sh
```

**Say while it runs:**

> This is the required self-correction sequence on official SRL-2018 memory evidence. The tool is real Volatility 3 `windows.psscan`. It shows `Rar.exe`, PID 2524, on the file server.
>
> The analyst overreaches. It says `Rar.exe` exfiltrated stolen data to the attacker's C2. That is exactly the kind of plausible but unsupported incident-response claim this system is designed to catch.
>
> The Council bounces it. Tool-semantics says a process listing cannot prove network activity or exfiltration. Inference says one process artifact cannot attribute intent to an attacker.
>
> Now watch the key moment: no human rewrites the finding. The analyst reads the objection and narrows the claim to what the evidence actually supports. `Rar.exe` is a data-staging indicator that warrants disk and timeline correlation. It is not proof of exfiltration.
>
> The corrected claim is re-reviewed, supported, traced to tool output, and receives a Council receipt.

**If it scrolls fast, say:**

> Watch the labels: Step 1 over-read, Step 2 Council review, Step 3 self-correction, Step 4 corrected review, Step 5 trace, Step 6 narrative report.

---

## Scene 4 — Show the report the examiner gets — 2:40–3:05

**Show:**

```bash
sed -n '1,45p' reports/SRL-MEM.md
```

**Say:**

> This is the report output. It is not a raw log. It says what the evidence shows, what it does not show, the confidence, and the receipt link. The original C2 and attribution overclaim does not survive into the verified narrative.

---

## Scene 5 — Prove this was agentic and broad enough — 3:05–3:35

**Show:**

```bash
sed -n '1,45p' execution-logs/AGENTIC.md
```

**Say:**

> The replay proves the loop, but the primary engine is a live Claude Code analyst. It chooses tools, writes findings, receives Council bounces, and self-corrects.
>
> These runs are against the official SIFT hackathon evidence images: ROCBA, SRL-2015, and SRL-2018. Across them we ran nine genuine autonomous runs, forty-six drafted findings, thirty-six verified findings, and ten self-corrections across disk, memory, and network telemetry. The public transcripts include tool calls, timestamps, and token usage.

---

## Scene 6 — Guardrails / evidence integrity / not prompt theater — 3:35–4:15

**Show:**

```bash
bin/sift 'dd if=/dev/zero of=/mnt/evidence/wipe bs=1M' || true
python3 tests/test_bypass.py
```

**Say:**

> This is the evidence integrity layer. A destructive `dd` is refused architecturally by `bin/sift` before it can modify original data — not by a prompt restriction the model can ignore.
>
> Evidence is also mounted read-only at the OS level, a structural guarantee no model instruction can override. The bypass suite passes: the analyst cannot self-approve, evidence text cannot order approval, capabilities are scoped and expiring, and legitimate read-only forensic commands are allowed. This is not a crippled sandbox; it is an evidence-preserving one.

---

## Scene 7 — Accuracy at scale — 4:15–4:45

**Show:**

```bash
sed -n '1,50p' accuracy-report/bench_real_report.md
```

**Say:**

> The challenge asks for fewer hallucinated findings than the Protocol SIFT baseline. This is that measurement on real official-case tool output. With Council off, eighty-five of eighty-five unsupported claims reach review. With Council on, zero of eighty-five reach the human.
>
> We also report false positives, misses, and blind red-team precision separately instead of hiding them.

---

## Scene 8 — Usability and close — 4:45–5:00

**Show:**

```bash
sed -n '37,56p' README.md
```

**Say:**

> The README has step-by-step setup, and the demo scripts replay the full loop without an API key, so a judge can re-run this locally on the SIFT workstation.
>
> Council-SIFT does not replace the human examiner. The human still decides who signs off; the Council receipt shows why the claim deserved to reach them.

---

## If time is tight, cut only these

1. Shorten Scene 2 to one sentence.
2. Shorten Scene 4 to one sentence.
3. Shorten final usability line.

Do **not** cut:

- `bash analyst/srl_memory_demo.sh`
- the self-correction narration
- `reports/SRL-MEM.md`
- `execution-logs/AGENTIC.md` with ROCBA/SRL-2015/SRL-2018 spoken aloud
- `dd` refusal + `tests/test_bypass.py`
- `accuracy-report/bench_real_report.md`

## Freeze line

> Council-SIFT makes autonomous forensic findings fight the evidence before a human sees them. In this demo, the agent makes a plausible but wrong C2/exfiltration claim from a process listing. The Council catches the unsupported inference, the agent corrects itself without human help, and the corrected claim receives a receipt tied back to exact tool output.
