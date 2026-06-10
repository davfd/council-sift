#!/usr/bin/env bash
# demo_selfcorrect.sh — Council-SIFT MVP bloodstream, end to end:
#   evidence -> analyst drafts finding (with a hallucinated detail) -> Council refutes
#   -> analyst self-corrects (no human) -> Council verifies -> Receipt + provenance trace.
cd "$(dirname "$0")/.."
set -a; source claw-memory-core/.env; set +a
NF() { grep -vE 'MEM-TELEMETRY|C1-COST|OPENAI_API_KEY absent|injected env' || true; }

# Fresh slate for the demo case.
docker exec councilsift-neo4j cypher-shell -u neo4j -p councilsiftpw \
  "MATCH (n) WHERE n.project_root='DEMO-1' DETACH DELETE n;" >/dev/null 2>&1 || true

echo "════ STEP 1 — analyst drafts a finding (cites a C2 IP that is NOT in the tool output) ════"
node bridge/csift.mjs record-finding <<'JSON' | NF
{ "case":"DEMO-1",
  "observation":"vol3 windows.psscan shows p.exe PID 8260 in C:\\Windows\\Temp\\perfmon; it established a C2 channel to 185.220.101.45",
  "interpretation":"Malicious process with active command-and-control",
  "confidence":"HIGH",
  "artifact":"/cases/mem/rd01-memory.img",
  "locator":"windows.psscan:PID=8260",
  "tool":"vol3",
  "command":"vol -f /cases/mem/rd01-memory.img windows.psscan",
  "output":"8260   p.exe   5948   cmd.exe   C:\\Windows\\Temp\\perfmon\\p.exe" }
JSON

echo
echo "════ STEP 2 — Council reviews F-analyst-DEMO-1-001 ════"
node council/council.mjs review F-analyst-DEMO-1-001 | NF

echo "════ STEP 3 — analyst SELF-CORRECTS (re-files, dropping the unsupported C2 claim) ════"
node bridge/csift.mjs record-finding <<'JSON' | NF
{ "case":"DEMO-1",
  "observation":"vol3 windows.psscan shows p.exe PID 8260 with parent cmd.exe PID 5948 in C:\\Windows\\Temp\\perfmon",
  "interpretation":"Suspicious Temp-resident process with a cmd.exe parent; network attribution is not established by this artifact",
  "confidence":"MEDIUM",
  "artifact":"/cases/mem/rd01-memory.img",
  "locator":"windows.psscan:PID=8260",
  "tool":"vol3",
  "command":"vol -f /cases/mem/rd01-memory.img windows.psscan",
  "output":"8260   p.exe   5948   cmd.exe   C:\\Windows\\Temp\\perfmon\\p.exe" }
JSON

echo
echo "════ STEP 4 — Council reviews the corrected F-analyst-DEMO-1-002 ════"
node council/council.mjs review F-analyst-DEMO-1-002 | NF

echo "════ STEP 5 — provenance trace + Council Receipt for the verified finding ════"
node bridge/csift.mjs trace F-analyst-DEMO-1-002 | NF
echo "── Receipt ──"
node council/council.mjs receipt F-analyst-DEMO-1-002 | NF
