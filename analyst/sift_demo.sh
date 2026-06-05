#!/usr/bin/env bash
# sift_demo.sh — Council-SIFT bloodstream on REAL Sleuth Kit output captured live from the SIFT VM.
#   real fls output -> analyst finding (claims inode 99 rootkit, NOT in output) -> Council refutes
#   -> analyst self-corrects -> Council verifies -> Receipt + trace.   No human in the loop.
cd "$(dirname "$0")/.."
set -a; source claw-memory-core/.env; set +a
SIFT="$HOME/sift-workstation/sift"
CASE=SIFT-DEMO
NF() { grep -vE 'MEM-TELEMETRY|C1-COST|OPENAI_API_KEY absent|injected env' || true; }

# (0) ensure a real artifact exists in SIFT, then capture REAL `fls` output from inside the VM.
"$SIFT" 'cd /tmp && [ -f case.img ] || { truncate -s 16M case.img && mkfs.ext4 -F -q case.img && printf "MZ\x90 planted\n" >/tmp/p.exe && debugfs -w -R "write /tmp/p.exe p.exe" case.img >/dev/null 2>&1; }' 2>/dev/null
OUT="$("$SIFT" 'fls -r -p /tmp/case.img' 2>/dev/null)"
echo "── REAL SIFT tool output (fls -r -p /tmp/case.img, run inside the VM) ──"; echo "$OUT"; echo

docker exec councilsift-neo4j cypher-shell -u neo4j -p councilsiftpw \
  "MATCH (n) WHERE n.project_root='$CASE' DETACH DELETE n;" >/dev/null 2>&1 || true

mkfinding() { # $1 obs  $2 interp  $3 confidence  $4 cited(comma) ; OUT from env
  OBS="$1" INTERP="$2" CONF="$3" CITED="$4" OUT="$OUT" CASE="$CASE" python3 - <<'PY'
import json, os
print(json.dumps({
  "case": os.environ["CASE"], "observation": os.environ["OBS"],
  "interpretation": os.environ["INTERP"], "confidence": os.environ["CONF"],
  "artifact": "/tmp/case.img", "locator": "fls:inode=12", "tool": "fls",
  "command": "fls -r -p /tmp/case.img", "output": os.environ["OUT"],
  "provenance_tier": "STORED_OUTPUT_ONLY",
  "cited_tokens": [t for t in os.environ["CITED"].split(",") if t],
}))
PY
}

echo "════ STEP 1 — analyst drafts a finding from the REAL fls output (claims a rootkit at inode 99) ════"
mkfinding "fls -r -p shows p.exe at inode 12; a hidden rootkit driver is staged at inode 99" \
          "Active rootkit present in the image" "HIGH" "12,p.exe,99" | node bridge/csift.mjs record-finding | NF
echo
echo "════ STEP 2 — Council reviews F-analyst-$CASE-001 ════"
node council/council.mjs review "F-analyst-$CASE-001" | NF
echo "════ STEP 3 — analyst SELF-CORRECTS (drops the unsupported inode-99 rootkit claim) ════"
mkfinding "fls -r -p shows a suspiciously named p.exe recovered at inode 12 under the lost+found tree" \
          "Suspicious file present; no rootkit claim is supported by this artifact" "MEDIUM" "12,p.exe" | node bridge/csift.mjs record-finding | NF
echo
echo "════ STEP 4 — Council reviews the corrected F-analyst-$CASE-002 ════"
node council/council.mjs review "F-analyst-$CASE-002" | NF
echo "════ STEP 5 — provenance trace (re-hash REAL tool output) ════"
node bridge/csift.mjs trace "F-analyst-$CASE-002" | NF
