#!/usr/bin/env bash
# run-migrations.sh — apply all claw-memory Neo4j migrations in order.
#
# R-packaging-phase1 B3 (Raguel + Zadkiel + Barachiel convergent, 2026-05-30):
# m013 (compound MC/SM/IM constraint) and m014 (compound VR constraint) open with
# bare DROP CONSTRAINT statements. On a fresh Neo4j where the old single-property
# constraints have never existed, those DROPs throw ConstraintNotFound and abort
# the migration mid-stream — leaving the compound constraints uncreated and the
# graph silently weaker than intended. This runner injects `IF EXISTS` into every
# bare DROP CONSTRAINT statement before execution so the migration is safe on
# both fresh installs and upgrade paths.
#
# Usage:
#   bash claw-memory/scripts/run-migrations.sh
#
# Environment:
#   NEO4J_URI       (REQUIRED — no default; prevents accidental Leonardo/Council graph mixups)
#   NEO4J_USER      (REQUIRED — no default)
#   NEO4J_PASSWORD  (REQUIRED — no default)
#   MIGRATIONS_DIR  (default: <this-script>/migrations)
#   DRY_RUN         (default: 0; set to 1 to print transformed SQL without executing)
#
# Exit codes:
#   0  — all migrations applied successfully
#   1  — usage / config error
#   2  — migration failure (first failing file's stderr is printed)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$SCRIPT_DIR/migrations}"
DRY_RUN="${DRY_RUN:-0}"

if [[ -z "${NEO4J_URI:-}" ]]; then
  echo "ERROR: NEO4J_URI is not set; refusing to guess a graph endpoint." >&2
  echo "Source the intended env file first, e.g.:" >&2
  echo "  set -a; source claw-memory/.env; set +a; bash claw-memory/scripts/run-migrations.sh" >&2
  exit 1
fi
if [[ -z "${NEO4J_USER:-}" ]]; then
  echo "ERROR: NEO4J_USER is not set." >&2
  exit 1
fi

if [[ -z "${NEO4J_PASSWORD:-}" ]]; then
  echo "ERROR: NEO4J_PASSWORD is not set." >&2
  echo "" >&2
  echo "Set it before running:" >&2
  echo "  export NEO4J_PASSWORD=<your-password>" >&2
  echo "  bash claw-memory/scripts/run-migrations.sh" >&2
  echo "" >&2
  echo "Or source your env file first:" >&2
  echo "  set -a; source claw-memory/.env; set +a; bash claw-memory/scripts/run-migrations.sh" >&2
  exit 1
fi

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "ERROR: Migrations directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

if ! command -v cypher-shell >/dev/null 2>&1; then
  echo "ERROR: cypher-shell not found in PATH." >&2
  echo "Install Neo4j Server (which bundles cypher-shell), or install neo4j-cypher-shell separately." >&2
  exit 1
fi

# Inject IF EXISTS into bare DROP CONSTRAINT statements. Idempotent — if IF EXISTS
# is already present, the regex leaves it alone. Operates on stdin → stdout so the
# transformation streams cleanly to cypher-shell without writing a temp file.
#
# Pattern: matches `DROP CONSTRAINT <name>;` or `DROP CONSTRAINT <name>` (no semicolon
# yet because the line continues on the next line) where <name> is not already followed
# by IF EXISTS.
inject_if_exists() {
  sed -E 's/(DROP CONSTRAINT [a-zA-Z_][a-zA-Z0-9_]*)([[:space:]]*;|[[:space:]]*$)/\1 IF EXISTS\2/I'
}

# Find migration files, sort lexicographically (m001 < m002 < ... < m016)
mapfile -t MIGRATION_FILES < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name "m*.cypher" -type f | sort)

if [[ ${#MIGRATION_FILES[@]} -eq 0 ]]; then
  echo "ERROR: No m*.cypher files found in $MIGRATIONS_DIR" >&2
  exit 1
fi

echo "[run-migrations] discovered ${#MIGRATION_FILES[@]} migration files"
echo "[run-migrations] target: $NEO4J_URI (user: $NEO4J_USER)"
echo "[run-migrations] dry-run: $DRY_RUN"
echo ""

applied=0
for f in "${MIGRATION_FILES[@]}"; do
  name="$(basename "$f")"
  echo "[run-migrations] applying $name ..."

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "--- transformed SQL (dry-run; NOT executed): ---"
    inject_if_exists < "$f"
    echo "--- end ---"
    echo ""
    applied=$((applied + 1))
    continue
  fi

  # Stream the transformed SQL into cypher-shell. --fail-fast aborts on first error
  # so we don't continue past a broken migration.
  if ! inject_if_exists < "$f" | cypher-shell \
       --address "$NEO4J_URI" \
       --username "$NEO4J_USER" \
       --password "$NEO4J_PASSWORD" \
       --fail-fast 2>&1; then
    echo "" >&2
    echo "ERROR: migration $name failed. Run with DRY_RUN=1 to inspect the transformed SQL." >&2
    exit 2
  fi
  applied=$((applied + 1))
  echo "[run-migrations] $name OK"
done

echo ""
echo "[run-migrations] DONE — $applied migrations applied successfully"
echo ""
echo "Verify compound constraints landed:"
echo "  cypher-shell -u \$NEO4J_USER -p \$NEO4J_PASSWORD 'SHOW CONSTRAINTS YIELD name, labelsOrTypes, properties WHERE name CONTAINS \"tenant_unique\";'"
echo ""
echo "Verify fulltext index online:"
echo "  cypher-shell -u \$NEO4J_USER -p \$NEO4J_PASSWORD 'SHOW INDEXES YIELD name, state WHERE name = \"memory_content_fulltext\";'"
