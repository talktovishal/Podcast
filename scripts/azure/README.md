# Azure Scripts

## First-Time Setup (Per Environment)
1. Preflight local machine:
   - `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/preflight.sh`
2. Provision infra (outside this folder, with `azd up`).
3. Discover runtime resources:
   - `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/discover-resources.sh`
4. Bootstrap VM:
   - `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/bootstrap-vm.sh`
5. Existing VM migration (if upgrading from legacy runtime names):
   - `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/migrate-runtime-naming.sh`
6. Render runtime env:
   - `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/render-env.sh`

See runbook: `/Users/vishalchowdhary/Documents/Podcast/docs/azure-deploy.md`

## Daily Deploy (Code Changes Only)
Single command:
```bash
TARGET_HOST=<vm-ip-or-fqdn> \
CANONICAL_HOST=articlepod.com \
HOST_ALIASES=www.articlepod.com \
LETSENCRYPT_EMAIL=<email> \
APP_URL=https://articlepod.com \
/Users/vishalchowdhary/Documents/Podcast/scripts/azure/deploy-changes.sh
```

Default deploy mode is incremental:
- skips `pnpm install` when `pnpm-lock.yaml` is unchanged
- skips python-tts package/model provisioning when requirements/assets are unchanged
- runs demo seed only once by default (`DEPLOY_DEMO_SEED_MODE=auto`)
- retries health checks automatically (`HEALTH_RETRIES` / `HEALTH_RETRY_DELAY`)
- configures nginx + TLS on every deploy (`DEPLOY_CONFIGURE_INGRESS=1`)
- auto-heals nginx `server_names_hash_*` sizing in `nginx.conf` only when needed
- removes legacy managed hash-tuning snippets during ingress reconfigure to avoid duplicate directives
- hardens VM sync with SSH keep-alive + rsync connect/I/O timeouts (`PUSH_TO_VM_SSH_*`, `PUSH_TO_VM_RSYNC_*`) to fail fast instead of hanging indefinitely

Force a full runtime refresh:
```bash
TARGET_HOST=<vm-ip-or-fqdn> \
CANONICAL_HOST=articlepod.com \
HOST_ALIASES=www.articlepod.com \
LETSENCRYPT_EMAIL=<email> \
APP_URL=https://articlepod.com \
/Users/vishalchowdhary/Documents/Podcast/scripts/azure/deploy-changes.sh --full-deploy
```

What it runs:
1. `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/push-to-vm.sh`
2. Bootstrap guard (runs `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/bootstrap-vm.sh` only if runtime user is missing on VM)
3. `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/promote-runtime.sh`
4. `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/deploy-vm-runtime.sh`
5. `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/configure-nginx.sh`
6. `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/configure-tls.sh`

### Domain/TLS deploy variables
- `CANONICAL_HOST`: required when ingress automation is enabled (defaults from `APP_URL` host if present).
- `HOST_ALIASES`: optional comma-separated aliases redirected to canonical host.
- `LETSENCRYPT_EMAIL`: required when ingress automation is enabled.
- `DEPLOY_CONFIGURE_INGRESS`: set `0` to skip nginx/TLS automation for a deploy.

## Production URL Extraction Probe (Safe Diagnostics)
Use the GitHub Actions workflow **Probe URL Extraction (VM)** to test extraction for a specific URL from the production VM network path without exposing new public endpoints.

Requirements:
- GitHub repository secrets already used by deploy workflow:
  - `AZURE_VM_HOST`
  - `AZURE_VM_USER` (optional; defaults to `azureuser`)
  - `AZURE_SSH_KEY`

What it does:
1. Copies `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/probe-url-extract.ts` to the VM.
2. Runs DNS + HTTP HEAD checks from the VM.
3. Runs core extraction (`validateFetchableUrl` + `extractHtmlFromUrl`) on the target URL.
4. Outputs structured JSON with either extraction metrics or actionable error details.

Security notes:
- Uses existing SSH key auth and VM host secrets; no inbound port changes or debug routes.
- Runs on demand (`workflow_dispatch`) and does not persist source content.

## Individual Building Blocks
- Sync only: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/push-to-vm.sh`
- Promote staged files only: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/promote-runtime.sh`
- Deploy runtime only: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/deploy-vm-runtime.sh`
- systemd install: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/install-systemd.sh`
- runtime naming defaults: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/runtime-naming.sh`
- Nginx config: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/configure-nginx.sh`
- TLS config: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/configure-tls.sh`
