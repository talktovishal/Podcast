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
TARGET_HOST=<vm-ip-or-fqdn> /Users/vishalchowdhary/Documents/Podcast/scripts/azure/deploy-changes.sh
```

Default deploy mode is incremental:
- skips `pnpm install` when `pnpm-lock.yaml` is unchanged
- skips python-tts package/model provisioning when requirements/assets are unchanged
- runs demo seed only once by default (`DEPLOY_DEMO_SEED_MODE=auto`)
- retries health checks automatically (`HEALTH_RETRIES` / `HEALTH_RETRY_DELAY`)

Force a full runtime refresh:
```bash
TARGET_HOST=<vm-ip-or-fqdn> /Users/vishalchowdhary/Documents/Podcast/scripts/azure/deploy-changes.sh --full-deploy
```

What it runs:
1. `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/push-to-vm.sh`
2. Bootstrap guard (runs `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/bootstrap-vm.sh` only if runtime user is missing on VM)
3. `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/promote-runtime.sh`
4. `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/deploy-vm-runtime.sh`

## Individual Building Blocks
- Sync only: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/push-to-vm.sh`
- Promote staged files only: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/promote-runtime.sh`
- Deploy runtime only: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/deploy-vm-runtime.sh`
- systemd install: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/install-systemd.sh`
- runtime naming defaults: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/runtime-naming.sh`
- Nginx config: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/configure-nginx.sh`
- TLS config: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/configure-tls.sh`
