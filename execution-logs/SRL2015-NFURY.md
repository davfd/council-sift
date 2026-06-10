# Agent Execution Log — case SRL2015-NFURY

Ordered, timestamped event stream from the Council-SIFT audit substrate. Every finding traces to the
tool execution (with output hash), the Council verdict, and (if verified) the Council Receipt.

| ts | event | actor | finding | detail |
|---|---|---|---|---|
| 2026-06-04T03:41:15.627Z | finding_deposited | agent:analyst | F-analyst-SRL2015-NFURY-001 | HIGH — Volatility3 windows.info on the nfury memory image reports N |
| 2026-06-04T03:41:15.808Z | tool_executed | agent:analyst | F-analyst-SRL2015-NFURY-001 | `vol -f /tmp/nfury/win7-64-nfury-memory/win7-64-nfury-memory-raw.001 windows.info` → output_sha256 f3d3de818556… |
| 2026-06-04T03:41:20.027Z | council_verified | seat:synthesis | F-analyst-SRL2015-NFURY-001 | receipt 748a3efd9c81… |
| 2026-06-04T03:41:24.303Z | finding_deposited | agent:analyst | F-analyst-SRL2015-NFURY-002 | MEDIUM — Volatility3 windows.netscan on the nfury memory image report |
| 2026-06-04T03:41:24.449Z | tool_executed | agent:analyst | F-analyst-SRL2015-NFURY-002 | `vol -f /tmp/nfury/win7-64-nfury-memory/win7-64-nfury-memory-raw.001 windows.netscan` → output_sha256 01e869325f86… |
| 2026-06-04T03:41:24.449Z | tool_executed | agent:analyst | F-analyst-SRL2015-NFURY-003 | `vol -f /tmp/nfury/win7-64-nfury-memory/win7-64-nfury-memory-raw.001 windows.netscan` → output_sha256 01e869325f86… |
| 2026-06-04T03:41:28.423Z | council_verified | seat:synthesis | F-analyst-SRL2015-NFURY-002 | receipt b99bc0e6863c… |
| 2026-06-04T03:41:32.923Z | finding_deposited | agent:analyst | F-analyst-SRL2015-NFURY-003 | HIGH — Volatility3 windows.netscan reports svchost.exe (PID 408) LI |
| 2026-06-04T03:41:33.427Z | council_verified | seat:synthesis | F-analyst-SRL2015-NFURY-003 | receipt aa84d7016102… |
| 2026-06-04T03:49:51.447Z | finding_deposited | agent:analyst | F-analyst-SRL2015-NFURY-004 | MEDIUM — ASCII strings extracted from the $DATA of NTFS inode 80517 ( |
| 2026-06-04T03:49:51.630Z | tool_executed | agent:analyst | F-analyst-SRL2015-NFURY-004 | `icat /tmp/nfury/win7-64-nfury-c-drive/win7-64-nfury-c-drive.E01 80517 | strings` → output_sha256 1c622d69294c… |
| 2026-06-04T03:49:51.955Z | finding_deposited | agent:analyst | F-analyst-SRL2015-NFURY-005 | MEDIUM — fls of NTFS inode 92258 (Users/vibranium/AppData/Local/Temp/ |
| 2026-06-04T03:49:52.101Z | tool_executed | agent:analyst | F-analyst-SRL2015-NFURY-005 | `fls -p /tmp/nfury/win7-64-nfury-c-drive/win7-64-nfury-c-drive.E01 92258` → output_sha256 07663299fd86… |
| 2026-06-04T03:49:57.274Z | council_verified | seat:synthesis | F-analyst-SRL2015-NFURY-004 | receipt cd7e5b603506… |
| 2026-06-04T03:49:57.608Z | council_verified | seat:synthesis | F-analyst-SRL2015-NFURY-005 | receipt 48493870fb82… |
| 2026-06-04T03:53:10.823Z | finding_deposited | agent:analyst | F-analyst-SRL2015-NFURY-006 | HIGH — A recovered registry-import file (winclient.reg, NTFS inode  |
| 2026-06-04T03:53:11.014Z | tool_executed | agent:analyst | F-analyst-SRL2015-NFURY-006 | `icat /tmp/nfury/win7-64-nfury-c-drive/win7-64-nfury-c-drive.E01 92256 | strings -el` → output_sha256 d90cf223c758… |
| 2026-06-04T03:53:11.014Z | tool_executed | agent:analyst | F-analyst-SRL2015-NFURY-009 | `icat /tmp/nfury/win7-64-nfury-c-drive/win7-64-nfury-c-drive.E01 92256 | strings -el` → output_sha256 d90cf223c758… |
| 2026-06-04T03:53:11.355Z | finding_deposited | agent:analyst | F-analyst-SRL2015-NFURY-007 | HIGH — ASCII strings from the recycled binary svchost.exe (NTFS ino |
| 2026-06-04T03:53:11.542Z | tool_executed | agent:analyst | F-analyst-SRL2015-NFURY-007 | `icat /tmp/nfury/win7-64-nfury-c-drive/win7-64-nfury-c-drive.E01 92255 | strings` → output_sha256 2a59a2143a42… |
| 2026-06-04T03:53:11.895Z | finding_deposited | agent:analyst | F-analyst-SRL2015-NFURY-008 | HIGH — The Windows Recycle Bin $I metadata file $I6SODDB (NTFS inod |
| 2026-06-04T03:53:12.062Z | tool_executed | agent:analyst | F-analyst-SRL2015-NFURY-008 | `icat /tmp/nfury/win7-64-nfury-c-drive/win7-64-nfury-c-drive.E01 91913 | strings -el` → output_sha256 a074a85b3b63… |
| 2026-06-04T03:53:16.601Z | council_refuted | seat:citation→seat:synthesis | F-analyst-SRL2015-NFURY-006 | [seat:inference] Inference overreach (CERTAINTY): unjustified certainty — a single artifact rarely proves a conclusion outright. Offending clause: "reg file proves the intended configuration". |
| 2026-06-04T03:53:16.896Z | council_verified | seat:synthesis | F-analyst-SRL2015-NFURY-007 | receipt 1763f46c1298… |
| 2026-06-04T03:53:17.249Z | council_verified | seat:synthesis | F-analyst-SRL2015-NFURY-008 | receipt 66866b32a586… |
| 2026-06-04T03:53:39.205Z | finding_deposited | agent:analyst | F-analyst-SRL2015-NFURY-009 | HIGH — A recovered registry-import file (winclient.reg, NTFS inode  |
| 2026-06-04T03:53:45.890Z | council_verified | seat:synthesis | F-analyst-SRL2015-NFURY-009 | receipt e5ae96abc830… |
