# Scripts Index

## Daily Commands
- Local app start: `/Users/vishalchowdhary/Documents/Podcast/run.sh`
- Contract gate: `/Users/vishalchowdhary/Documents/Podcast/scripts/verify_podcast_contract.sh`
- Parity smoke: `/Users/vishalchowdhary/Documents/Podcast/scripts/parity-smoke.sh`

## Azure
- Azure scripts index: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/README.md`
- Deploy local changes to existing VM:
  - `TARGET_HOST=<vm-ip-or-fqdn> /Users/vishalchowdhary/Documents/Podcast/scripts/azure/deploy-changes.sh`
  - or `npm run azure:deploy:changes -- --host <vm-ip-or-fqdn>`

## Operations And Diagnostics
- Pre-drill snapshot: `/Users/vishalchowdhary/Documents/Podcast/scripts/ops/pre-drill-snapshot.sh`
- Restore verification: `/Users/vishalchowdhary/Documents/Podcast/scripts/ops/verify-restore.sh`
- Log collection: `/Users/vishalchowdhary/Documents/Podcast/scripts/logs-collect.mjs`
- Log triage: `/Users/vishalchowdhary/Documents/Podcast/scripts/logs-triage.mjs`
- Observability verification: `/Users/vishalchowdhary/Documents/Podcast/scripts/observability-verify.mjs`

## Cost Model
- Price refresh and workbook build helpers live under:
  - `/Users/vishalchowdhary/Documents/Podcast/scripts/cost-model/`
