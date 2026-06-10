# VANKO-DEEP — Prefetch Drift Operator Update

## Bottom line

Continued beyond the selected byte-compare. The new pass shows the EWF and CYLR Prefetch surfaces are **not one interchangeable snapshot**.

New Council-SIFT verified findings:

- `F-analyst-VANKO-DEEP-008` — six previously byte-different selected EWF/CYLR Prefetch pairs also differ in parsed Prefetch semantics. `COUNCIL_VERIFIED/HIGH`.
- `F-analyst-VANKO-DEEP-011` — one selected allocated EWF CMD Prefetch item parsed successfully and has no same-name CYLR pair in the selected comparison set. `COUNCIL_VERIFIED/HIGH`.
- `F-analyst-VANKO-DEEP-012` — full allocated EWF Prefetch drift map against CYLR same-name files. `COUNCIL_VERIFIED/HIGH`.

Two over-broad drafts (`F-009`, `F-010`) were bounced and corrected into `F-011`; do not cite the bounced drafts as supported findings.

Current `VANKO-DEEP`: **10 Council-verified findings**, **2 self-corrected disputed drafts**.

## What we ran

1. Extracted selected EWF Prefetch files via `icat` at NTFS offset `1411072`.
2. Parsed EWF-extracted and CYLR same-name Prefetch files with `pyscca`.
3. Compared:
   - byte equality,
   - executable name,
   - Prefetch format version,
   - run count,
   - latest run timestamp,
   - last-run timestamp list.
4. Expanded from the six selected byte-different pairs to the full allocated EWF Prefetch set.
5. Captured safe summaries and promoted narrow Council-SIFT findings with trace reruns.

## What we learned

### Selected differing pairs

For the six selected allocated EWF Prefetch files that were byte-different from CYLR same-name files:

- `icat` succeeded.
- EWF and CYLR both parsed with `pyscca`.
- executable name matched for all six.
- Prefetch format version matched for all six (`v30`).
- run count differed for all six.
- latest run differed for all six.
- last-run list differed for all six.

So these are not only opaque SHA/size mismatches. The parsed Prefetch semantics differ too.

Selected examples:

| Prefetch | EWF run count / latest | CYLR run count / latest | Relation |
|---|---:|---:|---|
| `DROPBOXUPDATE.EXE-E72FEFE1.pf` | `8` / `2016-11-04T17:41:13Z` | `62` / `2018-05-13T10:15:19Z` | CYLR newer |
| `CHROME.EXE-CCF9F3F5.pf` | `2` / `2016-11-04T14:45:55Z` | `69` / `2018-05-13T10:12:07Z` | CYLR newer |
| `ONEDRIVE.EXE-CA84A5C1.pf` | `14` / `2016-11-04T13:24:58Z` | `20` / `2018-05-13T10:05:52Z` | CYLR newer |
| `IEXPLORE.EXE-7A9337F2.pf` | `43` / `2016-08-08T17:56:59Z` | `44` / `2017-03-20T21:38:08Z` | CYLR newer |
| `IEXPLORE.EXE-F4FB5D2F.pf` | `67` / `2016-08-08T17:56:59Z` | `68` / `2017-03-20T21:38:09Z` | CYLR newer |
| `WINWORD.EXE-4987BA32.pf` | `8` / `2016-06-29T16:20:43Z` | `9` / `2017-03-20T21:08:16Z` | CYLR newer |

One selected allocated EWF-only item:

- `CMD.EXE-2EB3E6E2.pf`
  - EWF inode: `9711-128-4`
  - CYLR same-name exists: `0`
  - EWF parse: `CMD.EXE`, Prefetch `v30`, run count `1`, latest `2016-10-30T23:07:30Z`

### Full allocated EWF Prefetch drift map

EWF `fls` Prefetch inventory:

- total EWF Prefetch entries: `280`
- allocated EWF Prefetch entries: `153`
- deleted-marked EWF Prefetch entries: `127`
- CYLR Prefetch files: `238`

Allocated EWF Prefetch parse/compare:

- `icat` OK: `153`
- `icat` errors: `0`
- EWF parse OK: `153`
- EWF parse errors: `0`
- Prefetch version counts: `30:153`
- same-name CYLR file exists: `144`
- same-name CYLR missing: `9`
- paired parse OK: `144`
- byte equal: `100`
- byte different: `44`
- semantic equal: `100`
- semantic different: `44`
- latest-run relation: `latest_equal:100`, `cylr_latest_newer:44`

Selected executable rollup:

| Executable | EWF allocated items | Same-name CYLR pairs | Byte/semantic equal | Byte/semantic different | CYLR latest newer |
|---|---:|---:|---:|---:|---:|
| `CHROME.EXE` | `1` | `1` | `0` | `1` | `1` |
| `ONEDRIVE.EXE` | `1` | `1` | `0` | `1` | `1` |
| `DROPBOXUPDATE.EXE` | `1` | `1` | `0` | `1` | `1` |
| `IEXPLORE.EXE` | `2` | `2` | `0` | `2` | `2` |
| `WINWORD.EXE` | `1` | `1` | `0` | `1` | `1` |
| `CMD.EXE` | `2` | `1` | `1` | `0` | `0` |
| `UTORRENT.EXE` | `1` | `1` | `1` | `0` | `0` |
| `WHATSAPP.EXE` | `1` | `1` | `1` | `0` | `0` |
| `FIREFOX.EXE` | `1` | `1` | `1` | `0` | `0` |
| `7ZFM.EXE` | `1` | `1` | `1` | `0` | `0` |
| `7ZG.EXE` | `1` | `1` | `1` | `0` | `0` |
| `7Z1602-X64.EXE` | `1` | `1` | `1` | `0` | `0` |

## What it means

- The `2018-05-13T10:05Z..10:15Z` Chrome / OneDrive / DropboxUpdate Prefetch timing lives in the CYLR Prefetch surface, not in the allocated EWF same-name Prefetch bytes parsed in this pass.
- For 100 allocated EWF/CYLR same-name Prefetch pairs, EWF and CYLR align exactly by bytes and parsed semantics.
- For 44 allocated EWF/CYLR same-name Prefetch pairs, CYLR is newer in parsed latest-run semantics.
- Treat EWF and CYLR as overlapping but distinct snapshots. Use per-file equality/semantic comparison before claiming a Prefetch fact belongs to both.

## What remains unproven

This still does not prove:

- human operator identity;
- intent;
- malware;
- transfer direction;
- completed upload/download;
- browser upload;
- cloud sync completion.

Prefetch remains a program-execution artifact witness, not a human-attribution or transfer-completion witness.

## Artifacts and hashes

Current generated report:

- `reports/VANKO-DEEP.md`  
  SHA256 `b534de60fb3355de6fc36d764d9b588567719bb6b4043bc803186e70e3000299`

Execution logs:

- `execution-logs/VANKO-DEEP.md`  
  SHA256 `fc53e93e4fce001a93cb699997201e61c50972616f817c3c045a861197cc5ce1`
- `execution-logs/VANKO-DEEP.jsonl`  
  SHA256 `c8b75efc6aa46f22498557518409d3aef403d7094be22da99c994e208ca4826b`

Safe summaries:

- SIFT `/tmp/vanko_prefetch_semantic_out/prefetch_semantic_diff_summary.txt`  
  SHA256 `9fa03aec41a3e3bcaa268bf3d020a4fb44d7e598aa177cbe838eae853e10fc15`, `34` lines
- SIFT `/tmp/vanko_prefetch_full_out/prefetch_full_drift_summary.txt`  
  SHA256 `5039158e0504c4870fd80ab82977af5057928dc82701200480fe1ca598a2494a`, `51` lines

Run/capture logs:

- `/tmp/vanko_prefetch_semantic_diff_run_v2.log`  
  SHA256 `4ece9124eb5985a181518b6bcb24a755d6bd9570e0445acf721c94457e8dba81`
- `/tmp/csift_vanko_prefetch_semantic_findings.log`  
  SHA256 `901293be8f239cafd91c918ad17b7f52c35ecddd5596c163ad43ba9b4e859855`
- `/tmp/csift_vanko_prefetch_semantic_corrected2.log`  
  SHA256 `692bbde9b8b7747ca36dbe405523ab54ca993c6fc0b5eef37bcc4b4572aeed44`
- `/tmp/csift_vanko_prefetch_semantic_corrected2_trace.log`  
  SHA256 `61c33c9030a0e02b52c36657b8ef58ed3b8a18a4671354f88c1d24dd309e9c6a`
- `/tmp/vanko_prefetch_full_drift_run.log`  
  SHA256 `7707d467d8d38549eabd74112fca9a844513decb981274be976ab09a6d46b90f`
- `/tmp/csift_vanko_prefetch_full_drift_findings.log`  
  SHA256 `80554d1de09254c5b981acb9c2bdf6200edbf75ef3510caa17765542138abeac`
- `/tmp/csift_vanko_prefetch_full_drift_trace.log`  
  SHA256 `06fc512b56b9b13fdbeaa1d621c333bcff81ac858dff63d7042b5f8db7bd1bc9`

Verified receipts:

- `council/receipts/F-analyst-VANKO-DEEP-008-ea937ca376f5.json`  
  SHA256 `882a97addb2fb6d00ccbfc4052f15bda51c83d7c4b99205f8313a42ae9962fd8`
- `council/receipts/F-analyst-VANKO-DEEP-011-b58c10b86921.json`  
  SHA256 `6ea91c46cc5c430d653e1bfd3799a07c87cd1aeedc55e368894ae2aa03c6c92b`
- `council/receipts/F-analyst-VANKO-DEEP-012-0dd25af1b6e6.json`  
  SHA256 `c069d3d60a225dc5bc0d27d73f6b75f55ccb5a5f83f309b3ca0eddfe44d001c8`

## Next best digs

1. Parse `$MFT` and, if present, `$UsnJrnl:$J` around `2018-05-13T10:05Z..10:15Z` for independent filesystem timing on Prefetch writes and candidate user/document/cloud paths.
2. Build an EWF/CYLR split ledger: which facts are EWF-backed, which are CYLR-backed, which are exact byte-equal in both, and which are snapshot-specific.
3. Registry/user-activity pass: UserAssist, RecentDocs, Shellbags, MountedDevices, Run keys, and typed paths, with the same artifact-fact vs human-attribution boundary.
