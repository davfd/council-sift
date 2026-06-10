# VANKO-DEEP — SRUM Network Boundary Operator Update

## Bottom line

Continued again. Parsed the exported SRUM tables for the same `2018-05-13T10:05Z..10:15Z` window, submitted the result to Council-SIFT, and verified it.

Current `VANKO-DEEP`: **22 Council-verified findings**, **2 self-corrected disputed drafts**.

New verified finding:

- `F-analyst-VANKO-DEEP-024` — exported SRUM network/connectivity target-window boundary. `COUNCIL_VERIFIED/HIGH`.

Council result this round: **1 submitted, 1 verified, 0 bounces**.

## What SRUM shows

Exported SRUM tables present:

- `SruDbIdMapTable`
- network table `{973F5D5C-1D90-4944-BE8E-24B94231A174}`
- connectivity table `{DD6636C4-8929-4683-974E-22C046A43763}`

Target window: `2018-05-13T10:05:00Z..10:15:59Z`

Network table:

- global rows: `4`
- target-window rows: `2`
- window app classes:
  - `WINLOGON.EXE:1`
  - `SPOOLER_SERVICE:1`
- total sent: `0`
- total received: `0`

Target-window cloud/browser executable SRUM network rows:

- Chrome: `0`
- OneDrive: `0`
- Dropbox: `0`
- DropboxUpdate: `0`
- iCloudDrive: `0`
- iCloudServices: `0`
- GoogleUpdate: `0`
- GoogleDriveFS: `0`
- GoogleDrive: `0`
- Explorer: `0`

Connectivity table:

- global rows: `8`
- target-window rows: `0`

## What it means

This adds a network-telemetry boundary:

> In the exported SRUM network/connectivity tables, the target window does not show cloud/browser process network rows for Chrome/OneDrive/Dropbox/iCloud/GoogleDriveFS-class executables. The two target-window network rows are Winlogon/Spooler with zero bytes.

This is **not** “no network happened.” It is only:

> the exported SRUM network table records zero bytes for its two target-window rows and no selected cloud/browser executable rows in that exported table.

## Case posture now

The strongest supported shape remains:

- PC User account/profile activity cluster is strong: EVTX + Prefetch + registry + RecentDocs/UserAssist + minute timeline.
- Local cloud/browser residue exists, but the local receipt hunt did not produce a completed upload/download receipt in the target window.
- SRUM does not add cloud/browser process network corroboration in the target window.

Still unsupported:

- “upload completed”;
- transfer direction;
- exact movement mechanism;
- human operator identity.

## Artifacts and hashes

Updated Council report:

- `reports/VANKO-DEEP.md`  
  SHA256 `0ccdcf61f57ffd60c282d2f3aa6057b0a2d63fb85537bd761ca86180b3d3abd2`

Execution logs:

- `execution-logs/VANKO-DEEP.md`  
  SHA256 `2c8fec86a58c89b329f25d40172523abc892184a057ecfba0f6dd5ad120f913a`
- `execution-logs/VANKO-DEEP.jsonl`  
  SHA256 `8df7756e0fb86155bcc55df2ca5f9935767b769fd7f113bd16334eec1ab2b59c`

SRUM output:

- SIFT `/tmp/vanko_srum_out/srum_window_summary.txt`  
  SHA256 `8df5c603bd709b060e7b1414bb2c60fd525cd07952aec63939790dd53cfbfe86`, `39` lines

Run/Council logs:

- `/tmp/vanko_srum_window_v2_run.log`  
  SHA256 `9f86c2b54c1fb382c7decdf7399d04642c4c52eed5149f4538c22229c887b0f6`
- `/tmp/csift_vanko_srum_window_finding.log`  
  SHA256 `d5dd75392c9ab9eb331b462e52c96ca1dbf10dfcb247fea1023c95f6efcc89b0`
- `/tmp/csift_vanko_srum_window_trace.log`  
  SHA256 `0292c5c175cbed7808750da19f249901975027939fc22e418fb9329ec9b8a203`
- `/tmp/csift_vanko_deep_process_run_v11.log`  
  SHA256 `8466d50e414bf851c4210e6a5a8dabc15d9857089b1a30999c2880c34fa47990`

Receipt:

- `council/receipts/F-analyst-VANKO-DEEP-024-e33b0ddd3bbe.json`  
  SHA256 `aa90d4dcf35af7992eb4c6489e43f179e7f05dab70f69f14bda4a4b35af09454`

## Next best dig

At this point the local evidence has given us timing and local-boundary findings, not a receipt. The next useful step is a **synthesis packet**: one manifest tying findings `001..024` to the exact artifacts, explicitly separating:

1. proven PC User activity timing;
2. cloud/browser residue and boundaries;
3. what remains unproven;
4. what an external server-side audit/export would need to supply.
