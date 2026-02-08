# ListenLater

RSS-first personal podcast feed that converts URLs/PDFs into private podcast episodes.

## Monorepo layout
- `apps/web` - Next.js UI + API routes
- `apps/worker` - async processing worker
- `packages/core` - shared extraction, RSS, chunking, security, adapter types
- `docs` - plans, architecture, implementation docs
- `fixtures` - deterministic HTML/PDF/demo fixtures

## Quick start
1. `./run.sh`

`run.sh` will:
- create `.env` from `.env.example` if missing
- install dependencies (on first run, or with `--force-install`)
- run environment checks
- start web + worker with demo seed/bootstrap flow

Optional:
- `./run.sh --setup-only` (prepare environment without starting servers)

## Validation
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
