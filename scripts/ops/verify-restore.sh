#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

SNAPSHOT_FILE="${SNAPSHOT_FILE:-./exports/ops/pre-drill-snapshot.json}"
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"

echo "[verify-restore] verifying db/storage against snapshot: $SNAPSHOT_FILE"
RUNTIME_PROFILE="${RUNTIME_PROFILE:-azure}" npx pnpm --filter @listenlater/web run ops:verify-restore -- --in "$SNAPSHOT_FILE"

echo "[verify-restore] running parity smoke + podcast contract"
BASE_URL="$BASE_URL" ./scripts/parity-smoke.sh

echo "[verify-restore] done"
