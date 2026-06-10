# Agent Execution Log — case SRL18-RD-NET

Ordered, timestamped event stream from the Council-SIFT audit substrate. Every finding traces to the
tool execution (with output hash), the Council verdict, and (if verified) the Council Receipt.

| ts | event | actor | finding | detail |
|---|---|---|---|---|
| 2026-06-04T03:26:31.775Z | finding_deposited | agent:analyst | F-analyst-SRL18-RD-NET-001 | MEDIUM — windows.netscan shows local sockets on this host bound to tw |
| 2026-06-04T03:26:32.051Z | tool_executed | agent:analyst | F-analyst-SRL18-RD-NET-001 | `vol -f /tmp/rd05/base-rd-05-memory.img windows.netscan` → output_sha256 974fc6d7847b… |
| 2026-06-04T03:26:32.051Z | tool_executed | agent:analyst | F-analyst-SRL18-RD-NET-002 | `vol -f /tmp/rd05/base-rd-05-memory.img windows.netscan` → output_sha256 974fc6d7847b… |
| 2026-06-04T03:26:32.051Z | tool_executed | agent:analyst | F-analyst-SRL18-RD-NET-003 | `vol -f /tmp/rd05/base-rd-05-memory.img windows.netscan` → output_sha256 974fc6d7847b… |
| 2026-06-04T03:26:32.051Z | tool_executed | agent:analyst | F-analyst-SRL18-RD-NET-004 | `vol -f /tmp/rd05/base-rd-05-memory.img windows.netscan` → output_sha256 974fc6d7847b… |
| 2026-06-04T03:26:32.051Z | tool_executed | agent:analyst | F-analyst-SRL18-RD-NET-008 | `vol -f /tmp/rd05/base-rd-05-memory.img windows.netscan` → output_sha256 974fc6d7847b… |
| 2026-06-04T03:26:40.701Z | council_verified | seat:synthesis | F-analyst-SRL18-RD-NET-001 | receipt 920601971fc7… |
| 2026-06-04T03:26:45.293Z | finding_deposited | agent:analyst | F-analyst-SRL18-RD-NET-002 | MEDIUM — windows.netscan shows PID 22456 'subject_srv.ex' LISTENING o |
| 2026-06-04T03:26:49.415Z | council_refuted | seat:citation→seat:synthesis | F-analyst-SRL18-RD-NET-002 | [seat:inference] Inference overreach (CERTAINTY): unjustified certainty — a single artifact rarely proves a conclusion outright. Offending clause: "CAVEAT: netscan proves only the live socket and its single internal peer". |
| 2026-06-04T03:27:09.805Z | finding_deposited | agent:analyst | F-analyst-SRL18-RD-NET-003 | MEDIUM — windows.netscan shows PID 22456 'subject_srv.ex' LISTENING o |
| 2026-06-04T03:27:13.409Z | council_verified | seat:synthesis | F-analyst-SRL18-RD-NET-003 | receipt 6bce5dd2eb5b… |
| 2026-06-04T03:27:31.489Z | finding_deposited | agent:analyst | F-analyst-SRL18-RD-NET-004 | MEDIUM — windows.netscan lists a TCPv4 endpoint (offset 0xbda06cf0) w |
| 2026-06-04T03:27:37.113Z | council_verified | seat:synthesis | F-analyst-SRL18-RD-NET-004 | receipt 99991e753d49… |
| 2026-06-04T03:27:42.974Z | finding_deposited | agent:analyst | F-analyst-SRL18-RD-NET-005 | MEDIUM — windows.psscan lists PID 17612 powershell.exe with parent PI |
| 2026-06-04T03:27:43.142Z | tool_executed | agent:analyst | F-analyst-SRL18-RD-NET-005 | `vol -f /tmp/rd05/base-rd-05-memory.img windows.psscan` → output_sha256 6b8dac2f0149… |
| 2026-06-04T03:27:43.142Z | tool_executed | agent:analyst | F-analyst-SRL18-RD-NET-007 | `vol -f /tmp/rd05/base-rd-05-memory.img windows.psscan` → output_sha256 6b8dac2f0149… |
| 2026-06-04T03:27:46.882Z | council_refuted | seat:citation→seat:synthesis | F-analyst-SRL18-RD-NET-005 | [seat:inference] Inference overreach (ATTRIBUTION): attribution to a specific actor cannot be established from one artifact — corroborate with intel + multiple artifacts. Offending clause: "PowerShell launched under WmiPrvSE is the classic process-lineage signature of remote command execution via WMI (e". |
| 2026-06-04T03:28:06.339Z | finding_deposited | agent:analyst | F-analyst-SRL18-RD-NET-006 | MEDIUM — windows.psscan lists PID 17612 powershell.exe with parent PI |
| 2026-06-04T03:28:06.490Z | tool_executed | agent:analyst | F-analyst-SRL18-RD-NET-006 | `vol -f /tmp/rd05/base-rd-05-memory.img windows.psscan` → output_sha256 e3b0c44298fc… |
| 2026-06-04T03:28:10.198Z | council_refuted | seat:citation→seat:synthesis | F-analyst-SRL18-RD-NET-006 | [seat:citation] Cited token(s) NOT present in the tool output as a standalone token (hallucinated/unsupported): powershell.exe, 17612, 3416, WmiPrvSE.exe, 796, 17144. [seat:inference] Inference overreach (CAUSATION): causation asserted from correlation — the artifact shows state, not cause. Offending clause: "Such WMI-driven execution can be triggered either locally or remotely". |
| 2026-06-04T03:31:12.964Z | finding_deposited | agent:analyst | F-analyst-SRL18-RD-NET-007 | MEDIUM — windows.psscan lists PID 17612 powershell.exe with parent PI |
| 2026-06-04T03:31:27.919Z | council_verified | seat:synthesis | F-analyst-SRL18-RD-NET-007 | receipt caf4428ba9f4… |
| 2026-06-04T03:32:41.778Z | finding_deposited | agent:analyst | F-analyst-SRL18-RD-NET-008 | LOW — windows.netscan records an ESTABLISHED TCPv4 session (offset |
| 2026-06-04T03:32:45.978Z | council_verified | seat:synthesis | F-analyst-SRL18-RD-NET-008 | receipt 9f0570de4239… |
