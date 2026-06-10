# SRL18-TIMELINE — Plaso timeline correlation for the file-server StarFury/Rar.exe story

**Purpose.** Close the prior breadth/depth gap: Council-SIFT already had memory (`vol3 psscan`) and disk (`fls`/`istat`) depth; this adds a bounded **Plaso/log2timeline + psort** timeline pass over the official SRL-2018 file-server disk image.

**Evidence source.** Official SANS HACKATHON-2026 image, not redistributed:

```text
/mnt/evidence/Compromised APT Attack Scenarios/SRL 2018/base-file-cdrive.E01
```

**Reproduce.** From the repo root with the SIFT wrapper available:

```bash
bash analyst/srl_timeline_demo.sh
```

**Captured run.** Local verification run produced:

```text
TIMELINE_CASE=SRL18-TIMELINE
TIMELINE_IMAGE=base-file-cdrive.E01
TOOL_LOG2TIMELINE_PRESENT=1
TOOL_PSORT_PRESENT=1
TOOL_FLS_PRESENT=1
TOOL_ISTAT_PRESENT=1
OFFICIAL_PCAP_COUNT=0
PLASO_EVENTS_EXPORTED=15
PLASO_CSV_LINES=16
PLASO_FILTER_SHA256=98bcb0fa6b55efb26ad5a70e1981b4f03aa5fccfd6ed14222e1e968d96c2e870
PLASO_CSV_SHA256=4e39cac2d83f7000504f01222635fe270fc11e03c4f0dbd7c468367f189761de
```

The full stdout hash for this run was:

```text
srl_timeline_demo_stdout_sha256=e05fd40426ebf9336f5df4b85ffa0b323df4e9f9b89f0ee3bf44f7cdf9f2f1f7
stdout_lines=74
```

## Timeline facts

Plaso/psort exported timeline rows for the live StarFury artifacts:

```text
STARFURY_ZIP_PLASO_HITS=3
STARFURY_ZIP_ROW_1=03/12/2012 20:49:00 UTC  NTFS:\Shares\shieldbase-share\R&D\StarFury.zip
STARFURY_ZIP_ROW_2=07/11/2018 16:16:06 UTC  NTFS:\Shares\shieldbase-share\R&D\StarFury.zip
STARFURY_ZIP_ROW_3=08/01/2018 21:06:30 UTC  NTFS:\Shares\shieldbase-share\R&D\StarFury.zip
STARFURY_DOCX_PLASO_HITS=3
STARFURY_DOCX_ROW_1=03/12/2012 20:52:27 UTC  NTFS:\Shares\shieldbase-share\R&D\StarFury.docx
STARFURY_DOCX_ROW_2=07/11/2018 16:16:05 UTC  NTFS:\Shares\shieldbase-share\R&D\StarFury.docx
STARFURY_DOCX_ROW_3=08/07/2018 21:17:23 UTC  NTFS:\Shares\shieldbase-share\R&D\StarFury.docx
```

Plaso also found timeline rows for rare-earth prospect-analysis material on the same file server:

```text
RARE_EARTH_DOC_PLASO_HITS=6
RARE_EARTH_DOC_ROW_1=07/17/2018 02:13:09 UTC  NTFS:\Shares\shieldbase-share\Management\Prospect Analysis\Rare-Earth Elements\'Semi-infinite' trove of rare earth elements.docx
RARE_EARTH_DOC_ROW_2=07/19/2018 16:13:56 UTC  NTFS:\Shares\shieldbase-share\Management\Prospect Analysis\Rare-Earth Elements\'Semi-infinite' trove of rare earth elements.docx
RARE_EARTH_DOC_ROW_3=07/20/2018 14:05:18 UTC  NTFS:\Shares\shieldbase-share\Management\Prospect Analysis\Rare-Earth Elements\DOE's REE Program.pdf
RARE_EARTH_DOC_ROW_4=07/20/2018 14:06:50 UTC  NTFS:\Shares\shieldbase-share\Management\Prospect Analysis\Rare-Earth Elements\DOE's REE Program.pdf
```

Sleuth Kit corroborates both a live and a deleted StarFury archive entry:

```text
FLS_STARFURY_ZIP_ROWS_BEGIN
r/r 120557-128-1:	Shares/shieldbase-share/R&D/StarFury.zip
r/r * 124702-128-1:	Windows/Logs/WindowsServerBackup/7.13/R&D/StarFury.zip
FLS_STARFURY_ZIP_ROWS_END
```

`istat` on the allocated StarFury archive:

```text
Entry: 120557        Sequence: 1
Allocated File
Created:	2018-07-11 16:16:06.501542000 (UTC)
File Modified:	2012-03-12 20:49:00.000000000 (UTC)
MFT Modified:	2018-08-01 21:06:30.514430900 (UTC)
Accessed:	2018-07-11 16:16:06.501542000 (UTC)
Name: StarFury.zip
Allocated Size: 724992  	Actual Size: 724919
```

`istat` on the deleted backup-path StarFury archive entry:

```text
Entry: 124702        Sequence: 2
Not Allocated File
Created:	2018-09-05 13:24:07.257129200 (UTC)
File Modified:	2018-09-06 16:22:02.115333800 (UTC)
MFT Modified:	2018-09-06 16:22:02.130698700 (UTC)
Accessed:	2018-09-05 14:29:05.264662600 (UTC)
Name: WINDOW~1.ZZZ
Name: windowsZZZZZZZZZZZZZZ.ZZZZZZZZZZZZZZZ.ZZZ
Allocated Size: 724992  	Actual Size: 724919
```

## Interpretation boundary

Supported:

- The official SRL-2018 file-server disk image has a **Plaso/psort timeline** for the live `StarFury.zip` and adjacent `StarFury.docx` artifacts.
- The same disk image has rare-earth prospect-analysis documents in the file-server share timeline.
- Sleuth Kit identifies both a live `Shares/shieldbase-share/R&D/StarFury.zip` entry and a deleted backup-path `Windows/Logs/WindowsServerBackup/7.13/R&D/StarFury.zip` entry, with matching actual size `724919` bytes.
- This materially upgrades the Rar.exe story: the memory finding is not treated as exfil proof; it is correlated with disk and timeline artifacts as a **staging/archive investigation path**.

Not supported by this artifact alone:

- packet payload contents;
- a completed exfiltration receipt;
- an external C2 endpoint;
- human/operator identity;
- transfer direction.

This is the same correction Council-SIFT is built to enforce: process presence (`psscan`) is not exfiltration; timeline + disk correlation is the proper next rung on the ladder.
