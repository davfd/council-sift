# VANKO-DEEP — ActivitiesCache Boundary Operator Update

## Status

Continued with another Council-SIFT loop against the `2018-05-13T10:05:00Z..10:15:59Z` target window.

Current case state after regeneration:

- `31` Council-verified findings
- `5` self-corrected disputed drafts
- latest verified finding: `F-analyst-VANKO-DEEP-036`

## Council-SIFT loop used

This round used:

- SIFT-wrapped read-only execution through `./bin/sift`
- trusted capture through `./bin/csift capture`
- Council review through `node council/council.mjs review F-analyst-VANKO-DEEP-036`
- independent rerun through `./bin/csift trace --rerun F-analyst-VANKO-DEEP-036`
- report regeneration through `bash analyst/process_run.sh VANKO-DEEP`

Council result:

- `F-analyst-VANKO-DEEP-036` — `COUNCIL_VERIFIED/MEDIUM`
- Council seats supported citation, tool semantics, contradiction, inference, and scope
- independent rerun exact-matched the captured output hash

## What was scanned

The scan searched the SIFT-visible CYLR and derived VANKO roots for ActivitiesCache-style artifacts and, if found, would have parsed SQLite tables for target-window times and activity markers.

It emitted only counts/hashes/classes and leak counters; no raw paths, users, or emails.

## Key counts

Target window:

- `WINDOW_UTC=2018-05-13T10:05:00Z..2018-05-13T10:15:59Z`

Root coverage:

- `ROOT_EXISTS=CYLR_EXTRACT:1,DERIVED_VANKO_NEXT:1`
- `ROOT_FILE_COUNTS=CYLR_EXTRACT:6576,DERIVED_VANKO_NEXT:41`

ActivitiesCache availability:

- `ACTIVITIESCACHE_CANDIDATE_COUNTS=NONE`
- `ACTIVITIESCACHE_CANDIDATE_SURFACE_COUNTS=NONE`
- `SQLITE_READABLE_ACTIVITYCACHE_FILES=0`
- `ACTIVITIESCACHE_ROWS_SAMPLED=0`

Target-window result:

- `TARGET_WINDOW_FIRST_PARSED_TIME=NONE`
- `TARGET_WINDOW_LAST_PARSED_TIME=NONE`
- `TARGET_WINDOW_ROW_COUNTS_BY_TABLE=NONE`
- `TARGET_WINDOW_ROW_TOTAL=0`
- `TARGET_WINDOW_MARKER_ROW_GROUP_COUNTS=NONE`
- `TARGET_WINDOW_ROW_HASH_COUNT=0`

Leak guard:

- `RAW_PATH_MARKERS_EMITTED=0`
- `RAW_USER_MARKERS_EMITTED=0`
- `RAW_EMAIL_MARKERS_EMITTED=0`

## Meaning

This is an **availability boundary**, not a behavioral conclusion.

It says: in the SIFT-visible CYLR and derived VANKO roots scanned here, there was no ActivitiesCache-style SQLite artifact available to use as a foreground-engagement witness for the target window.

So the stronger user-activity layer remains:

- registry/UserAssist/RecentDocs;
- LNK/JumpList shell context;
- EVTX/Security/session timing;
- Prefetch execution-context timing.

ActivitiesCache did **not** add a foreground-engagement witness because no candidate artifact was present in the scanned roots.

## Still not proven

- no user activity generally
- human operator identity
- intent
- file-open/copy/upload from this absence
- completed upload/download
- cloud sync completion
- browser upload
- server-side cloud receipt
- transfer direction

## Artifacts and hashes

- trusted execution output SHA256: `2bb2052a4e7ef3591d1e87e17c6d77c1f861750dd93a8cf8d6951c918dd09435`
- summary file SHA256: `5d6ab4804db9b56ac2059769b232ff5446ee66302e7438908d8d01fce17c5a26`
- finding log SHA256: `2e0cc2f341ada149e06fee6977ac81c8773447279ee94d4b3c148977636172b9`
- trace log SHA256: `781ef9257ffd3d77d2dab62189213d514fe88ec62825841f5c351383ab7fc55e`
- receipt SHA256: `24b2dfeef76370a5aa7100f556b469940dc8eb6fb48f6f722f2b6b0e13f56114`
- regenerated report SHA256: `580ec087c6469fde669553676b267fc03cab77825b7f7f9d9bc3aa6d74413aad`
- regenerated execution markdown SHA256: `f16a0e6f3f1c77e753a6c45f46fc4743323d1539339c28111b317d0286ef0fd6`
- regenerated execution JSONL SHA256: `8bd21ac1bcfb75f68c3b57a0c0c860553b5089ac02de5dcbf57136890defde93`
