# Azure Deployment (Durable VM Topology)

## Target architecture
- Compute: single Linux VM running:
  - `web` (Next.js)
  - `worker` (queue processor)
  - `python-tts` (Kokoro service)
  - optional `worker-overflow` (queue-pressure-triggered overflow lane)
- Durable data:
  - Azure PostgreSQL Flexible Server
  - Azure Blob Storage

This keeps compute cost-first while preserving data and media durability on VM loss.
Current right-sizing baseline for cost-control:
- VM SKU: `Standard_B2s`
- local TTS lane: fixed `TTS_WORKERS=1`

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

## Domain + DNS (production)
For canonical production URLs, use:
- apex canonical host: `articlepod.com`
- alias host: `www.articlepod.com` (redirected to apex)

At your registrar/DNS provider:
- `A` record: `articlepod.com` -> `<VM_IP>`
- `CNAME`: `www` -> `articlepod.com`
- TTL during cutover: `300` seconds (raise later after verification)

Pre-check from local machine:
```bash
dig +short articlepod.com
dig +short www.articlepod.com
```
Both should resolve to your VM endpoint before TLS automation.

## Sync code to VM (staging path)
Sync local repo to VM user-writable path:
```bash
TARGET_HOST="$VM_IP" \
TARGET_PATH="/home/azureuser/articlepod" \
TARGET_SSH_KEY="$HOME/.ssh/articlepod_azure" \
./scripts/azure/push-to-vm.sh
```
`push-to-vm.sh` excludes app-local `.env` files so VM runtime config only comes from `/etc/articlepod/articlepod.env`.
It now also uses SSH keep-alive plus rsync connect/I/O timeouts by default so stalled syncs fail fast instead of waiting indefinitely.

Optional timeout tuning:
```bash
PUSH_TO_VM_RSYNC_CONNECT_TIMEOUT=30 \
PUSH_TO_VM_RSYNC_TIMEOUT=300 \
PUSH_TO_VM_SSH_CONNECT_TIMEOUT=15 \
./scripts/azure/push-to-vm.sh
```

## VM bootstrap + promotion to runtime path
SSH into VM:
```bash
ssh -i "$HOME/.ssh/articlepod_azure" azureuser@"$VM_IP"
```

On VM:
```bash
sudo /home/azureuser/articlepod/scripts/azure/bootstrap-vm.sh
sudo STAGING_DIR="/home/azureuser/articlepod" \
  /home/azureuser/articlepod/scripts/azure/promote-runtime.sh
```

## One-time runtime naming migration (existing VMs only)
If the VM was previously deployed with legacy runtime names, run this once:
```bash
sudo /home/azureuser/articlepod/scripts/azure/migrate-runtime-naming.sh
```
This migrates runtime identity to canonical `articlepod` names while preserving legacy aliases for compatibility.

## Render runtime env
On VM, render `/etc/articlepod/articlepod.env`:
```bash
sudo DATABASE_URL="postgresql://articlepod_admin:<POSTGRES_PASSWORD>@${PG_NAME}.postgres.database.azure.com:5432/articlepod?sslmode=require" \
  APP_URL="https://articlepod.com" \
  STORAGE_BACKEND="azure_blob" \
  AZURE_STORAGE_CONTAINER="articlepod" \
  AZURE_STORAGE_CONNECTION_STRING="${STORAGE_CONNECTION_STRING}" \
  PYTHON_TTS_URL="http://127.0.0.1:8010" \
  TTS_WORKERS="1" \
  /opt/articlepod/scripts/azure/render-env.sh
```
Optional metadata mirror/canary flags:
```bash
METADATA_MIRROR_BACKEND="azure_table"
METADATA_MIRROR_DUAL_WRITE="1"
METADATA_CANARY_COMPARE="1"
AZURE_TABLE_CONNECTION_STRING="<TABLE_CONNECTION_STRING>"
WORKER_QUEUE_PRESSURE_SOURCE="prisma"
```
Optional low-cost diagnostic flags:
```bash
ANALYTICS_STORAGE_MODE="off"
JOB_EVENT_STORAGE_MODE="off"
DEMO_EXTRACTION_TRACE_ENABLED="0"
```
Defaults now include VM-safe runtime paths:
- `STORAGE_ROOT=/var/lib/articlepod/storage`
- `MEDIA_ROOT=/var/lib/articlepod/media`
- `UPLOAD_ROOT=/var/lib/articlepod/uploads`

## Deploy runtime + systemd services
On VM:
```bash
sudo /opt/articlepod/scripts/azure/deploy-vm-runtime.sh
sudo systemctl status --no-pager articlepod-python-tts articlepod-web articlepod-worker articlepod-worker-overflow
```

Notes:
- `deploy-vm-runtime.sh` now auto-provisions required python-tts language assets (`en_core_web_sm`, UniDic, NLTK corpora) when missing.
- `deploy-vm-runtime.sh` removes app-local `.env` files from runtime path and ensures VM runtime directories exist before service startup.
- `deploy-vm-runtime.sh` precomputes Kokoro voice previews during deployment so dashboard preview requests are instant.
- overflow worker service is installed but disabled by default (`ENABLE_OVERFLOW_WORKER_SERVICE=0`).
- enable overflow worker only when external overflow TTS is configured:
  - `sudo ENABLE_OVERFLOW_WORKER_SERVICE=1 /opt/articlepod/scripts/azure/install-systemd.sh`
  - `sudo systemctl restart articlepod-worker-overflow`
- `promote-runtime.sh` preserves `services/python-tts/.venv` so model assets are not dropped on every code sync.
- `promote-runtime.sh` preserves `.runtime/` and strips synced app-local `.env` files to avoid config/path drift across promotions.

## Configure ingress and TLS
On VM:
```bash
sudo CANONICAL_HOST="articlepod.com" HOST_ALIASES="www.articlepod.com" \
  /opt/articlepod/scripts/azure/configure-nginx.sh
sudo CANONICAL_HOST="articlepod.com" HOST_ALIASES="www.articlepod.com" LETSENCRYPT_EMAIL="<EMAIL>" \
  /opt/articlepod/scripts/azure/configure-tls.sh
```

Notes:
- `configure-nginx.sh` now self-heals `server_names_hash_*` sizing only when `nginx -t` reports `could not build server_names_hash`, by applying idempotent tuning in `/etc/nginx/nginx.conf`.
- Legacy managed hash files (`/etc/nginx/conf.d/<site>-server-names.conf`) are removed during reconfiguration to avoid duplicate directive failures with certbot-managed nginx restarts.

Verify health:
```bash
curl -sf "https://articlepod.com/api/health"
```

Verify redirects:
```bash
curl -I "http://www.articlepod.com/api/health"
curl -I "https://www.articlepod.com/api/health"
```
Expected: `301` redirect to `https://articlepod.com/...`.

Verify certificate SAN coverage:
```bash
echo | openssl s_client -servername articlepod.com -connect articlepod.com:443 2>/dev/null \
  | openssl x509 -noout -ext subjectAltName
```
Expected SAN entries include both `DNS:articlepod.com` and `DNS:www.articlepod.com`.

## Post-deploy validation
1. Log in on `https://articlepod.com/app` and copy a real feed token.
2. From local repo:
```bash
./scripts/verify_podcast_contract.sh "https://articlepod.com/rss/<feed_token>.xml"
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
One-command deploy from local machine:
```bash
TARGET_HOST="$VM_IP" \
CANONICAL_HOST="articlepod.com" \
HOST_ALIASES="www.articlepod.com" \
LETSENCRYPT_EMAIL="<EMAIL>" \
APP_URL="https://articlepod.com" \
TARGET_SSH_KEY="$HOME/.ssh/articlepod_azure" \
ENABLE_OVERFLOW_WORKER_SERVICE="0" \
  ./scripts/azure/deploy-changes.sh
```

## GitHub Actions deploy guardrails
`Deploy to Azure` now auto-runs on every push to `main` and enforces post-deploy smoke checks. Configure this secret in GitHub repository settings:
- `APP_SMOKE_FEED_TOKEN`: valid feed token for smoke validation.

The smoke gate verifies:
- `/api/health` returns `200`
- public branding assets (`/manifest.webmanifest`, `/apple-icon.png`, `/brand/brain-mark-192.png`) return `200`
- RSS + media contract via `scripts/verify_podcast_contract.sh`
- legacy `/api/media/...?...feed_token=...` HEAD `200` + Range `206`

Equivalent step-by-step flow:
From local repo:
```bash
TARGET_HOST="$VM_IP" \
TARGET_PATH="/home/azureuser/articlepod" \
TARGET_SSH_KEY="$HOME/.ssh/articlepod_azure" \
./scripts/azure/push-to-vm.sh
```

On VM:
```bash
sudo STAGING_DIR="/home/azureuser/articlepod" /opt/articlepod/scripts/azure/promote-runtime.sh
sudo /opt/articlepod/scripts/azure/deploy-vm-runtime.sh
sudo CANONICAL_HOST="articlepod.com" HOST_ALIASES="www.articlepod.com" /opt/articlepod/scripts/azure/configure-nginx.sh
sudo CANONICAL_HOST="articlepod.com" HOST_ALIASES="www.articlepod.com" LETSENCRYPT_EMAIL="<EMAIL>" /opt/articlepod/scripts/azure/configure-tls.sh
```
