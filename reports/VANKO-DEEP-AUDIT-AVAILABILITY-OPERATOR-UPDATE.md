# VANKO-DEEP — Server-Side Audit Availability Boundary Update

## Bottom line

Continued with a fresh source-read + Council-SIFT round focused on the remaining cloud question: do the local artifacts expose a server-side/cloud-admin audit export or admin CLI surface that can settle upload/download completion?

Current `VANKO-DEEP`: **24 Council-verified findings**, **4 self-corrected disputed drafts**.

New verified finding:

- `F-analyst-VANKO-DEEP-028` — local audit-availability boundary. `COUNCIL_VERIFIED/MEDIUM`.

Correction this round:

- `F-analyst-VANKO-DEEP-027` bounced because two cited summary-hash/line-count tokens were printed by the run wrapper, not by the captured `cat` output. I preserved it as a self-correction and resubmitted only tokens present in the SIFT-visible summary.
- Corrected `F-analyst-VANKO-DEEP-028` verified, with independent rerun hash match.

## What the fresh dig checked

The SIFT-visible scan covered these local roots:

- case evidence root for Standard Forensic Case 2;
- CYLR extract root;
- derived VANKO output roots for prior local parses.

It emitted only counts, hashes, root labels, and path/name hashes — no raw paths, emails, cookies, or credential values.

Key tokens from the verified summary:

- `FILES_VISITED=6644`
- `DIRS_VISITED=1751`
- `CONTENT_SCANNED_FILES=1808`
- `CONTENT_SCANNED_BYTES=38021939`
- `CONTENT_SCAN_ERRORS=0`
- `ADMIN_CLI_CONFIG_NAME_CANDIDATE_FILES=0`
- `SERVER_AUDIT_CONTENT_MARKER_FILE_TOTAL=0`
- `SERVER_AUDIT_CONTENT_MARKER_COUNTS=NONE`
- `CLIENT_CLOUD_CONTENT_MARKER_FILE_TOTAL=34`

Meaning: the local image/extract/derived outputs still have cloud-client/browser residue, but this scan did **not** expose a Google Workspace/Admin/GAM/GWS-style server audit export or admin CLI config surface.

Host-side tool/config availability check also found no local `gws`/`gam` CLI or obvious GAM/GWS config directory under `/home/exor`; this is host-context only, not a Council-promoted disk-image finding.

## What this changes

The cloud question is now sharper:

- Supported: local account/profile activity cluster.
- Supported: local cloud/browser/client residue exists.
- Supported: the scanned local evidence does not expose a server-side audit export/admin CLI surface.
- Still not supported: completed upload/download, cloud sync completion, or transfer direction.

The right next evidence, if available, is external/server-side audit material: actor, event type, file id/name, timestamp, source IP/client/user-agent around `2018-05-13T10:05Z..10:15Z`.

## Still not proven

Still not proven:

- human operator identity;
- intent;
- malware;
- transfer direction;
- completed upload/download;
- browser upload;
- cloud sync completion;
- provider-side event absence.

## Artifacts and hashes

Updated Council report:

- `reports/VANKO-DEEP.md`  
  SHA256 `f785d2df4e68ef73073174627b94d42b9236d08e9715b0955397822637f1bed0`

Execution logs:

- `execution-logs/VANKO-DEEP.md`  
  SHA256 `4d0ba245aab7ac9d6df4592a0c3453e0e57e37b62e1eaaf3f4223512defa1090`
- `execution-logs/VANKO-DEEP.jsonl`  
  SHA256 `52cbfc1dc6460ca53cce544121898c0118bd723c927960a71b10194fe8c0702a`

Audit-availability SIFT outputs:

- SIFT `/tmp/vanko_audit_boundary_out/audit_boundary_summary.txt`  
  SHA256 `59eff1b6e7461d89ce31f0bcd106e4299fa5170709d2ca637fe57e025d340c06`
- SIFT `/tmp/vanko_audit_boundary_out/audit_boundary_candidates.csv`  
  SHA256 `15e4430bae18cbecf237a8c75f007079d2ff783450d015ee12eeb6def0c57856`

Host tool availability summary:

- `/tmp/vanko_host_audit_tool_availability_summary.txt`  
  SHA256 `12ffd1e71ce20cab74d33841a469f060b7b5f6f3caafa7e67d6a4c059c1cb1ba`

Run/Council logs:

- `/tmp/vanko_audit_boundary_v3_run.log`  
  SHA256 `cfefdccc4a0ad9be4172173f2e19159db7389e81358ab334ddb0969f1d74ad53`
- `/tmp/vanko_audit_boundary_v3_sift_hashes.log`  
  SHA256 `4140dea8b512e967a8e3a8724a7e78bd6c718b8f5696e419acd75b12cda43842`
- `/tmp/csift_vanko_audit_boundary_finding.log`  
  SHA256 `245a2012ee087aa2ef2086b98595f1d36808e0eb29d9facacbe7cc805b201380`
- `/tmp/csift_vanko_audit_boundary_trace.log`  
  SHA256 `6309f131b7ed2ed5fae8db4225ecc0bb28479d277aa04717f20b635a861329b3`
- `/tmp/csift_vanko_audit_boundary_corrected_finding.log`  
  SHA256 `df1fa6e226b8d4426e1e9a0ec54c4a0b198397246a25bb8e37ac26e34784840e`
- `/tmp/csift_vanko_audit_boundary_corrected_trace.log`  
  SHA256 `22a8a2b6c97592d14f92fd79dbb942d8c3cbe79e0b1097f541e7c50c59a07d00`
- `/tmp/csift_vanko_deep_process_run_v13.log`  
  SHA256 `93370f824436a3e0421d66031d8e986972bca95d94156c19916e12db7ac12e3c`

Receipt:

- `council/receipts/F-analyst-VANKO-DEEP-028-819721632471.json`  
  SHA256 `7d4b1264b40a65d73d27b9fbd386d2a265fefab86beb51ba794c98da501d4828`
