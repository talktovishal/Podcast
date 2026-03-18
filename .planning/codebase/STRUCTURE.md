# Repository Structure

## Top-level layout
- `apps/`
  - Product runtimes and user-facing surfaces.
- `packages/`
  - Shared code intended to be imported by multiple runtimes.
- `services/`
  - Auxiliary service processes that are not bundled into the main Node workspaces.
- `scripts/`
  - Local-dev, validation, packaging, deployment, and operations helpers.
- `docs/`
  - Product prompts, architecture notes, runbooks, rollout plans, and release checklists.
- `infra/`
  - Infrastructure as Code plus systemd service unit templates.
- `fixtures/`
  - Stable HTML and PDF inputs used by extraction and contract tests.
- `vendor/`
  - Read-only upstream reference material used for implementation guidance, not runtime imports.

## App runtimes
- `apps/web/`
  - Next.js application.
  - `src/app/` holds App Router pages and route handlers.
  - `src/components/` contains React UI components.
  - `src/lib/` contains server-side helpers, auth, storage, analytics, and environment parsing.
  - `tests/` contains web-unit and route-level integration tests.
  - `prisma/` contains the SQLite and PostgreSQL schemas.
- `apps/worker/`
  - Async processing runtime.
  - `src/jobs/` holds queue consumers and background workflows.
  - `src/lib/` holds runtime-specific adapters and environment wiring.
  - `tests/` focuses on queue behavior, retries, digest jobs, and overflow policies.
- `apps/extension/`
  - Chrome MV3 extension assets.
  - Plain `manifest.json`, popup assets, runtime config, icons, and web store metadata.

## Shared package structure
- `packages/core/src/extract/`
  - HTML and PDF extraction utilities plus borrowed-but-localized readability rules.
- `packages/core/src/rss/`
  - Deterministic feed XML construction.
- `packages/core/src/security/`
  - URL policy, token hashing, signed URL helpers, and in-memory rate limiting primitives.
- `packages/core/src/storage/`
  - Local and Azure storage adapters plus shared storage types.
- `packages/core/src/tts/`
  - TTS provider interfaces, catalogs, local wrappers, and Python sidecar client.
- `packages/core/src/metadata/`
  - Azure Table primary and mirror implementations.
- `packages/core/src/digest/`, `logging/`, `chunking/`, `utils/`, and `types/`
  - Cross-runtime supporting modules.

## Service structure
- `services/python-tts/app/main.py`
  - FastAPI entry point for the TTS sidecar.
- `services/python-tts/tests/`
  - Python-side end-to-end tests.
- `services/python-tts/requirements*.txt`
  - Dependency group definitions for runtime, providers, and tests.

## Naming and location conventions
- Workspace packages use the `@articlepod/*` scope in `package.json` files.
- Next route handlers follow App Router naming: `page.tsx`, `layout.tsx`, and `route.ts`.
- Web code commonly uses the `@/` alias for `apps/web/src`.
- Worker and core code use ESM imports with explicit `.js` extensions in emitted-runtime-facing imports.
- Runtime-specific helpers stay under each app's `src/lib/`, while reusable logic is pushed to `packages/core/`.

## Tests and fixtures
- Web tests live in `apps/web/tests/`.
- Worker tests live in `apps/worker/tests/`.
- Shared package tests live in `packages/core/tests/`.
- Cross-language service tests live in `services/python-tts/tests/`.
- Reusable extraction fixtures live in `fixtures/html/` and `fixtures/pdf/`.

## Operations and deployment layout
- `scripts/azure/` is the main deployment automation subtree for VM rollout and runtime promotion.
- `infra/systemd/` holds service definitions for web, worker, overflow worker, and python-tts.
- `docs/azure-*.md`, `docs/operations.md`, and `docs/release-checklist.md` carry the human runbooks that match those scripts.

## Planning outputs
- `.planning/codebase/` is reserved for generated codebase map documents like this one.
- The repository did not have an existing `.planning/` tree before this mapping pass, so these docs form the initial local codebase reference set.
