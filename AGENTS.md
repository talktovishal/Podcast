# AGENTS.md — Personal Podcast Feed (RSS-first)

This file is the **execution contract** for coding agents in this repo (Codex, etc.).
Product/feature requirements live in **docs/Prompts.md**. Do not duplicate product specs here.

Codex reads `AGENTS.md` before doing any work. Keep this file practical and enforceable. :contentReference[oaicite:1]{index=1}

---

## Source of truth & precedence (important)
- If you need product requirements, API contracts, UX flows, MVP scope, or acceptance criteria, **read docs/Prompts.md**.
- Do **not** rewrite docs/Prompts.md unless explicitly asked.
- If docs/Prompts.md conflicts with code/tests, **surface the mismatch** and propose the smallest fix.

---

## Quick commands (keep these accurate)

### Command selection rules (do not guess)
- If a `Makefile` exists with relevant targets, prefer `make <target>`.
- Frontend package manager:
  - If `pnpm-lock.yaml` exists → use `pnpm`
  - Else if `yarn.lock` exists → use `yarn`
  - Else → use `npm`
- Python environment:
  - If `uv.lock` exists → use `uv`
  - Else if `poetry.lock` exists → use `poetry`
  - Else → use `python -m venv` + `pip`

### Frontend (expected in `frontend/`)
- Install: `cd frontend && <pm> install`
- Dev: `cd frontend && <pm> run dev`
- Lint: `cd frontend && <pm> run lint`
- Test: `cd frontend && <pm> test`
- Build: `cd frontend && <pm> run build`

### Backend API (expected in `backend/`)
- Dev: `cd backend && <venv_cmd> && uvicorn app.main:app --reload`
- Test: `cd backend && <venv_cmd> && pytest -q`
- Lint/format (preferred): `cd backend && <venv_cmd> && ruff check . && ruff format .`
- Typecheck (if configured): `cd backend && <venv_cmd> && mypy .`

### Worker (expected in `worker/` if present)
- Test: `cd worker && <venv_cmd> && pytest -q`
- Run (example): `cd worker && <venv_cmd> && python -m worker`

### Full repo validation (required before marking “done”)
- Frontend: lint + tests (+ build when feasible)
- Backend: ruff + tests (and mypy if present)
- Worker: tests
- Podcast compatibility gates (RSS + media) must pass (see below)

> Replace `<pm>` and `<venv_cmd>` with real commands as soon as scaffolding exists.

---

## Project goal (1 paragraph)
Ship an RSS-first “Personal Podcast Feed”: users submit a URL or upload a text-based PDF; the backend asynchronously extracts text, normalizes/chunks it, generates narrated audio, uploads MP3s to storage that supports range requests, and updates a **private per-user RSS feed** that plays in standard podcast apps.

---

## MVP scope guardrails (hard boundaries)
Do NOT implement any of the following unless explicitly requested in docs/Prompts.md:
- Dedicated mobile app
- Voice cloning
- “Two-host conversation” narration
- OCR for scanned/image-heavy PDFs (fail with a clear error instead)
- Paywall/DRM bypassing, session forwarding, or headless browser rendering
- Hosting audio on consumer file-sharing links (unreliable for podcast streaming)

---

## Podcast RSS & media delivery invariants (non-negotiable)
Breaking these causes podcast apps to fail silently.

### RSS requirements
- Feed must be valid RSS 2.0; include iTunes namespace as required.
- Each episode item MUST have:
  - Stable GUID that never changes
  - Unique enclosure URL (do not reuse enclosure URLs across items)
  - `<enclosure url="..." length="..." type="audio/mpeg" />` with correct byte length and MIME type
- Use RFC 2822 pubDate format.
- Proper XML escaping (do not output invalid XML).
- Keep item ordering newest-first.

### Media hosting requirements
- Media host MUST support:
  - HTTP HEAD
  - Byte-range requests (`Range: bytes=...`) with correct `206 Partial Content`
  - Correct `Content-Length`
- Prefer serving MP3 directly from object storage/CDN.
- If proxying MP3 through backend, proxy MUST preserve range semantics.

---

## System architecture rules

### 1) Async pipeline only
URL/PDF → extract → normalize → chunk → TTS → encode MP3 → upload → publish RSS MUST be asynchronous.
Never block an HTTP request on generation.

### 2) Idempotency + restartability
- Jobs must be safely retryable.
- Avoid re-running expensive steps (especially TTS) when outputs already exist.
- Prefer deterministic storage keys for derived artifacts.
- Failures must include machine-readable `error_code` and user-friendly `error_message`.

### 3) Clear error semantics (no silent failures)
- If extraction yields empty/garbage text, fail with a specific error code and guidance.
- If a PDF appears scanned/image-heavy, fail with “OCR not supported yet”.
- Never publish an RSS item pointing to missing/non-range-capable audio.

### 4) Provider abstraction (required)
External services must be behind adapters so tests can mock them:
- Extraction adapter(s)
- TTS adapter
- Storage adapter
- RSS generation module

No hard-coded vendor logic scattered throughout the code.

---

## Auth, privacy, and security rules

### Authentication surfaces
- Web UI: session-based auth (cookie) per docs/Prompts.md.
- RSS: feed token embedded in feed URL.
- Media: token-based access OR signed URLs per docs/Prompts.md.

### Token handling
- Treat feed/media tokens as secrets:
  - Don’t log them
  - Don’t leak them into client-visible error messages
  - Provide rotation that invalidates prior URLs (as required by docs/Prompts.md)

### Data minimization
- Store only what’s needed to operate/debug.
- Avoid retaining full extracted text indefinitely unless docs/Prompts.md requires it.
- Implement delete item + delete account per docs/Prompts.md.

### Abuse prevention (MVP baseline)
- Rate limit submission endpoints per user and per IP.
- Validate URL schemes and file size/type limits.
- SSRF protections: block private/internal IPs and metadata endpoints in URL fetcher.

---

## Code quality & style
- Prefer clarity over cleverness.
- Keep pipeline stages modular and independently testable.
- Structured logging: include item_id/job_id; do not log large text bodies.
- Avoid long-lived global mutable state in workers.

---

## Git / PR / change rules
- Small, reviewable diffs.
- Avoid scope creep.
- After validation passes, commit changes and push to `origin/<current-branch>` before marking work as complete (unless the user explicitly says not to push).
- Never commit runtime/debug logs (for example `.runtime/logs/`); keep logs local-only for troubleshooting.
- Docs Sync Gate (mandatory):
  - If runtime behavior, API contracts, milestones, or architecture changes, update these in the same change set:
    - `docs/Prompts.md`
    - `docs/plans.md`
    - impacted docs (`docs/architecture.md`, `docs/documentation.md`, `docs/implement.md`, `docs/env.md`, etc.)
  - Do not leave docs drift for a follow-up commit.
- Milestone Date Discipline (mandatory):
  - Every milestone in `docs/plans.md` MUST include `target_finish`.
  - `Done` milestones MUST include `completed_on` and evidence reference (best-effort commit/date trace).
  - If evidence is uncertain, keep confidence notes in the reconciliation ledger.
- If adding a dependency:
  - Explain why
  - Confirm license compatibility (avoid copyleft surprises)
  - Update lockfiles/setup instructions
- Never commit secrets or real tokens.

---

## Testing strategy (required)
Add tests when behavior changes.

### Unit tests (minimum)
- URL canonicalization + SSRF protections
- HTML extraction (fixtures)
- PDF extraction (fixtures, including scanned-failure case)
- Chunking determinism (same input → same chunk hashes)
- RSS XML generation (GUID stability; enclosure uniqueness; XML escaping)
- Storage URL/signed URL generation (if used)

### Integration tests (MVP milestones)
- Submit URL → job completes → RSS contains item → MP3 reachable
- Range request returns 206 and correct headers

### Manual smoke tests (release gate)
- Subscribe in Apple Podcasts + one other app
- Play, seek, resume (range issues show up immediately)

---

## Podcast compatibility gates (must pass before “done”)
If `scripts/verify_podcast_contract.sh` exists, run it:
- `./scripts/verify_podcast_contract.sh "<FEED_URL>"`

Otherwise run:
- `curl -I "<FEED_URL>"`
- Extract an enclosure MP3 URL from the RSS, then:
  - `curl -I "<MP3_URL>"`
  - `curl -i -H "Range: bytes=0-1" "<MP3_URL>"`  (expect 206)

---

## Working procedure for agents
0) Read `docs/codex-execution-checklist.md` before making any change and follow it for the entire task.
1) Read docs/Prompts.md sections relevant to the task.
2) Summarize requirements and acceptance criteria.
3) Implement the smallest change that satisfies the requirement.
4) Run tests/lint; fix failures.
5) Run Podcast compatibility gates.
6) Commit and push validated changes to `origin/<current-branch>`.
7) Provide a short “what changed + how to verify” note.

---

## Verification prompts (keep spec separate)
To prevent drift and keep long projects consistent:

- docs/Prompts.md MUST include a section titled **“Verification Prompts”**.
- For any milestone-sized work (or before marking a PR done), run the verification prompts from docs/Prompts.md and apply fixes if they reveal violations.
- Do not invent new verification prompts in chat; add them to docs/Prompts.md so the team uses the same checklist every time.

OpenAI’s recommended practice is to use repo docs (like AGENTS.md + related plan/docs files) to create consistent, repeatable behavior across runs. :contentReference[oaicite:2]{index=2}
