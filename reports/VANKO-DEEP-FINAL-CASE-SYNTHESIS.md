# VANKO-DEEP — Final Case Synthesis / Submission Packet

Generated UTC: `2026-06-09T23:29:13Z`

## Decision posture

- **Goal now:** ship a defensible, Council-audited case package and hackathon-tool proof.
- **Not the goal now:** another loop of bounded local-absence scans that does not change the case posture.
- **Evidence state captured in this packet, before the final packaging-control audit:** `31` Council-verified findings out of `36` drafted; `5` disputed drafts were self-corrected before reaching the main report.
- **Latest verified evidence finding at packet generation:** `F-analyst-VANKO-DEEP-036`.
- **Note:** later packaging-control findings may add audit receipts without changing the underlying disk-image evidence posture.

## Supported case theory

The supported theory is narrow: the captured workstation shows a strong **account/profile/session activity cluster** in the `2018-05-13T10:05Z..10:15Z` target window, with the densest registry/shell-account activity around `10:12Z..10:14Z`, supported by EVTX, Prefetch, registry UserActivity, LNK/JumpList, Security logon/session, and local browser/cloud residue surfaces.

The evidence supports **local machine/profile timing and context**. It does not, on the present local artifacts alone, settle the external/cloud questions that require an explicit transfer receipt or server-side audit source.

## What the evidence says, without the fog

| Layer | Supported by Council-verified findings | Plain meaning |
|---|---:|---|
| EVTX / Prefetch baseline | 001, 002, 004, 005, 006, 007, 008, 011, 012 | The host has real target-window program/session timing witnesses; EWF/CYLR snapshot differences were measured instead of assumed. |
| Registry UserActivity | 015, 016, 017, 018 | `PROFILE_PC_USER` / `NtUser` has 480 target-window rows: RecentDocs and UserAssist are the strongest local account/profile witnesses. |
| Cross-surface timeline | 019, 020, 029, 035 | The event cluster is temporally coherent across registry, EVTX, Prefetch, Security, and LNK/JumpList timestamp surfaces. |
| Browser/cloud/network context | 003, 021, 022, 023, 024, 028, 034, 036 | Local cloud/browser residue exists, but scanned local artifacts did not yield a target-window completed transfer receipt or local admin audit export. |
| Remote/access/persistence/automation triage | 030, 032, 033 | The bounded scans did not promote a target-window RDP/persistence/malware execution theory; these are scoped triage boundaries, not a clean-host proof. |
| Control/synthesis | 026 | The prior synthesis packet was verified as a control/manifest pointer only. |

## Verified finding map

### Baseline evidence and parser discipline

- **001/004** — EVTX selected counts and time-window lead map; Application.evtx 4625 rows are not Security failed-logon proof.
- **002** — CYLR Prefetch parse: 238 parsed files; selected execution witnesses include Chrome and OneDrive.
- **005** — EWF namespace corroborates selected Prefetch path presence.
- **007/008/011/012** — EWF-vs-CYLR Prefetch equality/drift map; snapshot discipline, not human/action proof.
- **013/014** — MFT/USN extraction and retention boundary; retained USN range does not overlap target window.

### Target-window account/profile activity cluster

- **006** — 10:05Z..10:15Z window: 168 EVTX rows, 61 Prefetch file hits/82 slots, selected Chrome/OneDrive/Explorer witnesses.
- **015/016** — RECmd UserActivity surface and 480 target-window registry rows under PROFILE_PC_USER/NtUser.
- **017/018** — Redacted registry ledger: RecentDocs=295, UserAssist=185; cloud/browser/tool string counts without raw paths.
- **019/020** — Cross-surface and minute timeline packet: strongest registry cluster at 10:12Z/10:14Z, EVTX/Prefetch peak at 10:05Z.
- **029** — Security logon/session target-window timing layer; account/session evidence only.

### Shell/browser/cloud/network context and receipt boundary

- **003** — Browser/shell lead map: Chrome downloads, LNK, JumpList counts as triage surfaces.
- **021/022/023** — Local cloud/browser artifact inventory and receipt-marker scan; local cache residue exists, no target-window browser/provider receipt promoted.
- **024** — SRUM aggregate network/connectivity boundary; process/network telemetry is not file-specific transfer proof.
- **028** — Local admin/audit availability boundary; no local Google Workspace/Admin/GAM/GWS-style audit export found in scanned local evidence.
- **034** — Deeper cloud-client/browser scan across 905 files / 198,448,633 bytes; marker/residue counts but zero target-window transfer receipt rows.
- **035** — LNK/JumpList boundary: 146 target-window rows across LNK/Automatic/Custom surfaces, path-class/timestamp context only.
- **036** — ActivitiesCache-style artifact availability boundary: no readable ActivitiesCache witness in cited SIFT-visible roots.

### Remote-access, automation, and persistence boundaries

- **030** — TerminalServices/RDP parsed-EVTX availability/timing boundary; no remote-access conclusion beyond cited rows.
- **032** — Malware/automation triage over EVTX and filenames; no selected Defender/PowerShell/offensive-term rows in the bounded scan.
- **033** — Persistence/autostart triage: zero target-window service-install/task/WMI/autostart EVTX rows in the bounded scan.

### Synthesis/control

- **026** — Prior synthesis/control packet pointer and manifest only; no new disk-image forensic claim.

## Corrected-bounce ledger

| Bounced draft | What Council caught | Corrected support |
|---|---|---|
| `F-analyst-VANKO-DEEP-009` | Council rejected certainty overreach around one Prefetch semantic-diff artifact. | `F-analyst-VANKO-DEEP-011` |
| `F-analyst-VANKO-DEEP-010` | Council rejected attribution/scope overreach around Prefetch artifact wording. | `F-analyst-VANKO-DEEP-012` / related corrected MFT-USN findings |
| `F-analyst-VANKO-DEEP-025` | Council rejected synthesis tokens not present in the captured output. | `F-analyst-VANKO-DEEP-026` |
| `F-analyst-VANKO-DEEP-027` | Council rejected audit-availability hash/line-count tokens outside the captured output. | `F-analyst-VANKO-DEEP-028` |
| `F-analyst-VANKO-DEEP-031` | Council rejected broad no-malware/no-human-attribution caveat in a single-artifact finding. | `F-analyst-VANKO-DEEP-032` |

This is a feature of the tool, not an embarrassment: the Council rejected over-certainty, citation drift, and attribution overreach, then preserved the narrower claims that survived exact-token review and rerun/rehash.

## What would settle the remaining external question

- A provider/server-side audit export tied to the relevant account and target object.
- A cloud-client log record with exact target object identifier/title plus upload/download/sync commit success markers in the target window.
- A browser/network artifact that ties the exact target object to a completed upload/download transaction, not merely provider residue or cached strings.
- A corroborated operator identity source outside the single local artifact chain: authenticated session source, camera/badge/EDR/IdP/admin logs, or equivalent.

## Stop condition

Do **not** continue random local negative-boundary scans. Continue only if one of these appears:

1. a new positive artifact lead;
2. a specific theory test that can falsify or strengthen the case;
3. a settling receipt source;
4. provider/server-side audit logs or credentials/exports supplied by the operator;
5. a bounded step needed for the hackathon demo narrative.

## Hackathon / Council-SIFT proof

This case demonstrates the project, not merely a hand-written DFIR report:

- `./bin/sift` constrained the forensic command surface.
- `./bin/csift capture` preserved exact tool executions and output hashes.
- `./bin/csift record-finding` forced observation/interpretation separation and exact cited tokens.
- `node council/council.mjs review <finding>` rejected unsupported claims.
- `./bin/csift trace --rerun <finding>` checked rerunability / output integrity where possible.
- `bash analyst/process_run.sh VANKO-DEEP` rebuilt the narrative from the verification substrate.

## Artifact hashes

- Main report: `reports/VANKO-DEEP.md` — SHA256 `580ec087c6469fde669553676b267fc03cab77825b7f7f9d9bc3aa6d74413aad`
- Execution log markdown: `execution-logs/VANKO-DEEP.md` — SHA256 `f16a0e6f3f1c77e753a6c45f46fc4743323d1539339c28111b317d0286ef0fd6`
- Execution log JSONL: `execution-logs/VANKO-DEEP.jsonl` — SHA256 `8bd21ac1bcfb75f68c3b57a0c0c860553b5089ac02de5dcbf57136890defde93`
- Receipt files counted: `31`

## Redaction posture

This packet uses counts, hashes, finding IDs, and class labels. It does not publish raw user paths, credential material, cookies, tokens, passwords, or connection strings.
