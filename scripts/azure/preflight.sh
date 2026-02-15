#!/usr/bin/env bash
set -euo pipefail

KEY_PATH="${KEY_PATH:-$HOME/.ssh/articlepod_azure}"
SUBSCRIPTION="${SUBSCRIPTION:-}"
CREATE_KEY=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --subscription)
      SUBSCRIPTION="${2:-$SUBSCRIPTION}"
      shift 2
      ;;
    --key-path)
      KEY_PATH="${2:-$KEY_PATH}"
      shift 2
      ;;
    --no-create-key)
      CREATE_KEY=0
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: scripts/azure/preflight.sh [--subscription <id-or-name>] [--key-path <path>] [--no-create-key]"
      exit 2
      ;;
  esac
done

required_cmds=(az azd ssh-keygen rsync)
for cmd in "${required_cmds[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    exit 1
  fi
done

if ! az account show >/dev/null 2>&1; then
  echo "Azure CLI is not logged in. Run: az login"
  exit 1
fi

if [[ -n "$SUBSCRIPTION" ]]; then
  az account set --subscription "$SUBSCRIPTION"
fi

if [[ ! -f "${KEY_PATH}.pub" ]]; then
  if [[ "$CREATE_KEY" == "1" ]]; then
    mkdir -p "$(dirname "$KEY_PATH")"
    ssh-keygen -t ed25519 -f "$KEY_PATH" -C "articlepod-azure" -N ""
  else
    echo "Missing SSH public key: ${KEY_PATH}.pub"
    exit 1
  fi
fi

ACCOUNT_NAME="$(az account show --query name -o tsv)"
ACCOUNT_ID="$(az account show --query id -o tsv)"

echo "AZURE_ACCOUNT_NAME=$ACCOUNT_NAME"
echo "AZURE_SUBSCRIPTION_ID=$ACCOUNT_ID"
echo "SSH_PUBLIC_KEY_PATH=${KEY_PATH}.pub"
