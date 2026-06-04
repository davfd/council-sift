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
- PRECISION / false-positive rate is the un-gameable signal here: across the real supported findings the Council raised ZERO false flags (FP=0) — it does not wrongly reject correctly-cited real findings.
- RECALL on THIS set is measured against OUR injected hallucination classes (fabricated token, tool over-read, inference overreach), which map onto the seats — so this recall is expected by construction and is NOT a substitute for an external answer key.
- RECALL was RED-TEAMED separately (eval/adversarial_evasions.mjs): hallucinations phrased to DODGE the seat vocabulary (substring-citation exploits, synonym over-reads, a hedge-bypass) initially caught 0/12 — proving the deterministic recall was vocabulary-bounded. The seats were then hardened (token-boundary citation, clause-local hedging, broadened vocab) to catch all 12 with FP=0 preserved here. NOTE: that suite was used to harden, so it is a REGRESSION test, not a held-out benchmark.
- HELD-OUT NON-CIRCULAR RECALL (eval/blind_redteam.mjs): an INDEPENDENT LLM attacker writes 130 fresh findings (57 supported / 73 hallucinated) the seats were never tuned on, the detector is FROZEN, and the deterministic floor scores ~65-69% recall at ~93-96% precision — the floor's TRUE recall on unseen hallucinations (the report lists the misses). See accuracy-report/blind_redteam_report.json.
- The truly NON-tuned recall signal is the ADDITIVE LLM skeptic panel (council/llm_skeptic.mjs): on SECOND-ORDER evasions that pass even the hardened floor (no regex trigger), a >=2/3 independent-skeptic majority bounces them (demonstrated live, eval/skeptic_live_demo.mjs). It can ONLY add a bounce to a floor-passed finding — never rescue a refuted one — so it lifts recall without lowering the floor's FP=0 precision.
- EXTERNAL held-out benchmark COMPLETED (non-circular): scored against the community vigia-cases answer key (NIST Hacking/Data Leakage, Nitroba) — 100% verdict accuracy on the score_against tier + false-positive gate PASS. See accuracy-report/vigia_external_report.md.
- Council-OFF approximates an unverified Protocol-SIFT-style baseline (same analyst findings, no Council verification): every unsupported finding reaches the human.
