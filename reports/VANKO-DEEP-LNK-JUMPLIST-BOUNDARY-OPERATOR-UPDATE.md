# VANKO-DEEP — LNK / JumpList Boundary Operator Update

## Status

Continued with another Council-SIFT loop against the `2018-05-13T10:05:00Z..10:15:59Z` target window.

Current case state after regeneration:

- `30` Council-verified findings
- `5` self-corrected disputed drafts
- latest verified finding: `F-analyst-VANKO-DEEP-035`

## Council-SIFT loop used

This round used:

- SIFT-wrapped read-only execution through `./bin/sift`
- trusted capture through `./bin/csift capture`
- Council review through `node council/council.mjs review F-analyst-VANKO-DEEP-035`
- independent rerun through `./bin/csift trace --rerun F-analyst-VANKO-DEEP-035`
- report regeneration through `bash analyst/process_run.sh VANKO-DEEP`

Council result:

- `F-analyst-VANKO-DEEP-035` — `COUNCIL_VERIFIED/MEDIUM`
- Council seats supported citation, tool semantics, contradiction, inference, and scope
- independent rerun exact-matched the captured output hash

## What was scanned

The scan parsed the derived LNK and JumpList CSVs:

- `LNK`
- `JUMPLIST_AUTOMATIC`
- `JUMPLIST_CUSTOM`

The output emitted path classes, extension classes, application classes, selected needle counts, timestamp-field hit counts, row hashes, and leak counters. No raw paths, user values, or emails were emitted.

## Key counts

CSV coverage:

- `CSV_FILE_EXISTS=LNK:1,JUMPLIST_AUTOMATIC:1,JUMPLIST_CUSTOM:1`
- `CSV_ROW_COUNTS=JUMPLIST_AUTOMATIC:390,LNK:237,JUMPLIST_CUSTOM:50`

Target-window timing:

- `TARGET_WINDOW_FIRST_TIMESTAMP=2018-05-13T10:12:22Z`
- `TARGET_WINDOW_LAST_TIMESTAMP=2018-05-13T10:12:46Z`
- `TARGET_WINDOW_DISTINCT_ROW_COUNTS=JUMPLIST_AUTOMATIC:144,LNK:1,JUMPLIST_CUSTOM:1`
- `TARGET_WINDOW_DISTINCT_ROW_TOTAL=146`
- `TARGET_WINDOW_TIMESTAMP_FIELD_HIT_COUNTS=JUMPLIST_AUTOMATIC:289,LNK:2,JUMPLIST_CUSTOM:2`
- `TARGET_WINDOW_TIMESTAMP_FIELD_HIT_TOTAL=293`
- `TIMESTAMP_PARSE_ERROR_COUNT=0`

Target-window profile/source class:

- `TARGET_WINDOW_SOURCE_PROFILE_CLASS_COUNTS=JUMPLIST_AUTOMATIC:USER_PROFILE_SOURCE:144,LNK:USER_PROFILE_SOURCE:1,JUMPLIST_CUSTOM:USER_PROFILE_SOURCE:1`

Target-window path classes:

- `JUMPLIST_AUTOMATIC:LOCAL_USER_PROFILE:96`
- `JUMPLIST_AUTOMATIC:LOCAL_DRIVE_PATH:43`
- `JUMPLIST_AUTOMATIC:CLOUD_ONEDRIVE:2`
- `LNK:LOCAL_DRIVE_PATH:1`
- `JUMPLIST_AUTOMATIC:NETWORK_OR_UNC:1`
- `JUMPLIST_AUTOMATIC:LOCAL_SYSTEM:1`
- `JUMPLIST_AUTOMATIC:URL_OR_WEB:1`
- `JUMPLIST_CUSTOM:LOCAL_DRIVE_PATH:1`

Target-window extension/needle context:

- `TARGET_WINDOW_EXTENSION_CLASS_COUNTS=JUMPLIST_AUTOMATIC:IMAGE_MEDIA:107,JUMPLIST_AUTOMATIC:OTHER_OR_NONE:15,JUMPLIST_AUTOMATIC:ARCHIVE:9,JUMPLIST_AUTOMATIC:OFFICE_DOC:9,JUMPLIST_AUTOMATIC:CSV_TEXT:4,LNK:ARCHIVE:1,JUMPLIST_CUSTOM:OTHER_OR_NONE:1`
- `TARGET_WINDOW_SELECTED_NEEDLE_COUNTS=JUMPLIST_AUTOMATIC:IMAGE_MEDIA:107,JUMPLIST_AUTOMATIC:ARCHIVE:9,JUMPLIST_AUTOMATIC:OFFICE_DOC:9,JUMPLIST_AUTOMATIC:FORENSIC_TOOL:4,JUMPLIST_AUTOMATIC:ONEDRIVE:2,LNK:ARCHIVE:1,LNK:FORENSIC_TOOL:1,JUMPLIST_AUTOMATIC:CLOUD_WORD:1,JUMPLIST_AUTOMATIC:URL_WEB:1`

Leak guard:

- `RAW_PATH_MARKERS_EMITTED=0`
- `RAW_USER_MARKERS_EMITTED=0`
- `RAW_EMAIL_MARKERS_EMITTED=0`

## Meaning

This adds a stronger shell-activity boundary around the dense target window:

- LNK/JumpList timestamps cluster tightly inside `10:12:22Z..10:12:46Z`.
- The cluster is overwhelmingly JumpList-heavy: `144` AutomaticDestinations rows, plus `1` LNK row and `1` CustomDestinations row.
- The rows are all in the user-profile source class.
- Path-class context is mostly local-user/local-drive, with a small OneDrive-class co-presence signal.

This supports account/profile shell-context co-presence in the target window.

It does **not** establish file open, copy, upload, completed transfer, or human identity.

## Still not proven

- human operator identity
- intent
- file-open or copy action from LNK/JumpList alone
- completed upload/download
- browser upload
- cloud sync completion
- server-side cloud receipt
- transfer direction

## Artifacts and hashes

- trusted execution output SHA256: `7cd0544a50acd58e0283dfdca0b8775d65169818459a86c6f507d926953ab8c3`
- summary file SHA256: `faf7aaacf1327cd3ddd59672196b67183950d9a17c15501d48bab312e11ffa78`
- finding log SHA256: `0b8eb0fa19f67e7dbcbbffce2fb7ae3e8427f6935b9a70985cda786b6326ad35`
- trace log SHA256: `fe9eb9a6ba62e019b30021b181321d09bc00d02d5e32d2615c650ec6edea9eb4`
- receipt SHA256: `21ed1f2c86b4a17cd5238c258cae73cb2ba96f1b3de5bc43d58c7311c311f3a7`
- regenerated report SHA256: `4dd38d31c44adaee06258873229d0cf2d8fcd1bd7cfae8e9a4b0c1ac9093cfaa`
- regenerated execution markdown SHA256: `f02ea81878348039b1cb9722905dae625ca3f7b0e1ea8f695e7664d43fcdc38b`
- regenerated execution JSONL SHA256: `79411685a8f3d786db3fcc8135a8c3b0f56886199eecbf2cd452a4250d4a1983`
