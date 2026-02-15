# Azure Deployment (Durable VM Topology)

## Target architecture
- Compute: single Linux VM running:
  - `web` (Next.js)
  - `worker` (queue processor)
  - `python-tts` (Kokoro service)
- Durable data:
  - Azure PostgreSQL Flexible Server
  - Azure Blob Storage

This keeps compute cost-first while preserving data and media durability on VM loss.

## Prerequisites (local)
From repo root:
```bash
./scripts/azure/preflight.sh --subscription "<SUBSCRIPTION_ID_OR_NAME>"
```

The preflight script verifies:
- `az`, `azd`, `rsync`, `ssh-keygen`
- active Azure login
- SSH key at `~/.ssh/articlepod_azure(.pub)` (creates if missing)

## Infrastructure provisioning (IaC)
Template inputs:
- `infra/main.bicep`
- `azure.yaml`

Provision:
```bash
azd env new articlepod-prod
azd up
azd env refresh
```

Capture the resource group:
```bash
azd env get-values | rg "^AZURE_RESOURCE_GROUP="
```

Optional drift review:
```bash
az deployment group what-if \
  --resource-group <resource-group> \
  --template-file infra/main.bicep \
  --parameters @infra/main.parameters.json
```

## Discover resources + open PostgreSQL firewall
```bash
RG="<AZURE_RESOURCE_GROUP>"
eval "$(./scripts/azure/discover-resources.sh \
  --resource-group "$RG" \
  --open-firewall \
  --print-connection-string)"
```

This exports:
- `VM_NAME`, `VM_IP`, `VM_FQDN`
- `PG_NAME`
- `STORAGE_ACCOUNT`
- `STORAGE_CONNECTION_STRING` (secret)

## Sync code to VM (staging path)
Sync local repo to VM user-writable path:
```bash
TARGET_HOST="$VM_IP" \
TARGET_PATH="/home/azureuser/listenlater" \
TARGET_SSH_KEY="$HOME/.ssh/articlepod_azure" \
./scripts/azure/push-to-vm.sh
```

## VM bootstrap + promotion to runtime path
SSH into VM:
```bash
ssh -i "$HOME/.ssh/articlepod_azure" azureuser@"$VM_IP"
```

On VM:
```bash
sudo /home/azureuser/listenlater/scripts/azure/bootstrap-vm.sh
sudo STAGING_DIR="/home/azureuser/listenlater" \
  /home/azureuser/listenlater/scripts/azure/promote-runtime.sh
```

## Render runtime env
On VM, render `/etc/listenlater/listenlater.env`:
```bash
sudo DATABASE_URL="postgresql://articlepod_admin:<POSTGRES_PASSWORD>@${PG_NAME}.postgres.database.azure.com:5432/articlepod?sslmode=require" \
  APP_URL="https://${VM_FQDN}" \
  STORAGE_BACKEND="azure_blob" \
  AZURE_STORAGE_CONTAINER="articlepod" \
  AZURE_STORAGE_CONNECTION_STRING="${STORAGE_CONNECTION_STRING}" \
  PYTHON_TTS_URL="http://127.0.0.1:8010" \
  /opt/listenlater/scripts/azure/render-env.sh
```

## Deploy runtime + systemd services
On VM:
```bash
sudo /opt/listenlater/scripts/azure/deploy-vm-runtime.sh
sudo systemctl status --no-pager listenlater-python-tts listenlater-web listenlater-worker
```

Notes:
- `deploy-vm-runtime.sh` now auto-provisions required python-tts language assets (`en_core_web_sm`, UniDic, NLTK corpora) when missing.
- `promote-runtime.sh` preserves `services/python-tts/.venv` so model assets are not dropped on every code sync.

## Configure ingress and TLS
On VM:
```bash
sudo PUBLIC_HOST="$VM_FQDN" /opt/listenlater/scripts/azure/configure-nginx.sh
sudo PUBLIC_HOST="$VM_FQDN" LETSENCRYPT_EMAIL="<EMAIL>" \
  /opt/listenlater/scripts/azure/configure-tls.sh
```

Verify health:
```bash
curl -sf "https://${VM_FQDN}/api/health"
```

## Post-deploy validation
1. Log in on `https://${VM_FQDN}/app` and copy a real feed token.
2. From local repo:
```bash
./scripts/verify_podcast_contract.sh "https://${VM_FQDN}/rss/<feed_token>.xml"
```
3. Confirm:
- feed `HEAD` -> `200`
- media `HEAD` -> `200`
- media range `GET` -> `206 Partial Content`

## Durability drill evidence
From local repo:
```bash
npm run ops:pre-drill-snapshot
```

Simulate VM loss/replacement, re-run deploy, then:
```bash
npm run ops:verify-restore
```

Record evidence in:
- `docs/operations.md` signed durability drill template
- `docs/release-checklist.md` release evidence template

## Ongoing deployment loop
From local repo:
```bash
TARGET_HOST="$VM_IP" \
TARGET_PATH="/home/azureuser/listenlater" \
TARGET_SSH_KEY="$HOME/.ssh/articlepod_azure" \
./scripts/azure/push-to-vm.sh
```

On VM:
```bash
sudo STAGING_DIR="/home/azureuser/listenlater" /opt/listenlater/scripts/azure/promote-runtime.sh
sudo /opt/listenlater/scripts/azure/deploy-vm-runtime.sh
```
