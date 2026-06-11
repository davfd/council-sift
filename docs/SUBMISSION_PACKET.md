# Council-SIFT — Devpost Submission Packet

This file is the one-page operator checklist for everything **except recording/uploading the video**.

## Submission status

| Item | Status | Exact artifact / value |
|---|---:|---|
| Public repository | ⚠️ push required | https://github.com/davfd/council-sift — public `main` was behind during Council audit; push the current polished `HEAD` and verify `git ls-remote origin refs/heads/main` matches before claiming the public repo contains these updates |
| Open-source license | ✅ done | `LICENSE` — MIT, detected by GitHub |
| README setup + run instructions | ✅ done | `README.md` → Setup, Run the demos, Live autonomous analyst |
| Written project description | ✅ done | `docs/DEVPOST_SUBMISSION_COPY.md` |
| Architecture diagram | ✅ done | `docs/architecture.svg` and `docs/architecture.png` |
| Evidence dataset documentation | ✅ done | `evidence-docs/EVIDENCE.md` |
| Accuracy report | ✅ done | `accuracy-report/bench_real_report.md` + JSON reports in `accuracy-report/` |
| Agent execution logs | ✅ done | `execution-logs/AGENTIC.md` + per-run stream JSON / structured logs |
| Structured investigative reports | ✅ done | `reports/` |
| Demo recording cue card | ✅ done | `docs/FINAL_RECORDING_CUE_CARD.md` |
| Demo video URL | ⛔ operator-owned | Upload final public YouTube/Vimeo/Youku URL, then paste into Devpost |
| Credentialed GitHub push | ⛔ operator-owned | Push current polished `HEAD` or a successor containing these files; verify `git ls-remote origin refs/heads/main` matches before final submission |

## Devpost fields to paste

Use `docs/DEVPOST_SUBMISSION_COPY.md` for the long text. Short fields:

- **Project title:** `Council-SIFT`
- **Tagline:** `Autonomous DFIR agents that investigate through SIFT, self-correct on adversarial Council review, and emit auditable evidence receipts.`
- **Repository URL:** `https://github.com/davfd/council-sift`
- **Video URL:** paste the final public recording URL
- **Architecture diagram upload/link:** `docs/architecture.png` or `docs/architecture.svg`
- **Testing instructions:** point judges to `README.md` setup and `docs/FINAL_RECORDING_CUE_CARD.md` / `docs/DEMO_SCRIPT.md` for the runnable demo spine.

## Eight required FIND EVIL components

1. **Code Repository** — public GitHub, MIT license: ⚠️ repo exists, but push the polished local packet before final submission
2. **Demo Video** — terminal screencast, audio, self-correction: ⛔ video URL still required
3. **Architecture Diagram** — agent, SIFT tools, MCP server, evidence sources, output pipeline, boundaries: ✅
4. **Written Project Description** — Devpost story format: ✅
5. **Dataset Documentation** — tested data/source/findings: ✅
6. **Accuracy Report** — false positives/misses/hallucinations/evidence integrity: ✅
7. **Try-It-Out Instructions** — local SIFT/Neo4j setup + demos: ✅
8. **Agent Execution Logs** — timestamps/tool sequence/token usage/traceability: ✅

## Judge-facing claim map

| Judging criterion | Best artifact to show/link |
|---|---|
| Autonomous Execution Quality | `docs/FINAL_RECORDING_CUE_CARD.md`, `analyst/srl_memory_demo.sh`, `execution-logs/AGENTIC.md` |
| IR Accuracy | `accuracy-report/bench_real_report.md`, `accuracy-report/blind_rescore_report.json` |
| Breadth and Depth | `execution-logs/AGENTIC.md`, `evidence-docs/EVIDENCE.md`, `reports/` |
| Constraint Implementation | `README.md` criterion table, `identity-kernel/`, `tests/test_bypass.py`, `eval/gate_redteam.py` |
| Audit Trail Quality | `bridge/csift.mjs trace`, `council/receipts/manifest.json`, `reports/SRL-MEM.md` |
| Usability and Documentation | `README.md`, `docs/DEVPOST_SUBMISSION_COPY.md`, `docs/FINAL_RECORDING_CUE_CARD.md` |

## Final operator actions

1. Push the polished local packet or otherwise publish these exact artifacts:
   ```bash
   cd /home/exor/council-sift-recording
   local_head=$(git rev-parse HEAD)
   git push origin HEAD:main
   git ls-remote origin refs/heads/main
   ```
   The final `ls-remote` must show `$local_head`, or a later explicitly approved commit containing the same packet.
2. Record from `/home/exor/council-sift-recording` using `docs/FINAL_RECORDING_CUE_CARD.md`.
3. Upload the video publicly.
4. Paste the video URL into Devpost.
5. Attach or link `docs/architecture.png` / `docs/architecture.svg`.
6. Submit before deadline.

Do **not** spend remaining time rewriting native SIFT integration unless the current SIFT wrapper fails in recording. The current non-video packet is complete **locally**; remaining elimination risks are credentialed GitHub publication of this packet, the public video URL, and final Devpost form submission.
