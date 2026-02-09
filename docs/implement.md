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

## Migration helpers
- SQLite export:
  - `npx pnpm --filter @listenlater/web run db:export-json -- --out <file>`
- PostgreSQL import:
  - `npx pnpm --filter @listenlater/web run db:import-json -- --in <file> --truncate`
- End-to-end migration helper:
  - `npm run db:migrate:sqlite-to-postgres -- --postgres-url "<DATABASE_URL>"`

## Azure VM deployment helpers
- Provision infra:
  - `azd up`
- Bootstrap VM:
  - `sudo /Users/vishalchowdhary/Documents/Podcast/scripts/azure/bootstrap-vm.sh`
- Sync code to VM:
  - `TARGET_HOST=<vm-ip> /Users/vishalchowdhary/Documents/Podcast/scripts/azure/push-to-vm.sh`
- Deploy runtime + services on VM:
  - `sudo /Users/vishalchowdhary/Documents/Podcast/scripts/azure/deploy-vm-runtime.sh`
