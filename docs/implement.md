# Implementation Guide

## First-time setup
1. Install dependencies:
- `npx pnpm install`
2. Bootstrap DB + seed demo in simple profile:
- `./run.sh --web`
- or use the full local stack:
- `./run.sh --profile simple`

## Runtime profiles
- Quick web-only local mode:
  - `./run.sh --web`
  - fastest repeat loop: `./run.sh --web --fast`
- Simple local mode:
  - `./run.sh --profile simple`
  - fastest repeat loop: `./run.sh --fast`
- Local parity mode (Docker Compose):
  - `./run.sh --profile parity`
- Azure profile env validation only:
  - `./run.sh --profile azure`

## Launcher shortcuts
- Single launcher:
  - `./run.sh`
- Web only:
  - `./run.sh --web`
- Skip recurring bootstrap work (Prisma/db/demo seed and env validation):
  - `./run.sh --fast`
- Skip bootstrap but keep env validation:
  - `./run.sh --skip-bootstrap`
- Reset local dev caches before starting:
  - `./run.sh --clean --web --fast`

`run-web.sh` remains available as a thin compatibility wrapper for `./run.sh --web`.

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

## M72-M79 implementation sequence (completed)
1. M72/M73
- add digest Prisma models + shared digest schemas/types.
- add digest settings/feed-token APIs and auth helpers.

2. M74/M75
- add worker digest scheduler and idempotent run enqueue contract.
- process digest runs (summary provider adapter, stub email sender, optional digest TTS episode).

3. M76/M77
- add separate digest RSS + digest media routes (`HEAD`/`Range` compliant).
- extend `/app/settings` with digest controls and recent run history panel.

4. M78/M79
- expand core/web/worker tests for digest behavior.
- run podcast contract gates for main + digest feeds and sync docs.

## M86-M91 implementation sequence (completed)
1. M86/M87
- add Summary Studio data models, shared contracts, and authenticated API/UI surfaces.
- keep manual summary runs separate from scheduled digests while reusing the existing digest feed.

2. M88/M89
- add Azure OpenAI summary provider support with nano/mini routing and retry fallback.
- process manual summary runs asynchronously and publish optional summary episodes through digest RSS/media.

3. M90/M91
- provision Azure OpenAI through deploy helpers and env rendering.
- sync docs/env examples/chat log and run full repo verification.

## C01-C07 implementation sequence
1. C01/C02
- set Azure VM baseline defaults to `Standard_B2s`.
- lock VM python-tts service to one local worker (`TTS_WORKERS=1`).
- add overflow worker role controls and hysteresis-based queue pressure policy.

2. C03/C04
- introduce queue/metadata adapter contract in `packages/core`.
- add Azure Table primary-store implementation for item/job/digest/account operational state.

3. C05/C06
- dual-write queue projections from web enqueue and worker state transitions.
- add backfill and consistency-check commands for mirror canary rollout.
- add primary-store cutover env (`METADATA_PRIMARY_BACKEND=azure_table`) and Azure deploy defaults for auxiliary SQLite + low-cost diagnostics.
- keep queue pressure source toggle (`prisma` vs `mirror`) and diff logging.

4. C07
- add budget and overflow guardrail automation scripts for operations.

## Migration helpers
- SQLite export:
  - `npx pnpm --filter @articlepod/web run db:export-json -- --out <file>`
- PostgreSQL import:
  - `npx pnpm --filter @articlepod/web run db:import-json -- --in <file> --truncate`
- End-to-end migration helper:
  - `npm run db:migrate:sqlite-to-postgres -- --postgres-url "<DATABASE_URL>"`

## Azure VM deployment helpers
- Deploy local code changes to existing VM (sync + promote + deploy):
  - `TARGET_HOST=<vm-ip-or-fqdn> CANONICAL_HOST=articlepod.com HOST_ALIASES=www.articlepod.com LETSENCRYPT_EMAIL=<email> APP_URL=https://articlepod.com TARGET_SSH_KEY=~/.ssh/articlepod_azure ./scripts/azure/deploy-changes.sh`
- Preflight (local):
  - `./scripts/azure/preflight.sh --subscription "<SUBSCRIPTION_ID_OR_NAME>"`
- Provision infra:
  - `azd up`
- Discover VM/Postgres/storage (+ optional firewall + connection string):
  - `./scripts/azure/discover-resources.sh --resource-group "<RG>" --open-firewall --print-connection-string`
  - add `--include-openai` to also export any existing Azure OpenAI account metadata
  - add `--provision-openai` to create/reuse Azure OpenAI account + deployments and export runtime vars
- Provision/reuse Azure OpenAI summary deployments directly:
  - `./scripts/azure/provision-openai.sh --resource-group "<RG>"`
- Sync code to VM:
  - `TARGET_HOST=<vm-ip> TARGET_PATH=/home/azureuser/articlepod TARGET_SSH_KEY=~/.ssh/articlepod_azure ./scripts/azure/push-to-vm.sh`
  - excludes app-local `.env` files from sync payload
- Bootstrap VM:
  - `sudo /home/azureuser/articlepod/scripts/azure/bootstrap-vm.sh`
- One-time runtime naming migration for pre-rename VMs:
  - `sudo /home/azureuser/articlepod/scripts/azure/migrate-runtime-naming.sh`
- Promote staged code to runtime path:
  - `sudo STAGING_DIR=/home/azureuser/articlepod /home/azureuser/articlepod/scripts/azure/promote-runtime.sh`
  - preserves `services/python-tts/.venv` across syncs
  - preserves `.runtime/` and removes app-local runtime `.env` files
- Deploy runtime + services on VM:
  - `sudo /opt/articlepod/scripts/azure/deploy-vm-runtime.sh`
  - auto-bootstraps missing python-tts language assets (`en_core_web_sm`, UniDic, NLTK)
  - ensures runtime directories (`/var/lib/articlepod/{storage,media,uploads}`) and precomputes Kokoro voice previews
  - in Azure Table primary mode, `render-env.sh` defaults `DATABASE_URL=file:/var/lib/articlepod/db.sqlite` and low-cost diagnostics off
  - when Azure OpenAI vars are present, `render-env.sh` can default `DIGEST_SUMMARY_PROVIDER=azure_openai`
- Configure ingress + TLS on VM:
  - `sudo CANONICAL_HOST=articlepod.com HOST_ALIASES=www.articlepod.com /opt/articlepod/scripts/azure/configure-nginx.sh`
  - `sudo CANONICAL_HOST=articlepod.com HOST_ALIASES=www.articlepod.com LETSENCRYPT_EMAIL=<email> /opt/articlepod/scripts/azure/configure-tls.sh`
