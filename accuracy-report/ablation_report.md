# Council-SIFT — Accuracy Report

Ablation on a labeled finding set (9 findings, 6 planted unsupported).
Same analyst output; the only variable is the Council.

## Headline: unsupported-claim pass-through to "human review"

| | Unsupported findings reaching review |
|---|---|
| **Council OFF** | 6 / 6 |
| **Council ON**  | 0 / 6 |

## Council panel (Citation + Tool-semantics + Contradiction + Inference + Scope) vs ground truth

| metric | value |
|---|---|
| precision | 1.000 |
| recall | 1.000 |
| true positives (caught hallucinations) | 6 |
| false positives (good findings wrongly flagged) | 0 |
| false negatives (missed hallucinations) | 0 |

## Per-finding

| finding | truth | council verdict | caught? |
|---|---|---|---|
| mem-supported | supported | SUPPORTED | no |
| mem-hallucinated-c2 | unsupported | UNSUPPORTED | yes |
| tsk-supported | supported | SUPPORTED | no |
| tsk-hallucinated-inode | unsupported | UNSUPPORTED | yes |
| hash-supported | supported | SUPPORTED | no |
| hash-hallucinated | unsupported | UNSUPPORTED | yes |
| mem-toolmisread | unsupported | MISREAD_TOOL | yes |
| tsk-timestomp | unsupported | CONTRADICTED | yes |
| inference-overreach | unsupported | MISREAD_TOOL | yes |

## Honest limitations (honesty valued over perfection)

- Five deterministic refutation seats: Citation (every cited token must be in the tool output), Tool-semantics (no over-reading a tool — e.g. psscan/pslist cannot establish C2; Shimcache != execution), Contradiction (timestomp: $SI vs $FN), Inference (no attribution/intent/causation/unjustified-certainty leap from a single artifact), and Scope (no single-host/single-artifact claim widened beyond the evidence bounds). Synthesis then aggregates the seat verdicts into verify-or-bounce.
- Remaining gap: a subtle semantic misinterpretation that matches none of the deterministic rules would still pass. That residue is what the AGENTIC council mode (council/run_agentic.mjs — OpenClaw/LLM seats grounded in these same primitives) is for; it is counted honestly here as not-caught, never as caught.
- cited_tokens are analyst-declared; regex auto-extraction is the weaker fallback for free-text claims.
- These numbers are on a small hand-crafted set and are NOT generalizable until run against the official dataset and real images.
