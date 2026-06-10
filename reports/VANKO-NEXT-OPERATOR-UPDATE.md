# VANKO / Standard Forensic Case 2 — Next-step Council-SIFT update

Generated: 2026-06-09

## Bottom line

The next-step pass is complete. Council-SIFT now has six additional verified VANKO-NEXT findings and one useful Council bounce/self-correction.

The biggest upgrade is not a guilt claim. It is a sharper evidence map:

1. Targeted CYLR artifacts parsed cleanly.
2. Chrome History gives a bounded browser-history result, not a universal cloud/activity negative.
3. LNK/JumpList/Amcache/AppCompat give concrete follow-up leads, not standalone execution/transfer proof.
4. EVTX gives authentication/process/service-install leads.
5. SRUM network bytes are weak in this export; do not overclaim network transfer from it.
6. EWF corroborates CYLR target paths, but most active log/database bytes do **not** match the CYLR copies, so CYLR and EWF must be treated as separate snapshots.

## Council-verified findings

- `F-analyst-VANKO-NEXT-001` — parser coverage: EVTX, Chrome History, LNK, JumpList, Amcache, AppCompat, SRUM summaries exist and are usable. `COUNCIL_VERIFIED/HIGH`.
- `F-analyst-VANKO-NEXT-002` — Chrome browser-history boundary: 2 DBs, 19 URL rows, 11 visits, 5 downloads, selected Drive/Dropbox/OneDrive-style URL needles at zero rows in those captured DBs. `COUNCIL_VERIFIED/MEDIUM`.
- `F-analyst-VANKO-NEXT-004` — EVTX/SRUM boundary: 60,371 EVTX rows; SRUM network table only 4 zero-byte rows; SRUM id map is app-path context only. `COUNCIL_VERIFIED/MEDIUM`.
- `F-analyst-VANKO-NEXT-005` — corrected shell/app lead inventory: LNK/JumpList/Amcache/AppCompat counts are follow-up leads only. `COUNCIL_VERIFIED/MEDIUM`.
- `F-analyst-VANKO-NEXT-006` — EWF path-level corroboration for targeted CYLR parser surfaces. `COUNCIL_VERIFIED/HIGH`.
- `F-analyst-VANKO-NEXT-007` — EWF-vs-CYLR byte comparison boundary: mixed equality; require per-artifact hash checks. `COUNCIL_VERIFIED/HIGH`.

Council bounce/self-correction:

- `F-analyst-VANKO-NEXT-003` was bounced because the first shell/app wording invited AppCompat/ShimCache overread and attribution overreach. It was replaced by `F-analyst-VANKO-NEXT-005`.

## Key parsed counts

- EVTX rows: `60371`
  - Security: `26052`
  - Application: `20077`
  - System: `14230`
  - OAlerts: `12`
  - Selected event counts: `4624=6564`, `4625=36`, `4648=200`, `4688=150`, `7045=57`, `1102=0`
- Chrome History DBs: `2`
  - total URL rows: `19`
  - visits: `11`
  - download rows: `5`
- LNK rows: `237`
  - local-drive path class: `54`
  - network-path class: `100`
  - cloud-path string class: `2`
  - removable drive-type rows: `32`
- JumpList rows:
  - AutomaticDestinations: `390`
  - CustomDestinations: `50`
- Amcache rows: `3469`
- AppCompat rows: `937`
- SRUM:
  - id map rows: `800`
  - selected network table rows: `4`
  - selected network sent/received bytes: `0/0`

## EWF ↔ CYLR corroboration

Path-level EWF corroboration exists for:

- both Chrome History DB paths
- Amcache.hve
- SRUDB.dat
- Application/Security/System/OAlerts EVTX paths

Byte-level comparison is mixed:

- byte-equal: defaultprinter Chrome History, OAlerts.evtx
- not byte-equal: SRUDB, Amcache, PC User Chrome History, Application.evtx, Security.evtx, System.evtx

Interpretation: the CYLR live-response archive and the EWF image overlap in path surface, but active logs/databases are not interchangeable. Every exact-content claim must name which snapshot/hash it uses.

## Artifacts and hashes

- Generated Council narrative: `reports/VANKO-NEXT.md`
  - SHA256 `64e96f2dfde7d7d056303d4c79e733566400f9d7cd2e69f9d2c0e373f347cc34`
- Structured log: `execution-logs/VANKO-NEXT.md`
  - SHA256 `cdb6a85531c01506b18d7fc5875cba3d0fa8ac4b26cf598386fb638834ca8033`
- Structured JSONL: `execution-logs/VANKO-NEXT.jsonl`
  - SHA256 `9bff6e43f1b3a80f0b83b889aeb387a3ec855c650fb0fdfd306d700bf4a432c8`
- Trace/rerun proof: `/tmp/csift_vanko_next_trace_rerun.log`
  - SHA256 `aaa55b0795d411b01e34079121daeaf575cca6ddffe2e4b53a5af1b971172ea9`
- Safe parsed summary: `/tmp/vanko_next_safe_summary.txt`
  - SHA256 `b4399ef6d13fad1e55c7e9053f235dd331e16087787215c6f676510f3b86193c`
- EWF corroboration summary: `/tmp/vanko_ewf_corroboration_summary.txt`
  - SHA256 `71b0cbadb40dd43e0181a8aa4f823a556baad2477ec1d7b97baba296212b021c`

## Boundaries

Still not proven:

- human operator identity
- intent
- malware conclusion
- file transfer direction
- completed cloud upload/download
- browser-UI upload
- network exfiltration

## Next safest follow-up

Run a focused temporal ladder:

1. EVTX: isolate 4624/4648/4688/7045 windows and service/process names without exposing raw account strings in public summaries.
2. LNK/JumpList: select the cloud/removable/Office rows, hash raw paths, classify path types, and only then decide what to correlate.
3. Chrome/downloads: inspect the five download rows privately; publish only host/file-extension/path-class/hash summaries unless David authorizes raw filenames/URLs.
4. For any target lead, compare CYLR artifact bytes against EWF `icat` bytes before claiming exact-content identity.
