# ListenLater Architecture

## Overview
ListenLater is an RSS-first system that converts user-submitted URLs and text-based PDFs into narrated audio episodes. It consists of:
- `apps/web`: Next.js UI + API routes.
- `apps/worker`: asynchronous pipeline worker.
- `packages/core`: shared domain logic (validation, extraction, RSS, chunking, adapters).

## Data model
Primary entities:
- `User`: account and role (`USER`, `ADMIN`).
- `Session`: cookie-backed authenticated sessions.
- `FeedToken`: active/rotated private RSS token per user.
- `ShareToken`: read-only demo links.
- `Item`: URL/PDF submission and lifecycle status.
- `Job`: queue entry for async processing.
- `JobEvent`: append-only deterministic event log.
- `Episode`: published audio metadata used by RSS.
- `ChunkCache`: deterministic hash cache to avoid repeated synthesis.

Planned extension/auth entities:
- `OAuthIdentity`: provider + subject mapping per user for hardened account linking.
- `ExtensionToken`: scoped, hashed tokens for extension-only ingest APIs.
- `ExtensionConnectCode` (ephemeral): one-time code used to exchange web session auth for extension token.

## Async pipeline
1. Web API validates and enqueues an item/job.
2. Worker claims queued jobs.
3. Worker extracts text (Readability for URL, pdfjs for PDF).
4. Worker normalizes/chunks text and computes deterministic hash.
5. Worker synthesizes audio (Kokoro-local default), caches output.
6. Worker writes episode metadata and marks item `READY`.
7. RSS endpoint includes ready episodes only.

Planned source-type extension:
- Add `HTML_SNAPSHOT` source mode for client-captured raw HTML, so worker extraction can run without backend URL fetch.

## Idempotency strategy
- Item keeps stable identifier.
- Episode GUID uses deterministic `episode-{item_id}`.
- Chunk hash key derived from deterministic chunk sequence.
- Worker checks chunk cache before synthesis.
- Upsert episode record on retries.

## RSS determinism
- Episodes sorted by `publishedAt DESC`, then stable tie-breaker.
- XML generation escapes unsafe characters.
- Each item uses stable GUID and unique enclosure URL.
- RSS output is tested with deterministic snapshots.

## Media hosting contract
- Web media endpoint supports:
  - `HEAD` with accurate `Content-Length`
  - `GET` with `Range: bytes=...` and `206 Partial Content`
- Enclosure MIME is currently `audio/mp4` (m4a local default).
- Feed URL and media are token-protected.

## Security controls
- URL SSRF blocking for localhost/private/internal ranges.
- Token hashing at rest (`session`, `feed`, `share`).
- Rate limiting per user and per IP on submit routes.
- Delete item/account routes for data minimization.

## Planned extension ingestion path
1. User signs in on web app (local credentials or OAuth).
2. Web app mints one-time extension connect code (`session` authenticated).
3. Extension exchanges code for short-lived scoped `ExtensionToken`.
4. Extension captures active-tab HTML snapshot (`outerHTML` + URL/title metadata).
5. Extension calls `POST /api/items/html-snapshot` with token.
6. Worker extracts from provided HTML snapshot and proceeds through normal pipeline.

Policy constraints:
- Capture is limited to content already rendered to the user in browser.
- No credential/session forwarding from extension to backend.
- No headless automation or bypass behavior for paywalled/protected content.

## Post-M28 architecture increments (planned)
- `M29` (quality gates):
  - CI-required integration matrix for OAuth callbacks, extension token lifecycle, and HTML snapshot ingest.
- `M30` (onboarding):
  - Dashboard-to-extension connect flow with reconnect lifecycle state.
- `M31` (extraction quality):
  - quality-scoring layer in extraction path with deterministic fixture coverage.
- `M32` (operations):
  - pipeline metrics (queue depth, latency, failure rates) surfaced in admin and structured logs.
- `M33` (release certification):
  - release evidence artifacts for feed/media compatibility across Apple Podcasts and a secondary app.
- `M34` (security/data lifecycle):
  - automated retention and purge routines for demo diagnostics plus extension token lifecycle hardening.

## Runtime profiles
- Local default:
  - SQLite (`apps/web/.data/db.sqlite`)
  - Local media filesystem (`apps/web/.data/media`)
  - Kokoro via local python-tts service for narration.
- Azure-ready:
  - DB/storage adapters and containerized runtime docs prepared.
