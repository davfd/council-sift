# VANKO-DEEP — Minute Timeline Operator Update

## Bottom line

Continued again. Built the minute-by-minute packet for `2018-05-13T10:05Z..10:15Z`, submitted it to Council-SIFT, and got it verified.

Current `VANKO-DEEP`: **18 Council-verified findings**, **2 self-corrected disputed drafts**.

New verified finding:

- `F-analyst-VANKO-DEEP-020` — 11-row minute timeline packet across registry / EVTX / Prefetch / LNK / JumpList / Chrome History. `COUNCIL_VERIFIED/HIGH`.

Council result for this extra round: **1 submitted, 1 verified, 0 bounces**.

## What the minute packet shows

Target window: `2018-05-13T10:05:00Z..10:15:59Z`

Totals across the 11 one-minute rows:

- registry rows: `480`
- EVTX rows: `168`
- Prefetch distinct file hits: `61`
- Prefetch slot hits: `82`
- LNK timestamp-field rows: `1`
- JumpList Automatic timestamp-field rows: `144`
- JumpList Custom timestamp-field rows: `1`
- Chrome History visits/downloads: `0`

Peak minutes:

- `10:05Z` — EVTX + Prefetch peak
  - EVTX rows: `111`
  - Security: `4624=5`, `4672=3`, `4648=2`, `4634=2`
  - Prefetch slots: `26`
  - Prefetch files: `24`
  - key Prefetch executables: `CHROME.EXE:4`, `DROPBOXUPDATE.EXE:2`, `EXPLORER.EXE:1`, `ONEDRIVE.EXE:1`, `GOOGLEUPDATE.EXE:1`
- `10:12Z` — RecentDocs / LNK / JumpList timestamp-field cluster
  - `RecentDocs=295`
  - Prefetch slots: `12`
  - LNK timestamp-field rows: `1`
  - JumpList Automatic timestamp-field rows: `144`
  - JumpList Custom timestamp-field rows: `1`
  - Chrome visits/downloads: `0`
- `10:14Z` — UserAssist cluster
  - `UserAssist=185`
  - registry needles: `GOOGLE:8`, `CHROME:7`, `DROPBOX:5`, `DRIVE:3`, `7Z:3`, `WINWORD:2`, `CMD:1`, `POWERSHELL:1`
- `10:15Z` — tail Prefetch activity
  - EVTX rows: `1`
  - Prefetch slots: `3`
  - key Prefetch executable: `DROPBOXUPDATE.EXE:2`

## What it means

The timeline is now sharper:

1. `10:05Z` — session/logon and process-execution witnesses cluster first.
2. `10:12Z` — registry RecentDocs + LNK/JumpList timestamp-field cluster appears.
3. `10:14Z` — UserAssist activity cluster appears.
4. Chrome History remains empty for visits/downloads in this scoped window across two captured DBs.

This strengthens account/profile timing for `PROFILE_PC_USER`. It still does **not** prove file-open/copy, transfer direction, upload completion, or human identity.

## Artifacts and hashes

Updated Council report:

- `reports/VANKO-DEEP.md`  
  SHA256 `88c407071e9fb3e7e54e547e7d67521b66cd37011fd18f934795e75ad6346a1a`

Execution logs:

- `execution-logs/VANKO-DEEP.md`  
  SHA256 `fb4e45a63b2a8100ec4e4cb98f11732ce0251d63d9f9a05a6d866e3d221e7faa`
- `execution-logs/VANKO-DEEP.jsonl`  
  SHA256 `5230e0c1eba0643d0582763fb053034d0d06781f85cf967461d9e02323132972`

Minute timeline safe outputs:

- SIFT `/tmp/vanko_minute_timeline_out/minute_timeline_summary.txt`  
  SHA256 `fadbd723c7b90c7b1448044dc7cb65c66707ab7c0471558d5c9b63837e105614`, `29` lines
- SIFT `/tmp/vanko_minute_timeline_out/minute_timeline.csv`  
  SHA256 `2c476687d8fbc14a064b21b1570cd063be6dc37cf536dba28bb08371b60dc301`, `12` lines including header

Run/Council logs:

- `/tmp/vanko_minute_timeline_v3_run.log`  
  SHA256 `68497db1adeebbe8d304195e0c841ae62bb667a3544bcdd22eb01f74432adb39`
- `/tmp/csift_vanko_minute_timeline_finding.log`  
  SHA256 `59b93bbf4e14564a7eb3a51dea09ec8541cb1542a45686e31d8af54c4a3d00be`
- `/tmp/csift_vanko_minute_timeline_trace.log`  
  SHA256 `2ca30da7902e2d4f41df3efd60db3dc2a2a5ed8f6f728bd8f22de81b622141e2`
- `/tmp/csift_vanko_deep_process_run_v9.log`  
  SHA256 `14b3c1848572716d9b6857a1d4f62d17144908dcfc9122c786a180d30dc08a69`

Receipt:

- `council/receipts/F-analyst-VANKO-DEEP-020-9ad33dd375cb.json`  
  SHA256 `76a3170b4e828a550ffb12c7cefed74c6410c41fafbeccff7d647140dff622d6`

## Still not proven

Still not proven:

- human operator identity;
- intent;
- malware;
- transfer direction;
- completed upload/download;
- browser upload;
- cloud sync completion.

## Next best dig

The next useful probe is a **cloud-client receipt hunt**: search Drive/Dropbox/OneDrive/iCloud local logs and metadata around `10:05Z..10:15Z` for explicit receipt markers (`upload`, `sync`, `commit`, server id, revision id, success code, stable file id). Without such a receipt, we should keep saying “account/profile activity cluster,” not “upload completed.”
