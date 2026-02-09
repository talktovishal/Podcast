#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

OUT_FILE="${OUT_FILE:-./exports/ops/pre-drill-snapshot.json}"

echo "[pre-drill-snapshot] capturing baseline snapshot to $OUT_FILE"
RUNTIME_PROFILE="${RUNTIME_PROFILE:-azure}" npx pnpm --filter @listenlater/web run ops:snapshot -- --out "$OUT_FILE"

echo "[pre-drill-snapshot] done"
