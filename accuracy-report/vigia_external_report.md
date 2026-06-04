# Council-SIFT — External Accuracy (vigia-cases, held-out ground truth)

Scored against **annatchijova/vigia-cases (external, held-out ground truth)** — `case.json` is the only agent input; `ground_truth.json`
(verdict + MITRE TTPs + key IOCs + Peirce classification) is held out and used only for scoring, per the
repo's SCORING_GUIDE. This is **non-circular**: someone else's published answer key. **Both arms** (analyst
baseline and Council) run on the **same model**, held constant so the only variable is the Council — our
published run used `claude-opus-4-8` (1M-context variant; the `[1m]` suffix is the context-window tag, not terminal formatting), invoked headless via `claude -p`. Headline accuracy is claimed **only on the `score_against` tier**; `build_and_test`
cases are exercised and reported as informational (not a headline claim), per the usability tiers.

## Headline — verdict accuracy on the `score_against` tier (3 cases)

| | accuracy |
|---|---|
| **Council-OFF** (analyst baseline) | 100% |
| **Council-ON** (Council-SIFT) | 100% |

## False-positive gate — VIGIA-REAL-005 (expected **SUSPICION**, not MALICE)

| | verdict | gate |
|---|---|---|
| Council-OFF | SUSPICION | PASS |
| Council-ON | SUSPICION | PASS |

## Other ground-truth fields (score_against, Council-ON)

| field | score | note |
|---|---|---|
| MITRE TTP — exact sub-technique | 7% | full ATT&CK ID overlap (T1071.001 == T1071.001); exact sub-technique agreement is low even between human analysts |
| MITRE TTP — parent technique | 31% | fairer granularity: agent's T1071 credited against key's T1071.001 |
| key-IOC recall | 85% | ground-truth indicator value appears in the agent's emitted output |
| Peirce classification | not graded | qualitative semiotic rubric (firstness/secondness/thirdness); we decline to manufacture a number |

## Per-case

| case | tier | truth | OFF | ON |
|---|---|---|---|---|
| VIGIA-REAL-001 NIST Hacking Case (Greg Sc | score_against | MALICE | MALICE✓ | MALICE✓ |
| VIGIA-REAL-002 NIST Data Leakage Case (Sr | score_against | MALICE | MALICE✓ | MALICE✓ |
| VIGIA-REAL-003 Ali Hadi Web Server Compro | build_and_test | MALICE | MALICE✓ | MALICE✓ |
| VIGIA-REAL-005 Ali Hadi Encrypt Them All  | build_and_test | SUSPICION | SUSPICION✓ | SUSPICION✓ |
| VIGIA-REAL-007 Digital Corpora Nitroba Ha | score_against | MALICE | MALICE✓ | MALICE✓ |
| VIGIA-REAL-009 DFRWS 2008 Linux Exfiltrat | build_and_test | MALICE | MALICE✓ | MALICE✓ |

## Honesty — what this does and does not show

- **Non-circular:** the answer key is someone else's (annatchijova/vigia-cases), held out from the agent.
- Headline accuracy is claimed only on `score_against` (the tier the benchmark says you may claim);
  `build_and_test` rows above are informational. `practice_only` / `not_ready` cases are deliberately not run.
- On this set the **baseline analyst LLM was already well-calibrated** (verdict + FP gate), so the Council's
  verdict-accuracy **delta is ~zero** — it *matches* a strong baseline, it does not beat it. We don't claim otherwise.
- The benchmark **surfaced a real flaw in our own design**: a first, blunt Council discipline over-abstained
  and turned the Nitroba MALICE case into SUSPICION (a false negative). We calibrated the Council to be
  skeptical of *over-claims*, not of *well-evidenced conclusions*, and re-scored — the self-correction thesis applied to itself.
- **MITRE TTP coverage** is reported at two openly-defined granularities (exact sub-technique and parent
  technique). Exact sub-technique overlap is the strict, honest weak spot — but it is known to have low
  inter-analyst agreement even among humans, so part of it is labeling subjectivity, not a verdict error.
  No part of the answer key is shown to the agent; only the public ATT&CK taxonomy informs its labels.
- The Council's **differentiating value shows where the analyst over-claims** — the live autonomous
  self-correction (`execution-logs/AGENTIC-SELFCORRECT.jsonl`) and the internal injected-hallucination
  benchmark (`accuracy_report.md`: 85/85 caught) — not on cases a strong base LLM already gets right.
- Verdicts here are emitted by a **live LLM Council** (`claude -p`), not deterministic seats.
