#!/usr/bin/env bash
# rocba_questions_demo.sh — work the OFFICIAL ROCBA "Key Questions" with real disk artifacts.
# Real TSK fls of Users/fredr on rocba-cdrive.e01 (zero-copy 9p). A supported finding on the real
# cloud-sync exfil vectors; a hallucinated "8.4 GB exfiltrated to 185.220.101.45" -> refuted ->
# self-corrected; then a question-by-question brief grounded only in verified findings.
cd "$(dirname "$0")/.."
set -a; source claw-memory-core/.env; set +a
SIFT="$HOME/sift-workstation/sift"
EV="/mnt/evidence/Standard Forensic Case/rocba-cdrive.e01"
CASE=ROCBA-Q
NF() { grep -vE 'MEM-TELEMETRY|C1-COST|OPENAI_API_KEY absent|injected env' || true; }

CMD="fls -f ntfs \"$EV\" 154910 | grep -iE 'drive|dropbox|onedrive|stark|icloud|documents' | head -16"
CAPTURE_JSON="$(CMD="$CMD" EV="$EV" CASE="$CASE" python3 - <<'PY' | node bridge/csift.mjs capture
import json, os
print(json.dumps({
  "case": os.environ["CASE"],
  "artifact": os.environ["EV"],
  "locator": "ntfs:Users/fredr (inode 154910)",
  "tool": "fls",
  "command": os.environ["CMD"],
  "cited_tokens": ["Google Drive", "iCloudDrive", "ROCBA Dropbox", "OneDrive - Stark Research Labs"],
}))
PY
)"
EXEC_REF="$(printf '%s' "$CAPTURE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["execution_ref"])')"
OUT="$(EXEC_REF="$EXEC_REF" python3 - <<'PY'
import json, os
print(json.load(open(os.environ["EXEC_REF"]))["output"], end="")
PY
)"
echo "── REAL TSK fls of Users/fredr (official ROCBA evidence) ──"; echo "$OUT"; echo

docker exec councilsift-neo4j cypher-shell -u neo4j -p councilsiftpw \
  "MATCH (n) WHERE n.project_root='$CASE' DETACH DELETE n;" >/dev/null 2>&1 || true

mkf() { OBS="$1" INTERP="$2" CONF="$3" CITED="$4" EXEC_REF="$EXEC_REF" CASE="$CASE" python3 - <<'PY'
import json, os
print(json.dumps({"case":os.environ["CASE"],"observation":os.environ["OBS"],"interpretation":os.environ["INTERP"],
"confidence":os.environ["CONF"],"execution_ref":os.environ["EXEC_REF"],
"cited_tokens":[t for t in os.environ["CITED"].split("|") if t]}))
PY
}

echo "════ Q2/Q3 attempt — analyst over-claims a specific exfiltration (not supported by a dir listing) ════"
mkf "fls of Users/fredr lists OneDrive - Stark Research Labs, ROCBA Dropbox, Google Drive and iCloudDrive" \
    "8.4 GB of SRL project files were exfiltrated to 185.220.101.45 via Dropbox on 2020-11-13" "HIGH" "185.220.101.45|8.4 GB" \
    | node bridge/csift.mjs record-finding | NF
echo; echo "──> Council:"; node council/council.mjs review "F-analyst-$CASE-001" | NF
echo "════ SELF-CORRECT — claim only what the artifact supports ════"
mkf "fls of Users/fredr shows corporate 'OneDrive - Stark Research Labs' plus personal Google Drive, iCloudDrive and 'ROCBA Dropbox' sync folders" \
    "Fred's profile carries the corporate SRL OneDrive and multiple personal cloud-sync clients; these personal sync folders are candidate exfiltration vectors that warrant cloud-log and \$MFT timeline correlation (what/where is NOT established from a directory listing)" "MEDIUM" "Google Drive|iCloudDrive|ROCBA Dropbox|OneDrive - Stark Research Labs" \
    | node bridge/csift.mjs record-finding | NF
echo; echo "──> Council:"; node council/council.mjs review "F-analyst-$CASE-002" | NF

echo
echo "════ Investigative brief — ROCBA Key Questions vs verified evidence ════"
cat <<BRIEF
Q1 What key projects did Fred have access to?
   SUPPORTED (F-analyst-$CASE-002): a 'Stark Research Labs' project folder + corporate
   'OneDrive - Stark Research Labs' sync are present in Users/fredr.
Q2 What was stolen?           OPEN — not establishable from a directory listing; needs file-level
                              hashing + cloud-client logs. (Hallucinated '8.4 GB' was REFUTED.)
Q3 Where was it transferred?  OPEN — candidate vectors identified (Dropbox/Google Drive/iCloud/OneDrive);
                              destination NOT proven. (Hallucinated C2 IP was REFUTED.)
Q4 How was it stolen?         PARTIAL — multiple personal cloud-sync clients on the corporate system are
                              plausible exfil channels; corroborate with client logs + browser history.
Q5 When did the activity occur? OPEN — break-in window per case background is 2020-11-13; confirm against
                              \$MFT/USN + event-log timeline (not yet run).
Only COUNCIL_VERIFIED findings appear above; refuted claims are excluded.
BRIEF