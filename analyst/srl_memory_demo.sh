#!/usr/bin/env bash
# srl_memory_demo.sh — MEMORY forensics through the loop on the OFFICIAL SRL-2018 evidence.
# Real vol3 windows.psscan on base-file-memory.img (read zero-copy from the RO share, extracted to /tmp).
# The analyst over-reads "Rar.exe -> exfiltration to C2" -> Tool-semantics REFUTES (psscan can't prove
# network exfil) -> analyst self-corrects to a data-staging indicator -> COUNCIL_VERIFIED.
cd "$(dirname "$0")/.."
set -a; source claw-memory-core/.env; set +a
SIFT="${SIFT_WRAPPER:-$HOME/sift-workstation/sift}"
CASE=SRL-MEM
NF() { grep -vE 'MEM-TELEMETRY|C1-COST|OPENAI_API_KEY absent|injected env' || true; }

# Ensure the image is extracted, symbols are writable, and psscan is cached (real vol3 output).
"$SIFT" '[ -f /tmp/srlmem/base-file-memory.img ] || 7z x -y -o/tmp/srlmem "/mnt/evidence/Compromised APT Attack Scenarios/SRL 2018/base-file-memory.7z" >/dev/null 2>&1
echo forensics | sudo -S chmod -R a+rwx /opt/volatility3/lib/python3.12/site-packages/volatility3/symbols /opt/volatility3/lib/python3.12/site-packages/volatility3/framework/symbols 2>/dev/null
[ -s /tmp/srlmem/psscan.txt ] || vol -q -f /tmp/srlmem/base-file-memory.img windows.psscan > /tmp/srlmem/psscan.txt 2>/dev/null'
# Replay-canonical command: the EXACT pipe whose stdout we store as the finding's trusted execution record, so
# `csift trace --rerun` re-executes it and the fresh hash matches (independent re-execution proof).
CMD='vol -q -f /tmp/srlmem/base-file-memory.img windows.psscan | grep -E "Rar.exe|rdpclip.exe|subject_srv|reg.exe" | head -6'
CAPTURE_JSON="$(CMD="$CMD" CASE="$CASE" python3 - <<'PY' | node bridge/csift.mjs capture
import json, os
print(json.dumps({
  "case": os.environ["CASE"],
  "artifact": "/tmp/srlmem/base-file-memory.img",
  "locator": "windows.psscan:PID=2524",
  "tool": "vol3",
  "command": os.environ["CMD"],
  "cited_tokens": ["Rar.exe", "2524", "6352"],
}))
PY
)"
EXEC_REF="$(printf '%s' "$CAPTURE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["execution_ref"])')"
OUT="$(EXEC_REF="$EXEC_REF" python3 - <<'PY'
import json, os
print(json.load(open(os.environ["EXEC_REF"]))["output"], end="")
PY
)"
echo "── REAL vol3 windows.psscan output (official SRL-2018 base-file memory image) ──"; echo "$OUT"; echo

docker exec councilsift-neo4j cypher-shell -u neo4j -p councilsiftpw \
  "MATCH (n) WHERE n.project_root='$CASE' DETACH DELETE n;" >/dev/null 2>&1 || true

mkf() { OBS="$1" INTERP="$2" CONF="$3" CITED="$4" EXEC_REF="$EXEC_REF" CASE="$CASE" python3 - <<'PY'
import json, os
print(json.dumps({
  "case": os.environ["CASE"], "observation": os.environ["OBS"], "interpretation": os.environ["INTERP"],
  "confidence": os.environ["CONF"], "execution_ref": os.environ["EXEC_REF"],
  "cited_tokens": [t for t in os.environ["CITED"].split("|") if t]}))
PY
}

echo "════ STEP 1 — analyst over-reads: 'Rar.exe exfiltrated data to the C2' (psscan can't prove that) ════"
mkf "vol3 windows.psscan shows Rar.exe PID 2524 (parent PID 6352) and rdpclip.exe on the file server" \
    "Rar.exe exfiltrated the stolen SRL data to the attacker's external C2 server" "HIGH" "2524|Rar.exe|6352" \
    | node bridge/csift.mjs record-finding | NF
echo
echo "════ STEP 2 — Council reviews F-analyst-$CASE-001 ════"
node council/council.mjs review "F-analyst-$CASE-001" | NF
echo "════ STEP 3 — analyst SELF-CORRECTS (stays within what a process listing supports) ════"
mkf "vol3 windows.psscan shows Rar.exe PID 2524 (parent PID 6352) executed 2018-09-05 on the file server" \
    "Rar.exe is an archiving utility; its execution is a data-staging indicator that warrants disk/timeline correlation — exfiltration is NOT established from a process listing alone" "MEDIUM" "2524|Rar.exe|6352" \
    | node bridge/csift.mjs record-finding | NF
echo
echo "════ STEP 4 — Council reviews the corrected F-analyst-$CASE-002 ════"
node council/council.mjs review "F-analyst-$CASE-002" | NF
echo "════ STEP 5 — provenance trace (re-hash real psscan output) ════"
node bridge/csift.mjs trace "F-analyst-$CASE-002" | NF
echo "════ STEP 6 — structured investigative narrative (analytical reasoning, not a raw log) ════"
node eval/narrative_report.mjs "$CASE" | NF
echo "   → reports/$CASE.md"
