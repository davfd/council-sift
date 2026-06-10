# VANKO / Standard Forensic Case 2 — Deep follow-up Council-SIFT update

Generated: 2026-06-09

## Bottom line

The continuation pass is complete. It deepened the previous VANKO-NEXT layer in three useful ways:

1. Corrected the EVTX lead map so `4625` is not misread as Security failed-logon evidence in this capture.
2. Parsed Windows 10 Prefetch with `pyscca`, turning several AppCompat-style leads into stronger program-execution witnesses in the CYLR snapshot.
3. Corroborated selected Prefetch paths against the EWF filesystem namespace with `fls` at NTFS offset `1411072`.

Council-SIFT now has **5 verified VANKO-DEEP receipts**. Substantively, there are **4 new evidence layers** because `F-analyst-VANKO-DEEP-004` is the short, independently rerunnable EVTX equivalent of `F-analyst-VANKO-DEEP-001`.

## Council-verified findings

- `F-analyst-VANKO-DEEP-001` — initial deep EVTX summary capture. `COUNCIL_VERIFIED/HIGH`.
- `F-analyst-VANKO-DEEP-004` — same EVTX finding, but via the short rerunnable `cat /tmp/vanko_deep_out/safe_summary.txt` capture. **Use this one as the clean EVTX receipt.** `COUNCIL_VERIFIED/HIGH`.
- `F-analyst-VANKO-DEEP-002` — CYLR Prefetch parse: 238 parsed Windows 10/v30 Prefetch files, zero parse errors, total run-count sum 3212. `COUNCIL_VERIFIED/HIGH`.
- `F-analyst-VANKO-DEEP-003` — browser/shell lead-prioritization summary: Chrome downloads, LNK classes, JumpList classes. `COUNCIL_VERIFIED/MEDIUM`.
- `F-analyst-VANKO-DEEP-005` — EWF `fls` path-level corroboration for selected Prefetch paths. `COUNCIL_VERIFIED/HIGH`.

No new Council bounces in this pass.

## What changed materially

### 1. EVTX: better event semantics

The earlier selected-event inventory is now sharpened:

- Security-selected counts:
  - `4624=6564`
  - `4672=6415`
  - `4648=200`
  - `4634=177`
  - `4688=150`
  - `4647=14`
- Non-Security selected counts:
  - `7045=57` from `System.evtx`
  - `4625=36` from `Application.evtx`

Important correction: the `4625=36` count here is **not** a Security failed-logon finding. It is an Application.evtx/EventSystem-style count in this selected summary. Good catch by the next pass — it prevents a false failed-logon inference.

Other EVTX leads:

- Security `4624` logon types: `5=6254`, `7=104`, `11=102`, `2=58`, `3=31`, `0=15`
- Security `4688` process creation rows: `150`
- Security `4688` command-line-present count: `0`
- System `7045` service path classes:
  - Windows/system path: `32`
  - Program Files path: `15`
  - local-drive path: `3`
  - user-profile path: `3`
  - cloud-token path: `2`
  - other: `2`

Meaning: EVTX gives a useful time ladder, but not a full solve by itself.

### 2. Prefetch: stronger execution witnesses

`pyscca` parsed the CYLR Prefetch set successfully:

- Prefetch files: `238`
- Parsed: `238`
- Parse errors: `0`
- Version: `30:238`
- Total run-count sum: `3212`
- Last-run range: `2016-04-08T23:53:48Z..2018-05-13T10:15:32Z`

Selected Prefetch witnesses:

- Chrome: `files=6`, `run_count_total=98`, last max `2018-05-13T10:12:07Z`
- OneDrive: `files=1`, `run_count_total=20`, last max `2018-05-13T10:05:52Z`
- Dropbox: `files=2`, `run_count_total=3`, last max `2017-07-01T20:42:33Z`
- PowerShell: `files=1`, `run_count_total=2`, last max `2017-07-01T20:42:23Z`
- CMD: `files=1`, `run_count_total=17`, last max `2016-10-30T23:07:30Z`
- WhatsApp: `files=1`, `run_count_total=16`, last max `2016-07-01T22:05:33Z`
- uTorrent: `files=1`, `run_count_total=12`, last max `2016-07-07T01:33:42Z`
- GoogleDriveFS / GoogleDrive: `files=0` in this captured Prefetch set

Meaning: Prefetch is stronger than AppCompat/ShimCache for program execution, but still does **not** prove human operator, intent, upload, sync completion, or transfer direction.

### 3. Chrome/LNK/JumpList: lead inventory only

Chrome downloads:

- total rows: `5`
- extensions: `jpg=3`, `exe=1`, `zip=1`
- download URL host class: `OTHER_HOST=6`

LNK:

- rows: `237`
- network path class: `100`
- document/media/archive extension class: `95`
- removable drive type: `32`
- cloud-token path class: `4`

JumpLists:

- AutomaticDestinations rows: `390`
- AutomaticDestinations doc/media/archive extension rows: `204`
- CustomDestinations includes app classes for Chrome, PowerShell, Tor Browser, Outlook, and Dropbox App.

Meaning: good triage leads; not copy/upload proof.

### 4. EWF Prefetch path corroboration

Targeted EWF `fls` at offset `1411072` found selected Prefetch paths for:

- Chrome
- OneDrive / OneDriveSetup
- Dropbox / DropboxUpdate
- CMD
- Firefox
- Internet Explorer
- WinWord
- WhatsApp / WhatsAppSetup
- uTorrent
- 7-Zip family

The listing includes both allocated and deleted-marked entries.

Meaning: EWF corroborates selected Prefetch path presence, separate from the CYLR Prefetch parse. This is **path-level** corroboration only; it is not byte equality or EWF-side last-run parsing.

## Still not proven

- human operator identity
- intent
- malware conclusion
- file-transfer direction
- completed cloud upload/download
- browser-UI upload
- cloud-sync completion
- network exfiltration
- exact EWF/CYLR byte equality for the Prefetch files

## Artifacts and hashes

- Council narrative: `reports/VANKO-DEEP.md`
  - SHA256 `63ec91128e73ef0cd08f7a70baf2808f83b417f17ff62514dfbb3761ce12843a`
- Execution markdown: `execution-logs/VANKO-DEEP.md`
  - SHA256 `1530aa16c59d275ca8812bcf2d48e2f580c7b0e2d7c2a7b034d37939b571747e`
- Execution JSONL: `execution-logs/VANKO-DEEP.jsonl`
  - SHA256 `18c20424ca3245310d7db7067b32b2262f0f19fbe23abbee8a7b05e0df998f33`
- Safe deep summary captured output:
  - SHA256 `cdf056257199874e9483d6f6593ae3916175b07a89e2c5ff689cb721c44ac298`
- Clean trace rerun log for `F-002/F-003/F-004`: `/tmp/csift_vanko_deep_clean_trace_rerun.log`
  - SHA256 `93359c395056fb903e1f7e31d43c51e99bef6a7d3dacc8f48057604923da5e09`
- EWF Prefetch trace: `/tmp/csift_vanko_deep_ewf_prefetch_trace.log`
  - SHA256 `6c4d11460dce58373a2c80b61a76059bda48417e68c840672faeb1e17d079e3a`
- EWF Prefetch `fls` output: `/tmp/vanko_deep_ewf_prefetch_fls.txt`
  - SHA256 `064718c5e2b2e2498b47c2aa1f4d55484bc2fb74f6ecb4712b938d8bcf235e14`

## Next safest follow-up

1. Build a timeline around `2018-05-13T10:05Z..10:15Z`: Chrome, OneDrive, Explorer, EVTX, Prefetch, and EWF path state.
2. Inspect the `7045` service-install rows privately and group by benign updater vs unusual user-profile/cloud-token path class.
3. Byte-compare selected Prefetch files between EWF `icat` and CYLR where both allocated in EWF.
4. Privately inspect Chrome’s 5 download rows; publish only host class, extension, byte counts, and path hashes unless raw filenames/URLs are authorized.
5. If transfer direction matters, add NTFS `$UsnJrnl:$J` / `$LogFile` witnesses or external cloud/provider logs. Local Prefetch/LNK/JumpList alone cannot carry directionality.
