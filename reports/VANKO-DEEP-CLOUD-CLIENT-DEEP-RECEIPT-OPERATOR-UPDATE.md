# VANKO-DEEP — Cloud Client Deep Receipt Boundary Operator Update

## Status

Continued with another Council-SIFT loop against the `2018-05-13T10:05:00Z..10:15:59Z` target window.

Current case state after regeneration:

- `29` Council-verified findings
- `5` self-corrected disputed drafts
- latest verified finding: `F-analyst-VANKO-DEEP-034`

## Council-SIFT loop used

This round used:

- SIFT-wrapped read-only execution through `./bin/sift`
- trusted capture through `./bin/csift capture`
- Council review through `node council/council.mjs review F-analyst-VANKO-DEEP-034`
- independent rerun through `./bin/csift trace --rerun F-analyst-VANKO-DEEP-034`
- report regeneration through `bash analyst/process_run.sh VANKO-DEEP`

Council result:

- `F-analyst-VANKO-DEEP-034` — `COUNCIL_VERIFIED/MEDIUM`
- Council seats supported citation, tool semantics, contradiction, inference, and scope
- independent rerun exact-matched the captured output hash

## What was scanned

The deep cloud-client/browser scan inventoried SIFT-visible local artifacts only:

- Chrome History DBs
- Chrome cache files
- Chrome local/session/IndexedDB-style storage files
- Dropbox/OneDrive/iCloud-named local surfaces
- bounded local content for receipt-marker groups
- Chrome History SQLite timing rows

Leak guard:

- `RAW_PATH_MARKERS_EMITTED=0`
- `RAW_USER_MARKERS_EMITTED=0`
- `RAW_EMAIL_MARKERS_EMITTED=0`

## Key counts

Source coverage:

- `ROOT_FILE_COUNTS=CYLR_EXTRACT:6574,DERIVED_VANKO_NEXT:41`
- `CONTENT_SCANNED_FILES=905`
- `CONTENT_BYTES_SCANNED=198448633`
- `SQLITE_SURFACE_CANDIDATE_FILES=2`
- `SQLITE_READABLE_FILES=2`

Surface inventory:

- `CHROME_CACHE_FILE_COUNT=694`
- `CHROME_STORAGE_FILE_COUNT=190`
- `CHROME_HISTORY_DB_COUNT=2`
- `DROPBOX_FILE_COUNT=9`
- `ONEDRIVE_FILE_COUNT=4`
- `ICLOUD_FILE_COUNT=4`
- `GOOGLE_DRIVE_DB_COUNT=0`
- `GOOGLE_DRIVE_LOG_COUNT=0`

Target-window local surface mtimes:

- `CHROME_STORAGE_FILE_TARGET_MTIME_COUNT=2`
- `DROPBOX_FILE_TARGET_MTIME_COUNT=2`
- `ONEDRIVE_FILE_TARGET_MTIME_COUNT=1`
- `ICLOUD_FILE_TARGET_MTIME_COUNT=2`
- `CHROME_CACHE_FILE_TARGET_MTIME_COUNT=0`
- `CHROME_HISTORY_DB_TARGET_MTIME_COUNT=0`

Receipt-marker context:

- `CONTENT_RECEIPT_MARKER_FILE_COUNTS=CHROME_CACHE_FILE:265,CHROME_PROFILE_CONFIG:4,CHROME_STORAGE_FILE:3,CHROME_HISTORY_DB:2,ONEDRIVE_FILE:1`
- `CONTENT_RECEIPT_MARKER_TARGET_MTIME_FILE_COUNTS=CHROME_PROFILE_CONFIG:2`
- `CONTENT_RECEIPT_MARKER_AND_TARGET_WINDOW_TEXT_FILES=0`
- `CONTENT_RECEIPT_MARKER_AND_TARGET_WINDOW_TEXT_CLASS_COUNTS=NONE`

Chrome History timing:

- `CHROME_URLS_GLOBAL_ROWS=19`
- `CHROME_VISITS_GLOBAL_ROWS=11`
- `CHROME_DOWNLOADS_GLOBAL_ROWS=5`
- `CHROME_URLS_TARGET_LAST_VISIT_ROWS=0`
- `CHROME_VISITS_TARGET_ROWS=0`
- `CHROME_DOWNLOADS_TARGET_START_ROWS=0`
- `CHROME_DOWNLOADS_TARGET_END_ROWS=0`

## Meaning

This is stronger than the earlier cloud inventory because it separates:

- local cloud/browser surface presence;
- marker-rich local cache/profile/history context;
- target-window text/timing linkage.

Result:

- local Chrome/cloud cache and profile artifacts contain many generic receipt-like marker strings;
- selected cloud/browser surfaces have target-window mtimes;
- but this scan found **zero** local files containing both receipt-marker groups and target-window text;
- Chrome History still shows **zero** target-window visit/download rows.

So: local cloud/browser residue is real, but this round still does **not** establish a completed upload, download, browser transfer, or server-side receipt.

## Still not proven

- completed upload/download
- browser upload
- cloud sync completion
- server-side cloud audit receipt
- transfer direction
- human operator identity or intent
- provider-side absence

## Artifacts and hashes

- trusted execution output SHA256: `ecdcd0e6691de161abd53be0069584cab069969031ebcba8c20843aef9654085`
- SIFT summary file SHA256: `a16d61777db6f652cd268e342f81301763880bcc730db51c5a694a61b76084f1`
- finding log SHA256: `a384c0e9be68b73adb0e0298b8cca65e52b6196b9f990a8fd7dabb60ecb2b964`
- trace log SHA256: `b5aecd18a3b67662683ac5855222bb459b257fc9a7656a1cc282a9218edaa499`
- receipt SHA256: `d65d751defb218cd27bd006a8fa13b962f75d43b3a7cb979b712e18e99b59bda`
- regenerated report SHA256: `e62bab75b606d7574cd5b9b64d8d4e0cef7b8c472903837c3b5e85406a34ef3c`
- regenerated execution markdown SHA256: `1644712d4bb63838ed14ce0f3403dc7a71d8a933a270ff0be11a5df0071b5487`
- regenerated execution JSONL SHA256: `24b33fd8565b9ab685b25105820bdd3c9f4e2c4339922cfc5922eaca0b3c9773`
