# ArticlePod

RSS-first personal podcast feed that turns URLs, PDFs, and extension captures into private podcast episodes plus a Karpathy-inspired personal wiki.

## Monorepo layout
- `apps/web` - Next.js UI + API routes
- `apps/worker` - async processing worker
- `apps/extension` - standalone Chrome extension (MV3)
- `packages/core` - shared extraction/RSS/storage/security logic
- `services/python-tts` - local Kokoro service
- `docs` - plans, architecture, deployment/runbooks

## Quick start
Fastest web-only UI loop:
```bash
./run.sh --web --fast
```

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

Common local options:

```bash
./run.sh --web              # web only
./run.sh --fast             # skip env/bootstrap and start watchers immediately
./run.sh --clean --web --fast  # clear Next caches, then start the fast web loop
```

`run-web.sh` now remains as a thin compatibility wrapper around `./run.sh --web`.

## Demo/admin accounts
Seeded automatically by `run.sh` during non-fast startup. Passwords are set via environment variables — do not hardcode them.

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

## Deployment ownership and temporary pause

Deployment credentials and operational orchestration belong in the private
[`talktovishal/Podcast-Deploy`](https://github.com/talktovishal/Podcast-Deploy)
repository. This source repository retains public-safe code CI, runtime/support
scripts, tests, and infrastructure definitions, but no active deployment,
production probe, or secret-export workflows.

Production continues on the existing deployment. Automated deployment remains
paused until the private workflows complete separate runtime/build validation.
This handoff does not verify or deploy a new release.
Existing deployment runbooks remain historical/support references, not active
source-repository deployment instructions.
Definitions retained under `.github/workflow-fixtures` are historical compatibility
test inputs, not active workflows or guarantees about production.

Script/catalog indexes:
- `docs/README.md`
- `scripts/README.md`
- `docs/billing/README.md` - Stripe billing handoff, setup, and rollout checklist

## Naming management
- Sync generated naming constants:
  - `npm run naming:sync`
- Validate naming drift + legacy allowlist:
  - `npm run naming:check`

## Validation gates
- `pnpm preflight`
- `pnpm preflight --parity` for runtime-sensitive changes
- GitHub `CI` runs the quick PR gate; `Nightly Full CI` runs the expensive full suite on `main`
- Failed parity smoke jobs record bounded service logs and exit/OOM/restart status before container teardown
- Manual `Source Support CI` retains credential-free support, infrastructure, and build-isolation checks
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run export`
- `npm run license:check`

Server builds resolve CSS Tree's CommonJS exports so its JSON grammar data is
bundled rather than loaded through a build-machine file URL. The web regression
test exercises CSS parsing and grammar matching with access to the original
dependency directory blocked, including a failing unpatched-bundle control.
PDF.js remains a native Node import resolved through the installed core package,
so its canvas dependency and worker resolve on the runtime host, not the build
machine. Regression coverage relocates the bundle, verifies runtime dependency
selection, and extracts text from a generated PDF using the real library.

## Inspection and rights

ArticlePod's repository is intended for inspection of the product, architecture,
and development history. Unless separately licensed, no additional license is
granted for ArticlePod's original code or content. This is not an open-source
license grant. GitHub's platform terms continue to apply.

Third-party material retains its existing license terms. See
[third-party attribution and retained notices](docs/THIRD_PARTY.md).
Repository visibility is separate from production access; source availability
does not grant access to accounts, private feeds, or deployed infrastructure.
