# VANKO-DEEP — Persistence / Autostart Triage Operator Update

## Status

Continued with another Council-SIFT loop against the `2018-05-13T10:05:00Z..10:15:59Z` target window.

Current case state after regeneration:

- `28` Council-verified findings
- `5` self-corrected disputed drafts
- latest verified finding: `F-analyst-VANKO-DEEP-033`

## Council-SIFT loop used

This round used the hackathon toolchain again:

- SIFT-wrapped read-only execution through `./bin/sift`
- trusted capture through `./bin/csift capture`
- Council review through `node council/council.mjs review F-analyst-VANKO-DEEP-033`
- independent rerun through `./bin/csift trace --rerun F-analyst-VANKO-DEEP-033`
- report regeneration through `bash analyst/process_run.sh VANKO-DEEP`

Council result:

- `F-analyst-VANKO-DEEP-033` — `COUNCIL_VERIFIED/MEDIUM`
- Council seats: citation, tool-semantics, contradiction, inference, and scope all supported
- independent rerun verdict: exact output hash match

## What was scanned

The persistence/autostart triage summary scanned:

- parsed EVTX rows
- selected persistence/autostart event IDs and provider classes
- selected filesystem surface classes in the SIFT-visible evidence roots
- safe class/count output only; no raw paths or raw user values emitted

Key source counts:

- `EVTX_TOTAL_ROWS_SCANNED=60371`
- `EVTX_WINDOW_ROWS=168`
- `ROOT_FILE_COUNTS=CYLR_EXTRACT:6574,DERIVED_VANKO_NEXT:41`

## What it found

Target-window EVTX persistence/autostart counts:

- `EVTX_PERSISTENCE_PROVIDER_OR_EVENT_WINDOW_ROWS=0`
- `EVTX_SERVICE_INSTALL_EVENT_WINDOW_ROWS=0`
- `EVTX_TASK_CHANGE_EVENT_WINDOW_ROWS=0`
- `EVTX_WMI_PERSISTENCE_EVENT_WINDOW_ROWS=0`
- `EVTX_SELECTED_WINDOW_EVENTID_COUNTS=NONE`
- `EVTX_SELECTED_WINDOW_PROVIDER_CLASS_COUNTS=NONE`
- `EVTX_AUTOSTART_TERM_WINDOW_ROWS=0`

Selected filesystem surface counts:

- `SCHEDULED_TASK_FILE_COUNT=0`
- `STARTUP_FOLDER_FILE_COUNT=0`
- `WMI_REPOSITORY_FILE_COUNT=0`
- `BITS_QMGR_DAT_COUNT=0`
- `APPCOMPAT_AMCACHE_SURFACE_COUNT=4`
- `APPCOMPAT_AMCACHE_SURFACE_TARGET_MTIME_COUNT=0`
- `REGISTRY_SYSTEM_CONFIG_HIVE_COUNT=10`
- `REGISTRY_SYSTEM_CONFIG_HIVE_TARGET_MTIME_COUNT=0`
- `REGISTRY_NTUSER_HIVE_TARGET_MTIME_COUNT=0`
- `REGISTRY_USRCLASS_HIVE_TARGET_MTIME_COUNT=0`

Prefetch / dual-use context:

- `PREFETCH_FILE_COUNT=238`
- `PREFETCH_FILE_TARGET_MTIME_COUNT=60`
- `PERSISTENCE_SURFACE_DUAL_USE_FILENAME_FILE_COUNTS=PREFETCH_FILE:37`
- `PERSISTENCE_SURFACE_DUAL_USE_TARGET_MTIME_FILE_COUNTS=PREFETCH_FILE:1`
- `PERSISTENCE_SURFACE_DUAL_USE_TARGET_MTIME_COUNTS=RUNDLL32:1`

Leak guard:

- `RAW_PATH_MARKERS_EMITTED=0`
- `RAW_USER_MARKERS_EMITTED=0`

## Meaning

This adds a bounded persistence/autostart check to the case:

- the selected EVTX witnesses do not show target-window service-install, scheduled-task-change, or WMI-persistence rows;
- the selected filesystem roots do not show scheduled-task/startup/WMI/BITS surface files in this scan;
- AppCompat/registry hive surfaces are present, but they do not carry target-window mtime counts in this summary;
- Prefetch remains the active execution-context surface, including one target-window dual-use basename class (`RUNDLL32`).

This strengthens the boundary around malware/automation/persistence, but it does not prove a clean host and does not identify a human operator.

## Still not proven

- human identity or intent
- completed upload/download
- cloud sync/server-side receipt
- malware absence across the whole host
- persistence absence across artifacts outside this bounded scan
- transfer direction or browser upload

## Artifacts and hashes

- trusted execution output SHA256: `08dd2a56b487b6b34e810cedc6c889b8221abb031571c34cc0e45d8b5366366f`
- SIFT summary file SHA256: `ed3d994344c86d31289d571d73abd544408f1928c35ba50f4c604f2e23a3f46e`
- finding log SHA256: `45cbd8c3ee46e83607ae264a9ca85bf44371a366b5c20e8e40d9342285899027`
- Council review log SHA256: `83ee708ab2c523090fa36b83ce226a05602d6b717395bfde8a475a3da904ba70`
- trace log SHA256: `f0ecfcd058c0e474600182aa795fa64afde7be7259a0b079f084a3e84c02d1aa`
- receipt SHA256: `a368613669690db8135061ea97d72aaad1b1bcadf181316d5f1c3ae578ba99e5`
- regenerated report SHA256: `6bdba76f90d2f3bb4eb41271cc8b65392e968ff51541cfce94f778acc7257cb9`
- regenerated execution markdown SHA256: `c38ee5f4213b4985109c3a1c0fa125487702295d6359bf9c5f803cefbd0aaf38`
- regenerated execution JSONL SHA256: `8069f85c7a54425e55d1d68bad4989daa20ee42d4ad5444222c8fc15fa9d5ee6`
