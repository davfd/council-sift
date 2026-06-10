# VANKO-DEEP — Registry Ledger + Cross-Surface Correlation Update

## Bottom line

Continued with Council-SIFT. This round converted the 480 target-window registry rows into a **redacted ledger** and then correlated that ledger against EVTX, Prefetch, LNK, JumpList, and Chrome History surfaces for the same `2018-05-13T10:05Z..10:15Z` window.

Current `VANKO-DEEP`: **17 Council-verified findings**, **2 self-corrected disputed drafts**.

New verified findings:

- `F-analyst-VANKO-DEEP-017` — redacted PC User registry ledger, 480 target-window rows, no raw Windows/user path markers. `COUNCIL_VERIFIED/HIGH`.
- `F-analyst-VANKO-DEEP-018` — RecentDocs/UserAssist selected needle-count split in the redacted ledger. `COUNCIL_VERIFIED/HIGH`.
- `F-analyst-VANKO-DEEP-019` — cross-surface target-window correlation: registry + EVTX + Prefetch present, Chrome History window empty, LNK/JumpList timestamp-field counts bounded. `COUNCIL_VERIFIED/HIGH`.

Council result this round: **3 submitted, 3 verified, 0 bounces**.

## What we ran

- Parsed `/tmp/vanko_reg_out/recmd_useractivity.csv` into a redacted target-window ledger.
- Wrote only hashes/classes/counts for registry rows — no raw paths.
- Re-read source parser outputs for the same UTC window:
  - RECmd UserActivity CSV
  - EVTX CSV
  - CYLR Prefetch files via `pyscca`
  - LNK CSV
  - JumpList Automatic/Custom CSVs
  - two captured Chrome History DBs
- Captured the safe summary through Council-SIFT.
- Submitted 3 narrow findings to Council.
- Reran traces; reruns reproduced exact output hashes.

## What we learned

### 1. The registry rows are now ledgered without raw paths

Redacted ledger:

- rows: `480`
- time range: `2018-05-13T10:12:23Z..2018-05-13T10:14:54Z`
- profile: `PROFILE_PC_USER:480`
- hive: `NtUser:480`
- descriptions:
  - `RecentDocs:295`
  - `UserAssist:185`
- raw Windows path markers in ledger: `0`
- raw user path markers in ledger: `0`
- ledger SHA256: `fea7a79665728ac31fdd8da57ff1d559515a204c47f23856dcdbd7321cf64076`

Meaning: the registry timing layer is now safer to hand to operators/Council because it is a hash/class ledger, not a raw-path dump.

### 2. RecentDocs and UserAssist split cleanly

RecentDocs selected needle counts:

- `LNK:295`
- `Recent:295`
- `Drive:2`
- `OneDrive:1`
- `7Z:2`

UserAssist selected needle counts:

- `Chrome:7`
- `Google:8`
- `Drive:3`
- `Dropbox:5`
- `CMD:1`
- `PowerShell:1`
- `WinWord:2`
- `uTorrent:2`
- `WhatsApp:2`
- `Firefox:2`
- `7Z:3`

Meaning: this supports **account/profile activity triage** in the target window. It is not, by itself, execution proof, file movement proof, browser upload proof, or human attribution.

### 3. Cross-surface window now has a tighter shape

Target window: `2018-05-13T10:05:00Z..10:15:59Z`

Verified cross-surface counts:

- Registry ledger rows: `480`
- EVTX rows: `168`
  - `security.evtx:106`
  - `system.evtx:37`
  - `application.evtx:25`
- Prefetch:
  - files with target-window hits: `61`
  - last-run slots: `82`
  - time range: `2018-05-13T10:05:31Z..10:15:32Z`
- Chrome History DBs: `2`
  - visits in window: `0`
  - downloads in window: `0`
  - Drive-needle visits in window: `0`

LNK/JumpList parser CSV timestamp-field counts in the window:

- LNK rows with any selected timestamp field in window: `1`
- JumpList Automatic rows with any selected timestamp field in window: `144`
- JumpList Custom rows with any selected timestamp field in window: `1`

Boundary: those LNK/JumpList counts are **parser CSV timestamp-field counts**, not proof of file-open, transfer, or use.

## What it means

The strongest supported case shape is now:

> `PROFILE_PC_USER` has a dense artifact-timing cluster in the `10:05Z..10:15Z` window across EVTX, CYLR Prefetch, and registry UserActivity/RecentDocs/UserAssist. Chrome History remains empty for visits/downloads in the same scoped window across the two captured DBs.

That strengthens the **account/profile activity window**. It does not settle **who** was at the keyboard or **what movement mechanism** occurred.

## Still not proven

Still not proven:

- human operator identity;
- intent;
- malware;
- transfer direction;
- completed upload/download;
- browser upload;
- cloud sync completion.

## Artifacts and hashes

Current Council report:

- `reports/VANKO-DEEP.md`  
  SHA256 `869fcc663c3e9da9176277f8f4b91e0457059954aa2433b0ecb26c050e90c35f`

Execution logs:

- `execution-logs/VANKO-DEEP.md`  
  SHA256 `fab07f85a1b00955468307bca306ca5f3a5421df1d2da9907a9c0db71d1e0ab4`
- `execution-logs/VANKO-DEEP.jsonl`  
  SHA256 `14eaa76371717257158801ccedb294c39967a62779d6381c8d7433a548cfe93b`

Safe summary and redacted ledger:

- SIFT `/tmp/vanko_reg_correlate_out/registry_ledger_correlation_summary.txt`  
  SHA256 `5373dcfa7f161d3dac292c50d78f6351dccd931e4e3a0d98303e708211b280d8`, `102` lines
- SIFT `/tmp/vanko_reg_correlate_out/registry_window_redacted_ledger.csv`  
  SHA256 `fea7a79665728ac31fdd8da57ff1d559515a204c47f23856dcdbd7321cf64076`, `481` lines including header

Run/Council logs:

- `/tmp/vanko_registry_correlation_v3_run.log`  
  SHA256 `1ee270f5132d404f4dc9ebb37d1656dae3b5448c7311937d4bb70ab559edf2c7`
- `/tmp/csift_vanko_registry_correlation_findings.log`  
  SHA256 `bb6715afb9fe5e4226cfc027fec621a6ce41de26d98c7d821c4d6f11b71e7c7c`
- `/tmp/csift_vanko_registry_correlation_trace.log`  
  SHA256 `2623cddb680783bfc05e77493e8825345a27c134362d9153e3c8836bf9c525c7`
- `/tmp/csift_vanko_deep_process_run_v8.log`  
  SHA256 `7638b1999e76ce1e878c717c96532b8e10fc0d2bf70eea1f0fe4c873112edede`

Receipts:

- `council/receipts/F-analyst-VANKO-DEEP-017-369b1f758e49.json`  
  SHA256 `806a7037a12d3ae287b5a41b339592112bb53e5bfe6bdee078f9430f9d94a19c`
- `council/receipts/F-analyst-VANKO-DEEP-018-9ae23ef67957.json`  
  SHA256 `66f9f1ff96f18fbbba6639913777b95a2db4f57eff6f801bddac1c9305f2beb9`
- `council/receipts/F-analyst-VANKO-DEEP-019-0d17c806955f.json`  
  SHA256 `cb16c07e3627e99a48317770acc12a08bca8196cbe5c0727aa01b34cc233b5d3`

## Next best digs

1. Build a minute-by-minute timeline packet for `10:05Z..10:15Z` with one row per minute and source columns: EVTX / Prefetch / Registry / Chrome / LNK / JumpList.
2. For registry ledger rows, group hashed values into equivalence classes and correlate repeated row hashes with Prefetch executable classes.
3. If the goal is upload proof, hunt for explicit server/client receipt markers in cloud-client logs or audit exports; the current local artifacts do not prove completed upload.
