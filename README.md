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
Seeded automatically by `run.sh`:
- Demo user:
  - email: `demo@articlepod.local`
  - password: `demo-password`
- Admin user:
  - email: `admin@articlepod.local`
  - password: `admin-demo-password`

## Extension packaging
```bash
npm run extension:package
```

Output:
- `dist/extension/articlepod-capture-v<version>.zip`

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
TARGET_HOST="<vm-ip-or-fqdn>" npm run azure:deploy:changes
```

Automated CI/CD deployment:
- Configure GitHub deploy secrets (`AZURE_VM_HOST`, `AZURE_SSH_KEY`, `AZURE_SSH_KNOWN_HOSTS`)
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
