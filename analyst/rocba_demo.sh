#!/usr/bin/env bash
# rocba_demo.sh — full bloodstream on the OFFICIAL HACKATHON-2026 "Standard Forensic Case" (ROCBA),
# read zero-copy over the read-only 9p evidence share (no 200GB copied). Real Sleuth Kit on the real
# rocba-cdrive.e01: analyst fabricates a BitLocker container -> Council refutes -> self-corrects -> verified.
cd "$(dirname "$0")/.."
set -a; source claw-memory-core/.env; set +a
SIFT="$HOME/sift-workstation/sift"
EV="/mnt/evidence/Standard Forensic Case/rocba-cdrive.e01"
CASE=ROCBA
NF() { grep -vE 'MEM-TELEMETRY|C1-COST|OPENAI_API_KEY absent|injected env' || true; }

OUT="$("$SIFT" "fsstat \"$EV\" | sed -n '1,16p'; echo ---FLS---; fls -f ntfs \"$EV\" | head -25" 2>/dev/null)"
echo "── REAL Sleuth Kit output on official evidence (rocba-cdrive.e01, via read-only 9p) ──"
echo "$OUT" | head -28; echo

docker exec councilsift-neo4j cypher-shell -u neo4j -p councilsiftpw \
  "MATCH (n) WHERE n.project_root='$CASE' DETACH DELETE n;" >/dev/null 2>&1 || true

mkf() { OBS="$1" INTERP="$2" CONF="$3" CITED="$4" OUT="$OUT" CASE="$CASE" python3 - <<'PY'
import json, os
print(json.dumps({
  "case": os.environ["CASE"], "observation": os.environ["OBS"], "interpretation": os.environ["INTERP"],
  "confidence": os.environ["CONF"], "artifact": "/mnt/evidence/Standard Forensic Case/rocba-cdrive.e01",
  "locator": "ntfs:root", "tool": "fls/fsstat", "command": "fsstat + fls -f ntfs rocba-cdrive.e01",
  "output": os.environ["OUT"], "provenance_tier": "STORED_OUTPUT_ONLY", "cited_tokens": [t for t in os.environ["CITED"].split("|") if t]}))
PY
}

echo "════ STEP 1 — analyst finding cites a hidden BitLocker container at inode 999999 (NOT in evidence) ════"
mkf "fsstat/fls on rocba-cdrive.e01: NTFS volume 'Windows' serial F0E0FE66E0FE3288; a hidden BitLocker container is staged at inode 999999" \
    "Encrypted anti-forensic container present" "HIGH" "F0E0FE66E0FE3288|999999|BitLocker" | node bridge/csift.mjs record-finding | NF
echo
echo "════ STEP 2 — Council reviews F-analyst-$CASE-001 ════"
node council/council.mjs review "F-analyst-$CASE-001" | NF
echo "════ STEP 3 — analyst SELF-CORRECTS (drops the unsupported encryption claim) ════"
mkf "fsstat/fls on rocba-cdrive.e01: NTFS volume 'Windows' serial F0E0FE66E0FE3288 with Users and ProgramData directories present" \
    "Standard Windows system volume; user-profile artifacts available for triage" "MEDIUM" "F0E0FE66E0FE3288|Users|ProgramData" | node bridge/csift.mjs record-finding | NF
echo
echo "════ STEP 4 — Council reviews the corrected F-analyst-$CASE-002 ════"
node council/council.mjs review "F-analyst-$CASE-002" | NF
echo "════ STEP 5 — provenance trace (re-hash real TSK output) ════"
node bridge/csift.mjs trace "F-analyst-$CASE-002" | NF
