# prompts.md — Codex spec for ArticlePod (RSS-first)

You are **Codex** acting as a **senior staff engineer and tech lead**. Build a polished, locally runnable **ArticlePod** web app from scratch.

## Spec Status (as of 2026-02-14)

### Implemented (as of 2026-02-14)
- Async URL/PDF -> extract -> chunk -> TTS -> episode -> RSS worker pipeline is in place.
- Private feed tokens, rotation, and read-only share links are implemented.
- RSS/media compatibility gates are implemented (`HEAD` + byte-range `206`).
- URL/PDF extraction pipeline includes abogen-derived cleanup with explicit error handling.
- Voice settings are Kokoro-focused in UI, with preview caching and python-tts integration.
- Demo-only extraction diagnostics (last 10 runs) and source attribution in recent items are implemented.
- OAuth provider gating + callback hardening with provider-subject identity linking is implemented.
- Chrome extension baseline is implemented:
  - one-time connect code -> extension token exchange
  - raw HTML snapshot ingest endpoint
  - worker extraction path for `HTML_SNAPSHOT`
  - standalone MV3 extension package under `apps/extension`.
- Durable Azure/parity implementation assets are in place:
  - profile-aware env validation (`simple`, `parity`, `azure`)
  - Docker Compose parity stack (PostgreSQL + Azurite + python-tts + web + worker)
  - object storage abstraction (`local`, `azure_blob`) wired into uploads/audio/media
  - SQLite export/import migration scripts for PostgreSQL transition
  - Bicep + azd infra baseline and VM deployment automation scripts.
  - VM rollout runbook/scripts include staging sync -> runtime promotion and nginx/TLS automation.
  - Deploy helper auto-runs VM bootstrap on first deploy when runtime user is missing.
- Observability baseline milestones are implemented:
  - shared error/log schema and support IDs
  - local structured JSONL logs with rotation
  - worker/python-tts correlation propagation
  - log triage and diagnostics collection scripts.
- Markdown artifact milestones (`M57`-`M64`) are implemented:
  - HTML/PDF extraction emits markdown outputs alongside narration text.
  - Worker persists dual artifacts (`RAW_HTML`/`RAW_PDF` + `MARKDOWN`) with lifecycle metadata.
  - Narration input is derived from markdown normalization with deterministic chunking preserved.
  - Markdown diagnostics/review surfaces are available in dashboard and API.
  - Backfill + purge scripts enforce dual-save transition and raw artifact retention policy.
- Docs governance baseline is implemented:
  - milestone snapshot tracks `target_finish`, `completed_on`, and evidence references
  - status reconciliation ledger captures corrections with confidence notes.

### Next Milestones
- Current milestone set (`M00`-`M64`) is complete per `docs/plans.md`.
- New work should be added as new dated milestones before implementation starts.

### Future / Optional
- Long-form split episodes (Phase 1.5).
- Bookmarklet variant after extension.
- Additional provider expansion beyond current Kokoro-first UX.

### Core goals

- This must be impressive to **non-engineers** in a live demo:
  - clean interface, modern design
  - it “just works” out of the box
  - it produces a **private podcast RSS feed** compatible with Apple Podcasts and any RSS-capable podcast app (when the server is reachable over the network).
- This must also be impressive to **engineers**:
  - clean architecture + separation of concerns (web vs worker)
  - strong TypeScript types and stable interfaces
  - deterministic serialization (RSS XML, job logs, manifests)
  - idempotent job processing + caching
  - tests + lint + typecheck + deterministic snapshots
- You will run for hours: **plan first**, then implement **milestone by milestone**. Do not skip planning.

### Hard requirements (follow strictly)

**Local run experience**
- One command to start the full stack (document exact commands).
- Must run on **macOS**.
- Must run **fully locally by default**:
  - no required external hosted services
  - local DB + local storage
  - local TTS provider supported so the demo works without paid APIs (current default: Kokoro via python-tts; `say` can remain optional fallback).
- Have Auth integration with Google, Apple (env-gated locally; local credential auth remains available).
- I should have a private account that I can setup in a manner that I point someone to a url and they should be able to run as a read only mode so that it's easily demoable to anyone.

**Remote run experience (Azure-ready)**
- Provide a simple path to deploy to Azure later:
  - containerize web + worker
  - document the Azure resource map and env vars
  - do not hardcode any local-only assumptions (except where explicitly labeled dev-only).

**Tech constraints**
- Language: **TypeScript**
- Frontend: **React + Tailwind**
- Backend: Node.js (TypeScript) + Python
- Use only **MIT / Apache-2.0 / BSD** licensed dependencies for production code.
- Do **not** introduce AGPL, SSPL, or “Non-Commercial” dependencies/models for production paths.

**Podcast compatibility constraints**
- RSS and audio hosting must support podcast clients:
  - audio endpoints must support **HTTP HEAD** and **byte-range requests**
  - each RSS item must have unique `<enclosure url=… length=… type=…>` and stable GUID

**Process constraints**
- Every milestone must include explicit verification steps:
  - tests, lint, typecheck, and deterministic snapshots where applicable.

### Deliverable (repo must contain)

- Working web app implementing the product spec below
- A demo “starter item” (sample PDF + pre-generated audio + feed entry) that loads by default so you can demo instantly even without API keys
- A short architecture doc (`docs/architecture.md`) explaining:
  - data model
  - job engine + idempotency strategy
  - RSS rendering and determinism strategy
  - media hosting (range/HEAD)
- Scripts:
  - `dev`, `build`, `test`, `lint`, `typecheck`, `format`
  - `export` (exports RSS + media to a local folder)
- A `plans.md` file capturing:
  - the full milestone plan
  - a risk register
  - ongoing notes and decisions
- An `AGENTS.md` file with persistent guardrails for Codex.

---

## 1) Product spec (build this)

### Product statement
ArticlePod turns **URLs and PDFs** into **audio episodes** and publishes them to a **private podcast RSS feed** that users can subscribe to in their favorite podcast app.

> Note: Google Podcasts has been discontinued; we target Apple Podcasts and other RSS-capable podcast apps. (YouTube Music consumes podcasts differently and is out of scope.)  
> For local-only demo, we validate RSS and playback via browser + curl; for Apple Podcasts integration you must run the server on a reachable host (Azure deployment or local tunnel).  

### MVP scope (must-have)

A) Account + private feed
- Sign up + login
- Each user has a private feed URL:
  - `/rss/<feed_token>.xml`
- User can rotate the feed token (invalidates previous URL)

B) Ingest content
- Submit URL (HTML article)
- Upload PDF (text-based PDFs only; no OCR in MVP)
- Each submission becomes an “Item” with status:
  - queued → processing → ready / failed

C) Convert to audio (worker)
- Worker extracts readable text:
  - URL: Readability extraction with abogen-derived cleanup.
  - PDF: deterministic text extraction (pdfjs path) with markdown output for downstream reuse.
  - Reuse as much as possible from reputable upstream repos (abogen first) and keep attribution in docs.
- Worker generates audio with a pluggable TTS provider:
  - default local provider: Kokoro via python-tts → AAC (`.m4a`) (see below)
  - optional local fallback: macOS `say`
  - optional: OpenAI TTS provider (only if API key set)
- Output:
  - one episode per item (MVP)
  - optionally split very long items into multiple parts (Phase 1.5)

D) Podcast RSS feed
- RSS endpoint renders user feed deterministically
- Each episode appears as a feed `<item>` with stable GUID and unique enclosure
- Enclosure points to a media URL that supports HEAD + Range

E) Web UI (polished)
- `/login`: signup/login
- `/app` dashboard:
  - shows RSS feed URL + copy button
  - URL submit form + mode selector (summary/full optional)
  - PDF upload form
  - recent items list with status and actions (retry/delete)
  - ability to play in browser via streaming and download.
- Strong empty states, toasts, clear failure messages, modern UI.

F) Admin Module
- Secure admin login with a predefined administrator account.
- Centralized admin dashboard providing critical system insights:
  - Active user count
  - Job execution status (successes and failures)
  - Error logs and diagnostic information
- Enables efficient monitoring, debugging, and continuous system improvement.
- Presentation-ready dashboard that clearly demonstrates system usage, value, and impact to stakeholders.

G) Export
- `pnpm export` writes:
  - RSS XML to `exports/rss.xml`
  - media files to `exports/media/`
  - a JSON manifest listing episodes and file paths

H) Quality and engineering
- Strong types + schema validation for API inputs (Zod)
- Deterministic serialization:
  - RSS generation produces stable ordering and stable XML formatting
- Unit tests + snapshot tests for RSS
- Integration tests for:
  - extraction on fixtures (HTML + PDF)
  - media serving range requests (local mode)
- License gate in CI: block AGPL / SSPL / NC.

I) Extraction artifacts (near-term track)
- Current (`M57`-`M64` implemented):
  - persist raw source artifacts and markdown artifacts in object storage.
  - keep markdown as durable reusable artifact for downstream workflows.
  - apply retention lifecycle to raw artifacts (target 90 days).

### Explicit non-goals (MVP)
- Native mobile app
- Word-by-word highlighting in third-party podcast apps
- Voice cloning

### Next Milestones (Post-MVP Phase 2)
- Add net-new milestones only (do not reopen completed milestones).
- Candidate future themes:
  - long-form multi-part episode splitting
  - richer managed observability exports/dashboards in Azure
  - bookmarklet ingestion mode after extension baseline

Policy for authenticated/paywalled pages:
- Extension capture is allowed only for content already rendered to the logged-in user in the browser.
- No credential forwarding, session forwarding, or backend login replay.
- No headless bypass, paywall bypass, or DRM bypass automation.

---

## 2) Architecture constraints and layout (keep the repo maintainable)

### Monorepo layout
- `apps/web/` — Next.js (React + Tailwind) UI + API routes (RSS endpoint lives here)
- `apps/worker/` — Node.js worker that processes queued items
- `packages/core/` — shared types, schemas, RSS builder, extraction utilities, TTS provider interfaces (local and remote)
- `packages/ui/` — shared UI components (optional; ok to keep in web app for MVP)
- `vendor/postcast/` — upstream reference repo (read-only; do not edit) to borrow patterns from
- `docs/` — docs, architecture, Azure deployment guide
- `fixtures/` — HTML + PDF fixtures for tests, plus demo starter content
- `scripts/` — helper scripts (export, seed demo, license report)

### Key architectural rule
**The web app must never do heavy conversion work in request handlers.**  
All extraction/TTS runs in the worker. The web app only:
- creates items/jobs
- renders status
- renders RSS XML
- serves local media files (dev mode)

### Derived-from-upstream rule (to leverage existing work safely)
We will leverage `https://github.com/denizsafak/abogen`,  `https://github.com/iamspruce/postcast` (MIT) as a **reference** for:
- Readability extraction plumbing
- RSS generation patterns
- pipeline structuring patterns

**Do not fork it** and do not edit it in-place:
- include it under `vendor/postcast/` (submodule or pinned copy)
- copy only the minimal code patterns we need into our own packages with attribution in `docs/THIRD_PARTY.md`.

---

## 3) Process requirements (follow strictly)

### 3.1 PLANNING FIRST
Before writing any code:
- Create `plans.md` with **at least 12 milestones**.
- For each milestone include:
  - scope
  - key files/modules
  - acceptance criteria
  - commands to verify
- Include a **risk register** with mitigations (top risks):
  - podcast client compatibility (range/HEAD)
  - HTML extraction quality
  - PDF extraction quality
  - job idempotency and retries
  - determinism/snapshots drift
- Include a **3-minute demo script** for non-engineers:
  - show demo starter item
  - submit a URL
  - show it becomes an episode in RSS
  - show audio plays in browser and passes range test
- Include a short **architecture overview**:
  - data model
  - job engine state machine
  - RSS rendering strategy
  - media hosting strategy (local vs Azure)
  - TTS provider abstraction

Do NOT start coding until `plans.md` exists and is coherent.

### 3.2 SCAFFOLD SECOND
Initialize repo, scripts, lint/typecheck/test harness.
One command `pnpm dev` must start the system.

### 3.3 IMPLEMENT THIRD
Implement one milestone at a time.
After each milestone:
- run verification commands
- fix issues
- commit with a clear message

### 3.4 UX polish throughout
- clean design
- empty states, toasts, quick “copy feed” UX
- demo banner when running with demo data

### 3.5 If you hit complexity choices
Prefer correctness and maintainability over extra features.
Document tradeoffs in `plans.md`.

---

## 4) Engineering details (prescriptive)

### 4.1 DB and storage (local-first)
- Local DB: SQLite via Prisma (file in `apps/web/.data/db.sqlite`)
- Local media storage (dev): `apps/web/.data/media/`
- In Azure mode:
  - DB becomes Azure PostgreSQL Flexible Server
  - media stored in Azure Blob Storage

### 4.2 Job engine (deterministic + idempotent)
- Item statuses:
  - `queued`, `processing`, `ready`, `failed`
- Worker must be idempotent:
  - repeated job runs for same item must not produce duplicate episodes
- Store an `episode_id` or `episode_token` deterministically per item (e.g., derived from item UUID)
- Maintain a job events log:
  - append-only events in DB for debugging + deterministic snapshots

### 4.3 TTS provider interface
In `packages/core` define:

- `TtsProvider.synthesizeToFile({ text, voice, format, outPath })`
- Providers:
  - `MacSayTtsProvider` (default local)
  - `OpenAiTtsProvider` (optional)
  - Scaffolding in place to host and run tts models.

Chunking:
- chunk text by paragraphs/sentences to avoid max limits
- persist chunk hashes for caching

### 4.4 Media serving requirements (dev mode)
If serving media from the web server:
- Must implement:
  - `HEAD` returning correct `Content-Length`
  - `Range` returning `206 Partial Content` and correct `Content-Range`

### 4.5 RSS generation requirements
- Deterministic ordering (published_at desc, then stable tiebreaker)
- Stable GUID per episode
- Unique enclosure URL per episode
- Include `length` (bytes) and `type` (audio/mpeg or audio/mp4)

Start now.
First, create `plans.md` with the complete plan, risk register, demo script, and architecture overview. Do NOT start coding until `plans.md` exists and is coherent. 

## Verification Prompts

Before marking any milestone complete, run and record the results for:

1. Workspace quality gates
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`

2. Export and license gates
- `npm run export`
- `npm run license:check`

3. Podcast compatibility gate
- Start web server (`npm run start --workspace @articlepod/web -- --hostname 127.0.0.1 --port 3000`)
- Run:
  - `./scripts/verify_podcast_contract.sh "http://127.0.0.1:3000/rss/<feed_token>.xml"`

4. Demo flow gate
- Confirm seeded demo user can login and see starter item.
- Confirm starter item plays in browser and seek works.
- Confirm admin dashboard loads and shows metrics.

If any gate fails, fix and re-run all impacted gates before committing.
