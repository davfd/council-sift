# VANKO-DEEP — Council-Assisted MFT/USN + Registry UserActivity Update

## Bottom line

Continued with Council-SIFT as requested. This round did two independent digs beyond Prefetch:

1. **EWF `$MFT` / `$UsnJrnl:$J` extraction + target-window check** — Council verified the extraction and the availability boundary.
2. **CYLR registry UserActivity pass with RECmd** — Council verified a strong PC User profile registry timing layer inside the same `2018-05-13T10:05Z..10:15Z` window.

Current `VANKO-DEEP`: **14 Council-verified findings**, **2 self-corrected disputed drafts**.

New verified findings:

- `F-analyst-VANKO-DEEP-013` — EWF-derived `$MFT` / `$UsnJrnl:$J` extraction and MFTECmd CSV output coverage. `COUNCIL_VERIFIED/HIGH`.
- `F-analyst-VANKO-DEEP-014` — MFT/USN target-window availability boundary. `COUNCIL_VERIFIED/HIGH`.
- `F-analyst-VANKO-DEEP-015` — RECmd UserActivity registry parser coverage. `COUNCIL_VERIFIED/HIGH`.
- `F-analyst-VANKO-DEEP-016` — target-window registry UserActivity layer for `PROFILE_PC_USER`. `COUNCIL_VERIFIED/HIGH`.

## What we ran

### EWF filesystem metadata

- Extracted EWF `$MFT` via `icat` from NTFS offset `1411072`.
- Extracted EWF `$UsnJrnl:$J` via `icat` from NTFS offset `1411072`.
- Parsed both with `MFTECmd`.
- Built a safe target-window summary.
- Submitted the summary to Council-SIFT and reran traces.

### Registry user activity

- Ran `RECmd` with `UserActivity.reb` against the CYLR extracted Windows tree.
- Built a safe summary from the CSV: counts, profile/hive coverage, target-window rows, and selected string-presence counts.
- Submitted the summary to Council-SIFT and reran traces.

ActivitiesCache check: no `ActivitiesCache.db` was found in the extracted CYLR tree, so there was no ActivitiesCache parse to promote.

## What we learned

### 1. MFT/USN did not supply the `2018-05-13T10:05Z..10:15Z` witness

EWF extraction / parse facts:

- `$MFT` size: `325,320,704`
- `$MFT` SHA256: `719d322022c7c783f3a80e5bf7bad17912ce14a251a3e6fdb94d7c0a4fc93a93`
- `$UsnJrnl:$J` size: `2,665,094,304`
- `$UsnJrnl:$J` SHA256: `af29641589bd3a43d156504531e4751d10054a832b4d97a5b482b6e4847acd93`
- USN CSV rows: `210,168`
- USN retained time range: `2016-11-04T13:28:03Z..2016-11-04T17:51:17Z`
- USN retained range overlaps target window: `0`
- USN target-window rows: `0`
- MFT CSV literal `2018-05-13` timestamp lines: `0`
- MFT CSV literal `2018-05-13 10:05..10:15` timestamp lines: `0`

Meaning: USN is not available as a 2018 target-window witness in this EWF extraction. This is **not** evidence of no activity; it is an availability boundary.

### 2. Registry UserActivity gives a strong same-window PC User profile timing layer

RECmd UserActivity coverage:

- total rows: `1,778`
- hives:
  - `NtUser:1463`
  - `UsrClass:315`
- profiles:
  - `PROFILE_PC_USER:1398`
  - `PROFILE_DEFAULTPRINTER:380`
- global LastWrite range: `2016-03-15T10:48:41Z..2018-05-13T10:14:54Z`

Target window: `2018-05-13T10:05:00Z..2018-05-13T10:15:59Z`

- registry rows in window: `480`
- time range in window: `2018-05-13T10:12:23Z..2018-05-13T10:14:54Z`
- deleted rows: `0`
- hive type: `NtUser:480`
- profile: `PROFILE_PC_USER:480`
- descriptions:
  - `RecentDocs:295`
  - `UserAssist:185`

Selected string-presence counts in the same window:

- `LNK:295`
- `UserAssist:185`
- `Recent:295`
- `Chrome:7`
- `Google:8`
- `Drive:5`
- `Dropbox:5`
- `OneDrive:1`
- `CMD:1`
- `PowerShell:1`

Meaning: this materially strengthens the **account/profile activity timing** layer for `PC User` during the same window where EVTX and Prefetch already clustered. It still does not identify the human operator or prove a transfer/upload mechanism.

## Council result

Council-SIFT verified all four new findings:

- `F-analyst-VANKO-DEEP-013` — verified extraction/parser coverage.
- `F-analyst-VANKO-DEEP-014` — verified MFT/USN target-window availability boundary.
- `F-analyst-VANKO-DEEP-015` — verified RECmd UserActivity coverage.
- `F-analyst-VANKO-DEEP-016` — verified PC User target-window registry UserActivity timing layer.

Trace reruns reproduced exact output hashes for both safe summaries.

## What remains unproven

Still not proven:

- human operator identity;
- intent;
- malware;
- transfer direction;
- completed upload/download;
- browser upload;
- cloud sync completion.

Registry `UserAssist` / `RecentDocs` and Prefetch together strengthen account/profile activity timing. They do not settle movement mechanism or human attribution.

## Artifacts and hashes

Current Council report:

- `reports/VANKO-DEEP.md`  
  SHA256 `ab8d0cdb3769070b05b489d4a279da00949d2989dfd7951d86a8211ca444e8e9`

Execution logs:

- `execution-logs/VANKO-DEEP.md`  
  SHA256 `f31e7928798cb64929d92e4a7007962bd4c24a4c6049bc0455e2284f4f661dc7`
- `execution-logs/VANKO-DEEP.jsonl`  
  SHA256 `ef9d8c36e9f18ebf538741fceb661a6aa081bbc75dd8a54eca28b532f6c5681b`

MFT/USN safe summary:

- SIFT `/tmp/vanko_mft_usn_window_out/mft_usn_window_summary_v2.txt`  
  SHA256 `28edb118f0a79ab8ae638453bf6476b40ac7a4869653844601e9b95976d09dc6`, `27` lines

Registry UserActivity safe summary:

- SIFT `/tmp/vanko_reg_out/recmd_useractivity_summary_v3.txt`  
  SHA256 `2d4950872132839d46bfcc5b4cecbf979514b5077af41d8ef14b81f53cf8c0e2`, `62` lines

Run and Council logs:

- `/tmp/vanko_mft_usn_extract_parse_run.log`  
  SHA256 `f761ac4b7aaac3962bb34e497612d79200903e2a40918d5fd4371dfd55a4bcc7`
- `/tmp/vanko_mft_usn_window_summary_v2_run.log`  
  SHA256 `caf1bbeb83345c168f5165a4a5252bed982b015cacbfcfc6befb9976978ce0cf`
- `/tmp/csift_vanko_mft_usn_window_findings.log`  
  SHA256 `f7e2ec6f1f969ffb1a251ab79dac7888d4a3a8872810003cfa056dd9ae11c644`
- `/tmp/csift_vanko_mft_usn_window_trace.log`  
  SHA256 `f32eb92c068f81ee1c7ea62a188460b5f4d2d4d45bd97280806017a122336524`
- `/tmp/vanko_reg_useractivity_run.log`  
  SHA256 `91f4a90c307c58790560900d45232266a59b02e30a53b86e4ef5696cf7c0d43d`
- `/tmp/vanko_reg_useractivity_summary_v3b_run.log`  
  SHA256 `28be603685376ea65d9d3585619e0f5e5d098412b87ffdcc3f741b91712e4e1b`
- `/tmp/csift_vanko_reg_useractivity_findings.log`  
  SHA256 `d310a4e633c1ab6fc56bf0c75a6d0e3910d9476dacf3beb9b6eda6e7e33291c6`
- `/tmp/csift_vanko_reg_useractivity_trace.log`  
  SHA256 `8f3426fc6679261dec6c5681f8f03164aab0d0217779d58934a0c7d35dfff502`

Receipts:

- `council/receipts/F-analyst-VANKO-DEEP-013-4ac00159a1e8.json`  
  SHA256 `ad43e8a9f41a3094c2d9903ba5b761a33b9110d437e8af99f70e01bcf98c4cae`
- `council/receipts/F-analyst-VANKO-DEEP-014-2f3f64f78ae3.json`  
  SHA256 `7f4980e005c73f525f1ac55c5f3ea031aa59dfe4a42296e6eb23a486ea437236`
- `council/receipts/F-analyst-VANKO-DEEP-015-c576ad9143b6.json`  
  SHA256 `efdcc2412c08b8d4d30e743ce1ce46a7a7855c60dd7136210e92bca0143ff046`
- `council/receipts/F-analyst-VANKO-DEEP-016-18227e4a0485.json`  
  SHA256 `a1556187da9f4308f3d5404119d1ec8a7dd93aa952c03a4a8400d4ad4c7c7a03`

## Next best digs

1. Extract the actual `RecentDocs` / `UserAssist` value families behind the 480 target-window registry rows into a redacted per-extension/per-hash ledger.
2. Correlate those registry rows against the existing LNK/JumpList/Prefetch rows in the same window.
3. Build an account/profile timeline packet: EVTX + Prefetch + Registry UserActivity, with explicit source tags for each fact.
