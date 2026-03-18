# Codebase Stack

## Monorepo and package management
- The repo is a pnpm workspace monorepo rooted at `package.json` with workspaces declared in `pnpm-workspace.yaml`.
- Dependency resolution is locked through `pnpm-lock.yaml`.
- Root scripts use a mixed `npm` plus `npx pnpm` wrapper style in `package.json`, so contributors usually invoke `npm run ...` from the root even though pnpm is the actual package manager.
- `turbo.json` exists, but the main developer workflows are currently driven by workspace scripts and shell helpers rather than Turbo task orchestration.

## Languages and runtimes
- TypeScript is the primary implementation language across `apps/web`, `apps/worker`, and `packages/core`.
- The JavaScript packages are ESM-based (`"type": "module"` in each workspace package).
- Node.js 20+ is the expected local runtime, called out by `run.sh`.
- Python is used for the self-hosted TTS sidecar in `services/python-tts/app/main.py`.
- Bash is used heavily for deployment, parity, validation, and release workflows in `scripts/` and `run.sh`.

## Runtime applications
- Web app: `apps/web` runs Next.js 14 with React 18 and the App Router.
- Worker: `apps/worker` is a long-running Node process that polls jobs, processes items, and exposes `GET /health`.
- Shared core: `packages/core` contains extraction, RSS, storage, security, metadata, digest, and TTS abstractions reused by web and worker.
- Browser extension: `apps/extension` is a Chrome MV3 capture client with plain HTML/CSS/JS assets.
- Python sidecar: `services/python-tts` is a FastAPI service that synthesizes WAV output for Kokoro and Melo style providers.

## Web stack
- Framework: `next` in `apps/web/package.json`.
- UI runtime: `react`, `react-dom`.
- Styling: Tailwind CSS and PostCSS via `apps/web/postcss.config.mjs`.
- Data access: Prisma client generated from `apps/web/prisma/schema.prisma` or `apps/web/prisma/schema.postgres.prisma`.
- Auth/security libraries: `bcryptjs`, `jose`, `cookie`, and `zod`.
- Billing: `stripe`.

## Worker and shared backend stack
- Worker runtime is plain TypeScript plus `tsx` execution from `apps/worker/package.json`.
- Shared extraction stack in `packages/core` uses `@mozilla/readability`, `jsdom`, `pdfjs-dist`, and `turndown`.
- Shared cloud/storage stack uses `@azure/storage-blob` and `@azure/data-tables`.
- Shared validation and typing rely on `zod` and TypeScript source exports from `packages/core/src/index.ts`.

## Data, storage, and hosting stack
- Local metadata path: SQLite via Prisma in `apps/web/prisma/schema.prisma`.
- Parity and some hosted flows: PostgreSQL via `apps/web/prisma/schema.postgres.prisma`.
- Alternate primary metadata backend: Azure Table through `packages/core/src/metadata/azureTablePrimaryStore.ts`.
- Artifact storage backends: local filesystem via `packages/core/src/storage/localObjectStorage.ts` and Azure Blob via `packages/core/src/storage/azureBlobStorage.ts`.
- Hosted deployment target: Azure VM plus systemd/nginx automation under `infra/` and `scripts/azure/`.

## TTS and AI stack
- Active narration path in production code is Kokoro through `apps/worker/src/lib/providers.ts`.
- Python service client and circuit breaker live in `packages/core/src/tts/pythonService.ts`.
- Provider scaffolding exists for `macSay`, `OpenAI`, `Melo`, and Kokoro under `packages/core/src/tts/`, even though the worker currently enables only Kokoro for narration.
- Digest summaries are adapter-based and can use a stub or proxy provider via `apps/worker/src/lib/summary.ts`.

## Tooling and quality gates
- Type checking is the main lint-equivalent signal in `apps/worker` and `packages/core`; the web app also runs Next ESLint.
- Formatting uses Prettier from the root `package.json`.
- Unit and integration tests run through `tsx --test`; browser E2E uses Playwright.
- Repo automation includes license scanning in `scripts/license-check.mjs`, podcast contract verification in `scripts/verify_podcast_contract.sh`, and runtime profile validation in `scripts/check-env.mjs`.
