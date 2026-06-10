# NETWORK-TELEMETRY — memory-derived network evidence, not packet capture

**Purpose.** Address the breadth/depth ceiling honestly. The mounted official evidence available to Council-SIFT contains memory and disk images, but the SIFT-side scan did **not** find standalone PCAP/PCAPNG/CAP files. Council-SIFT therefore claims **network telemetry from memory** (`vol3 windows.netscan`), not packet payload analysis.

SIFT-side availability scan:

```text
TOOLS log2timeline.py=1 psort.py=1 mmls=1 fls=1 istat=1 icat=1 ewfinfo=1
PCAP_PATHS=<none printed>
OFFICIAL_PCAP_COUNT=0
E01_COUNT=8
```

## What we do have

Council-SIFT already exercises network telemetry through Volatility 3 `windows.netscan` across official memory images:

| Case | Evidence type | Network tool | Supported network scope |
|---|---|---|---|
| `SRL18-WKSTN-MEM` | official SRL-2018 workstation memory | `vol3 windows.netscan` | listening socket and established/internal peer rows; no payload claim |
| `SRL18-RD-NET` | official SRL-2018 remote-desktop memory | `vol3 windows.netscan` + `psscan` | socket/process correlation; self-correction on internal-IP-as-C2 over-read |
| `ROCBA-MEM` | official ROCBA memory | `vol3 windows.netscan` | `svchost.exe` socket ownership and inbound TCPv4 record counts |
| `SRL2015-NFURY` | official SRL-2015 memory + disk | `vol3 windows.netscan` | suspicious service/process socket posture, corroborated with disk artifacts |

Representative repo evidence:

```text
execution-logs/AGENTIC.md: SRL18-RD-NET — memory / network, vol3 netscan + psscan, 8 findings, 3 self-corrections.
execution-logs/AGENTIC.md: ROCBA-MEM — memory, vol3 info/netscan/psscan/cmdline/registry, svchost.exe socket ownership; 118 inbound TCPv4 records.
execution-logs/AGENTIC.md: SRL-LIVE2 — agent re-ran vol3 netscan and corrected an internal-IP "C2" over-read.
```

## Claim boundary

Supported:

- socket rows, local/foreign endpoints, connection state, PID/owner when `netscan` provides them;
- RFC1918/internal vs external classification;
- correlation between socket/process evidence and other disk/memory artifacts.

Not supported by memory-derived telemetry alone:

- packet payload contents;
- file transfer contents;
- completed upload/exfil event;
- remote operator identity;
- external C2 labeling when the peer is internal/RFC1918.

## Why this helps the submission

The prior critique said: “no real network-capture (pcap) depth.” This report makes the posture explicit:

- **No fake PCAP depth is claimed.** The official mounted evidence scan found no packet captures.
- **Network depth still exists** through memory-derived telemetry across multiple official cases.
- Council-SIFT’s key value is visible here: it catches exactly the dangerous over-read — a socket row or process listing becoming “C2/exfiltration” without packet, log, or timeline corroboration.
