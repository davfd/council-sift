# Accuracy Reports

Council-SIFT ships separate accuracy artifacts so one run cannot silently overwrite another.

| Report | Generator | Scope |
|---|---|---|
| [`bench_real_report.md`](bench_real_report.md) / [`bench_real_report.json`](bench_real_report.json) | `node eval/bench_real.mjs` | At-scale real-tool-output benchmark across official evidence corpus; injected unsupported classes; headline 85/85 regression metric. |
| [`ablation_report.md`](ablation_report.md) / [`ablation_report.json`](ablation_report.json) | `node eval/ablation.mjs` | Small labeled sanity ablation; not the at-scale report. |
| [`blind_redteam_report.json`](blind_redteam_report.json) + [`blind_findings.jsonl`](blind_findings.jsonl) | `node eval/blind_redteam.mjs` | Frozen-detector blind red-team attacker set; held-out/non-circular recall estimate. |
| [`blind_rescore_report.json`](blind_rescore_report.json) | `node eval/blind_rescore.mjs` | Current detector rescored over the persisted blind corpus; regression guard for recall/FP drift when live attacker auth is unavailable. |
| [`vigia_external_report.md`](vigia_external_report.md) / [`vigia_external_report.json`](vigia_external_report.json) | `node eval/vigia_score.mjs` | External VIGIA specificity-prompt benchmark; supporting evidence, not the deterministic-seat path. |

Guard for metric drift after regenerating `bench_real_report.json`:

```bash
node eval/check_bench_real_report.mjs
```
