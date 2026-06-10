# VANKO-DEEP Synthesis Packet

## Control

CASE=VANKO-DEEP
SYNTHESIS_PACKET_VERSION=1
MANIFEST_PATH=reports/VANKO-DEEP-SYNTHESIS-MANIFEST.json
MANIFEST_SHA256=881056b3e090aa2d720ebbe6c7b460ca9273a30652821fb8a304a788dc5ddafc
MANIFEST_FILE_COUNT=47
CURRENT_REPORT_PATH=reports/VANKO-DEEP.md
CURRENT_REPORT_SHA256=0ccdcf61f57ffd60c282d2f3aa6057b0a2d63fb85537bd761ca86180b3d3abd2
REPORT_VERIFIED_FINDING_LINES=22
REPORT_DRAFTED_FINDING_LINES=24
REPORT_DISPUTED_FINDING_LINES=2

## Included file classes

This packet's manifest includes:

- `reports/VANKO-DEEP*.md`
- `execution-logs/VANKO-DEEP*`
- `council/receipts/F-analyst-VANKO-DEEP-*.json`
- `council/executions/TE-VANKO-DEEP-*.json`

It excludes raw evidence content and secret-bearing files. SIFT `/tmp` parser summaries remain cited through their trusted-execution captures/receipts, not embedded here.

## Supported posture, as a synthesis guide only

Do not treat this section as a new disk-image finding; it is a roadmap to the Council-verified finding set.

- `ACCOUNT_PROFILE_TIMING_CLUSTER_SUPPORTED=1`
- `PREFETCH_EVTX_REGISTRY_RECENTDOCS_USERASSIST_TIMELINE_SUPPORTED=1`
- `LOCAL_CLOUD_BROWSER_RESIDUE_SUPPORTED=1`
- `LOCAL_COMPLETED_UPLOAD_RECEIPT_FOUND=0`
- `LOCAL_SRUM_CLOUD_BROWSER_WINDOW_CORROBORATION_FOUND=0`
- `HUMAN_OPERATOR_PROVEN=0`
- `TRANSFER_DIRECTION_PROVEN=0`
- `SERVER_SIDE_AUDIT_ACCESS_LOCAL=0`

## How to read the packet

1. Use `reports/VANKO-DEEP.md` as the current Council-generated narrative.
2. Treat `DISPUTED` findings as correction history only; cite corrected `COUNCIL_VERIFIED` findings.
3. For operator language, say: PC User account/profile activity cluster is strong; local receipt hunt did not find completed upload/download evidence; server-side audit/export would be needed for a cloud completion receipt.
4. Do not convert timing co-presence, filename inventory, cache marker strings, or SRUM aggregate rows into transfer proof.

## Manifest hash

MANIFEST_SHA256=881056b3e090aa2d720ebbe6c7b460ca9273a30652821fb8a304a788dc5ddafc
