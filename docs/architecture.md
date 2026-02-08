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

## Async pipeline
1. Web API validates and enqueues an item/job.
2. Worker claims queued jobs.
3. Worker extracts text (Readability for URL, pdfjs for PDF).
4. Worker normalizes/chunks text and computes deterministic hash.
5. Worker synthesizes audio (local `say` default), caches output.
6. Worker writes episode metadata and marks item `READY`.
7. RSS endpoint includes ready episodes only.

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

## Runtime profiles
- Local default:
  - SQLite (`apps/web/.data/db.sqlite`)
  - Local media filesystem (`apps/web/.data/media`)
  - macOS `say` for TTS.
- Azure-ready:
  - DB/storage adapters and containerized runtime docs prepared.
