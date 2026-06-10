#!/usr/bin/env bash
# Launch the Council-SIFT analyst as a Claude Code agent.
# Tools (sift / csift / council) are placed on PATH; analyst/CLAUDE.md is the operating contract.
# Requires: an authenticated Claude Code ('claude' on PATH) and the isolated Neo4j (scripts/migrate.sh).
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HERE/bin:$PATH"
cd "$HERE/analyst" || exit 1
if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: 'claude' (Claude Code) not found on PATH. Install + authenticate it, then re-run." >&2
  echo "Tools are ready: $(command -v sift) $(command -v csift) $(command -v council)" >&2
  exit 1
fi
echo "Council-SIFT analyst → Claude Code (tools: sift, csift, council). Operating contract: analyst/CLAUDE.md"
echo "Tell the agent: the case id, the evidence path, and 'investigate and submit findings to the Council.'"
exec claude "$@"
