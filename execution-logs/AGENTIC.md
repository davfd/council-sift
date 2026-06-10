# Autonomous agent execution logs (live Claude Code — nothing scripted)

These are **genuine autonomous Claude Code investigations**, driven by [`analyst/autorun.sh`](../analyst/autorun.sh).
The agent reads its operating contract ([`analyst/CLAUDE.md`](../analyst/CLAUDE.md)), runs **real** SIFT tools
via `sift`, drafts its **own** four-part findings, submits each to the **Council** (`csift record-finding` +
`council review`), and **self-corrects on every bounce — with no human and no hardcoded findings.**

Each `AGENTIC-<CASE>.jsonl` is the real Claude Code stream-json transcript (tool calls + timestamps + token
usage), **redacted** for public release (bulk official-evidence tool output excerpted to a sha256 + a
`[N rows redacted]` marker; full raw kept locally, git-ignored, via [`eval/redact_agentic.mjs`](../eval/redact_agentic.mjs)).
The structured execution log (`execution-logs/<CASE>.{jsonl,md}`) and the investigative narrative
(`reports/<CASE>.md`) are generated from the verification graph — they cannot contain a claim that is not a
verified node.

> The deterministic `analyst/*_demo.sh` scripts are a separate, no-API-key **reproducibility harness**
> (findings hardcoded so a judge can re-run the loop without credentials). **The runs below are the real
> agent** — this is the primary execution engine.

## Breadth — genuine agent runs across evidence types and cases

| Case | Evidence type | Tools the agent chose | Findings | Verified | Self-corrected | Headline artifact (agent-found) |
|---|---|---|---:|---:|---:|---|
| **SRL18-DC-DISK** | disk / MFT (E01) | `fls` `icat` `mmls` `fsstat` + EVTX | 8 | 4 | **4** | `ntds.dit` + SYSTEM/SECURITY staged in `C:\temp` — `ntdsutil ifm` domain credential dump |
| **SRL18-FILE-DISK** | disk / MFT (E01) | `fls` `icat` `istat` | 6 | 5 | 1 | `StarFury.zip` archive/staging artifact (live + **deleted**) + deleted RAR subtree (MFT carving) |
| **ROCBA-DISK** | disk (E01) | `fls` `fsstat` `icat` | 5 | 5 | 0 | Stark Research Labs IP-theft files in `fredr`'s profile (`Maria Hill - WorkingFiles`) |
| **SRL18-WKSTN-MEM** | memory | vol3 ×8 (`netscan` `psscan` `malfind` `svcscan` `dlllist` `pstree` `cmdline` `info`) | 4 | 4 | 0 | LISTENING backdoor socket + `subject_srv.ex` Wow64 process |
| **SRL18-RD-NET** | memory / network | vol3 `netscan` `psscan` | 8 | 5 | **3** | `subject_srv.ex` LISTENING on `0.0.0.0:3262`; suspicious `powershell.exe` |
| **ROCBA-MEM** | memory | vol3 `info` `netscan` `psscan` `cmdline` `registry` | 3 | 3 | 0 | `svchost.exe` socket ownership; 118 inbound TCPv4 records |
| **SRL2015-NFURY** | memory **+** disk (E01) | vol3 ×6 + `fls` `icat` `istat` `mmls` | 9 | 8 | 1 | PyInstaller malware (`Temp/_MEI`), recycled `svchost.exe` masquerade + `winclient.reg` persistence (Recycle-Bin carving) |
| **SRL-LIVE** (file-srv) | memory | vol3 `psscan` | 1 | 1 | 0 | disciplined first pass — picked `subject_srv.ex` over the obvious `Rar.exe` |
| **SRL-LIVE2** (file-srv) | memory / network | vol3 `netscan` (agent re-ran the tool itself) | 2 | 1 | **1** | corrected "internal IP = external C2" over-read after Council bounce |

**Totals (9 genuine runs): 46 drafted findings · 36 Council-verified · 10 live self-corrections · disk,
memory, and network telemetry · 3 cases (SRL-2018, ROCBA, SRL-2015).** The SRL-2015
run analyzed **memory and disk together** in a single investigation (PyInstaller malware, a recycled-binary
masquerade, registry persistence, Recycle-Bin anti-forensics). The added [`analyst/srl_timeline_demo.sh`](../analyst/srl_timeline_demo.sh)
Plaso/psort harness is a bounded reproducibility add-on, not a new autonomous run count.

Every finding traces to its tool execution (`csift trace <id>`). Concrete recorded commands can be
independently re-run (`csift trace --rerun <id>`) when the evidence path is present; receipt/hash checks
remain valid for placeholder or non-rerunnable commands. The verdicts are hash-chained Council Receipts.

---

## Marquee — repeated autonomous self-correction on the domain controller (SRL18-DC-DISK)

Real `fls`/`icat`/EVTX forensics on the DC C-drive E01. The agent drafted 8 findings and the Council
**bounced 4 of them**; the agent read each objection and re-filed only what the evidence supported — **four
self-corrections, no human** — converging on a hash-chained receipt chain (GENESIS → 55953c3e → … → db7e7ba3).
The verified picture: a full **domain credential dump** (`ntds.dit` + registry hives) was staged in `C:\temp`
on 2018-09-05, the signature of an `ntdsutil … ifm create full` operation. See
[`reports/SRL18-DC-DISK.md`](../reports/SRL18-DC-DISK.md).

## Marquee — cross-evidence corroboration (SRL18-FILE-DISK)

Memory analysis on the file server flagged `Rar.exe` staging. Pointed at the **disk**, the agent
independently found `StarFury.zip` (an allocated copy under `Shares/shield…` **and** a deleted copy) plus a
deleted RAR directory subtree via `istat`/MFT analysis. The bounded Plaso/psort add-on now puts the live
`StarFury.zip` and rare-earth documents into a timeline as well — correcting the right way: psscan is not
exfil proof; disk + timeline correlation is the next evidentiary rung. See
[`reports/SRL18-FILE-DISK.md`](../reports/SRL18-FILE-DISK.md) and
[`reports/SRL18-TIMELINE.md`](../reports/SRL18-TIMELINE.md).

## Marquee — live self-correction with independent tool re-execution (SRL-LIVE2)

The agent's cached file was missing; rather than fabricate, it **re-ran the real tool itself**
(`vol windows.netscan`) and verified the md5. It initially named an **internal** `10.10.4.5 → 10.10.254.1`
session as attacker **C2**; the Council bounced it (Tool-semantics: a socket existing ≠ exfiltration; an
internal/loopback peer can't be external C2 — Inference: attribution from one artifact). The agent
self-corrected to the supported claim and re-verified provenance. Full stream:
[`AGENTIC-SELFCORRECT.jsonl`](AGENTIC-SELFCORRECT.jsonl).

**This is the bloodstream, autonomous and at breadth:** real evidence → the agent's own tool choices and
findings → Council refutation → the agent's self-correction (no human) → verified + provenance-checked,
repeated across disk, memory, network telemetry, and multiple hosts. Reproduce any of the autonomous runs with
`analyst/autorun.sh <CASE> "<lead>"`.
