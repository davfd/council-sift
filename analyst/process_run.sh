#!/usr/bin/env bash
# process_run.sh <CASE> — turn a completed autonomous run into public, traceable artifacts:
#   1. redact the raw transcript (excerpt official tool output → hash; keep reasoning/commands/verdicts)
#   2. generate the structured investigative NARRATIVE from the graph (reports/<CASE>.md)
#   3. export the structured execution log from the graph (execution-logs/<CASE>.{jsonl,md})
#   4. print the verified findings + a self-correction count
HERE="$(cd "$(dirname "$0")/.." && pwd)"; cd "$HERE"
set -a; . claw-memory-core/.env; set +a
CASE="$1"; [ -z "$CASE" ] && { echo "usage: process_run.sh <CASE>" >&2; exit 2; }
RAW="execution-logs/AGENTIC-${CASE}.jsonl"

[ -f "$RAW" ] && node eval/redact_agentic.mjs "$RAW" || echo "(no transcript $RAW)"
node eval/narrative_report.mjs "$CASE" 2>/dev/null || echo "(no graph findings to narrate for $CASE)"
node eval/export_execution_log.mjs "$CASE" 2>/dev/null || true
echo "=== $CASE — findings in graph ==="
node bridge/csift.mjs list "$CASE" 2>/dev/null | grep -vE 'injected env' || echo "  (none)"
sc=$(node bridge/csift.mjs list "$CASE" 2>/dev/null | grep -c DISPUTED)
echo "  self-corrections (DISPUTED→corrected): ${sc:-0}"
