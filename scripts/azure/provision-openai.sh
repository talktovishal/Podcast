#!/usr/bin/env bash
set -euo pipefail

RG="${AZURE_RESOURCE_GROUP:-}"
ACCOUNT_NAME="${AZURE_OPENAI_ACCOUNT:-}"
LOCATION="${AZURE_OPENAI_LOCATION:-eastus}"
PREFIX="${AZURE_OPENAI_PREFIX:-articlepod}"
NANO_DEPLOYMENT="${AZURE_OPENAI_SUMMARY_NANO_DEPLOYMENT:-digest-summary-nano}"
MINI_DEPLOYMENT="${AZURE_OPENAI_SUMMARY_MINI_DEPLOYMENT:-digest-summary-mini}"
DEPLOYMENT_SKU="${AZURE_OPENAI_DEPLOYMENT_SKU:-GlobalStandard}"

usage() {
  cat <<EOF
Usage: scripts/azure/provision-openai.sh --resource-group <rg> [options]

Creates or reuses an Azure OpenAI account and summary deployments, then prints shell exports.

Options:
  --resource-group, -g <rg>   Azure resource group (required unless AZURE_RESOURCE_GROUP is set)
  --account <name>            Azure OpenAI account name to reuse
  --location <region>         Azure OpenAI region (default: eastus)
  --prefix <value>            Prefix for derived account names (default: articlepod)
  --nano-deployment <name>    Deployment name for nano summary model
  --mini-deployment <name>    Deployment name for mini summary model
  --deployment-sku <name>     Deployment SKU (default: GlobalStandard)
  -h, --help                  Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --resource-group|-g)
      RG="${2:-}"
      shift 2
      ;;
    --account)
      ACCOUNT_NAME="${2:-}"
      shift 2
      ;;
    --location)
      LOCATION="${2:-}"
      shift 2
      ;;
    --prefix)
      PREFIX="${2:-}"
      shift 2
      ;;
    --nano-deployment)
      NANO_DEPLOYMENT="${2:-}"
      shift 2
      ;;
    --mini-deployment)
      MINI_DEPLOYMENT="${2:-}"
      shift 2
      ;;
    --deployment-sku)
      DEPLOYMENT_SKU="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
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

hash_short() {
  local raw="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    printf "%s" "$raw" | sha256sum | awk '{print substr($1,1,10)}'
  else
    printf "%s" "$raw" | shasum -a 256 | awk '{print substr($1,1,10)}'
  fi
}

derive_account_name() {
  local seed
  seed="$(az group show -n "$RG" --query id -o tsv)"
  local compact_prefix
  compact_prefix="$(printf "%s" "${PREFIX}aoai" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]')"
  printf "%s%s" "$compact_prefix" "$(hash_short "$seed")" | cut -c1-64
}

emit_export() {
  local key="$1"
  local value="$2"
  printf "export %s=%q\n" "$key" "$value"
}

find_existing_account() {
  az resource list \
    -g "$RG" \
    --resource-type Microsoft.CognitiveServices/accounts \
    --query "[?kind=='OpenAI'] | [0].name" \
    -o tsv
}

ensure_account() {
  if [[ -z "$ACCOUNT_NAME" ]]; then
    ACCOUNT_NAME="$(find_existing_account)"
  fi

  if [[ -z "$ACCOUNT_NAME" ]]; then
    ACCOUNT_NAME="$(derive_account_name)"
  fi

  if az cognitiveservices account show -g "$RG" -n "$ACCOUNT_NAME" >/dev/null 2>&1; then
    return 0
  fi

  az cognitiveservices account create \
    --resource-group "$RG" \
    --name "$ACCOUNT_NAME" \
    --location "$LOCATION" \
    --kind OpenAI \
    --sku S0 \
    --custom-domain "$ACCOUNT_NAME" \
    --yes \
    --only-show-errors >/dev/null
}

deployment_exists() {
  local deployment_name="$1"
  local found
  found="$(az cognitiveservices account deployment list -g "$RG" -n "$ACCOUNT_NAME" --query "[?name=='${deployment_name}'] | [0].name" -o tsv)"
  [[ "$found" == "$deployment_name" ]]
}

create_deployment() {
  local deployment_name="$1"
  local model_name="$2"
  local model_version="$3"

  az cognitiveservices account deployment create \
    --resource-group "$RG" \
    --name "$ACCOUNT_NAME" \
    --deployment-name "$deployment_name" \
    --model-format OpenAI \
    --model-name "$model_name" \
    --model-version "$model_version" \
    --sku-name "$DEPLOYMENT_SKU" \
    --sku-capacity 1 \
    --only-show-errors >/dev/null
}

ensure_deployment_with_fallback() {
  local deployment_name="$1"
  local primary_model="$2"
  local primary_version="$3"
  local fallback_model="$4"
  local fallback_version="$5"

  if deployment_exists "$deployment_name"; then
    return 0
  fi

  if create_deployment "$deployment_name" "$primary_model" "$primary_version" 2>/dev/null; then
    return 0
  fi

  create_deployment "$deployment_name" "$fallback_model" "$fallback_version"
}

ensure_account
ensure_deployment_with_fallback "$NANO_DEPLOYMENT" "gpt-5-nano" "2025-08-07" "gpt-4.1-nano" "2025-04-14"
ensure_deployment_with_fallback "$MINI_DEPLOYMENT" "gpt-5-mini" "2025-08-07" "gpt-4.1-mini" "2025-04-14"

OPENAI_ENDPOINT="$(az cognitiveservices account show -g "$RG" -n "$ACCOUNT_NAME" --query properties.endpoint -o tsv)"
OPENAI_API_KEY="$(az cognitiveservices account keys list -g "$RG" -n "$ACCOUNT_NAME" --query key1 -o tsv)"

emit_export "AZURE_OPENAI_ACCOUNT" "$ACCOUNT_NAME"
emit_export "AZURE_OPENAI_BASE_URL" "$OPENAI_ENDPOINT"
emit_export "AZURE_OPENAI_API_KEY" "$OPENAI_API_KEY"
emit_export "AZURE_OPENAI_SUMMARY_NANO_DEPLOYMENT" "$NANO_DEPLOYMENT"
emit_export "AZURE_OPENAI_SUMMARY_MINI_DEPLOYMENT" "$MINI_DEPLOYMENT"
