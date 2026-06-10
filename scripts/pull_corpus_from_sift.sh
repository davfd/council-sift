#!/usr/bin/env bash
# pull_corpus_from_sift.sh — regenerate eval/corpus/ from the official organizer evidence.
#
# The corpus is REAL Sleuth Kit / Volatility 3 output captured from the HACKATHON-2026 images. We do
# NOT redistribute it (it is derived from official evidence); instead this script reproduces it locally
# on a machine that has the SIFT VM up and the evidence mounted at /mnt/evidence (see scripts/mount_evidence.sh).
#
# bench_real.mjs reads eval/corpus/*.txt; filenames encode scenario + tool so the grader can bucket them:
#   rocba_fls_<id>.txt  rocba_fsstat_<id>.txt   srl15_*_psscan.txt   srl18_*_netscan.txt  ...
#
# Usage: SIFT_WRAPPER=~/sift-workstation/sift bash scripts/pull_corpus_from_sift.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SIFT="${SIFT_WRAPPER:-$HOME/sift-workstation/sift}"
OUT="$HERE/eval/corpus"; mkdir -p "$OUT"
run() { "$SIFT" "$1"; }

echo "[corpus] ensuring evidence is mounted in the guest..."
bash "$HERE/scripts/mount_evidence.sh" >/dev/null 2>&1 || true

echo "[corpus] ROCBA disk images -> fls + fsstat"
# Enumerate ROCBA E01/raw images and capture a recursive file listing + filesystem stats per partition.
run 'for img in $(find "/mnt/evidence" -iregex ".*ROCBA.*\.\(E01\|raw\|dd\|img\)" 2>/dev/null); do
       id=$(basename "$img" | tr -cd "[:alnum:]" | tail -c 6)
       for off in $(mmls "$img" 2>/dev/null | awk "/[0-9]/{print \$3}" | sed "s/^0*//" | grep -E "^[0-9]+$" | head -4); do
         echo "=== $img @ $off ===" ; fls -r -o "$off" "$img" 2>/dev/null | head -4000
       done
     done' > "$OUT/rocba_fls_$(date +%s 2>/dev/null || echo run).txt" || true

echo "[corpus] SRL 2018 + 2015 memory images -> vol3 psscan + netscan"
# Volatility 3 process + network pool scans (psscan/netscan work where pslist/netstat fail on these images).
for year in 2015 2018; do
  tag="srl${year:2:2}"
  run "ls /mnt/evidence/**/SRL\ ${year}/*.img /mnt/evidence/**/SRL\ ${year}/*.mem 2>/dev/null" | while read -r mem; do
    [ -z "$mem" ] && continue
    base=$(basename "$mem" | tr -cd "[:alnum:]" | tail -c 8)
    run "vol -q -f \"$mem\" windows.psscan" > "$OUT/${tag}_${base}_psscan.txt" 2>/dev/null || true
    run "vol -q -f \"$mem\" windows.netscan" > "$OUT/${tag}_${base}_netscan.txt" 2>/dev/null || true
  done
done

n=$(find "$OUT" -name '*.txt' | wc -l)
echo "[corpus] regenerated $n artifacts in eval/corpus/. Now run: node eval/bench_real.mjs"
echo "[corpus] NOTE: the committed accuracy-report/ reflects the author's full captured run;"
echo "         your regenerated counts may differ with image availability."
