# ArticlePod

RSS-first personal podcast feed that converts URLs/PDFs/extension captures into private podcast episodes.

## Monorepo layout
- `apps/web` - Next.js UI + API routes
- `apps/worker` - async processing worker
- `apps/extension` - standalone Chrome extension (MV3)
- `packages/core` - shared extraction/RSS/storage/security logic
- `services/python-tts` - local Kokoro service
- `docs` - plans, architecture, deployment/runbooks

## Quick start
Simple local profile:
```bash
./run.sh --profile simple
```

Parity profile (Docker Compose with PostgreSQL + Azurite):
```bash
./run.sh --profile parity
```

Azure profile env validation:
```bash
./run.sh --profile azure
```

## Demo/admin accounts
Seeded automatically by `run.sh`. Passwords are set via environment variables — do not hardcode them.

Before running, add these to your `.env` file (copy from `.env.example`):
```
ADMIN_PASSWORD="<choose a strong password>"
DEMO_PASSWORD="<choose a password>"
```

- Demo user: email `demo@articlepod.local` — password from `DEMO_PASSWORD`
- Admin user: email `admin@articlepod.local` — password from `ADMIN_PASSWORD`

## Extension

Load locally or publish to the Chrome Web Store — see **[apps/extension/README.md](apps/extension/README.md)** for the full guide.

Quick commands:

```bash
npm run extension:package   # build the ZIP + listing templates
npm run extension:validate  # verify Chrome Web Store readiness
```

Output ZIP: `dist/extension/articlepod-capture-v<version>.zip`

## Durable migration + ops helpers
- SQLite -> PostgreSQL migration:
  - `npm run db:migrate:sqlite-to-postgres -- --postgres-url "<DATABASE_URL>"`
- Parity smoke + feed/media contract:
  - `npm run parity:smoke`
- Durability drill snapshot:
  - `npm run ops:pre-drill-snapshot`
- Durability restore verification:
  - `npm run ops:verify-restore`

## Azure deployment
See:
- `docs/azure-deploy.md` - Initial provisioning and manual deployment
- `docs/azure-ci-cd.md` - CI/CD automated deployment setup
- `infra/README.md` - Infrastructure as Code (Bicep templates)

Deploy-only (for local code changes to an existing VM):
```bash
TARGET_HOST="<vm-ip-or-fqdn>" \
CANONICAL_HOST="articlepod.com" \
HOST_ALIASES="www.articlepod.com" \
LETSENCRYPT_EMAIL="<email>" \
APP_URL="https://articlepod.com" \
npm run azure:deploy:changes
```

Automated CI/CD deployment:
- Configure GitHub deploy secrets (`AZURE_VM_HOST`, `AZURE_SSH_KEY`, `AZURE_SSH_KNOWN_HOSTS`, `APP_URL`, `APP_DOMAIN_ALIASES`, `LETSENCRYPT_EMAIL`)
- Push with `[deploy]` tag or use workflow dispatch
- See `docs/azure-ci-cd.md` for setup instructions

Script/catalog indexes:
- `docs/README.md`
- `scripts/README.md`

## Naming management
- Sync generated naming constants:
  - `npm run naming:sync`
- Validate naming drift + legacy allowlist:
  - `npm run naming:check`

## Validation gates
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run export`
- `npm run license:check`
