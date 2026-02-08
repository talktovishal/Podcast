# ListenLater Detailed Build Plan

## Planning Gate
- This file is planning-only. No implementation starts until explicit user approval.
- Source-of-truth product requirements: `docs/Prompts.md`.
- Execution guardrails and compatibility invariants: `AGENTS.md`.
- If any requirement appears conflicting, log it in "Spec Consistency Notes" and apply the smallest correction before coding.

## Spec Consistency Notes (Current)
- `docs/Prompts.md` now includes a **"Verification Prompts"** section and status-tagged sections.
- OAuth routes exist but still need production-hardening (identity-linking by provider subject, callback resilience, tests).
- Chrome extension was previously listed as MVP non-goal and is now promoted to post-MVP planned milestones (M24-M28).

## Requirement Coverage Snapshot

| Requirement | Planned Milestone(s) |
|---|---|
| One-command local startup (`pnpm dev`) | M01, M04 |
| Local-first operation (no paid services) | M04, M12, M13 |
| Google + Apple auth integration | M06 |
| OAuth hardening completion (env-gated production-ready) | M23 |
| Shareable read-only demo access | M07, M17 |
| Async pipeline only (no heavy request work) | M09 |
| Idempotent/restartable jobs + caching | M09, M11, M12, M13 |
| Deterministic serialization (RSS, logs, manifests) | M09, M15, M18 |
| RSS correctness (GUID, enclosure uniqueness, ordering) | M15 |
| Media `HEAD` + `Range` compatibility | M14, M21 |
| URL + PDF ingest (no OCR for scanned PDFs) | M08, M10 |
| Admin module (users, jobs, diagnostics) | M06, M16 |
| Export command (`pnpm export`) | M18 |
| Azure-ready path (containers + env/resource map) | M19 |
| License policy gate (deny AGPL/SSPL/NC) | M20 |
| Demo starter item preloaded by default | M17 |
| Attribution for copied patterns (`abogen`, `postcast`) | M03 |
| Chrome extension raw HTML snapshot ingest | M24, M25, M26, M27, M28 |

## Milestone Status Snapshot

| Milestone | Status |
|---|---|
| M00 | Done |
| M01 | Done |
| M02 | Done |
| M03 | Done |
| M04 | Done |
| M05 | Done |
| M06 | In Progress |
| M07 | Done |
| M08 | Done |
| M09 | Done |
| M10 | Done |
| M11 | Done |
| M12 | Done |
| M13 | Done |
| M14 | Done |
| M15 | Done |
| M16 | Done |
| M17 | Done |
| M18 | Done |
| M19 | Planned |
| M20 | In Progress |
| M21 | In Progress |
| M22 | Planned |
| M23 | Planned |
| M24 | Planned |
| M25 | Planned |
| M26 | Planned |
| M27 | Planned |
| M28 | Planned |

## Milestones

### M00 - Spec Lock and Acceptance Baseline
- Scope:
  - Convert prompts/guardrails into an auditable checklist.
  - Define completion criteria and stop/go gate for implementation start.
- Key files/modules:
  - `docs/plans.md`
- Acceptance criteria:
  - All hard requirements from `docs/Prompts.md` map to milestones.
  - Known spec mismatch list is explicit.
- Verification commands:
  - Manual checklist review in `docs/plans.md`.

### M01 - Workspace Bootstrap and Command Contract
- Scope:
  - Initialize pnpm workspace and root scripts.
  - Standardize script names: `dev`, `build`, `test`, `lint`, `typecheck`, `format`, `export`.
- Key files/modules:
  - `package.json`
  - `pnpm-workspace.yaml`
  - `tsconfig.base.json`
  - root lint/test/typecheck configs
- Acceptance criteria:
  - `pnpm dev` exists and orchestrates full local stack.
  - All required root scripts are defined.
- Verification commands:
  - `pnpm install`
  - `pnpm run dev --help`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`

### M02 - Monorepo Skeleton and Interface Boundaries
- Scope:
  - Create maintainable repo layout with strict package boundaries.
  - Define shared contracts in `packages/core`.
- Key files/modules:
  - `apps/web/`
  - `apps/worker/`
  - `packages/core/`
  - `packages/ui/` (optional for MVP)
  - `docs/`, `fixtures/`, `scripts/`, `vendor/`
- Acceptance criteria:
  - Web and worker consume shared core types/interfaces.
  - No heavy pipeline logic in request handlers.
- Verification commands:
  - `pnpm -r typecheck`
  - `pnpm -r test`

### M03 - Third-Party Reference Intake and Attribution
- Scope:
  - Add read-only upstream references (`abogen`, `postcast`) under `vendor/`.
  - Track copied ideas/code snippets with attribution.
- Key files/modules:
  - `vendor/postcast/`
  - `vendor/abogen/` (or documented external reference if not vendored)
  - `docs/THIRD_PARTY.md`
- Acceptance criteria:
  - Upstream references are clearly isolated as non-runtime source.
  - Attribution doc explains what was reused and where.
- Verification commands:
  - `test -d vendor/postcast`
  - `test -f docs/THIRD_PARTY.md`

### M04 - Environment and Runtime Profiles (Local + Azure-Ready)
- Scope:
  - Define local defaults and cloud-compatible env contract.
  - Ensure no hardcoded local-only assumptions outside dev profile.
- Key files/modules:
  - `.env.example`
  - `docs/env.md`
  - startup scripts for web + worker + optional python service
- Acceptance criteria:
  - Local mode works with zero paid APIs.
  - Azure mode variables documented, including DB/storage/auth settings.
- Verification commands:
  - `pnpm dev` (local profile)
  - `pnpm run check:env`

### M05 - Database Schema and Migration Baseline
- Scope:
  - Implement Prisma schema for users, auth, items, episodes, jobs, events, tokens.
  - Set SQLite local DB location to `apps/web/.data/db.sqlite`.
- Key files/modules:
  - `apps/web/prisma/schema.prisma`
  - `apps/web/prisma/migrations/*`
  - `apps/web/src/lib/db/*`
- Acceptance criteria:
  - Schema supports private feeds, token rotation, admin visibility, and idempotent job linkage.
  - Migrations are reproducible from clean state.
- Verification commands:
  - `pnpm --filter @listenlater/web prisma migrate dev`
  - `pnpm --filter @listenlater/web test -- db`

### M06 - Authentication Surfaces (User + OAuth + Admin)
- Scope:
  - Session auth for web users.
  - Google and Apple OAuth integration (env-gated).
  - Predefined admin account bootstrap and role-gated admin routes.
- Key files/modules:
  - `apps/web/src/auth/*`
  - `apps/web/src/app/login/*`
  - `apps/web/src/app/admin/*`
- Acceptance criteria:
  - Local credential login works without external providers.
  - OAuth providers work when env vars are configured.
  - Admin routes are inaccessible to non-admin users.
- Verification commands:
  - `pnpm --filter @listenlater/web test -- auth`

### M07 - Feed Token, Media Token, and Read-Only Demo Access
- Scope:
  - Implement private feed token issuance and rotation.
  - Implement media access control via tokenized URLs or signed URLs.
  - Add read-only share mode for demos.
- Key files/modules:
  - `apps/web/src/app/api/feed-token/*`
  - `apps/web/src/app/api/share/*`
  - `packages/core/src/security/tokens/*`
- Acceptance criteria:
  - Rotating feed token invalidates old feed URLs.
  - Tokens are never logged or leaked in client-visible errors.
  - Shared read-only mode cannot mutate items/settings.
- Verification commands:
  - `pnpm --filter @listenlater/web test -- tokens`
  - manual: old feed URL returns unauthorized/not found after rotation

### M08 - Ingestion APIs and Abuse Prevention
- Scope:
  - Add URL submission and PDF upload endpoints.
  - Add Zod validation, file size/type checks, and per-user/per-IP rate limiting.
  - Add SSRF protections for URL fetch pipeline.
- Key files/modules:
  - `apps/web/src/app/api/items/*`
  - `packages/core/src/validation/*`
  - `packages/core/src/security/urlPolicy.ts`
  - `packages/core/src/security/rateLimit/*`
- Acceptance criteria:
  - Valid URL/PDF creates queued item.
  - Private/internal IP and metadata endpoint requests are blocked.
  - Invalid files/oversized files are rejected with clear error codes/messages.
- Verification commands:
  - `pnpm test -- ingestion`
  - `pnpm test -- security`

### M09 - Job Engine, Async Pipeline, and Deterministic Event Log
- Scope:
  - Implement worker loop: claim, process, retry, dead-letter/fail handling.
  - Enforce async-only conversion path; web only enqueues and displays state.
  - Emit append-only structured job events.
- Key files/modules:
  - `apps/worker/src/runner/*`
  - `apps/worker/src/jobs/*`
  - `packages/core/src/jobs/*`
  - `packages/core/src/logging/*`
- Acceptance criteria:
  - State transitions: `queued -> processing -> ready|failed`.
  - Retries do not duplicate episodes or re-run already completed expensive steps.
  - Job events are deterministic and linked to `item_id`/`job_id`.
  - Structured logs include `item_id`/`job_id` and avoid dumping full extracted text bodies.
- Verification commands:
  - `pnpm --filter @listenlater/worker test -- jobs`
  - `pnpm --filter @listenlater/worker test -- idempotency`

### M10 - Content Extraction Adapters (HTML + PDF, OCR Unsupported)
- Scope:
  - Implement Readability-based HTML extraction.
  - Implement text-based PDF extraction via pdfjs.
  - Detect scanned/image-heavy PDFs and fail with explicit OCR-not-supported error.
- Key files/modules:
  - `packages/core/src/extract/html/*`
  - `packages/core/src/extract/pdf/*`
  - `fixtures/html/*`
  - `fixtures/pdf/*`
- Acceptance criteria:
  - Fixture extraction is deterministic and non-empty for valid inputs.
  - Scanned-PDF path fails predictably with machine-readable error code.
- Verification commands:
  - `pnpm test -- extraction`
  - `pnpm test -- extraction-pdf`

### M11 - Normalization, Chunking, and Hash-Cache Determinism
- Scope:
  - Normalize extracted text and split by sentence/paragraph constraints.
  - Persist chunk hashes for TTS cache reuse.
- Key files/modules:
  - `packages/core/src/normalize/*`
  - `packages/core/src/chunking/*`
- Acceptance criteria:
  - Same input always yields same chunk boundaries and hash set.
  - Chunk cache prevents repeated synthesis on retries/restarts.
- Verification commands:
  - `pnpm test -- chunking`
  - `pnpm test -- determinism`

### M12 - TTS Provider Layer (Kokoro-First + Optional Providers)
- Scope:
  - Define `TtsProvider.synthesizeToFile({ text, voice, format, outPath })`.
  - Implement Kokoro-backed local narration path through python-tts service.
  - Keep optional providers (e.g., OpenAI/macOS `say`) behind adapters where configured.
  - Maintain python service runtime and preview prewarm path.
- Key files/modules:
  - `packages/core/src/tts/types.ts`
  - `packages/core/src/tts/kokoro.ts`
  - `packages/core/src/tts/openai.ts`
  - `services/python-tts/` (runtime service)
- Acceptance criteria:
  - Local audio generation works with no cloud dependencies.
  - Provider selection is adapter-driven and test-mockable.
  - Python service can run locally and expose synthesis/health endpoints.
- Verification commands:
  - `pnpm test -- tts`
  - `pnpm test -- tts-provider-selection`
  - `npm run test:tts:e2e`

### M13 - Storage Adapter and Artifact Lifecycle
- Scope:
  - Implement local storage adapter for media outputs.
  - Define deterministic storage key format for audio/chunks/manifests.
  - Add cleanup behavior for deleted items/accounts.
- Key files/modules:
  - `packages/core/src/storage/*`
  - `apps/web/.data/media/` (runtime path)
  - deletion handlers in web/worker flows
- Acceptance criteria:
  - Deterministic keys allow safe retries and cache hits.
  - Delete item/account removes or tombstones related artifacts as defined.
  - Data retention policy minimizes long-lived storage of full extracted text unless explicitly required.
- Verification commands:
  - `pnpm test -- storage`
  - `pnpm test -- deletion`

### M14 - Media Delivery Contract (`HEAD` + `Range`)
- Scope:
  - Implement media endpoint with strict HTTP semantics for podcast clients.
  - Preserve range behavior if proxying through backend.
- Key files/modules:
  - `apps/web/src/app/api/media/*`
  - `packages/core/src/http/range/*`
- Acceptance criteria:
  - `HEAD` returns valid `Content-Length` and type.
  - `Range: bytes=0-1` returns `206` with valid `Content-Range`.
  - Unauthorized media token requests fail without exposing secrets.
- Verification commands:
  - `pnpm test -- media`
  - `curl -I "<MP3_URL>"`
  - `curl -i -H "Range: bytes=0-1" "<MP3_URL>"`

### M15 - Deterministic RSS Renderer and Private Feed Endpoint
- Scope:
  - Build RSS 2.0 feed with iTunes namespace and deterministic ordering.
  - Ensure stable GUID and unique enclosure URL per episode item.
- Key files/modules:
  - `packages/core/src/rss/*`
  - `apps/web/src/app/rss/[feedToken]/route.ts` (or equivalent)
- Acceptance criteria:
  - RFC 2822 `pubDate`, proper XML escaping, newest-first item order.
  - Enclosure includes correct URL, byte length, and MIME.
  - No item publishes until audio is confirmed available/range-capable.
- Verification commands:
  - `pnpm test -- rss`
  - `pnpm test -- rss-snapshots`

### M16 - Web App UX and Admin Observability Module
- Scope:
  - Implement `/login` and `/app` dashboard UX.
  - Implement URL/PDF forms, item status list, retry/delete actions.
  - Add in-browser playback and download.
  - Build admin dashboard for active users, job success/failure, error logs.
- Key files/modules:
  - `apps/web/src/app/login/*`
  - `apps/web/src/app/app/*`
  - `apps/web/src/app/admin/*`
  - shared UI components
- Acceptance criteria:
  - UI is implemented with React + Tailwind and remains polished for live demos.
  - Clear empty states, toasts, and failure guidance.
  - Admin dashboard is presentation-ready and role-protected.
  - Delete item + delete account flows are available and functional.
- Verification commands:
  - `pnpm --filter @listenlater/web test -- ui`
  - `pnpm --filter @listenlater/web test -- admin`

### M17 - Demo Starter Content and Read-Only Demo Experience
- Scope:
  - Add sample PDF fixture, pre-generated audio, and seeded episode/feed entry.
  - Show demo banner when running with seeded data.
  - Provide read-only URL workflow for demo observers.
- Key files/modules:
  - `fixtures/demo/*`
  - `scripts/seed-demo.*`
  - dashboard demo components
- Acceptance criteria:
  - Fresh local run shows playable starter episode without API keys.
  - Read-only demo URL allows viewing/listening but blocks edits.
- Verification commands:
  - `pnpm run seed:demo`
  - `pnpm test -- demo-seed`

### M18 - Export Pipeline and Deterministic Manifest
- Scope:
  - Implement `pnpm export` to write RSS, media files, and manifest JSON.
  - Ensure manifest ordering and fields are deterministic.
- Key files/modules:
  - `scripts/export.*`
  - `exports/rss.xml`
  - `exports/media/*`
  - `exports/manifest.json`
- Acceptance criteria:
  - Export command succeeds from local state.
  - Manifest and RSS outputs are stable across repeated runs.
- Verification commands:
  - `pnpm export`
  - `pnpm test -- export`

### M19 - Azure Readiness and Deployment Documentation
- Scope:
  - Containerize web and worker.
  - Document Azure resource map, env vars, and deployment steps.
  - Keep runtime adapters cloud-ready (DB/storage/auth).
- Key files/modules:
  - `Dockerfile.web`
  - `Dockerfile.worker`
  - `docs/azure-deploy.md`
  - `docs/architecture.md`
- Acceptance criteria:
  - Containers build locally.
  - Docs clearly map local config to Azure config.
- Verification commands:
  - `docker build -f Dockerfile.web .`
  - `docker build -f Dockerfile.worker .`

### M20 - Automated Quality Gates and Spec-Drift Controls
- Scope:
  - Add CI workflow for lint, typecheck, tests, build, snapshots.
  - Add dependency license gate to block AGPL/SSPL/NC.
  - Add and run verification prompts flow from `docs/Prompts.md`.
- Key files/modules:
  - `.github/workflows/ci.yml` (or equivalent)
  - `scripts/license-check.*`
  - `docs/Prompts.md` (add "Verification Prompts" section)
- Acceptance criteria:
  - CI fails on lint/type/test/snapshot/license violations.
  - Verification prompts exist and are run before release signoff.
- Verification commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
  - `pnpm run license:check`
  - `ruff check services/python-tts`
  - `mypy services/python-tts` (if configured)

### M21 - Release Certification and Podcast Compatibility Gate
- Scope:
  - Run final release checklist including podcast client compatibility checks.
  - Validate with manual app subscription tests on reachable host.
- Key files/modules:
  - `scripts/verify_podcast_contract.sh`
  - release checklist doc section in `docs/plans.md`
- Acceptance criteria:
  - Contract script passes on final feed URL.
  - Manual smoke tests pass: Apple Podcasts + one other podcast app.
  - Demo walkthrough is reproducible in under 3 minutes.
- Verification commands:
  - `./scripts/verify_podcast_contract.sh "<FEED_URL>"`
  - `curl -I "<FEED_URL>"`
  - `curl -I "<MP3_URL>"`
  - `curl -i -H "Range: bytes=0-1" "<MP3_URL>"`

### M22 - Optional Phase 1.5: Multi-Part Episode Splitting for Long Inputs
- Scope:
  - Add deterministic segmentation for very long items into multiple podcast episodes/parts.
  - Preserve stable GUID scheme and ordering for part sequences.
- Key files/modules:
  - chunking + episode assembly modules in `packages/core`
  - feed rendering logic in `packages/core/src/rss/*`
- Acceptance criteria:
  - Long inputs can be rendered as numbered parts with deterministic titles/GUIDs.
  - Enclosure URLs remain unique per part and feed ordering remains correct.
- Verification commands:
  - `pnpm test -- longform-splitting`
  - `pnpm test -- rss`

### M23 - OAuth Hardening Completion (Google + Apple)
- Scope:
  - Add provider config detection and explicit login UX gating.
  - Harden callback/state handling and user-safe error mapping.
  - Add provider-subject identity linking strategy to avoid unsafe email-only collisions.
  - Add automated tests for success/failure callback paths.
- Key files/modules:
  - `apps/web/src/app/api/auth/google/*`
  - `apps/web/src/app/api/auth/apple/*`
  - `apps/web/src/lib/auth.ts`
  - `apps/web/src/app/login/page.tsx`
- Acceptance criteria:
  - Local password login works without external providers configured.
  - OAuth buttons/routes handle unconfigured providers cleanly.
  - With valid provider env set, callback creates session and lands in `/app`.
  - Admin/user role protections remain intact.
- Verification commands:
  - `npm run lint`
  - `npm run test`
  - `npm run build`
  - auth integration tests with mocked provider flows

### M24 - Extension Auth Model (Login In Extension)
- Scope:
  - Implement one-time connect-code mint endpoint (session-authenticated from web app).
  - Implement code exchange endpoint for extension-scoped token.
  - Store extension tokens hashed at rest and support rotation/revocation.
- Key files/modules:
  - `apps/web/src/app/api/auth/extension/connect-code/*`
  - `apps/web/src/app/api/auth/extension/exchange/*`
  - `packages/core/src/security/tokens/*`
  - Prisma schema additions for extension tokens/codes
- Acceptance criteria:
  - User can connect extension without entering provider secrets in extension UI.
  - Extension token authorizes ingest-only extension APIs.
  - Expired/replayed/revoked tokens are rejected with clear errors.
- Verification commands:
  - token lifecycle tests
  - unauthorized/expired/replayed token tests

### M25 - HTML Snapshot Ingestion API
- Scope:
  - Add new source type `HTML_SNAPSHOT`.
  - Implement `POST /api/items/html-snapshot`.
  - Accept canonical URL, optional title fallback, raw HTML snapshot, and capture metadata.
  - Add payload size limits, schema validation, and abuse controls.
  - Keep snapshot retention ephemeral by default.
- Key files/modules:
  - `apps/web/src/app/api/items/html-snapshot/*`
  - `apps/web/src/lib/items.ts`
  - `packages/core/src/types/domain.ts`
  - `packages/core` submit schemas
- Acceptance criteria:
  - Valid snapshot enqueue path works and does not require backend URL fetch.
  - Clear errors for malformed or oversized payloads.
  - Existing URL/PDF ingestion remains unchanged.
- Verification commands:
  - schema validation tests
  - ingest API tests for `HTML_SNAPSHOT`
  - regression tests for URL/PDF endpoints

### M26 - Worker Extraction Path for Snapshot Mode
- Scope:
  - Extend extraction adapter to support URL, PDF, and HTML snapshot source modes.
  - Reuse cleanup pipeline for deterministic output quality.
  - Ensure chunk/hash determinism is unchanged for equivalent content.
- Key files/modules:
  - `apps/worker/src/jobs/processItemJob.ts`
  - `packages/core/src/extract/*`
  - extraction fixtures for snapshot mode
- Acceptance criteria:
  - `HTML_SNAPSHOT` source processes without network fetch.
  - Output quality and determinism are comparable to current URL flow.
  - Failures return actionable extraction errors.
- Verification commands:
  - extraction fixture tests for snapshot mode
  - chunk determinism tests
  - worker pipeline tests

### M27 - Chrome Extension (MV3) UX + Capture Flow
- Scope:
  - Build extension popup UX with connect status and submit action.
  - Capture `document.documentElement.outerHTML`, page URL, and title from active tab.
  - Send authenticated payload to backend snapshot ingest API.
  - Provide user-facing error/success feedback in extension popup.
- Key files/modules:
  - `apps/extension/` (MV3 manifest, popup, background, content script)
  - backend extension auth and ingest routes
  - docs for local extension loading
- Acceptance criteria:
  - End-to-end capture from active tab creates queued item successfully.
  - Extension UX clearly indicates connected/disconnected/submission states.
  - Errors are understandable (unsupported page, payload too large, auth expired).
- Verification commands:
  - local extension manual smoke script
  - API contract tests for extension requests

### M28 - Security/Compliance + Demo Readiness for Extension
- Scope:
  - Enforce user-visible-content-only policy for extension ingestion.
  - Minimize extension permissions and review abuse scenarios.
  - Add audit logging for extension submissions.
  - Extend demo script to include extension capture flow.
- Key files/modules:
  - extension manifest + permission docs
  - ingestion policy checks
  - `docs/plans.md` demo script + security checklist
- Acceptance criteria:
  - Security checklist passes for token handling and payload controls.
  - Extension flow is demo-ready and repeatable.
  - Policy is explicit: no credential forwarding/session replay/headless bypass.
- Verification commands:
  - security tests (token misuse, payload abuse)
  - demo walkthrough including extension capture

## Assumptions and Defaults
- Package manager: `pnpm`.
- Workspace package names will use `@listenlater/*`.
- Local demo audio format currently defaults to AAC/M4A (`audio/mp4`).
- OAuth providers are optional at runtime and must not block local credential login.
- Apple Podcasts verification requires a reachable host (Azure deployment or trusted tunnel).
- Optional Phase 1.5 milestone (M22) is explicitly non-blocking for MVP completion.
- Chrome extension is post-MVP and does not block current MVP release.
- Authenticated page capture policy is user-visible-only (no credential/session forwarding or bypass automation).

## Architecture Overview

### High-Level Components
- `apps/web`:
  - UI routes (`/login`, `/app`, admin pages)
  - lightweight API routes (enqueue jobs, feed rendering, media serving in dev mode)
  - auth/session/token management
- `apps/worker`:
  - async processing loop and retry/idempotency control
  - extraction, normalization, chunking, TTS orchestration
- `packages/core`:
  - shared schemas and domain types
  - adapter interfaces (extract, tts, storage, rss)
  - deterministic utilities (sorting, serialization, hashing)
- `services/python-tts`:
  - Python scaffold for future local/hosted TTS model execution path

### Data Model (Planned Entities)
- `User`:
  - `id`, `email`, `name`, `role`, `created_at`
- `Session`:
  - `id`, `user_id`, `expires_at`
- `FeedToken`:
  - `id`, `user_id`, `token_hash`, `active`, `rotated_at`
- `ShareToken` (read-only demo):
  - `id`, `user_id`, `token_hash`, `scope=read_only`, `expires_at`
- `Item`:
  - `id`, `user_id`, `source_type(url|pdf|html_snapshot)`, `source_uri_or_file`, `status`, `error_code`, `error_message`
- `Episode`:
  - `id`, `item_id`, `guid`, `title`, `audio_path`, `audio_bytes`, `mime_type`, `published_at`
- `Job`:
  - `id`, `item_id`, `attempt`, `status`, `locked_at`, `next_retry_at`
- `JobEvent`:
  - `id`, `job_id`, `item_id`, `stage`, `payload_json`, `created_at`

### Pipeline and State Machine
- Intake route:
  - validates request -> creates `Item(status=queued)` -> enqueues `Job`.
- Worker stages:
  - claim job -> mark `processing`
  - extract text
  - normalize/chunk
  - synthesize (cache-aware)
  - persist media artifact
  - publish episode metadata
  - mark `ready`
- Failure behavior:
  - write deterministic `JobEvent`
  - set `failed` with `error_code` and user-safe `error_message`
  - schedule retry if eligible

### Adapter Interfaces (No Vendor Lock-in)
- `ExtractorAdapter`:
  - `extractFromUrl(input): ExtractResult`
  - `extractFromPdf(input): ExtractResult`
  - `extractFromHtmlSnapshot(input): ExtractResult`
- `TtsProvider`:
  - `synthesizeToFile({ text, voice, format, outPath })`
- `StorageAdapter`:
  - `putObject/getObject/headObject/getSignedUrl`
- `RssBuilder`:
  - `buildFeed({ user, episodes, baseUrl }): string`

### Determinism Strategy
- Stable sort keys for feed items and manifest entries.
- Deterministic episode GUID from stable episode identity.
- Deterministic chunk hashing from canonical normalized text.
- Snapshot tests on RSS XML, event logs, and export manifest.

### Security and Privacy Strategy
- Feed/media/share tokens are hashed at rest and redacted in logs.
- SSRF guardrails block private networks and metadata endpoints.
- Rate limits per IP and per authenticated user.
- Clear delete semantics for item/account and corresponding data artifacts.

### Local vs Azure Runtime Strategy
- Local:
  - SQLite + local filesystem media + Kokoro/python-tts local narration.
- Azure:
  - Azure SQL Serverless + Blob storage + containerized web/worker.
  - optional cloud TTS provider via adapter.

## Risk Register

| Risk | Probability | Impact | Detection Signal | Mitigation | Owner Milestone(s) |
|---|---|---|---|---|---|
| Podcast clients reject media seek/play | Medium | High | Range test not returning `206`, app playback stalls | enforce `HEAD`/`Range` tests + contract script | M14, M21 |
| RSS invalid or unstable across runs | Medium | High | snapshot drift or feed parsing errors | deterministic serializer + strict RSS tests | M15, M20 |
| HTML extraction low quality/empty output | Medium | Medium | extraction tests fail or many failed jobs | fixture corpus + fallback normalization + explicit errors | M10 |
| PDF extraction fails on scanned docs silently | Medium | High | empty text with no clear error | scanned detection and explicit OCR-not-supported code | M10 |
| Retry logic creates duplicate episodes | Medium | High | duplicate GUID/enclosures | deterministic IDs + check-before-generate + transactionally claimed jobs | M09, M11 |
| Token leakage in logs/errors | Low | High | token strings visible in logs/UI errors | token redaction + secure error mapping | M07, M20 |
| OAuth instability in local demos | Medium | Medium | login blocked when providers unavailable | local auth fallback always enabled | M06 |
| OAuth account-linking ambiguity (same email across providers) | Medium | High | wrong account linked after provider login | introduce provider-subject identity table and linking rules | M23 |
| Extension token leakage or replay | Medium | High | unauthorized extension submissions | short-lived connect codes, hashed stored tokens, revocation and replay checks | M24, M28 |
| Snapshot payload abuse (oversized/hostile HTML) | Medium | High | high memory/CPU usage or ingest failures | strict payload caps, validation, and rate limits | M25, M28 |
| Policy drift for paywalled content handling | Medium | Medium | feature requests imply bypass behavior | enforce user-visible-only policy in spec, code, and tests | M28 |
| License policy violation in dependencies | Low | High | CI dependency audit fail | automated denylist gate in CI | M20 |
| Demo not impressive without API keys | Medium | High | blank state or slow first run | starter seed with pre-generated episode and demo banner | M17 |
| Cloud deployment drift from local assumptions | Medium | Medium | Azure docs incomplete or container mismatch | env contract + container smoke + architecture docs | M19 |
| Missing verification-prompts process | Medium | Medium | drift between plan and releases | add section to `docs/Prompts.md` and run each milestone | M20 |

## 3-Minute Demo Script (Time-Boxed)

### 00:00-00:20 - Start and Login
1. Run `pnpm dev`.
2. Open app and log in with seeded demo account.

### 00:20-00:45 - Show Immediate Value
1. Show starter episode already present and playable.
2. Highlight private feed URL and copy button.

### 00:45-01:15 - Verify Feed
1. Open `/rss/<feed_token>.xml`.
2. Point out GUID + enclosure URL + enclosure length/type.

### 01:15-01:45 - New Submission
1. Submit a URL (or sample PDF).
2. Show status transition `queued -> processing`.

### 01:45-02:10 - Admin Observability
1. Open admin dashboard.
2. Show active users, job success/failure, recent errors.

### 02:10-02:35 - Ready Episode and Playback
1. Return to dashboard; show item as `ready`.
2. Play audio in browser and seek mid-track.

### 02:35-02:55 - Podcast Compatibility Proof
1. Run `curl -I "<MP3_URL>"`.
2. Run `curl -i -H "Range: bytes=0-1" "<MP3_URL>"` and show `206`.

### 02:55-03:00 - Portability
1. Mention `pnpm export` creates portable RSS + media + manifest outputs.

## Test Strategy and Acceptance Matrix

### Unit Tests (Minimum)
- URL normalization + SSRF guard checks.
- HTML extraction fixtures.
- PDF extraction fixtures including scanned-failure case.
- Chunk determinism and hash stability.
- RSS item GUID stability, enclosure uniqueness, XML escaping.
- Storage URL/token generation.

### Integration Tests
- URL submission -> job ready -> RSS item appears -> media reachable.
- PDF submission -> ready for text-based PDF.
- Scanned PDF -> failed with explicit OCR-not-supported error.
- Media `HEAD` + `Range` behavior.
- Feed token rotation invalidates prior feed URL.
- OAuth callback coverage (unconfigured provider, state mismatch, token/profile failures, success path).
- Extension connect-code/token lifecycle and HTML snapshot ingest end-to-end.

### Snapshot/Determinism Tests
- RSS XML snapshots.
- Job event log serialization snapshots.
- Export manifest snapshots.

### Manual Smoke Tests (Release Gate)
- Subscribe on Apple Podcasts (reachable host) and one additional RSS podcast app.
- Play, seek, resume.
- Validate read-only share mode cannot mutate content.

## Milestone Execution Protocol (After Approval)
- Execute one milestone at a time.
- For each milestone:
  - implement only that scope
  - run listed verification commands
  - fix failures immediately
  - commit with clear milestone-specific message
  - append results to "Milestone Verification Log"
- Do not skip podcast compatibility gates before marking done.

## Ongoing Notes and Decisions

### Decision Log Template
- Date:
- Milestone:
- Decision:
- Alternatives considered:
- Why this choice:
- Follow-up impact:

### Open Questions Tracker
- Question:
- Blocking/non-blocking:
- Owner:
- Due milestone:
- Resolution:

### Milestone Verification Log Template
- Milestone:
- Commands run:
- Pass/fail:
- Regressions found:
- Fixes applied:
- Commit hash:
