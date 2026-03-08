#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/exports/ops}"
mkdir -p "$OUT_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="${OUT_FILE:-$OUT_DIR/cost-baseline-${STAMP}.json}"
DB_PATH="${DB_PATH:-$ROOT_DIR/apps/web/.data/db.sqlite}"
AZ_SUBSCRIPTION_ID="${AZ_SUBSCRIPTION_ID:-}"
AZ_RESOURCE_GROUP="${AZ_RESOURCE_GROUP:-}"

queue_json="{}"
if [[ -f "$DB_PATH" ]] && command -v sqlite3 >/dev/null 2>&1; then
  queue_json="$(sqlite3 "$DB_PATH" <<'SQL'
SELECT json_object(
  'queued_jobs', (SELECT COUNT(*) FROM Job WHERE status='QUEUED'),
  'processing_jobs', (SELECT COUNT(*) FROM Job WHERE status='PROCESSING'),
  'failed_jobs', (SELECT COUNT(*) FROM Job WHERE status='FAILED'),
  'ready_items', (SELECT COUNT(*) FROM Item WHERE status='READY'),
  'failed_items', (SELECT COUNT(*) FROM Item WHERE status='FAILED')
);
SQL
)"
fi

cost_json="{}"
if [[ -n "$AZ_SUBSCRIPTION_ID" && -n "$AZ_RESOURCE_GROUP" ]] && command -v az >/dev/null 2>&1; then
  set +e
  cost_result="$(az costmanagement query \
    --scope "/subscriptions/${AZ_SUBSCRIPTION_ID}/resourceGroups/${AZ_RESOURCE_GROUP}" \
    --type Usage \
    --timeframe MonthToDate \
    --dataset-aggregation totalCost=Sum \
    --dataset-grouping name=ServiceName type=Dimension \
    -o json 2>/dev/null)"
  status=$?
  set -e
  if [[ $status -eq 0 && -n "$cost_result" ]]; then
    cost_json="$cost_result"
  fi
fi

cat > "$OUT_FILE" <<JSON
{
  "captured_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "queue_snapshot": $queue_json,
  "cost_snapshot": $cost_json,
  "inputs": {
    "db_path": "$DB_PATH",
    "subscription_id": "${AZ_SUBSCRIPTION_ID}",
    "resource_group": "${AZ_RESOURCE_GROUP}"
  }
}
JSON

echo "[cost-baseline-snapshot] wrote $OUT_FILE"
