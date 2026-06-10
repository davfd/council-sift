#!/usr/bin/env bash
# srl_timeline_demo.sh — bounded Plaso/psort timeline correlation for SRL-2018 file server.
#
# Runs inside the SIFT VM through the read-only wrapper. It does not copy official evidence into
# the repo; it writes transient /tmp/*.plaso and /tmp/*.csv files in the SIFT guest and prints only
# compact, judge-safe KEY=value evidence lines.
set -euo pipefail

SIFT="${SIFT_WRAPPER:-/home/exor/sift-workstation/sift}"

"$SIFT" 'set -euo pipefail
IMG="/mnt/evidence/Compromised APT Attack Scenarios/SRL 2018/base-file-cdrive.E01"
FILTER=/tmp/csift_srl18_timeline_filter.yaml
PLASO=/tmp/csift_srl18_file_timeline.plaso
CSV=/tmp/csift_srl18_file_timeline.csv
L2T_LOG=/tmp/csift_srl18_l2t.log
PSORT_LOG=/tmp/csift_srl18_psort.log

rm -f "$FILTER" "$PLASO" "$CSV" "$L2T_LOG" "$PSORT_LOG"
cat > "$FILTER" <<"EOF"
description: Council-SIFT SRL-2018 file-server staging/timeline paths
type: include
path_separator: /
paths:
- /Program Files \(x86\)/WinRAR/.*
- /Shares/shieldbase-share/R&D/StarFury.*
- /Shares/shieldbase-share/Management/.*Starfury.*
- /Shares/shieldbase-share/Management/Prospect Analysis/Rare-Earth Elements/.*
- /Windows/Logs/WindowsServerBackup/6\.11/Research/.*
- /Windows/Logs/WindowsServerBackup/7\.13/R&D/.*
EOF

printf "TIMELINE_CASE=SRL18-TIMELINE\n"
printf "TIMELINE_IMAGE=base-file-cdrive.E01\n"
printf "TOOL_LOG2TIMELINE_PRESENT="; command -v log2timeline.py >/dev/null 2>&1 && echo 1 || echo 0
printf "TOOL_PSORT_PRESENT="; command -v psort.py >/dev/null 2>&1 && echo 1 || echo 0
printf "TOOL_FLS_PRESENT="; command -v fls >/dev/null 2>&1 && echo 1 || echo 0
printf "TOOL_ISTAT_PRESENT="; command -v istat >/dev/null 2>&1 && echo 1 || echo 0
printf "OFFICIAL_PCAP_COUNT="; find /mnt/evidence -type f \( -iname "*.pcap" -o -iname "*.pcapng" -o -iname "*.cap" \) 2>/dev/null | wc -l

log2timeline.py --storage-file "$PLASO" --vss_stores none --partitions all --parsers mft,filestat,lnk -f "$FILTER" --status_view none --single_process "$IMG" >"$L2T_LOG" 2>&1
psort.py -o l2tcsv -w "$CSV" "$PLASO" >"$PSORT_LOG" 2>&1

csv_lines=$(wc -l < "$CSV")
printf "PLASO_EVENTS_EXPORTED=%s\n" "$((csv_lines - 1))"
printf "PLASO_CSV_LINES=%s\n" "$csv_lines"
printf "PLASO_FILTER_SHA256="; sha256sum "$FILTER" | awk "{print \$1}"
printf "PLASO_CSV_SHA256="; sha256sum "$CSV" | awk "{print \$1}"

# Compact Plaso/psort facts: live StarFury artifacts and rare-earth document timeline rows.
python3 - "$CSV" <<"PY"
import csv, sys
path = sys.argv[1]
rows = list(csv.DictReader(open(path, newline="", errors="replace")))
for needle, label in [
    ("\\Shares\\shieldbase-share\\R&D\\StarFury.zip", "STARFURY_ZIP"),
    ("\\Shares\\shieldbase-share\\R&D\\StarFury.docx", "STARFURY_DOCX"),
    ("Rare-Earth Elements", "RARE_EARTH_DOC"),
]:
    hits = [r for r in rows if needle.lower() in (r.get("filename") or "").lower() or needle.lower() in (r.get("message") or "").lower()]
    print(f"{label}_PLASO_HITS={len(hits)}")
    for i, r in enumerate(hits[:4], 1):
        date = r.get("date", "")
        time = r.get("time", "")
        timezone = r.get("timezone", "")
        description = r.get("description", "")
        filename = r.get("filename", "")
        message = (r.get("message", "") or "")[:160]
        print(f"{label}_ROW_{i}={date} {time} {timezone} {description} {filename} {message}")
PY

printf "FLS_STARFURY_ZIP_ROWS_BEGIN\n"
fls -r -p -o 0 "$IMG" 2>/dev/null | grep -i "StarFury.zip" | sed -n "1,10p"
printf "FLS_STARFURY_ZIP_ROWS_END\n"

printf "ISTAT_ALLOCATED_STARFURY_BEGIN\n"
istat -o 0 "$IMG" 120557 | grep -E "Entry:|Allocated File|Not Allocated File|Created:|File Modified:|MFT Modified:|Accessed:|Name:|Actual Size" | sed -n "1,24p"
printf "ISTAT_ALLOCATED_STARFURY_END\n"

printf "ISTAT_DELETED_STARFURY_BEGIN\n"
istat -o 0 "$IMG" 124702 | grep -E "Entry:|Allocated File|Not Allocated File|Created:|File Modified:|MFT Modified:|Accessed:|Name:|Actual Size" | sed -n "1,28p"
printf "ISTAT_DELETED_STARFURY_END\n"

printf "TIMELINE_INTERPRETATION_BOUNDARY=plaso_psort_and_tsk_support_file_timeline_correlation_not_pcap_payloads_not_human_identity_not_completed_exfil_receipt\n"
'
