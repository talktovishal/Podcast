# Azure Deployment (Durable VM Topology)

## Target architecture
- Primary compute: single `eastus` Linux VM running:
  - `web` (Next.js)
  - `worker` (queue processor, `WORKER_ROLE=primary`)
  - `python-tts` (Kokoro service, `TTS_WORKERS=1`)
- Overflow compute: private Azure Container Apps app in `eastus` running:
  - `worker` (`WORKER_ROLE=overflow`)
  - `python-tts` sidecar (`TTS_WORKERS=1`)
- Durable data:
  - Azure Table (primary operational metadata when `METADATA_PRIMARY_BACKEND=azure_table`)
  - Azure Blob Storage
- Azure OpenAI summary inference:
  - Azure OpenAI account in `eastus`
  - `digest-summary-nano` deployment for `5`/`15` minute summary runs
  - `digest-summary-mini` deployment for `30` minute runs and nano fallback
- Auxiliary local state:
  - SQLite on the primary VM for low-cost/admin-only data that does not need to live in Azure Table

This keeps compute cost-first while preserving data and media durability on VM loss.
Current blue/green cutover target:
- primary VM SKU: `Standard_D2as_v5`
- overflow app: Azure Container Apps Consumption, `minReplicas=0`, `maxReplicas=1`
- no PostgreSQL in the new eastus resource group
- local TTS lane remains fixed at `TTS_WORKERS=1` on both the primary VM and the overflow sidecar

Latest verified production state:
- 2026-03-17: `articlepod.com` was redeployed in fresh-start low-cost mode with Azure Table primary metadata, Azure Blob artifact storage, and local auxiliary SQLite.
- 2026-03-17: managed PostgreSQL was stopped after live feed/media contract checks passed (`HEAD 200`, media `206`).
- 2026-04-10: eastus blue/green prestage created `rg-articlepod-prod-eastus`, `articlepod-eastus-vm`, `articlepod-aca-env`, and `articlepodacrdvlolaz43j6be` with no PostgreSQL resources.

## Prerequisites (local)
From repo root:
```bash
./scripts/azure/preflight.sh --subscription "<SUBSCRIPTION_ID_OR_NAME>"
```

The preflight script verifies:
- `az`, `azd`, `rsync`, `ssh-keygen`
- active Azure login
- SSH key at `~/.ssh/articlepod_azure(.pub)` (creates if missing)

VM bootstrap now also provisions swap by default on Azure hosts. Keep swap enabled on the primary VM so local `python-tts` stays resilient during long synthesis runs.

## Eastus blue/green provisioning
Use the dedicated eastus template and helper for this rollout. Do not use `infra/main.bicep` as-is for the cutover, because it still models the older PostgreSQL-backed topology.

Provision the new resource group, VM, ACR, Log Analytics workspace, and ACA environment:
```bash
./scripts/azure/provision-eastus-bluegreen.sh
```

Defaults:
- resource group: `rg-articlepod-prod-eastus`
- VM: `articlepod-eastus-vm`
- public IP: `articlepod-eastus-pip`
- NIC: `articlepod-eastus-nic`
- VNet: `articlepod-eastus-vnet`
- NSG: `articlepod-eastus-nsg`
- ACR: `articlepodacrdvlolaz43j6be`
- Log Analytics: `articlepod-aca-logs`
- ACA environment: `articlepod-aca-env`

Capture the new VM IP/FQDN after the helper completes:
```bash
az vm show -d -g rg-articlepod-prod-eastus -n articlepod-eastus-vm \
  --query '{ip:publicIps,fqdn:fqdns}' -o json
```

## Historical single-VM provisioning (legacy)
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

## Discover resources
```bash
RG="<AZURE_RESOURCE_GROUP>"
eval "$(./scripts/azure/discover-resources.sh \
  --resource-group "$RG" \
  --print-connection-string \
  --include-openai)"
```

This exports:
- `VM_NAME`, `VM_IP`, `VM_FQDN`
- `PG_NAME`
- `STORAGE_ACCOUNT`
- `STORAGE_CONNECTION_STRING` (secret)
- optionally `AZURE_OPENAI_ACCOUNT`, `AZURE_OPENAI_BASE_URL`

Notes:
- `PG_NAME` is only needed if you are still keeping PostgreSQL around for rollback/canary work.
- In the low-cost Azure Table primary path, PostgreSQL is not required for day-to-day runtime.

## Azure OpenAI provisioning
Provision or reuse Azure OpenAI resources in the production resource group:
```bash
RG="<AZURE_RESOURCE_GROUP>"
eval "$(./scripts/azure/provision-openai.sh --resource-group "$RG")"
```

This exports:
- `AZURE_OPENAI_ACCOUNT`
- `AZURE_OPENAI_BASE_URL`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_SUMMARY_NANO_DEPLOYMENT`
- `AZURE_OPENAI_SUMMARY_MINI_DEPLOYMENT`

Notes:
- The production Azure OpenAI account already lives in `eastus`, which is also the target region for the blue/green VM and ACA overflow lane.
- The provisioning helper attempts `gpt-5-nano` and `gpt-5-mini` first, then falls back to `gpt-4.1-nano` and `gpt-4.1-mini` if deployment creation fails.

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

## First cutover state clone
For the first eastus cutover, clone the live runtime state instead of rendering a fresh env file:
```bash
./scripts/azure/clone-vm-state.sh --target-host "<NEW_VM_IP>"
```

This copies:
- `/etc/articlepod/articlepod.env`
- `/var/lib/articlepod/`
- `/etc/letsencrypt/live/articlepod.com`
- `/etc/letsencrypt/archive/articlepod.com`
- `/etc/letsencrypt/renewal/articlepod.com.conf`

Use the copied `/etc/articlepod/articlepod.env` as the source of truth for the first eastus start so no app secrets, signing keys, or queue/storage settings rotate accidentally.

## Sync code to VM (staging path)
Sync local repo to VM user-writable path:
```bash
TARGET_HOST="$VM_IP" \
TARGET_PATH="/home/azureuser/articlepod" \
TARGET_SSH_KEY="$HOME/.ssh/articlepod_azure" \
./scripts/azure/push-to-vm.sh
```
`push-to-vm.sh` excludes app-local `.env` files so VM runtime config only comes from `/etc/articlepod/articlepod.env`.
It now also uses SSH keep-alive, SSH connect timeout, and rsync I/O timeout by default so stalled syncs fail fast instead of waiting indefinitely.
The shared sync exclusion list also skips local-only artifacts such as `exports/`, `.worktrees/`, `.runtime/`, and test-report directories so they never consume VM staging/runtime disk.

Optional timeout tuning:
```bash
PUSH_TO_VM_SSH_CONNECT_TIMEOUT=15 \
PUSH_TO_VM_RSYNC_TIMEOUT=300 \
./scripts/azure/push-to-vm.sh
```
`PUSH_TO_VM_RSYNC_CONNECT_TIMEOUT` remains accepted as a legacy alias for `PUSH_TO_VM_SSH_CONNECT_TIMEOUT`.

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
Bootstrap now also installs a journald guard config (`SystemMaxUse`, `SystemKeepFree`, `MaxRetentionSec`) with Azure-safe defaults even before the first full runtime deploy.

## One-time runtime naming migration (existing VMs only)
If the VM was previously deployed with legacy runtime names, run this once:
```bash
sudo /home/azureuser/articlepod/scripts/azure/migrate-runtime-naming.sh
```
This migrates runtime identity to canonical `articlepod` names while preserving legacy aliases for compatibility.

## Render runtime env
On VM, render `/etc/articlepod/articlepod.env`:
```bash
sudo APP_URL="https://articlepod.com" \
  STORAGE_BACKEND="azure_blob" \
  AZURE_STORAGE_CONTAINER="articlepod" \
  AZURE_STORAGE_CONNECTION_STRING="${STORAGE_CONNECTION_STRING}" \
  PYTHON_TTS_URL="http://127.0.0.1:8010" \
  TTS_WORKERS="1" \
  METADATA_PRIMARY_BACKEND="azure_table" \
  AZURE_TABLE_CONNECTION_STRING="<TABLE_CONNECTION_STRING>" \
  DIGEST_SUMMARY_PROVIDER="azure_openai" \
  AZURE_OPENAI_BASE_URL="${AZURE_OPENAI_BASE_URL}" \
  AZURE_OPENAI_API_KEY="${AZURE_OPENAI_API_KEY}" \
  AZURE_OPENAI_SUMMARY_NANO_DEPLOYMENT="${AZURE_OPENAI_SUMMARY_NANO_DEPLOYMENT}" \
  AZURE_OPENAI_SUMMARY_MINI_DEPLOYMENT="${AZURE_OPENAI_SUMMARY_MINI_DEPLOYMENT}" \
  /opt/articlepod/scripts/azure/render-env.sh
```
Optional PostgreSQL rollback/canary input:
```bash
DATABASE_URL="postgresql://articlepod_admin:<POSTGRES_PASSWORD>@${PG_NAME}.postgres.database.azure.com:5432/articlepod?sslmode=require"
```
Optional metadata mirror/canary flags:
```bash
METADATA_MIRROR_BACKEND="azure_table"
METADATA_MIRROR_DUAL_WRITE="1"
METADATA_CANARY_COMPARE="1"
WORKER_QUEUE_PRESSURE_SOURCE="prisma"
```
Optional low-cost diagnostic flags:
```bash
ANALYTICS_STORAGE_MODE="off"
JOB_EVENT_STORAGE_MODE="off"
DEMO_EXTRACTION_TRACE_ENABLED="0"
```
Optional Azure VM disk-guard tuning:
```bash
LOG_RETENTION_DAYS="7"
VM_JOURNAL_MAX_USE="200M"
VM_JOURNAL_KEEP_FREE="1G"
VM_JOURNAL_RETENTION="7day"
VM_CLEANUP_MIN_FREE_MB="3072"
```
Defaults now include VM-safe runtime paths:
- `STORAGE_ROOT=/var/lib/articlepod/storage`
- `MEDIA_ROOT=/var/lib/articlepod/media`
- `UPLOAD_ROOT=/var/lib/articlepod/uploads`
- When `METADATA_PRIMARY_BACKEND=azure_table` and `DATABASE_URL` is omitted, `render-env.sh` now defaults it to `file:/var/lib/articlepod/db.sqlite`.
- `PYTHON_TTS_TIMEOUT_MS=300000` and `OVERFLOW_PYTHON_TTS_TIMEOUT_MS=300000` on Azure unless explicitly overridden, which avoids false worker failures on slower B2s Kokoro chunk synthesis.
- `PINNED_FETCH_IPV6_ENABLED=0` on Azure unless explicitly overridden, because the current Azure VM runtime is effectively IPv4-only for outbound pinned fetches and IPv6 candidates can crash Node 22 before request-level recovery logic runs.
- `WORKER_STALE_PROCESSING_MS=900000`, `WORKER_MAX_STALE_RETRIES=1`, and `WORKER_MAX_PROCESSING_MS=2700000` on Azure unless explicitly overridden, so stalled jobs get one bounded recovery attempt and then fail cleanly instead of blocking the queue forever.

First eastus cutover note:
- skip this render step on the first blue/green bring-up
- reuse the copied `/etc/articlepod/articlepod.env`
- only go back to `render-env.sh` after the new primary is stable and you intentionally want config-as-code to replace the cloned file

## Deploy runtime + systemd services
On VM:
```bash
sudo /opt/articlepod/scripts/azure/deploy-vm-runtime.sh
sudo systemctl status --no-pager articlepod-python-tts articlepod-web articlepod-worker articlepod-worker-overflow
```

Notes:
- `deploy-vm-runtime.sh` now auto-provisions required python-tts language assets (`en_core_web_sm`, UniDic, NLTK corpora) when missing.
- `deploy-vm-runtime.sh` also enforces the Azure VM swapfile baseline before service restarts.
- swap baseline checks now tolerate the one-page `SwapTotal` rounding gap reported by `/proc/meminfo`, so repeat full deploys do not rebuild an already-healthy `4 GiB` `/swapfile` on the B2s VM.
- `deploy-vm-runtime.sh` removes app-local `.env` files from runtime path and ensures VM runtime directories exist before service startup.
- `deploy-vm-runtime.sh` bootstraps the auxiliary SQLite schema automatically when Azure Table is the primary metadata backend.
- `deploy-vm-runtime.sh` precomputes Kokoro voice previews during deployment so dashboard preview requests are instant.
- `deploy-vm-runtime.sh` now runs a root-owned disk cleanup pass before build/install work so staging junk, old journal data, and pressure-cleanable caches do not crowd out the deploy.
- overflow worker service is installed but disabled by default (`ENABLE_OVERFLOW_WORKER_SERVICE=0`).
- enable overflow worker only when external overflow TTS is configured:
  - `sudo ENABLE_OVERFLOW_WORKER_SERVICE=1 /opt/articlepod/scripts/azure/install-systemd.sh`
  - `sudo systemctl restart articlepod-worker-overflow`
- `promote-runtime.sh` preserves `services/python-tts/.venv` so model assets are not dropped on every code sync.
- `promote-runtime.sh` preserves `.runtime/` and strips synced app-local `.env` files to avoid config/path drift across promotions.
- `install-systemd.sh` now enables `articlepod-maintenance.timer`, which runs `/opt/articlepod/scripts/azure/cleanup-vm-disk.sh` every 6 hours to vacuum journald, prune staging-only artifacts, and pressure-clean caches.

## ACA overflow deploy
Build and deploy the overflow burst lane after the eastus ACA environment exists:
```bash
./scripts/azure/deploy-aca-overflow.sh --env-file <copied-prod-env>
```

Default overflow settings:
- app name: `articlepod-overflow`
- no public ingress
- queue wake-up threshold: `1`
- worker policy thresholds:
  - `WORKER_OVERFLOW_ACTIVATE_QUEUE_DEPTH=3`
  - `WORKER_OVERFLOW_DEACTIVATE_QUEUE_DEPTH=1`
  - `WORKER_OVERFLOW_ACTIVATE_OLDEST_MS=120000`
  - `WORKER_OVERFLOW_DEACTIVATE_OLDEST_MS=60000`
  - `WORKER_OVERFLOW_MIN_ACTIVE_MS=1200000`

The overflow app reuses the live Blob/Table/OpenAI data plane and uses a local sidecar `python-tts` endpoint at `http://127.0.0.1:8010`.

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

Notes:
- `deploy-changes.sh` and `configure-tls.sh` now treat HTTP error responses from the health endpoint as retryable deploy-time checks, so a brief post-ingress `502` during nginx/TLS reconciliation does not fail CI on the first probe.

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
AZURE_RESOURCE_GROUP="$RG" \
  ./scripts/azure/deploy-changes.sh --render-env --resource-group "$RG"
```
`deploy-changes.sh` now performs a remote disk guard before sync and before promote/build. Default floors are `4096 MB` warn / `2048 MB` fail for incremental deploys, and `8192 MB` warn / `4096 MB` fail for `--full-deploy`. Override with `DEPLOY_WARN_FREE_MB`, `DEPLOY_FAIL_FREE_MB`, `--warn-free-mb`, or `--fail-free-mb` if you need different thresholds.

## GitHub Actions production deploy
The `Deploy to Azure` workflow now assumes the same live topology as the VM:
- `METADATA_PRIMARY_BACKEND=azure_table`
- auxiliary `DATABASE_URL` omitted so render-env falls back to `file:/var/lib/articlepod/db.sqlite`
- `APP_AZURE_STORAGE_CONNECTION_STRING` is reused for Azure Blob and Azure Table access
- Azure OpenAI summary settings must be present in the production environment secrets:
  - `APP_AZURE_OPENAI_BASE_URL`
  - `APP_AZURE_OPENAI_API_KEY`
  - `APP_AZURE_OPENAI_SUMMARY_NANO_DEPLOYMENT`
  - `APP_AZURE_OPENAI_SUMMARY_MINI_DEPLOYMENT`
- Optional Chrome Web Store reviewer secrets:
  - `APP_WEBSTORE_REVIEWER_EMAIL`
  - `APP_WEBSTORE_REVIEWER_PASSWORD`
  - when both are present, the production deploy seeds/updates that reviewer account during the normal demo bootstrap and grants complimentary Pro access for review coverage

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
