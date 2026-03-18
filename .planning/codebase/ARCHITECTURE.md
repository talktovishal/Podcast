# Codebase Architecture

## Runtime shape
- The repo is organized as a multi-runtime system rather than a single app.
- `apps/web` owns UI, session auth, submission endpoints, RSS rendering, and media delivery.
- `apps/worker` owns the asynchronous pipeline for extraction, chunking, TTS, digest scheduling, and artifact publication.
- `services/python-tts` is a separate HTTP sidecar used by the worker for narration synthesis.
- `packages/core` holds the shared domain logic and provider abstractions that keep vendor-specific code out of request handlers.

## Entry points
- Web routing starts in the Next App Router tree under `apps/web/src/app/`.
- Session gating is centralized in `apps/web/src/middleware.ts`.
- RSS generation entry points are `apps/web/src/app/rss/[token]/route.ts` and `apps/web/src/app/rss/digest/[token]/route.ts`.
- Media serving entry points are `apps/web/src/app/api/media/[...path]/route.ts` and `apps/web/src/app/api/digest-media/[...path]/route.ts`.
- Worker execution begins in `apps/worker/src/index.ts`.
- Python synthesis requests enter through `services/python-tts/app/main.py`.

## Core request and job flow
1. A signed-in user or extension submits a URL, PDF, or HTML snapshot through the item routes in `apps/web/src/app/api/items/`.
2. The web app authenticates the caller, enforces rate limits, validates the payload, and enqueues an `Item` plus `Job` through helpers in `apps/web/src/lib/items.ts`.
3. The worker polling loop in `apps/worker/src/index.ts` claims eligible jobs and hands them to `apps/worker/src/jobs/processItemJob.ts`.
4. Shared extraction utilities from `packages/core/src/extract/` normalize source content into narration text and markdown.
5. Deterministic chunking in `packages/core/src/chunking/chunkText.ts` and cache keys stored in `ChunkCache` prevent unnecessary re-synthesis.
6. The worker uses `apps/worker/src/lib/providers.ts` plus `packages/core/src/tts/` to synthesize audio, persists artifacts to object storage, and upserts `Episode` metadata.
7. RSS routes read ready episodes, sign media URLs, and render deterministic XML through `packages/core/src/rss/buildFeed.ts`.

## Data and persistence layers
- Prisma-backed relational data is defined in `apps/web/prisma/schema.prisma` and `apps/web/prisma/schema.postgres.prisma`.
- The relational schema models users, sessions, tokens, items, jobs, artifacts, episodes, analytics, digest state, billing, and feedback.
- A second persistence path exists for Azure Table primary metadata through `packages/core/src/metadata/azureTablePrimaryStore.ts`.
- Web-side auth and token operations are wrapped by `apps/web/src/lib/metadata-primary-auth.ts`.
- Web and worker both choose between Prisma and Azure Table through small runtime-specific adapter modules in their `src/lib/metadata-primary-store.ts` files.

## Storage and delivery boundaries
- Artifact storage is abstracted behind the `ObjectStorage` interface and selected per profile by `apps/web/src/lib/storage.ts` and `apps/worker/src/lib/storage.ts`.
- Local simple-profile storage stays on disk; parity and Azure can use Blob-backed object storage.
- Media routes enforce byte-range semantics directly against object storage and add compatibility logging plus repair hooks.
- RSS routes never expose raw storage paths directly; they sign media URLs before placing them in enclosures.

## Auth and security boundaries
- Middleware in `apps/web/src/middleware.ts` defines the public surface and redirects or rejects unauthorized access.
- `apps/web/src/lib/auth.ts` handles password auth, session issuance, OAuth identity linkage, token rotation, and digest defaults.
- SSRF protection for URL ingestion lives in `packages/core/src/security/urlPolicy.ts`.
- Rate limiting is handled in `apps/web/src/lib/rate-limit.ts` with an in-memory simple-profile path and a persistent bucket path for non-simple Prisma profiles.

## Feature slices layered on top of the core pipeline
- Billing flows are handled by web-only code in `apps/web/src/lib/billing.ts` and related API routes.
- Digest scheduling and digest job execution live in `apps/worker/src/jobs/scheduleDigestRuns.ts` and `apps/worker/src/jobs/processDigestRunJob.ts`.
- Admin analytics are web-facing modules under `apps/web/src/lib/admin-analytics/`, fed by web and worker event writes.
- Extension capture uses a separate frontend in `apps/extension` but feeds the same item pipeline as URL and PDF submissions.

## Runtime profiles
- `simple` uses local SQLite, local artifact storage, and a local Python TTS sidecar.
- `parity` is the multi-service profile with PostgreSQL and Azurite for production-like validation.
- `azure` keeps the same logical boundaries but swaps in Azure-hosted persistence and deployment automation.
- Runtime config parsing is profile-aware and split across `apps/web/src/lib/env.ts`, `apps/worker/src/lib/env.ts`, and supporting scripts such as `scripts/prisma-profile.mjs`.
