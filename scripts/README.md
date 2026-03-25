# Scripts Index

## Daily Commands
- Local app start: `/Users/vishalchowdhary/Documents/Podcast/run.sh`
- Contract gate: `/Users/vishalchowdhary/Documents/Podcast/scripts/verify_podcast_contract.sh`
- Parity smoke: `/Users/vishalchowdhary/Documents/Podcast/scripts/parity-smoke.sh`
- Live-site harness:
  - `npm run live-sites:test`
  - `npm run live-sites:test:url`
  - `npm run live-sites:test:extension`
  - `npm run live-sites:test:prod-probe`

## Azure
- Azure scripts index: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/README.md`
- Provision or reuse Azure OpenAI summary resources:
  - `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/provision-openai.sh --resource-group rg-articlepod-prod`
- Deploy local changes to existing VM:
  - `TARGET_HOST=<vm-ip-or-fqdn> CANONICAL_HOST=articlepod.com HOST_ALIASES=www.articlepod.com LETSENCRYPT_EMAIL=<email> APP_URL=https://articlepod.com /Users/vishalchowdhary/Documents/Podcast/scripts/azure/deploy-changes.sh`
  - or `TARGET_HOST=<vm-ip-or-fqdn> CANONICAL_HOST=articlepod.com HOST_ALIASES=www.articlepod.com LETSENCRYPT_EMAIL=<email> APP_URL=https://articlepod.com npm run azure:deploy:changes`

## Naming
- Sync generated naming constants:
  - `npm run naming:sync`
- Enforce naming drift + legacy allowlist:
  - `npm run naming:check`

## Operations And Diagnostics
- Pre-drill snapshot: `/Users/vishalchowdhary/Documents/Podcast/scripts/ops/pre-drill-snapshot.sh`
- Restore verification: `/Users/vishalchowdhary/Documents/Podcast/scripts/ops/verify-restore.sh`
- Azure cost report: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/cost-report.py`
- Log collection: `/Users/vishalchowdhary/Documents/Podcast/scripts/logs-collect.mjs`
- Log triage: `/Users/vishalchowdhary/Documents/Podcast/scripts/logs-triage.mjs`
- Observability verification: `/Users/vishalchowdhary/Documents/Podcast/scripts/observability-verify.mjs`

## Cost Model
- Price refresh and workbook build helpers live under:
  - `/Users/vishalchowdhary/Documents/Podcast/scripts/cost-model/`
