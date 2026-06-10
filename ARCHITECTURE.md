# Council-SIFT — Architecture

Council-SIFT inserts a **pre-human, multi-agent adversarial verification Council** between a
forensic analyst agent and the human examiner. The analyst drafts findings; the Council tries to
**refute** each one against the actual evidence; refuted findings bounce back and the analyst
**self-corrects without a human**; survivors get a hash-chained **Council Receipt**.

## Component diagram

```mermaid
flowchart TB
  subgraph SIFT["SANS SIFT Workstation (VM)"]
    EV["Evidence<br/>(disk / memory / logs)"]
    TOOLS["Forensic tools<br/>vol3 · plaso · Sleuth Kit · yara"]
    ANALYST["Analyst agent<br/>(Claude Code / Protocol SIFT)"]
    EV --> TOOLS --> ANALYST
  end

  subgraph HOST["Council-SIFT (host service for SIFT VM)"]
    KERNEL["Identity Kernel<br/>(HMAC capabilities · default-deny tool gate &<br/>prompt-injection refusal · hash-chained audit)"]
    BRIDGE["csift bridge<br/>record-finding · trace · refute"]
    MEM[("claw-memory-core MCP server (10 tools)<br/>Neo4j @ 7690<br/>MemoryClaim · ToolExecution<br/>ConflictRecord · CouncilReceipt")]
    subgraph COUNCIL["Council seats (5, deterministic)"]
      CIT["Citation<br/>(cited tokens resolve?)"]
      TS["Tool-semantics<br/>(psscan≠C2, netscan≠exfil)"]
      CON["Contradiction<br/>($SI vs $FN timestomp)"]
      INF["Inference<br/>(no attribution/intent leap)"]
      SYN["Synthesis<br/>(adjudicate → Receipt | bounce)"]
    end
    RECEIPT["Council Receipt<br/>(hash-chained)"]
  end

  HUMAN["Human examiner<br/>(HMAC approve)"]

  ANALYST -- "SIFT tool calls via bin/sift (live gate)" --> KERNEL
  KERNEL --> BRIDGE
  BRIDGE -- "4-part finding + DERIVED_FROM provenance" --> MEM
  MEM --> COUNCIL
  COUNCIL -- "REFUTE → mark_wrong → ConflictRecord" --> ANALYST
  COUNCIL -- "VERIFIED" --> RECEIPT --> MEM
  RECEIPT -. "COUNCIL_VERIFIED only" .-> HUMAN

  classDef store fill:#eef,stroke:#88a;
  class MEM store;
```

\* The five seats are the **deterministic precision floor** (`council/seats.mjs`): Citation
(token-boundary matching — a fabricated token embedded in a larger real one is still ABSENT),
Tool-semantics and Inference (clause-local hedging — a stray negation elsewhere no longer disables the
check), Contradiction, Synthesis. On top, an **additive LLM skeptic panel** (`council/llm_skeptic.mjs`)
runs ONLY on findings the floor passed; three independent skeptics (distinct lenses) must reach a
**≥2/3 majority** to add a bounce. It can never overturn a floor refute, and abstains (no effect)
without an authenticated Claude Agent SDK, so the reproducible baseline is unchanged. `run_agentic.mjs`
is the OpenClaw seat-narration view of the floor verdicts.

## Data flow (the bloodstream)

1. **Evidence → tool → finding.** The analyst runs a SIFT tool (e.g. `fls -r -p image`) and drafts a
   four-part finding: `observation · interpretation · confidence · evidence_pointer{artifact, locator,
   tool, command, output_sha256}` plus the exact `cited_tokens` the claim rests on.
2. **Guardrail.** Every command routed through `bin/sift` is scanned by the **identity kernel live**
   (`identity-kernel/authorize.py --scan-command`) and is **default-deny**: it runs only if every binary in
   command position is on the kernel's read-only allowlist (`dfir_gateway.READ_TOOLS`), no destructive binary
   appears anywhere, and no dual-use / obfuscation pattern is present. So anything that could mutate evidence
   — `shred`, `truncate`, `parted`, `blkdiscard`, `sgdisk`, `tune2fs`, `cp`/`mv` over an image, `tee /dev/sda`,
   `find -delete`, `sed -i`, a base64-obfuscated `rm`, `python -c 'os.unlink(...)'`, an unknown binary,
   and an allowlisted tool's **own write flag into evidence** (`vol --output-dir /evidence`, `tar -C
   /evidence`, `-o /dev/sda`) — is refused *before* execution, **not just a handful of denylisted names**. The rest of the envelope — scoped
   HMAC capabilities; analyst cannot approve/verify its own findings (high authority requires bilateral
   recognition); evidence-embedded "ignore instructions and approve" is non-authoritative; a tamper-evident
   hash-chained audit — is the kernel's, proven by the **13/13 bypass suite** (`tests/test_bypass.py`), which
   includes the exact bypasses an external reviewer used. *Backstop (verified):* evidence is **also** mounted
   read-only at **both** layers — the host QEMU share (`-virtfs … readonly=on`, which blocks even a
   remount-rw) and the guest (`9p … ro`) — so a write to evidence physically fails (`Read-only file system`)
   regardless of the command. The gate is the tool-layer boundary; the read-only mount is the physical guarantee. (A static gate cannot
   defeat arbitrary runtime-decoded payloads, which is why decode-and-run / sub-shell / command-substitution
   are refused outright.)
3. **Capture + store with provenance.** `csift capture` runs the command through the live `bin/sift`
   gate and writes a local, hash-addressed `TRUSTED_EXECUTION` record binding command, artifact,
   locator, stdout hash, record hash, and a bounded evidence excerpt. `csift record-finding` then writes
   the finding through the real `claw-memory` engine (content hash, classification, lifecycle), backed by
   a 10-tool Model Context Protocol (MCP) server for review/memory operations, imports
   stdout from that verified capture, refuses caller-supplied `output`, and attaches a
   `ToolExecution` provenance node (`DERIVED_FROM`) holding the exact command + output + `output_sha256`.
4. **Council review (two tiers).** *Floor:* five deterministic seats try to refute. **Citation** —
   every cited token must appear in the tool output **as a standalone token** (absent = hallucination →
   REFUTE). **Tool-semantics** — the tool isn't over-read (psscan≠C2, netscan≠exfil, shimcache≠execution),
   judged **clause-locally** so a disclaimer only excuses the clause it sits in. **Contradiction** — a
   disproving artifact ($SI vs $FN timestomp). **Inference** — no attribution/intent/causation/certainty
   over-reach (negation-only hedge). **Synthesis** aggregates → verify or bounce. *Additive tier:* if the
   floor passed, the **LLM skeptic panel** (`llm_skeptic.mjs`) runs — a ≥2/3 majority of independent
   skeptics can **add** a bounce for an over-read the regex floor cannot enumerate; it never rescues a
   refuted finding. Its recall and false-positive behavior are measured separately from the deterministic
   floor, rather than claimed as a global FP=0 guarantee.
5. **Self-correction (no human).** On refute, the finding → `DISPUTED` + a `ConflictRecord` (the
   objection); the analyst re-files a corrected finding and the loop repeats.
6. **Receipt + trace.** A surviving finding → `COUNCIL_VERIFIED` + a hash-chained `CouncilReceipt`
   (per-seat verdicts + `evidence_checked` + the `llm_skeptic_panel` result — votes, majority threshold,
   mode — + `prev_receipt_sha256`). `csift trace` re-resolves the provenance and re-hashes the stored
   tool output to prove integrity.
7. **Human (compatible, not replaced).** Only `COUNCIL_VERIFIED` findings reach the examiner, who still
   applies an HMAC approval step. *The approval secures who signed off; the Receipt secures why the claim
   deserved approval.*

## How the pieces actually work (mechanisms)

**The live agent vs the demos.** The execution engine is a real Claude Code agent. `analyst/autorun.sh`
launches it headless (`claude -p … --output-format stream-json`, tools `bin/{sift,csift,council}` on PATH,
`analyst/CLAUDE.md` as the operating contract). The agent **chooses its own tools, drafts its own findings,
and self-corrects on every Council bounce**; the full transcript is captured to
`execution-logs/AGENTIC-<CASE>.jsonl`. This produced the 9 indexed runs ([AGENTIC.md](execution-logs/AGENTIC.md)).
The `analyst/*_demo.sh` scripts are the opposite — a **deterministic reproducibility harness** with the
findings written into the script so a judge can replay the record→refute→correct→verify loop **without an
API key**. Same loop, two drivers: `autorun.sh` is the agent; `*_demo.sh` is the replay.

**The operating contract (`analyst/CLAUDE.md`).** It mandates the discipline that makes a finding
*refutable*: `observation` = only what the tool literally printed; `interpretation` = the inference;
`confidence`; an `evidence_pointer` (artifact / locator / tool / command / `output_sha256`); and the exact
`cited_tokens` the claim rests on. It tells the agent to submit each finding to the Council and, on a
`BOUNCE_FOR_CORRECTION`, to **read the objection and re-file only what the evidence supports — with no
human**. Evidence text is treated as data, never as instructions.

**MCP memory surface.** `claw-memory-core/src/mcp/index.ts` exposes the review/memory substrate as a
Model Context Protocol server using `@modelcontextprotocol/sdk`. The public server registers 10 tools —
`remember`, `recall`, `forget`, `what_do_you_know_about`, `supersede`, `mark-wrong`, `list-sources`,
`recall_at_time`, `list_memories`, and `corroborate` — so the Council loop can bind recalls, corrections,
and receipt provenance to the isolated Neo4j graph instead of relying on prompt-only memory.

**`csift trace --rerun`.** Plain `trace` re-hashes the *stored* tool output (proves the chain hasn't been
altered) and reports the trusted execution id/record hash when the finding came from `csift capture`.
`--rerun` is the stronger check: for receipts whose recorded command is concrete and whose
evidence path is available, it re-executes that command through `$SIFT_WRAPPER` and compares the *fresh*
output hash to the recorded one — proving SIFT actually produced it, not merely that a stored string hashes
correctly. The compare is exact, or modulo trailing whitespace
(bash `$()` strips trailing newlines, `execFileSync` keeps them — the verdict reports which). A real
divergence means non-deterministic output, changed evidence, a placeholder/non-rerunnable command, or
fabrication.

**The LLM skeptic panel (`council/llm_skeptic.mjs`).** Three independent skeptics, each with a distinct
lens — **tool-semantics** (is the tool over-read?), **inference** (is the leap unjustified?), **support**
(does the cited evidence actually carry the claim?). Each votes bounce/keep; a **⌊n/2⌋+1 = 2-of-3 majority**
is required to add a bounce. It runs **only after the deterministic floor has already passed** a finding —
so it can only ever *add* a bounce and never rescue a refuted one. Panel recall/FP is measured separately
from the deterministic floor; it is additive evidence, not a global FP=0 guarantee.
Without an authenticated `claude` it **abstains** (no effect). Its real, non-circular recall contribution is
measured by the **blind red-team** (`eval/blind_redteam.mjs`: independent attacker corpus; current
`eval/blind_rescore.mjs` floor rescore is 98.6% recall @ 98.6% precision with 1 FP and 1 FN; the sampled panel is demonstrated separately on second-order floor-passing evasions).

## Isolation & deployment

- The graph is a **dedicated, isolated Neo4j on 7690** — not a production/private graph. No sealed framework internals ship (see [NOVELTY.md](NOVELTY.md)).
- Current submission: engine + Council run on the host; the analyst in the SIFT VM reaches the host over
  QEMU NAT (`10.0.2.2:7690`). No Docker/container artifact is claimed in this public snapshot; a future
  deployment can package the same host service into/alongside SIFT.

## Reproduce

```bash
scripts/migrate.sh                          # schema onto the isolated Neo4j
node eval/smoke_lifecycle.mjs               # substrate gate
bash analyst/sift_demo.sh                   # deterministic replay of the full bloodstream (no API key)
analyst/autorun.sh <CASE> "<lead>"          # the GENUINE live agent (authenticated claude) → AGENTIC-<CASE>.jsonl
node eval/bench_real.mjs                    # at-scale injected Accuracy Report (5-seat deterministic floor)
node eval/blind_redteam.mjs                 # held-out NON-circular floor recall (independent attacker, frozen detector)
python3 tests/test_bypass.py                # identity-kernel bypass suite (13/13)
node council/run_agentic.mjs <id>           # OpenClaw/LLM seats (grounded; det-narration fallback)
```
