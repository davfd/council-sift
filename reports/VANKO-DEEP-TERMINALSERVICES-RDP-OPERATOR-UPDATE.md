# VANKO-DEEP — TerminalServices/RDP Availability Operator Update

## Bottom line

Continued with another source-read + Council-SIFT round, focused on whether the captured EVTX set provides TerminalServices/RDP session telemetry for the `2018-05-13T10:05Z..10:15Z` target window.

Current `VANKO-DEEP`: **26 Council-verified findings**, **4 self-corrected disputed drafts**.

New verified finding:

- `F-analyst-VANKO-DEEP-030` — TerminalServices/RDP parsed-EVTX availability and target-window boundary. `COUNCIL_VERIFIED/MEDIUM`.

Council result this round: **1 submitted, 1 verified, 0 bounces**.

## What we learned

The SIFT-visible TerminalServices/RDP summary records:

- selected CYLR EVTX files: `4`
- TerminalServices/RDP-named EVTX files in selected CYLR extract: `0`
- parsed EVTX CSV rows scanned: `60,371`
- TerminalServices/RDP-like rows globally: `5`
- global TerminalServices/RDP-like time range: `2016-06-18T20:40:57Z..2018-01-16T18:32:16Z`
- global source class: `SYSTEM.EVTX:5`
- target-window TerminalServices/RDP-like rows: `0`
- raw user/remote-host values emitted: `0`

Meaning:

- The parsed EVTX set does **not** place a TerminalServices/RDP session inside the `10:05Z..10:15Z` target window.
- The selected CYLR extract also does **not** expose a TerminalServices/RDP-named operational EVTX file.
- This is an **availability/timing boundary**, not proof no remote access occurred elsewhere or in an uncaptured/missing log.

## What this changes

The account/session picture is now cleaner:

- Security logon rows show local/cached/unlock/service-shaped account/session activity in the target window.
- TerminalServices/RDP telemetry in the parsed set does not provide a target-window remote-session witness.
- Therefore the current supported path remains **local account/profile/session timing**, not human-operator identity and not remote-session attribution.

## Still not proven

Still not proven:

- human operator identity;
- intent;
- malware;
- remote-session attribution for the target window;
- transfer direction;
- completed upload/download;
- browser upload;
- cloud sync completion;
- provider-side event absence.

## Artifacts and hashes

Updated Council report:

- `reports/VANKO-DEEP.md`  
  SHA256 `975d5fc2d3a52e834b053462444116913c82243ec4609b5c2324453f9e17fd49`

Execution logs:

- `execution-logs/VANKO-DEEP.md`  
  SHA256 `c19000431049166810d2a8c43c8d80852692f1b633dce6b17574ad281b2d98ec`
- `execution-logs/VANKO-DEEP.jsonl`  
  SHA256 `47f05d9ae153ff965d9926c0a71926824c0ee1b255f58ade0e11232e3b3fffd9`

TerminalServices/RDP summary:

- SIFT `/tmp/vanko_ts_rdp_window_out/ts_rdp_window_summary.txt`  
  SHA256 `8ce87a8f4049106d4116e27b3b98d3cf536b3d4ef1fe6c664768d798b0661e36`

Run/Council logs:

- `/tmp/vanko_ts_rdp_window_run.log`  
  SHA256 `340a6f3abdddc402761ab5558205ee9e4fd55133ca1cf9323d295409d4a137d0`
- `/tmp/vanko_ts_rdp_window_sift_hashes.log`  
  SHA256 `c0c76b5e5ca682421c51befdeb954d56a987ebe588d0b15f6f9a709160ec5067`
- `/tmp/csift_vanko_ts_rdp_window_finding.log`  
  SHA256 `c8c5da7ff32729fd6229a9046d43fdadc925a3c0a8104807eb93ac64d5bfe406`
- `/tmp/csift_vanko_ts_rdp_window_trace.log`  
  SHA256 `498ba8eca5f40e4546f09a55a9409af0aa691f6e8257ed4cc930964cbe8a85eb`
- `/tmp/csift_vanko_deep_process_run_v15.log`  
  SHA256 `75f9bc8e64d6fc5ca4cbdcb39fbbd8f66ff9e7cb5cea892cad90daa80051882e`

Receipt:

- `council/receipts/F-analyst-VANKO-DEEP-030-9405dfcc8c2e.json`  
  SHA256 `8015f3105a70e5306d7e20e8f9355963d550e408d48c488a9506a3fd236962a8`
