#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

RG="${AZURE_RESOURCE_GROUP:-rg-articlepod-prod-eastus}"
LOCATION="${AZURE_LOCATION:-eastus}"
VM_NAME="${VM_NAME:-articlepod-eastus-vm}"
PUBLIC_IP_NAME="${PUBLIC_IP_NAME:-articlepod-eastus-pip}"
NIC_NAME="${NIC_NAME:-articlepod-eastus-nic}"
VNET_NAME="${VNET_NAME:-articlepod-eastus-vnet}"
SUBNET_NAME="${SUBNET_NAME:-articlepod-app-subnet}"
NSG_NAME="${NSG_NAME:-articlepod-eastus-nsg}"
VM_SIZE="${VM_SIZE:-Standard_D2as_v5}"
ACR_NAME="${ACR_NAME:-articlepodacrdvlolaz43j6be}"
ACR_SKU="${ACR_SKU:-Basic}"
LOG_ANALYTICS_NAME="${LOG_ANALYTICS_NAME:-articlepod-aca-logs}"
CONTAINERAPP_ENV_NAME="${CONTAINERAPP_ENV_NAME:-articlepod-aca-env}"
ADMIN_USERNAME="${ADMIN_USERNAME:-azureuser}"
SSH_PUBLIC_KEY_PATH="${SSH_PUBLIC_KEY_PATH:-$HOME/.ssh/articlepod_azure.pub}"
DEPLOYMENT_NAME="${DEPLOYMENT_NAME:-articlepod-eastus-bluegreen}"
TAGS="${TAGS:-environment=production rollout=bluegreen region=eastus}"

usage() {
  cat <<EOF
Usage: scripts/azure/provision-eastus-bluegreen.sh [options]

Creates the eastus blue/green compute stack with:
- primary VM (D2as_v5)
- static Standard public IP + VNet + NSG
- Azure Container Registry
- Log Analytics workspace
- Container Apps environment

Options:
  --resource-group <name>       Resource group (default: ${RG})
  --location <region>           Azure region (default: ${LOCATION})
  --vm-name <name>              VM name (default: ${VM_NAME})
  --vm-size <sku>               VM size (default: ${VM_SIZE})
  --public-ip-name <name>       Public IP resource name
  --nic-name <name>             NIC resource name
  --vnet-name <name>            VNet resource name
  --subnet-name <name>          Subnet name
  --nsg-name <name>             NSG resource name
  --acr-name <name>             ACR name (default: ${ACR_NAME})
  --acr-sku <sku>               ACR SKU (default: ${ACR_SKU})
  --log-analytics-name <name>   Log Analytics workspace name
  --aca-env-name <name>         Container Apps environment name
  --admin-username <name>       VM admin username (default: ${ADMIN_USERNAME})
  --ssh-public-key-path <path>  SSH public key path (default: ${SSH_PUBLIC_KEY_PATH})
  --deployment-name <name>      Azure deployment name
  --tags "<k=v ...>"            Space-separated Azure tags
  -h, --help                    Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --resource-group|-g)
      RG="${2:-}"
      shift 2
      ;;
    --location|-l)
      LOCATION="${2:-}"
      shift 2
      ;;
    --vm-name)
      VM_NAME="${2:-}"
      shift 2
      ;;
    --vm-size)
      VM_SIZE="${2:-}"
      shift 2
      ;;
    --public-ip-name)
      PUBLIC_IP_NAME="${2:-}"
      shift 2
      ;;
    --nic-name)
      NIC_NAME="${2:-}"
      shift 2
      ;;
    --vnet-name)
      VNET_NAME="${2:-}"
      shift 2
      ;;
    --subnet-name)
      SUBNET_NAME="${2:-}"
      shift 2
      ;;
    --nsg-name)
      NSG_NAME="${2:-}"
      shift 2
      ;;
    --acr-name)
      ACR_NAME="${2:-}"
      shift 2
      ;;
    --acr-sku)
      ACR_SKU="${2:-}"
      shift 2
      ;;
    --log-analytics-name)
      LOG_ANALYTICS_NAME="${2:-}"
      shift 2
      ;;
    --aca-env-name)
      CONTAINERAPP_ENV_NAME="${2:-}"
      shift 2
      ;;
    --admin-username)
      ADMIN_USERNAME="${2:-}"
      shift 2
      ;;
    --ssh-public-key-path)
      SSH_PUBLIC_KEY_PATH="${2:-}"
      shift 2
      ;;
    --deployment-name)
      DEPLOYMENT_NAME="${2:-}"
      shift 2
      ;;
    --tags)
      TAGS="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI 'az' is required." >&2
  exit 1
fi

if [[ ! -f "$SSH_PUBLIC_KEY_PATH" ]]; then
  echo "Missing SSH public key: $SSH_PUBLIC_KEY_PATH" >&2
  exit 1
fi

ADMIN_PUBLIC_KEY="$(<"$SSH_PUBLIC_KEY_PATH")"

if ! az account show >/dev/null 2>&1; then
  echo "Azure CLI is not logged in. Run 'az login' first." >&2
  exit 1
fi

az provider register -n Microsoft.App --wait >/dev/null
az provider register -n Microsoft.OperationalInsights --wait >/dev/null

existing_acr_rg="$(az acr show -n "$ACR_NAME" --query resourceGroup -o tsv 2>/dev/null || true)"
if [[ -n "$existing_acr_rg" && "$existing_acr_rg" != "$RG" ]]; then
  echo "ACR name '$ACR_NAME' is already in use by resource group '$existing_acr_rg'." >&2
  exit 1
fi

if [[ -z "$existing_acr_rg" ]]; then
  acr_available="$(az acr check-name -n "$ACR_NAME" --query nameAvailable -o tsv)"
  if [[ "$acr_available" != "true" ]]; then
    echo "ACR name '$ACR_NAME' is not available." >&2
    exit 1
  fi
fi

az group create --name "$RG" --location "$LOCATION" --tags $TAGS >/dev/null

az deployment group create \
  --resource-group "$RG" \
  --name "$DEPLOYMENT_NAME" \
  --template-file "$ROOT_DIR/infra/eastus-bluegreen.bicep" \
  --parameters \
    location="$LOCATION" \
    adminUsername="$ADMIN_USERNAME" \
    adminPublicKey="$ADMIN_PUBLIC_KEY" \
    vmSize="$VM_SIZE" \
    vmName="$VM_NAME" \
    publicIpName="$PUBLIC_IP_NAME" \
    nicName="$NIC_NAME" \
    vnetName="$VNET_NAME" \
    subnetName="$SUBNET_NAME" \
    nsgName="$NSG_NAME" \
    acrName="$ACR_NAME" \
    acrSku="$ACR_SKU" \
    tags="{$(printf '%s' "$TAGS" | awk '{for(i=1;i<=NF;i++){split($i,a,"="); printf "\"%s\":\"%s\"%s", a[1], a[2], (i<NF?",":"")}}')}" \
  >/dev/null

az extension add --name containerapp --upgrade >/dev/null

az monitor log-analytics workspace create \
  --resource-group "$RG" \
  --workspace-name "$LOG_ANALYTICS_NAME" \
  --location "$LOCATION" \
  --tags $TAGS \
  >/dev/null

workspace_id="$(az monitor log-analytics workspace show -g "$RG" -n "$LOG_ANALYTICS_NAME" --query customerId -o tsv)"
workspace_key="$(az monitor log-analytics workspace get-shared-keys -g "$RG" -n "$LOG_ANALYTICS_NAME" --query primarySharedKey -o tsv)"

if ! az containerapp env show -g "$RG" -n "$CONTAINERAPP_ENV_NAME" >/dev/null 2>&1; then
  az containerapp env create \
    --resource-group "$RG" \
    --name "$CONTAINERAPP_ENV_NAME" \
    --location "$LOCATION" \
    --logs-workspace-id "$workspace_id" \
    --logs-workspace-key "$workspace_key" \
    >/dev/null
fi

vm_ip="$(az vm show -d -g "$RG" -n "$VM_NAME" --query publicIps -o tsv)"
vm_fqdn="$(az vm show -d -g "$RG" -n "$VM_NAME" --query fqdns -o tsv)"
acr_login_server="$(az acr show -g "$RG" -n "$ACR_NAME" --query loginServer -o tsv)"
aca_env_id="$(az containerapp env show -g "$RG" -n "$CONTAINERAPP_ENV_NAME" --query id -o tsv)"

cat <<EOF
export AZURE_RESOURCE_GROUP=$(printf '%q' "$RG")
export TARGET_HOST=$(printf '%q' "$vm_ip")
export TARGET_FQDN=$(printf '%q' "$vm_fqdn")
export TARGET_USER=$(printf '%q' "$ADMIN_USERNAME")
export ACR_NAME=$(printf '%q' "$ACR_NAME")
export ACR_LOGIN_SERVER=$(printf '%q' "$acr_login_server")
export CONTAINERAPP_ENV_NAME=$(printf '%q' "$CONTAINERAPP_ENV_NAME")
export CONTAINERAPP_ENV_ID=$(printf '%q' "$aca_env_id")
EOF
