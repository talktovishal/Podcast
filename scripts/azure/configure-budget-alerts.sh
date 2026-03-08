#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/azure/configure-budget-alerts.sh \
    --subscription-id <id> \
    --resource-group <name> \
    --monthly-budget-usd <amount> \
    --contact-email <email> \
    [--budget-prefix articlepod] \
    [--start-date YYYY-MM-01] \
    [--end-date YYYY-MM-DD]

Creates/updates two Azure Cost Management budgets:
  1) subscription scope budget
  2) resource-group scope budget
with both actual and forecasted alert thresholds.
USAGE
}

SUBSCRIPTION_ID=""
RESOURCE_GROUP=""
BUDGET_PREFIX="articlepod"
MONTHLY_BUDGET_USD=""
CONTACT_EMAIL=""
START_DATE="$(date -u +%Y-%m-01)"
END_DATE="2030-12-31"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --subscription-id)
      SUBSCRIPTION_ID="$2"
      shift 2
      ;;
    --resource-group)
      RESOURCE_GROUP="$2"
      shift 2
      ;;
    --monthly-budget-usd)
      MONTHLY_BUDGET_USD="$2"
      shift 2
      ;;
    --contact-email)
      CONTACT_EMAIL="$2"
      shift 2
      ;;
    --budget-prefix)
      BUDGET_PREFIX="$2"
      shift 2
      ;;
    --start-date)
      START_DATE="$2"
      shift 2
      ;;
    --end-date)
      END_DATE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$SUBSCRIPTION_ID" || -z "$RESOURCE_GROUP" || -z "$MONTHLY_BUDGET_USD" || -z "$CONTACT_EMAIL" ]]; then
  echo "Missing required arguments." >&2
  usage
  exit 2
fi

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI ('az') is required." >&2
  exit 1
fi

create_budget() {
  local scope="$1"
  local budget_name="$2"

  local payload
  payload="$(cat <<JSON
{
  "properties": {
    "category": "Cost",
    "amount": ${MONTHLY_BUDGET_USD},
    "timeGrain": "Monthly",
    "timePeriod": {
      "startDate": "${START_DATE}T00:00:00Z",
      "endDate": "${END_DATE}T00:00:00Z"
    },
    "notifications": {
      "actual-80": {
        "enabled": true,
        "operator": "GreaterThan",
        "threshold": 80,
        "thresholdType": "Actual",
        "contactEmails": ["${CONTACT_EMAIL}"]
      },
      "actual-100": {
        "enabled": true,
        "operator": "GreaterThan",
        "threshold": 100,
        "thresholdType": "Actual",
        "contactEmails": ["${CONTACT_EMAIL}"]
      },
      "forecast-100": {
        "enabled": true,
        "operator": "GreaterThan",
        "threshold": 100,
        "thresholdType": "Forecasted",
        "contactEmails": ["${CONTACT_EMAIL}"]
      }
    }
  }
}
JSON
)"

  echo "[configure-budget-alerts] upserting budget '${budget_name}' at scope '${scope}'"
  az rest \
    --method put \
    --url "https://management.azure.com${scope}/providers/Microsoft.Consumption/budgets/${budget_name}?api-version=2023-05-01" \
    --body "$payload" \
    --output none
}

SUB_SCOPE="/subscriptions/${SUBSCRIPTION_ID}"
RG_SCOPE="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}"

create_budget "$SUB_SCOPE" "${BUDGET_PREFIX}-subscription-monthly"
create_budget "$RG_SCOPE" "${BUDGET_PREFIX}-rg-monthly"

echo "[configure-budget-alerts] done"
