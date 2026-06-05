# Council-SIFT — Accuracy Report (real evidence, at scale)

Findings generated from **real Sleuth Kit + Volatility 3 output** captured from the official
HACKATHON-2026 images (**ROCBA + SRL-2015 + SRL-2018, 36 tool-output artifacts across
multiple hosts**). Ground truth is mechanical: a cited token either appears in the real output or it does not.
Same analyst output; the only variable is the Council.

## Headline — unsupported-claim pass-through to "human review"

| | Unsupported findings reaching review |
|---|---|
| **Council OFF** (unverified Protocol-SIFT-style baseline) | 85 / 85 |
| **Council ON** (Council-SIFT) | 0 / 85 |

185 findings total · 85 hallucinated (injected in 3 real classes) · 100 supported.

## Council vs ground truth

| metric | value |
|---|---|
| precision | 1.000 |
| recall | 1.000 |
| true positives (hallucinations caught) | 85 |
| false positives (real findings wrongly flagged) | 0 |
| false negatives (hallucinations missed) | 0 |
| true negatives (real findings passed) | 100 |

## By hallucination class

| class | n | caught |
|---|---|---|
| supported | 100 | 0 |
| hallucination_citation | 34 | 34 |
| inference_overreach | 34 | 34 |
| tool_misread | 17 | 17 |

## By scenario

| scenario | findings | unsupported | caught |
|---|---|---|---|
| ROCBA | 48 | 20 | 20 |
| SRL-2015 | 42 | 21 | 21 |
| SRL-2018 | 95 | 44 | 44 |

## Honesty

- Findings are GROUNDED IN REAL tool output from the organizer images; supported findings cite tokens that genuinely appear, hallucinations inject tokens/over-reads that genuinely do not. Ground truth = present-vs-absent in the real output (mechanical, not author opinion).
- PRECISION / false-positive rate on THIS injected-class regression set: across the template-scoped supported findings the Council raised ZERO false flags (FP=0). The blind red-team rescore is the unseen precision signal and records 1 FP; do not read this as a global guarantee.
- RECALL on THIS set is measured against OUR injected hallucination classes (fabricated token, tool over-read, inference overreach), which map onto the seats — so this recall is expected by construction and is NOT a substitute for an external answer key.
- RECALL was RED-TEAMED separately (eval/adversarial_evasions.mjs): hallucinations phrased to DODGE the seat vocabulary (substring-citation exploits, synonym over-reads, hedge-bypasses, zero-token citations, PID/scope/RFC1918, causation overreach) initially exposed misses — proving the deterministic recall was vocabulary-bounded. The seats were then hardened to pass the regression suite at 56/56 caught with 0/27 natural-prose FP. NOTE: that suite was used to harden, so it is a REGRESSION test, not a held-out benchmark.
- HELD-OUT NON-CIRCULAR RECALL (eval/blind_redteam.mjs + eval/blind_rescore.mjs): an INDEPENDENT LLM attacker wrote 130 fresh findings (56 supported / 74 hallucinated) the seats were not tuned on; the current detector rescore scores 81.1% recall at 98.4% precision (60 TP / 1 FP / 14 FN / 55 TN) — the floor's TRUE recall on unseen hallucinations (the report lists the misses). See accuracy-report/blind_rescore_report.json.
- The ADDITIVE LLM skeptic panel (council/llm_skeptic.mjs) is reported separately: on SECOND-ORDER evasions that pass even the hardened floor (no regex trigger), a >=2/3 independent-skeptic majority can add a bounce (demonstrated live, eval/skeptic_live_demo.mjs). It can ONLY add a bounce to a floor-passed finding — never rescue a refuted one — so panel recall/FP must be measured separately from the deterministic floor.
- EXTERNAL benchmark (supporting evidence, scoped): eval/vigia_score.mjs is a live LLM specificity-prompt comparison, not the deterministic runSeats verifier. Its score_against tier has 3 cases, all MALICE; Council-OFF and Council-ON both reached 100% verdict accuracy there (delta ~0). See accuracy-report/vigia_external_report.md.
- Council-OFF approximates an unverified Protocol-SIFT-style baseline (same analyst findings, no Council verification): every unsupported finding reaches the human.
