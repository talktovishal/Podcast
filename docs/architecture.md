# ArticlePod Architecture

## Overview
ArticlePod is an RSS-first ingestion and narration system with three runtime tiers:
- `apps/web`: Next.js UI + API routes (auth, ingest, feed, media)
- `apps/worker`: asynchronous extraction/TTS/publish pipeline
- `services/python-tts`: self-hosted Kokoro inference service
- `packages/core`: shared extraction, security, chunking, storage, and RSS logic

## Data model
Primary entities:
- `User`, `Session`, `FeedToken`, `ShareToken`
- `Item` (source submission lifecycle)
- `Job` + `JobEvent` (worker queue and deterministic events)
- `Episode` (RSS/media metadata)
- `ItemArtifact` (raw + markdown extraction artifact metadata)
- `ChunkCache` (idempotent synthesis cache)
- `OAuthIdentity` (provider subject mapping)
- `ExtensionConnectCode` + `ExtensionToken` (extension auth)
- `DemoExtractionTrace` (demo-only extraction diagnostics, last 10)
- `AnalyticsEvent` (raw behavior events for KPI/retention/user analytics)
- `AnalyticsDailyRollup` (daily additive counters for fast trend queries)
- `AnalyticsCoverage` (metric coverage/backfill metadata, including forward-only metrics)

## Ingestion sources
`Item.sourceType` supports:
- `URL`
- `PDF`
- `HTML_SNAPSHOT` (Chrome extension captured HTML)

The worker extraction adapter branches by source type:
- URL: backend fetch + readability + cleanup
- PDF: uploaded bytes from artifact storage + text extraction
- HTML snapshot: parse raw HTML directly, no server-side fetch

## Extraction Artifact Plane
Current behavior (`M57`-`M64` implemented):
- extraction emits both narration text and markdown from HTML/PDF/snapshot sources.
- worker persists dual artifacts in object storage:
  - raw source artifacts (`RAW_HTML`, `RAW_PDF`) with retention expiry (default target: 90 days)
  - markdown artifact (`MARKDOWN`) retained for downstream workflows
- metadata is normalized via `ItemArtifact` records:
  - `kind`, `storageKey`, `contentType`, `byteLength`, `expiresAt`, `createdAt`
- narration input contract uses markdown-derived normalized text while preserving deterministic chunk/hash behavior.

## Async pipeline
1. Web validates request and enqueues `Item` + `Job`.
2. Worker claims due jobs (`QUEUED` or retry-eligible `FAILED`).
3. Worker extracts + normalizes text.
4. Worker chunks text deterministically and computes hash key.
5. Worker resolves TTS selection and uses chunk cache when available.
6. Worker writes final audio artifact to object storage and upserts `Episode`.
7. Worker marks item/job `READY/SUCCEEDED` or `FAILED` with actionable error.

## Admin analytics pipeline (`M66`-`M70`)
Event sources:
- web auth: `USER_SIGNUP`, `USER_LOGIN`
- ingest paths: `ITEM_SUBMITTED`
- worker completion: `ITEM_READY`, `ITEM_FAILED` (+ queue/processing duration metadata)
- media route: `PLAYBACK_STARTED` (deduped by user + media + day)

Storage/query model:
- write path records raw `AnalyticsEvent` rows plus `AnalyticsDailyRollup` updates.
- analytics APIs compute KPI/retention from indexed raw events with rollups available for additive trend acceleration.
- `AnalyticsCoverage` surfaces historical/backfill confidence:
  - signups/logins/submissions/ready/failed can be backfilled
  - playback starts are forward-only from instrumentation start date.

Queue resilience:
- stale `PROCESSING` reclaim (`lockedAt` timeout)
- due-retry scheduling via `nextRetryAt`
- retry jitter to reduce thundering-herd retries

## Storage contract
Artifacts use object keys, not local absolute paths.

Backends:
- `local` -> filesystem-backed object store (simple profile)
- `azure_blob` -> Azure Blob/Azurite object store (parity + azure profiles)

Critical artifacts in object storage:
- uploaded PDFs
- generated episode audio
- exported media copies
- raw-source snapshots/artifacts (`RAW_HTML`, `RAW_PDF`) with retention policy
- markdown artifacts (`MARKDOWN`) for diagnostics/reuse

## Media delivery contract
`/api/media/[...path]` is storage-backed and enforces podcast-compatible semantics:
- token authorization via active feed token
- `HEAD` with accurate `Content-Length`
- `GET` with byte-range `206 Partial Content`
- stable enclosure URLs from episode object keys

## Extension ingestion path
1. User is authenticated on web app.
2. Web mints one-time extension connect code.
3. Extension exchanges code for scoped token.
4. Extension captures active-tab HTML (`document.documentElement.outerHTML`).
5. Extension calls `POST /api/items/html-snapshot`.
6. Item enters normal worker pipeline and appears in user feed.

Policy guardrails:
- capture only user-visible page content
- no credential forwarding/session replay to backend
- no bypass automation (paywall/DRM/headless bypass)

## Runtime profiles and parity
- `simple`: local SQLite + local object storage + local python-tts
- `parity`: Docker Compose with PostgreSQL + Azurite + python-tts + web + worker
- `azure`: single VM compute + Azure PostgreSQL + Azure Blob

Profile-aware Prisma generation is handled by `/Users/vishalchowdhary/Documents/Podcast/scripts/prisma-profile.mjs`.

## Durable Azure target (M35-M46)
Locked target architecture:
- Compute: single Linux VM running `web`, `worker`, and `python-tts` as `systemd` services
- Durable data: Azure PostgreSQL Flexible Server
- Durable artifacts: Azure Blob Storage
- Provisioning: Bicep + azd (`/Users/vishalchowdhary/Documents/Podcast/infra`)
- Deployment automation: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/*.sh`

Durability principle:
- VM loss must not lose customer records, episodes, or media objects.
- Recovery relies on re-provisioning compute and reconnecting to existing PostgreSQL + Blob state.

## Observability contract (M47+)
All runtime services emit structured JSON events with shared fields:
- `ts`, `level`, `service`, `env`, `msg`
- `error_code`, `support_id`
- correlation keys: `trace_id`, `span_id`, `request_id`, `job_id`, `item_id`

Local sink:
- `/Users/vishalchowdhary/Documents/Podcast/.runtime/logs/<service>/app.log.jsonl`
- rotation/retention controlled by `LOG_MAX_BYTES`, `LOG_MAX_FILES`, `LOG_RETENTION_DAYS`

Correlation propagation:
- internal calls carry `traceparent`, `x-request-id`, `x-job-id`, `x-item-id`
- worker binds correlation context per claimed job and propagates it to python-tts synth requests

Error response contract (API):
- `error_code`
- `error_message`
- `retry_recommended` (when applicable)
- `support_id` (for operator lookup)
