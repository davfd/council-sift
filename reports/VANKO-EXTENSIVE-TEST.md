# VANKO / Standard Forensic Case 2 — Council-SIFT extensive test

Generated: 2026-06-09

## Input evidence

- Source archive: `/home/exor/hackathon_samples/Standard Forensic Case 2/VANKO.zip`
- Source SHA256: `ac8efb3bcae165ea2c1c270964d574c410a884297d90ccbe6f09efacd9621929`
- ZIP size: `43730418364` bytes
- Extracted to: `/home/exor/hackathon_samples/Standard Forensic Case 2/extracted`
- Extracted file count: `25`
- Extracted total bytes: `43730414220`
- SIFT-visible path: `/mnt/evidence/Standard Forensic Case 2/extracted`

Evidence surfaces verified:

- Split EWF physical image: `surface_physical.E01` … `surface_physical.E21`
- FTK Imager acquisition text: `surface_physical.E01.txt`
- CYLR triage archive: `vanko-c-drive.CYLR.7z`

CYLR inventory prepass:

- Archive bytes: `549852502`
- Entries: `8326`
- Files: `6576`
- Folders: `1750`
- Uncompressed file bytes: `1882720537`
- Key artifact counts from inventory: `EVTX=4`, `PREFETCH=238`, `LNK=238`, `JUMPLIST=54`, `REGISTRY_HIVE=12`, `SRUM=1`, `AMCACHE=1`, `CHROME_HISTORY=2`.

## System gates run

Deterministic Council-SIFT gates all passed:

- identity-kernel bypass suite: `13/13 passed`
- gate red-team: `52` destructive refused, `20` legitimate allowed
- adversarial evasions: `67/67` caught, `0/36` false positives
- receipt store: PASS
- trusted execution: PASS
- bounded skeptic prompt: PASS
- bench-real report guard: PASS
- smoke lifecycle on isolated Neo4j `bolt://localhost:7690`: PASS
- ablation: precision `1.000`, recall `1.000`
- skeptic panel gate logic: PASS

Gate logs:

- `/tmp/csift_standard_case2_core_gates.log` — SHA256 `a7a2bd046d495165c553bacd5a876198b531fbb552eae7f356789348b5e46eb0`
- `/tmp/csift_standard_case2_graph_gates.log` — SHA256 `5870151dd8617d63c633ee042d00af35b6927e870ced8206a70a46e78645eb11`

## Manual Council-SIFT prepass (`case=VANKO`)

Three trusted-execution findings were captured, recorded, Council-reviewed, and independently rerun exactly:

1. `F-analyst-VANKO-001` — CYLR archive readable and sized — `COUNCIL_VERIFIED`.
2. `F-analyst-VANKO-002` — EWF GPT partition map, primary Windows lead at sector `1411072` — `COUNCIL_VERIFIED`.
3. `F-analyst-VANKO-003` — root filesystem at offset `1411072` exposes Windows artifact surface and deleted `runme.cmd` / `version.txt` leads — `COUNCIL_VERIFIED`.

Artifacts:

- `reports/VANKO.md` — SHA256 `d7601f9ae90a53b237ed79e8a35573431de0ee618ff31404b92290d7a32ee06c`
- `execution-logs/VANKO.md` — SHA256 `1e998dc581a11b891273f0e212245fd7cf2a16f246333755fa2a1edf07eef1f5`
- `execution-logs/VANKO.jsonl` — SHA256 `f29ca0f3c3bb31f1dea1b6dcc590aa81377a9023537b9bb8aaca8e36fe60fa16`
- Trace rerun log: `/tmp/csift_vanko_trace_rerun.log` — SHA256 `de764996cd1c21e85c880e4d3291e5bc7426cce314d85c71572dc797150dc437`

## Live autonomous agent run (`case=VANKO-AUTO`)

Command used bounded `analyst/autorun.sh` with live Claude Code, SIFT wrapper, `csift capture`, `record-finding`, and `council review`.

Result:

- Transcript: `execution-logs/AGENTIC-VANKO-AUTO.jsonl` — `220` JSON lines.
- Processed report: `reports/VANKO-AUTO.md` — SHA256 `8f05b41dea236cb4f031345cf84d5e0fdec872cf22eb82e746a43f54c3e13b42`.
- Structured log: `execution-logs/VANKO-AUTO.md` — SHA256 `fcaf134f558c364e1fad762c1edb22c166d32e58976c9353d59d163bee715e4e`.
- Structured JSONL: `execution-logs/VANKO-AUTO.jsonl` — SHA256 `8ee588f2f6edb13493be9d83b7e86f28463d55e469e6f9c0bd685ef88300e78c`.
- Trace rerun log: `/tmp/csift_vanko_auto_trace_rerun.log` — SHA256 `df7c1188477d541bb05379b265580e7a2c2d3219449c0452482a1d0ebc197749`.

Findings:

1. `F-analyst-VANKO-AUTO-001` — FTK Imager acquisition provenance and verified MD5 — `COUNCIL_VERIFIED`.
2. `F-analyst-VANKO-AUTO-002` — GPT partition map and likely OS-volume lead at sector `1411072` — `COUNCIL_VERIFIED`.
3. `F-analyst-VANKO-AUTO-003` — NTFS Windows root on slot-003 partition; Windows.old/GWX/WS upgrade context — `COUNCIL_VERIFIED`.
4. `F-analyst-VANKO-AUTO-004` — CYLR archive scope and counts — `COUNCIL_VERIFIED`.
5. `F-analyst-VANKO-AUTO-005` — over-strong Users-directory wording — `DISPUTED` by Council.
6. `F-analyst-VANKO-AUTO-006` — corrected Users-directory/profile-surface claim — `COUNCIL_VERIFIED`.

Self-correction proof:

- The Council bounced `F-analyst-VANKO-AUTO-005` for certainty/inference overreach.
- The agent re-filed the narrower `F-analyst-VANKO-AUTO-006`, which passed.
- `process_run.sh` reports: `5 verified, 1 self-corrected`.

All five verified VANKO-AUTO findings reproduced exactly under `csift trace --rerun`.

## Limitations / boundaries

- This is a first-pass case/system test, not a full case solve.
- Current supported claims are artifact/provenance/surface claims only.
- No human operator attribution, malware conclusion, file-transfer conclusion, execution conclusion, or intent conclusion is supported yet.
- `ewfinfo` was refused by the current identity-kernel allowlist (`tool not in authorized envelope`); `mmls`, `fls`, `7z`, `cat`, `csift capture`, `record-finding`, `council review`, and `trace --rerun` all worked.
- The live agent initially looked for `/mnt/evidence` from the host shell before switching to `sift`; the corrected workflow uses `sift '<command>'` for evidence access.
- VANKO receipts/reports are local/uncommitted and may contain case-identifying paths/tokens. Do not publish or push them without an explicit receipt-scope decision.

## Recommended next digs

1. Extract or parse only targeted CYLR artifacts: Security/System/Application EVTX, SRUM, Amcache, Prefetch, LNK/JumpLists, and Chrome History.
2. Use `fls`/`icat` from the EWF image to corroborate any CYLR-only lead against the disk image.
3. Submit only narrow artifact facts to Council: event rows, registry values, file metadata, hash/byte equality, or parser counts — not narrative guilt or operator attribution.
