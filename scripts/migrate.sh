#!/usr/bin/env bash
# Apply claw-memory-core Neo4j migrations to the ISOLATED Council-SIFT graph.
# Runs cypher-shell INSIDE the Docker container (no host cypher-shell needed).
set -euo pipefail
CONTAINER="${COUNCILSIFT_NEO4J_CONTAINER:-councilsift-neo4j}"
NUSER="${NEO4J_USER:-neo4j}"
NPASS="${NEO4J_PASSWORD:-councilsiftpw}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../claw-memory-core/scripts/migrations" && pwd)"

# Make bare DROP CONSTRAINT idempotent on a fresh DB (same fix as upstream run-migrations.sh).
inject() { sed -E 's/(DROP CONSTRAINT [a-zA-Z_][a-zA-Z0-9_]*)([[:space:]]*;|[[:space:]]*$)/\1 IF EXISTS\2/I'; }

shopt -s nullglob
count=0
for f in $(ls "$DIR"/m*.cypher | sort); do
  echo "[migrate] $(basename "$f")"
  if ! inject < "$f" | docker exec -i "$CONTAINER" cypher-shell -u "$NUSER" -p "$NPASS" --fail-fast >/dev/null; then
    echo "[migrate] FAILED on $(basename "$f")" >&2; exit 2
  fi
  count=$((count+1))
done
echo "[migrate] applied $count migrations to $CONTAINER"
