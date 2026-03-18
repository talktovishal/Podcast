# Areas of Concern

## 1. Dual persistence implementations increase drift risk
- The codebase supports both Prisma-backed metadata and Azure Table primary metadata.
- The relational schemas live in `apps/web/prisma/schema.prisma` and `apps/web/prisma/schema.postgres.prisma`.
- A second operational model exists in `packages/core/src/metadata/azureTablePrimaryStore.ts`, plus web and worker adapter layers in each runtime.
- This gives the product useful deployment flexibility, but it also means every feature touching users, items, jobs, digests, or tokens can drift across three persistence representations.
- Any future work that changes entities or auth/token behavior should verify both Prisma schemas and the Azure Table primary implementation together.

## 2. Legacy plaintext-token compatibility is still visible in the data model
- Token models in both Prisma schema files still include nullable `tokenValue` columns for `FeedToken`, `ShareToken`, and `ExtensionToken`.
- The auth layer explicitly preserves compatibility for legacy rows in `apps/web/src/lib/auth.ts`.
- Media delivery also keeps a legacy `feed_token` fallback path in `apps/web/src/app/api/media/[...path]/route.ts`.
- This is practical for migrations, but it keeps security-sensitive compatibility logic alive in core auth and media paths.
- Future token hardening work should treat schema cleanup and compatibility removal as one coordinated change.

## 3. Environment and storage logic are duplicated across runtimes
- `apps/web/src/lib/env.ts` and `apps/worker/src/lib/env.ts` independently parse many of the same variables and normalization rules.
- `apps/web/src/lib/storage.ts` and `apps/worker/src/lib/storage.ts` also duplicate storage backend selection and key normalization patterns.
- This duplication is understandable because the runtimes need separate entry points, but it raises the chance that profile behavior diverges over time.
- A contributor changing storage, security, or Azure settings needs to inspect both runtimes, not just one.

## 4. Command and onboarding story is split across pnpm, npm, shell, and repo docs
- The actual package manager is pnpm, but most root scripts are invoked through `npm run ...` wrappers in `package.json`.
- `run.sh` and `scripts/dev.mjs` add another layer of orchestration on top of those workspace commands.
- `AGENTS.md` still describes expected `frontend/` and `backend/` directories, while the real repo layout is `apps/web`, `apps/worker`, and `services/python-tts`.
- None of this is broken, but it does create onboarding friction because the "right" command depends on which doc a contributor reads first.

## 5. Podcast compatibility logic is resilient but concentrated in a few complex routes
- The RSS route in `apps/web/src/app/rss/[token]/route.ts` now mixes token lookup, episode filtering, missing-media repair, URL signing, and compatibility logging.
- The media route in `apps/web/src/app/api/media/[...path]/route.ts` handles auth, range parsing, HEAD support, legacy token fallback, playback analytics, and repair fallback.
- These routes are well-tested, but they are high-leverage complexity points for the product.
- Changes to feed or media behavior should be treated as contract work, not routine route edits, and should always be paired with podcast contract verification.

## 6. The repo has grown a wide operational surface area around a relatively focused product core
- In addition to the core ingest-to-RSS flow, the repo now carries billing, extension packaging, digest automation, analytics, Azure VM automation, cost controls, and feedback mirroring.
- Those features are all real parts of the product, but they expand the mental model required to make "simple" changes safely.
- New contributors will likely need a subsystem-first onboarding path rather than a full-repo read-through.
- This codebase map should help, but future planning work should continue to isolate feature slices and identify the minimum files for common change types.
