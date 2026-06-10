# Evidence Dataset Documentation

Council-SIFT is exercised against **four distinct evidence layers**, from a no-PII reproducibility
harness up to an external held-out benchmark scored on someone else's answer key. They are kept
separate on purpose so each claim is traceable to the right ground truth.

## A. Synthetic reproducibility harness (no PII, no credentials)

A 16 MB ext4 image (`/tmp/case.img`) is built inside the SANS SIFT Workstation with a planted file
`p.exe` (written to a known inode via `debugfs`, no mount). The analyst runs **real `fls -r -p` and
`fsstat`** in the VM; the actual tool output flows through the pipeline (`analyst/sift_demo.sh`). This
lets a judge re-run the full loop — draft → Council refute → self-correct → verify → trace — **without
any credentials or official evidence**. It proves the mechanism, not accuracy at scale.

## B. Official SANS evidence demos (HACKATHON-2026, ~200 GB — not redistributed)

The organizer set lives on the analysis host (never committed — too large and not ours to
redistribute). The analyst runs **real tools against the real images, in place (zero-copy over 9p)**:

- **Standard Forensic Case — ROCBA** (Fred Rocba / Stark Research Labs — break-in & IP theft):
  `rocba-cdrive.e01` (22 GB) + `Rocba-Memory.zip` (5.4 GB). Demo: `analyst/rocba_demo.sh`.
- **Compromised APT Scenarios — SRL 2015 / SRL 2018**: per-host Windows `.E01` C-drives (11–17 GB) +
  per-host memory captures. Demo: `analyst/srl_memory_demo.sh` (real `vol3 windows.psscan`) and
  `analyst/srl_timeline_demo.sh` (bounded `log2timeline.py`/`psort.py` timeline over `base-file-cdrive.E01`).

*Known quirk (organizer Slack): on some SRL-2018 memory images `vol3 pslist`/`cmdline` return
header-only on current builds — use the `psscan`/`netscan` pool scanners (which we do), and give vol3 a
writable symbol dir.*

## C. Derived real-output corpus benchmark (at scale)

`eval/bench_real.mjs` runs the Council over **real Sleuth Kit + Volatility 3 output captured from the
official images** (`eval/corpus/*.txt` — derived data, **git-ignored, not redistributed**; regenerate
with `scripts/pull_corpus_from_sift.sh`). Ground truth is **mechanical** (a cited token is present or
absent in the real output), not author opinion:

| | value |
|---|---|
| corpus artifacts (ROCBA + SRL-2015 + SRL-2018) | 36 |
| total findings | 185 (100 supported · 85 injected-unsupported) |
| unsupported reaching "human review" — Council **OFF** | 85 / 85 |
| unsupported reaching "human review" — Council **ON** | **0 / 85** |
| precision / recall · FP / FN | 1.000 / 1.000 · 0 / 0 |

**Honest scope:** precision/FP=0 is measured on this injected-class regression set (template-scoped
supported findings). The blind red-team rescore is the unseen precision signal and records 1 FP. Recall
here is measured against **our injected** hallucination classes (fabricated
token / tool over-read / inference over-reach), which map onto the seats — so high recall is expected by
construction and is **not** a substitute for an external key. Layer C-bis removes that circularity; layer D
is external supporting evidence with its own scope.

## C-bis. Blind red-team — the floor's *real* recall, held-out and non-circular

`eval/blind_redteam.mjs` removes layer C's "expected by construction" circularity: an **independent LLM
attacker** wrote fresh findings (supported *and* hallucinated) the seats were not tuned on. After final
causation hardening, `eval/blind_rescore.mjs` rescored that persisted corpus with the current detector.

| | value |
|---|---|
| held-out findings (independent attacker) | 130 (56 supported · 74 unsupported) |
| deterministic-floor recall (overall / per seed) | **0.986 overall** · current rescore over persisted corpus |
| deterministic-floor precision (overall / per seed) | **0.986 overall** · 1 FP |

**Honest:** this is the floor's *true* recall — the regex seats catch all but one of the unseen hallucinations
at high precision and **still name the remaining miss** (the report enumerates the specific `true_holes`). That residual gap
is exactly what the **additive LLM skeptic panel** addresses: it runs only after the floor passes a finding
and bounces second-order over-reads no regex enumerates. Panel recall/FP is measured separately from the
floor's deterministic precision. Outputs: `accuracy-report/blind_redteam_report.json`, `accuracy-report/blind_rescore_report.json` (+ `blind_findings.jsonl`).

## D. External benchmark (supporting evidence, scoped)

`eval/vigia_score.mjs` scores against the community **`vigia-cases`** benchmark
(annatchijova/vigia-cases): `case.json` is the only agent input; `ground_truth.json` is held out and
used only for scoring (SCORING_GUIDE protocol). This path is a live LLM specificity-prompt comparison,
not the deterministic `runSeats` verifier. Headline accuracy is claimed only on the `score_against` tier,
which currently contains 3 cases and all are MALICE ground truth.

| | value |
|---|---|
| verdict accuracy, `score_against` (OFF / ON) | 100% / 100% |
| false-positive gate VIGIA-REAL-005 (expect SUSPICION) | PASS (both) |
| key-IOC recall | 85% |
| MITRE TTP — parent technique / exact sub-technique | 31% / ~7% |

**Honest:** on this set the baseline LLM was already strong, so the Council **matched** it (delta ≈ 0)
rather than beating it. Because the `score_against` tier is only 3 all-MALICE cases and this is not the
deterministic-seat code path, treat it as external supporting evidence, not proof of the Council floor.
MITRE exact-TTP coverage is weak and reported as such. See `accuracy-report/vigia_external_report.md`
for the full honesty section.

## What the agent found (representative)

| Case | Analyst's draft claim | Council outcome |
|---|---|---|
| **OFFICIAL — ROCBA** (`rocba-cdrive.e01`, real NTFS over 9p) | "hidden **BitLocker** container at **inode 999999**" (vol serial `F0E0FE66E0FE3288`) | **Refuted** — `999999`+`BitLocker` absent from real `fsstat`/`fls` → DISPUTED → self-corrected → **COUNCIL_VERIFIED**; trace stored-chain VERIFIED. (`analyst/rocba_demo.sh`) |
| **OFFICIAL — SRL-2018 memory** (`base-file-memory.img`, real `vol3 windows.psscan`) | "**Rar.exe** PID 2524 exfiltrated SRL data to **the attacker's C2**" | **Refuted by two seats** — Tool-semantics (psscan can't establish network activity) + Inference (attribution leap) → DISPUTED → self-corrected to a hedged *data-staging indicator* → **COUNCIL_VERIFIED**. (`analyst/srl_memory_demo.sh`) |
| **OFFICIAL — SRL-2018 timeline** (`base-file-cdrive.E01`, real Plaso/psort + Sleuth Kit) | `StarFury.zip` / rare-earth file-server artifacts require timeline correlation after the Rar.exe memory correction | `analyst/srl_timeline_demo.sh` exports 15 bounded Plaso rows and Sleuth Kit live/deleted `StarFury.zip` metadata; interpretation remains limited to staging/timeline correlation, not packet payload, completed exfil, or human identity. |
| **OFFICIAL — SRL-2018 (autonomous, live)** | `rubyw.exe` holding `10.10.4.5→10.10.254.1` named as attacker **C2** | **Bounced** (Tool-semantics: internal/loopback ≠ external C2; Inference: attribution) → agent **re-ran `vol3 netscan` itself** and self-corrected → verified. (`execution-logs/AGENTIC-SELFCORRECT.jsonl`) |

Every verified finding carries a hash-chained Council Receipt; `csift trace` re-hashes the stored tool
output to the recorded `output_sha256`. For receipts whose recorded command is concrete and whose evidence
path is available, `csift trace --rerun` independently re-executes the command through the SIFT wrapper and
compares the fresh hash; placeholder/pseudo commands should be treated as receipt/hash evidence, not as
rerun-verified evidence.

## Honest limitations

- Layer A is synthetic (mechanism proof, not accuracy). Accuracy is carried by layers C (at scale, real
  output) and D (external held-out). Absolute numbers generalize only as far as each layer's ground truth.
- All five seats are implemented (Citation, Tool-semantics, Contradiction, Inference, Synthesis). The
  Citation seat catches **absent/fabricated** tokens; **misinterpretation of present** evidence is the
  Tool-semantics / Inference seats' job — and the live SRL self-correction is exactly such a case.
- MITRE TTP exact-ID coverage (layer D) is weak and reported as such; the verdict is the headline metric.
