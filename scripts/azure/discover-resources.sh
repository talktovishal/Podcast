#!/usr/bin/env bash
set -euo pipefail

RG="${AZURE_RESOURCE_GROUP:-}"
OPEN_FIREWALL=0
PRINT_CONNECTION_STRING=0
INCLUDE_OPENAI=0
PROVISION_OPENAI=0
RULE_NAME="${RULE_NAME:-allow-vm}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --resource-group|-g)
      RG="${2:-$RG}"
      shift 2
      ;;
    --open-firewall)
      OPEN_FIREWALL=1
      shift
      ;;
    --print-connection-string)
      PRINT_CONNECTION_STRING=1
      shift
      ;;
    --include-openai)
      INCLUDE_OPENAI=1
      shift
      ;;
    --provision-openai)
      INCLUDE_OPENAI=1
      PROVISION_OPENAI=1
      shift
      ;;
    --rule-name)
      RULE_NAME="${2:-$RULE_NAME}"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: scripts/azure/discover-resources.sh --resource-group <rg> [--open-firewall] [--print-connection-string] [--include-openai] [--provision-openai] [--rule-name <name>]"
      exit 2
      ;;
  esac
done

if [[ -z "$RG" ]]; then
  echo "Missing resource group. Set AZURE_RESOURCE_GROUP or pass --resource-group <rg>."
  exit 1
fi

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI 'az' is required."
  exit 1
fi

VM_NAME="$(az vm list -g "$RG" --query "[0].name" -o tsv)"
VM_IP="$(az vm show -d -g "$RG" -n "$VM_NAME" --query publicIps -o tsv)"
VM_FQDN="$(az vm show -d -g "$RG" -n "$VM_NAME" --query fqdns -o tsv)"
PG_NAME="$(az postgres flexible-server list -g "$RG" --query "[0].name" -o tsv)"
STORAGE_ACCOUNT="$(az storage account list -g "$RG" --query "[0].name" -o tsv)"

required_pairs=(
  "VM_NAME:$VM_NAME"
  "VM_IP:$VM_IP"
  "VM_FQDN:$VM_FQDN"
  "STORAGE_ACCOUNT:$STORAGE_ACCOUNT"
)

for pair in "${required_pairs[@]}"; do
  key="${pair%%:*}"
  value="${pair#*:}"
  if [[ -z "$value" ]]; then
    echo "Unable to resolve ${key} in resource group '${RG}'."
    exit 1
  fi
done

if [[ "$OPEN_FIREWALL" == "1" ]]; then
  if [[ -z "$PG_NAME" ]]; then
    echo "Unable to resolve PG_NAME in resource group '${RG}' for --open-firewall."
    exit 1
  fi
  az postgres flexible-server firewall-rule create \
    -g "$RG" \
    -n "$PG_NAME" \
    -r "$RULE_NAME" \
    --start-ip-address "$VM_IP" \
    --end-ip-address "$VM_IP" >/dev/null
fi

emit_export() {
  local key="$1"
  local value="$2"
  printf "export %s=%q\n" "$key" "$value"
}

emit_export "RG" "$RG"
emit_export "VM_NAME" "$VM_NAME"
emit_export "VM_IP" "$VM_IP"
emit_export "VM_FQDN" "$VM_FQDN"
emit_export "STORAGE_ACCOUNT" "$STORAGE_ACCOUNT"
if [[ -n "$PG_NAME" ]]; then
  emit_export "PG_NAME" "$PG_NAME"
fi

if [[ "$PRINT_CONNECTION_STRING" == "1" ]]; then
  STORAGE_CONNECTION_STRING="$(az storage account show-connection-string -g "$RG" -n "$STORAGE_ACCOUNT" --query connectionString -o tsv)"
  emit_export "STORAGE_CONNECTION_STRING" "$STORAGE_CONNECTION_STRING"
fi

if [[ "$OPEN_FIREWALL" == "1" ]]; then
  emit_export "POSTGRES_FIREWALL_RULE" "$RULE_NAME"
fi

if [[ "$INCLUDE_OPENAI" == "1" ]]; then
  if [[ "$PROVISION_OPENAI" == "1" ]]; then
    # shellcheck disable=SC1091
    eval "$("$(dirname "$0")/provision-openai.sh" --resource-group "$RG")"
  else
    OPENAI_ACCOUNT="$(az resource list -g "$RG" --resource-type Microsoft.CognitiveServices/accounts --query "[?kind=='OpenAI'] | [0].name" -o tsv)"
    if [[ -n "$OPENAI_ACCOUNT" ]]; then
      OPENAI_ENDPOINT="$(az cognitiveservices account show -g "$RG" -n "$OPENAI_ACCOUNT" --query properties.endpoint -o tsv)"
      AZURE_OPENAI_ACCOUNT="$OPENAI_ACCOUNT"
      AZURE_OPENAI_BASE_URL="$OPENAI_ENDPOINT"
    fi
  fi

  if [[ -n "${AZURE_OPENAI_ACCOUNT:-}" ]]; then
    emit_export "AZURE_OPENAI_ACCOUNT" "${AZURE_OPENAI_ACCOUNT}"
  fi
  if [[ -n "${AZURE_OPENAI_BASE_URL:-}" ]]; then
    emit_export "AZURE_OPENAI_BASE_URL" "${AZURE_OPENAI_BASE_URL}"
  fi
  if [[ -n "${AZURE_OPENAI_API_KEY:-}" ]]; then
    emit_export "AZURE_OPENAI_API_KEY" "${AZURE_OPENAI_API_KEY}"
  fi
  if [[ -n "${AZURE_OPENAI_SUMMARY_NANO_DEPLOYMENT:-}" ]]; then
    emit_export "AZURE_OPENAI_SUMMARY_NANO_DEPLOYMENT" "${AZURE_OPENAI_SUMMARY_NANO_DEPLOYMENT}"
  fi
  if [[ -n "${AZURE_OPENAI_SUMMARY_MINI_DEPLOYMENT:-}" ]]; then
    emit_export "AZURE_OPENAI_SUMMARY_MINI_DEPLOYMENT" "${AZURE_OPENAI_SUMMARY_MINI_DEPLOYMENT}"
  fi
fi
