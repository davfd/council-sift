# VANKO-DEEP — Synthesis Packet Operator Update

## Bottom line

Continued into synthesis. Built a hash-manifested packet tying the current VANKO-DEEP report, receipts, executions, and logs together.

Current `VANKO-DEEP`: **23 Council-verified findings**, **3 self-corrected disputed drafts**.

New synthesis control finding:

- `F-analyst-VANKO-DEEP-026` — corrected synthesis packet/manifest pointer. `COUNCIL_VERIFIED/HIGH`.

Correction note:

- `F-analyst-VANKO-DEEP-025` bounced because its first capture pointed at a repo-relative path that the SIFT rerun environment could not see.
- I corrected it by copying the synthesis summary into SIFT-visible `/tmp/vanko_synthesis_out/synthesis_summary.txt`, recapturing, resubmitting, and rerunning the trace.
- Corrected finding: `F-analyst-VANKO-DEEP-026`.

## What the synthesis packet contains

Packet:

- `reports/VANKO-DEEP-SYNTHESIS-PACKET.md`
- SHA256 `0cd6ecbabb6fb1f6a19557ccc615f9790cf70af703c9e43f62db626c383b8bf5`

Manifest:

- `reports/VANKO-DEEP-SYNTHESIS-MANIFEST.json`
- SHA256 `881056b3e090aa2d720ebbe6c7b460ca9273a30652821fb8a304a788dc5ddafc`
- file count: `47`

Synthesis summary:

- `reports/VANKO-DEEP-SYNTHESIS-SUMMARY.txt`
- SHA256 `6481d5640467fb5daa2981175c56d1653477d371af46629b6e71d5fd604eeb659b9e4377`

Current generated Council report:

- `reports/VANKO-DEEP.md`
- SHA256 `21ffa6f00369f4950709240dac1e30b3d981439e2898dc9571d07e983c8ad09a`

## Current posture

Supported:

- PC User account/profile activity timing cluster.
- EVTX + Prefetch + registry + RecentDocs/UserAssist minute timeline.
- Local cloud/browser residue exists.
- Local receipt hunt did not find completed upload/download evidence in named scanned artifacts.
- SRUM export did not show target-window cloud/browser process network rows.

Not proven:

- completed upload/download;
- transfer direction;
- exact movement mechanism;
- human operator identity;
- intent;
- malware.

## Artifacts and hashes

Updated Council report/logs:

- `reports/VANKO-DEEP.md`  
  SHA256 `21ffa6f00369f4950709240dac1e30b3d981439e2898dc9571d07e983c8ad09a`
- `execution-logs/VANKO-DEEP.md`  
  SHA256 `69cd6d1e39f79d4f5991fc483d18f1d5805d67423c417210ecc25503667497d1`
- `execution-logs/VANKO-DEEP.jsonl`  
  SHA256 `af3f56f2732606b60b6057254c1ad601bc662266fdfbe8427bdbf07e59504039`

Synthesis files:

- `reports/VANKO-DEEP-SYNTHESIS-PACKET.md`  
  SHA256 `0cd6ecbabb6fb1f6a19557ccc615f9790cf70af703c9e43f62db626c383b8bf5`
- `reports/VANKO-DEEP-SYNTHESIS-MANIFEST.json`  
  SHA256 `881056b3e090aa2d720ebbe6c7b460ca9273a30652821fb8a304a788dc5ddafc`
- `reports/VANKO-DEEP-SYNTHESIS-SUMMARY.txt`  
  SHA256 `6481d5640467fb5daa298c36323f6dc6a14974a2ef27956242fb4a0674ff1aa1`

Corrected synthesis Council logs:

- `/tmp/csift_vanko_synthesis_corrected_finding.log`  
  SHA256 `b8da4a5ec901d3c060ac58ac2b6ce0594969ef07c276122fe509bbd6b09006a2`
- `/tmp/csift_vanko_synthesis_corrected_trace.log`  
  SHA256 `bec3cbe13b682607cb78c1ad16b4b07f59a0d3da2309932cf606e0cf14e4d2df`
- `council/receipts/F-analyst-VANKO-DEEP-026-5fdfe5e1ac5e.json`  
  SHA256 `a27c0d02102ea24d1e6eb044b2ced28abc3ae4263cdd8c7ae96ede95b1c6455a`

Process run:

- `/tmp/csift_vanko_deep_process_run_v12.log`  
  SHA256 `4729c2bb5ae435e90bed7210cb5109d94437866ebe30a117a9e4055cffa273ac`

## Next best external ask

For a completed cloud movement claim, local artifacts have hit their limit. The needed artifact is a server-side audit/export with:

- actor;
- event time;
- event type: create/upload/edit/move/download/view;
- file id/name/hash if available;
- source IP/client/user-agent;
- window around `2018-05-13T10:05Z..10:15Z`.
