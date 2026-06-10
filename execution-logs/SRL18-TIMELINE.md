# Execution Log — SRL18-TIMELINE bounded Plaso/psort add-on

This is **not** counted as a new autonomous Claude Code run. It is a bounded, no-key reproducibility harness added to close the timeline-depth gap in the submission critique.

| Time (UTC) | Event | Tool / artifact | Output |
|---|---|---|---|
| 2026-06-08T03:30Z | SIFT capability check | `/home/exor/sift-workstation/sift` against mounted official evidence | `log2timeline.py=1`, `psort.py=1`, `fls=1`, `istat=1`, `OFFICIAL_PCAP_COUNT=0` |
| 2026-06-08T03:31Z | Timeline extraction | `log2timeline.py --storage-file /tmp/csift_srl18_file_timeline.plaso --vss_stores none --partitions all --parsers mft,filestat,lnk -f /tmp/csift_srl18_timeline_filter.yaml base-file-cdrive.E01` | targeted SRL-2018 file-server timeline generated in SIFT `/tmp` |
| 2026-06-08T03:31Z | Timeline export | `psort.py -o l2tcsv -w /tmp/csift_srl18_file_timeline.csv /tmp/csift_srl18_file_timeline.plaso` | `PLASO_EVENTS_EXPORTED=15`, `PLASO_CSV_SHA256=4e39cac2d83f7000504f01222635fe270fc11e03c4f0dbd7c468367f189761de` |
| 2026-06-08T03:31Z | Sleuth Kit corroboration | `fls -r -p -o 0`, `istat -o 0` on entries `120557`, `124702` | live `StarFury.zip` and deleted backup-path `StarFury.zip` metadata captured |

Report: [`reports/SRL18-TIMELINE.md`](../reports/SRL18-TIMELINE.md)

Re-run:

```bash
bash analyst/srl_timeline_demo.sh
```

Boundary emitted by the run:

```text
TIMELINE_INTERPRETATION_BOUNDARY=plaso_psort_and_tsk_support_file_timeline_correlation_not_pcap_payloads_not_human_identity_not_completed_exfil_receipt
```
