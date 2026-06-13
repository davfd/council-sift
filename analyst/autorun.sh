#!/usr/bin/env bash
# autorun.sh — launch a GENUINE autonomous Claude Code analyst investigation (no hardcoded findings).
#
# Unlike the deterministic *_demo.sh reproductions, this hands a real lead to a live Claude Code agent
# that reads its contract (analyst/CLAUDE.md), runs real SIFT tools via `sift`, drafts its OWN findings,
# submits each to the Council (`csift record-finding` + `council review`), and SELF-CORRECTS on any bounce
# — with no human and nothing scripted. The full stream-json transcript is captured.
#
#   analyst/autorun.sh <CASE-ID> "<investigative lead>" [model] [timeout_s]
#   → execution-logs/AGENTIC-<CASE-ID>.jsonl  (raw live transcript)
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HERE/bin:$PATH"
# Underlying executor behind the guarded `sift` command. For no-SSH local SIFT, run this repo
# inside the SIFT workstation/container and set: SIFT_WRAPPER="$HERE/bin/sift-local".
# For a VM bridge, set SIFT_WRAPPER to your SSH/QEMU wrapper.
export SIFT_WRAPPER="${SIFT_WRAPPER:-$HOME/sift-workstation/sift}"
set -a; . "$HERE/claw-memory-core/.env"; set +a
cd "$HERE/analyst" || exit 1

CASE="$1"; LEAD="$2"; MODEL="${3:-}"; TMO="${4:-900}"
[ -z "$CASE" ] && { echo "usage: autorun.sh <CASE> \"<lead>\" [model] [timeout_s]" >&2; exit 2; }
LOG="$HERE/execution-logs/AGENTIC-${CASE}.jsonl"

read -r -d '' PROMPT <<EOF
You are the Council-SIFT DFIR analyst. Your operating contract is analyst/CLAUDE.md (in this directory) —
follow it exactly. Tools are on PATH; call them with Bash:
  sift '<command>'         quick interactive forensic look inside the SIFT VM
  csift capture            run command through bin/sift and print execution_ref for trusted stdout
  csift record-finding     submit ONE finding with execution_ref (pipe the JSON schema on stdin); prints the finding_id
  council review <id>      run the Council seats → COUNCIL_VERIFIED or BOUNCE_FOR_CORRECTION+objection
  csift trace <id>         show provenance + re-hash the tool output

CASE: ${CASE}
LEAD: ${LEAD}

Investigate autonomously. For every finding: first run `csift capture` for the REAL tool output, then draft a 4-part finding
(observation = literal captured output; interpretation = your inference; confidence; execution_ref +
the exact cited_tokens your claim rests on), submit it to the Council, and run council review.
If the Council BOUNCES a finding, read the objection and SELF-CORRECT — re-file only what the evidence
supports — without asking me. Do not invent evidence; cite only tokens that appear in real tool output.
Finish with a 3-5 sentence investigative narrative of the COUNCIL_VERIFIED findings.
EOF

echo "[autorun] CASE=$CASE model=${MODEL:-default} timeout=${TMO}s → $LOG"
ARGS=(-p "$PROMPT" --allowedTools "Bash" --output-format stream-json --verbose)
[ -n "$MODEL" ] && ARGS+=(--model "$MODEL")
CLAUDE_HOME="${COUNCILSIFT_CLAUDE_HOME:-$HOME}"
HOME="$CLAUDE_HOME" timeout "$TMO" claude "${ARGS[@]}" > "$LOG" 2>&1
rc=$?
echo "[autorun] $CASE done (rc=$rc); $(wc -l < "$LOG") transcript lines"
exit 0
