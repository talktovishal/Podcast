#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SQLITE_URL="${SQLITE_URL:-file:./apps/web/.data/db.sqlite}"
POSTGRES_URL="${POSTGRES_URL:-}"
OUT_FILE="${OUT_FILE:-./exports/migrations/sqlite-export.json}"
TRUNCATE_TARGET="${TRUNCATE_TARGET:-1}"

print_usage() {
  cat <<USAGE
Usage: scripts/migrate-sqlite-to-postgres.sh --postgres-url <postgres-url> [--sqlite-url <sqlite-url>] [--out <export-json>] [--no-truncate]

Exports data from SQLite profile, then imports into PostgreSQL profile.

Options:
  --postgres-url  Target PostgreSQL DATABASE_URL (required)
  --sqlite-url    Source SQLite DATABASE_URL (default: file:./apps/web/.data/db.sqlite)
  --out           Export JSON path (default: ./exports/migrations/sqlite-export.json)
  --no-truncate   Do not clear target tables before import
  -h, --help      Show this help text
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --postgres-url)
      POSTGRES_URL="${2:-}"
      shift 2
      ;;
    --sqlite-url)
      SQLITE_URL="${2:-$SQLITE_URL}"
      shift 2
      ;;
    --out)
      OUT_FILE="${2:-$OUT_FILE}"
      shift 2
      ;;
    --no-truncate)
      TRUNCATE_TARGET="0"
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      print_usage
      exit 2
      ;;
  esac
done

if [[ -z "$POSTGRES_URL" ]]; then
  echo "Error: --postgres-url is required"
  print_usage
  exit 2
fi

echo "[migration] exporting from SQLite: $SQLITE_URL"
RUNTIME_PROFILE=simple DATABASE_URL="$SQLITE_URL" node ./scripts/prisma-profile.mjs generate
RUNTIME_PROFILE=simple DATABASE_URL="$SQLITE_URL" npx pnpm --filter @articlepod/web run db:export-json -- --out "$OUT_FILE"

echo "[migration] importing into PostgreSQL"
RUNTIME_PROFILE=parity DATABASE_URL="$POSTGRES_URL" node ./scripts/prisma-profile.mjs generate
if [[ "$TRUNCATE_TARGET" == "1" ]]; then
  RUNTIME_PROFILE=parity DATABASE_URL="$POSTGRES_URL" npx pnpm --filter @articlepod/web run db:import-json -- --in "$OUT_FILE" --truncate
else
  RUNTIME_PROFILE=parity DATABASE_URL="$POSTGRES_URL" npx pnpm --filter @articlepod/web run db:import-json -- --in "$OUT_FILE"
fi

echo "[migration] completed"
echo "[migration] export snapshot: $OUT_FILE"
