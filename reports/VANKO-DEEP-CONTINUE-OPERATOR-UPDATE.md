# VANKO / Standard Forensic Case 2 — Continue pass: 10:05Z window + Prefetch byte compare

Generated: 2026-06-09

## Bottom line

Continuation complete. This pass added two new Council-verified findings on top of the prior VANKO-DEEP layer:

- `F-analyst-VANKO-DEEP-006` — bounded `2018-05-13T10:05Z..10:15Z` artifact-timing window. `COUNCIL_VERIFIED/HIGH`.
- `F-analyst-VANKO-DEEP-007` — selected allocated EWF Prefetch files byte-compared against same-name CYLR Prefetch files. `COUNCIL_VERIFIED/HIGH`.

Council-SIFT now reports **7 verified VANKO-DEEP findings** and **0 bounces** for this deep pass.

## What we ran

1. Built a safe 10-minute timeline window around:

   `2018-05-13T10:05:00Z..2018-05-13T10:15:59Z`

   Sources included prior parsed EVTX CSV, CYLR Prefetch via `pyscca`, Chrome History DBs, LNK CSV, and JumpList CSVs.

2. Byte-compared selected allocated EWF Prefetch entries against CYLR same-name Prefetch files using EWF `icat` content extraction and SHA256/size comparison.

3. Captured the safe summary through Council-SIFT and promoted only narrow findings.

## What we learned

### 1. The 10:05Z..10:15Z window is real artifact activity, but not a human attribution claim

Window summary:

- EVTX rows in window: `168`
  - `security.evtx=106`
  - `system.evtx=37`
  - `application.evtx=25`
- Selected Security events:
  - `4624@security.evtx=6`
  - `4672@security.evtx=4`
  - `4648@security.evtx=2`
  - `4634@security.evtx=2`
- Security `4624` logon types in this window:
  - `11=2`
  - `7=2`
  - `5=2`
- Security `4688` rows in this window: none in selected summary.
- System `7045` rows in this window: none in selected summary.

Prefetch in the same window:

- Prefetch files with last-run slots in window: `61`
- Prefetch last-run slots in window: `82`
- Selected rows:
  - Chrome: `files=6`, `slots=7`, `run_count_total=98`
  - OneDrive: `files=1`, `slots=1`, `run_count_total=20`
  - Explorer: `files=1`, `slots=1`, `run_count_total=16`
  - Dropbox / PowerShell / CMD / WhatsApp / uTorrent / WinWord / IE / Firefox / 7-Zip / GoogleDriveFS / GoogleDrive: zero selected last-run slots in this exact 10-minute window

Scoped negatives in that same window:

- Chrome History visits: `0`
- Chrome downloads: `0`
- LNK rows: `0`
- JumpList Automatic rows: `0`
- JumpList Custom rows: `0`

Meaning: this window supports a host/account artifact timing cluster — EVTX + Prefetch co-presence — but **not** human identity, intent, transfer direction, upload completion, or sync completion.

### 2. Prefetch EWF/CYLR byte equality is mixed, not global

Selected allocated EWF Prefetch entries compared: `14`

- CYLR same-name file existed: `13`
- Byte-equal EWF/CYLR pairs: `7`
- Byte-different EWF/CYLR pairs: `6`
- CYLR missing same-name file: `1`
- `icat` extraction errors: `0`

Byte-equal pairs:

- `7Z1602-X64.EXE-D5C6A9F5.pf`
- `7ZFM.EXE-44040917.pf`
- `7ZG.EXE-D9AA3A0B.pf`
- `FIREFOX.EXE-D8019162.pf`
- `CMD.EXE-CD245F9E.pf`
- `UTORRENT.EXE-B8C1E45F.pf`
- `WHATSAPP.EXE-7EF6C991.pf`

Byte-different pairs:

- `DROPBOXUPDATE.EXE-E72FEFE1.pf`
- `CHROME.EXE-CCF9F3F5.pf`
- `IEXPLORE.EXE-7A9337F2.pf`
- `IEXPLORE.EXE-F4FB5D2F.pf`
- `WINWORD.EXE-4987BA32.pf`
- `ONEDRIVE.EXE-CA84A5C1.pf`

EWF selected file missing from CYLR same-name set:

- `CMD.EXE-2EB3E6E2.pf`

Meaning: some Prefetch artifacts are identical across EWF and CYLR; some active/application Prefetch files differ by size/hash. Treat equality **per file**, not globally.

## What this does not prove

Still not proven:

- human operator identity
- intent
- malware
- file-transfer direction
- completed upload/download
- browser upload
- cloud-sync completion
- global EWF/CYLR equivalence

## Artifacts and hashes

- Updated Council narrative: `reports/VANKO-DEEP.md`
  - SHA256 `9b1da73f8b2fe8e19e9f12881ace034eb7b611617990fe28b63e4ee2d1e3785e`
- Updated execution markdown: `execution-logs/VANKO-DEEP.md`
  - SHA256 `253421dcdd502748c00f91f6f1bfa8a2a7bf23cc7a49351eb7c83a67a1ba087c`
- Updated execution JSONL: `execution-logs/VANKO-DEEP.jsonl`
  - SHA256 `42b1d8831c41703fa2513d87b03f40742b7dd1722d96c93b64cb2b65a6368562`
- Continue safe summary, SIFT-visible: `/tmp/vanko_continue_out/window_prefetch_compare_summary.txt`
  - SHA256 `54d985ab6bbde4e26dce64eeb96822a0211e8aa372d151b06741b8ec467aa066`
- Continue capture/findings log: `/tmp/csift_vanko_continue_findings.log`
  - SHA256 `204957f4a1d9aca0c42dd890115a365aa0f07bccd3873f01dffad7dade84bf38`
- Continue trace rerun log: `/tmp/csift_vanko_continue_trace_rerun.log`
  - SHA256 `78a48bd2bb9aed9e5f9c130caa53223ee816c0ec6f9c4b61765b982ca9781b60`
- Raw continue summary-generation log: `/tmp/vanko_continue_window_compare_run.log`
  - SHA256 `9a9e0d1086552928b5f93f492368cc33df854f8427c720f7b835402b2f003b00`

## Next safest follow-up

1. Parse the **EWF-side differing Prefetch files** after `icat` extraction with `pyscca` and compare run counts / last-run slots against the CYLR versions. This tells us whether the byte differences matter semantically.
2. Expand the timeline outward from `10:05Z..10:15Z` to determine whether this cluster is acquisition/collection/tooling context or ordinary user/application context.
3. Use `$UsnJrnl:$J` / `$LogFile` or MFT sequence witnesses for the files touched around this window; do not use Prefetch/LNK/JumpList alone for directionality.
4. If cloud activity remains a theory, prioritize OneDrive/Dropbox local DB/log artifacts or external provider logs. Prefetch can say a program ran; it cannot say what it uploaded or synced.
