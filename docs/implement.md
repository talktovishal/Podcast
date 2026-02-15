# Implementation Guide

## First-time setup
1. Install dependencies:
- `npx pnpm install`
2. Bootstrap DB + seed demo in simple profile:
- `./run.sh --profile simple`

## Runtime profiles
- Simple local mode:
  - `./run.sh --profile simple`
- Local parity mode (Docker Compose):
  - `./run.sh --profile parity`
- Azure profile env validation only:
  - `./run.sh --profile azure`

## Spec status workflow
Whenever runtime code changes land:
1. Update status sections in `/Users/vishalchowdhary/Documents/Podcast/docs/Prompts.md`.
2. Update milestone statuses in `/Users/vishalchowdhary/Documents/Podcast/docs/plans.md`.
3. Add a concise summary + exact user prompt(s) in `/Users/vishalchowdhary/Documents/Podcast/docs/chat_log.md`.

## Status maintenance workflow (mandatory)
Use this for every milestone-sized change:
1. Set milestone `status` in `docs/plans.md`:
  - `Planned` -> not implemented yet.
  - `In Progress` -> implementation started but acceptance not fully met.
  - `Done` -> acceptance met and verification evidence captured.
2. Maintain date/evidence metadata:
  - Every milestone: `target_finish`.
  - `Done` milestones: `completed_on` + evidence reference (commit/date best effort).
3. Update reconciliation ledger for any corrected historical status:
  - include previous state, corrected state, evidence, confidence, and open gaps.
4. Keep cross-doc status in lock-step:
  - update implemented/next/future sections in `docs/Prompts.md`.
  - update architecture/ops/docs language if runtime behavior changed.

## No-drift enforcement order
Apply updates in this strict order to avoid drift:
1. `docs/Prompts.md`
2. `docs/plans.md`
3. `docs/architecture.md`
4. `docs/documentation.md`
5. `docs/implement.md` / `docs/env.md` / other supporting docs

## Verification workflow
Run these before each push:
1. `npm run typecheck`
2. `npm run lint`
3. `npm run test`
4. `npm run build`
5. `npm run export`
6. `npm run license:check`

If parity/azure runtime paths changed, also run:
1. `npm run check:env:parity`
2. `npm run parity:up`
3. `npm run parity:smoke`
4. `npm run parity:down`

## M35-M46 implementation sequence
1. M35/M36/M37
- profile contract lock
- parity compose stack
- env validator + profile templates

2. M38
- PostgreSQL schema/profile bootstrap
- SQLite -> PostgreSQL export/import scripts

3. M39/M40/M41
- object storage abstraction (`local`, `azure_blob`)
- blob-backed media route with strict `HEAD`/`Range`
- worker artifact read/write migration to object keys

4. M42
- stale lock reclaim
- retry scheduling and due-failure pickup
- queue resilience tests

5. M43/M44
- Bicep + azd infra baseline
- VM bootstrap/deploy automation
- systemd service templates for `web`, `worker`, `python-tts`

6. M45/M46
- durability drill snapshot/restore scripts
- parity CI + release gate checks

## M47-M56 implementation sequence
1. M47/M48
- lock shared log/error schema and support-id contract
- enable dedicated JSONL sinks with rotation under `.runtime/logs`

2. M49/M50
- wire structured logging in web/worker/python-tts
- propagate correlation IDs (`traceparent`, `x-request-id`, `x-job-id`, `x-item-id`)

3. M51/M52
- add OTel tracing and service/business metrics export wiring
- keep metric names stable across local and Azure

4. M53/M54
- configure Azure Monitor + Log Analytics export
- add dashboards + alert thresholds with runbook links

5. M55/M56
- implement `logs:triage` digest loop
- make observability checks release-gating via `observability:verify`

## M57-M64 implementation sequence (completed)
1. M57/M58
- lock dual-artifact contract (raw + markdown) and add `ItemArtifact` metadata model.

2. M59/M60
- extend HTML/PDF extraction outputs to emit markdown alongside narration text.

3. M61/M62
- persist raw + markdown artifacts in storage and shift narration input to markdown-derived normalization.

4. M63/M64
- expose markdown diagnostics in authorized app/API flows.
- add artifact lifecycle scripts (`artifacts:backfill`, `artifacts:purge`) and regression verification.

## Migration helpers
- SQLite export:
  - `npx pnpm --filter @listenlater/web run db:export-json -- --out <file>`
- PostgreSQL import:
  - `npx pnpm --filter @listenlater/web run db:import-json -- --in <file> --truncate`
- End-to-end migration helper:
  - `npm run db:migrate:sqlite-to-postgres -- --postgres-url "<DATABASE_URL>"`

## Azure VM deployment helpers
- Preflight (local):
  - `./scripts/azure/preflight.sh --subscription "<SUBSCRIPTION_ID_OR_NAME>"`
- Provision infra:
  - `azd up`
- Discover VM/Postgres/storage (+ optional firewall + connection string):
  - `./scripts/azure/discover-resources.sh --resource-group "<RG>" --open-firewall --print-connection-string`
- Sync code to VM:
  - `TARGET_HOST=<vm-ip> TARGET_PATH=/home/azureuser/listenlater ./scripts/azure/push-to-vm.sh`
- Bootstrap VM:
  - `sudo /home/azureuser/listenlater/scripts/azure/bootstrap-vm.sh`
- Promote staged code to runtime path:
  - `sudo STAGING_DIR=/home/azureuser/listenlater /home/azureuser/listenlater/scripts/azure/promote-runtime.sh`
- Deploy runtime + services on VM:
  - `sudo /opt/listenlater/scripts/azure/deploy-vm-runtime.sh`
- Configure ingress + TLS on VM:
  - `sudo PUBLIC_HOST=<vm-fqdn> /opt/listenlater/scripts/azure/configure-nginx.sh`
  - `sudo PUBLIC_HOST=<vm-fqdn> LETSENCRYPT_EMAIL=<email> /opt/listenlater/scripts/azure/configure-tls.sh`
