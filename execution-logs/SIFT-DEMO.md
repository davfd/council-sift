# Agent Execution Log — case SIFT-DEMO

Ordered, timestamped event stream from the Council-SIFT audit substrate. Every finding traces to the
tool execution (with output hash), the Council verdict, and (if verified) the Council Receipt.

| ts | event | actor | finding | detail |
|---|---|---|---|---|
| 2026-06-02T20:24:36.318Z | finding_deposited | agent:analyst | F-analyst-SIFT-DEMO-001 | HIGH — fls -r -p shows p.exe at inode 12; a hidden rootkit driver i |
| 2026-06-02T20:24:38.290Z | tool_executed | agent:analyst | F-analyst-SIFT-DEMO-001 | `fls -r -p /tmp/case.img` → output_sha256 fdf3d227c7fb… |
| 2026-06-02T20:24:38.290Z | tool_executed | agent:analyst | F-analyst-SIFT-DEMO-002 | `fls -r -p /tmp/case.img` → output_sha256 fdf3d227c7fb… |
| 2026-06-02T20:24:38.575Z | council_refuted | seat:citation→seat:synthesis | F-analyst-SIFT-DEMO-001 | [seat:citation] Cited token(s) NOT present in the tool output (hallucinated/unsupported): 99. |
| 2026-06-02T20:24:38.845Z | finding_deposited | agent:analyst | F-analyst-SIFT-DEMO-002 | MEDIUM — fls -r -p shows a suspiciously named p.exe recovered at inod |
| 2026-06-02T20:24:42.187Z | council_verified | seat:synthesis | F-analyst-SIFT-DEMO-002 | receipt 57fa4c1eebf1… |
