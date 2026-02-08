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

## Demo and admin accounts
`run.sh` seeds both accounts automatically on local first run.

- Demo user:
  - email: `demo@listenlater.local`
  - password: `demo-password`
- Admin user:
  - email: `admin@listenlater.local`
  - password: `admin-demo-password` (from `.env`)

Login flow for demoing:
1. Sign in as demo user at `/login`.
2. Open `/app` and submit a URL or upload a text-based PDF.
3. Wait for item status to become `READY`.
4. Play the generated episode and test seeking.
5. Copy private RSS URL from dashboard and test in podcast client.
6. Sign in as admin and open `/admin` for metrics/events view.

OAuth behavior:
- Google/Apple login buttons require `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and `APPLE_CLIENT_ID`/`APPLE_CLIENT_SECRET`.
- If these vars are empty, OAuth is intentionally not configured for local demo.

Admin credential note:
- Admin is created from `.env` defaults.
- Changing `ADMIN_PASSWORD` later does not automatically reset the existing admin password in the current DB.

## Validation
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
