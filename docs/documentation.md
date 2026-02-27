# Product Documentation

Related indexes:
- Docs index: `/Users/vishalchowdhary/Documents/Podcast/docs/README.md`
- Scripts index: `/Users/vishalchowdhary/Documents/Podcast/scripts/README.md`

## What ArticlePod does
ArticlePod converts URLs, PDFs, and Chrome-captured HTML snapshots into private podcast episodes and publishes them through a private RSS feed.

## User flow
1. Sign in with local credentials (or OAuth when configured).
2. Submit URL, upload PDF, or capture page from Chrome extension.
3. Item enters `QUEUED` -> `PROCESSING` -> `READY/FAILED`.
4. Episode appears in recent items and private RSS feed.
5. Optional digest automation generates daily/weekly summary runs (email stub + optional digest podcast) based on user settings.

## Accounts
Set passwords via environment variables before seeding (see `.env.example`):
- Demo account: `demo@articlepod.local` — password from `DEMO_PASSWORD` env var
- Admin account: `admin@articlepod.local` — password from `ADMIN_PASSWORD` env var
- Free-tier quota:
  - non-paid users get `FREE_TRIAL_SUBMISSION_LIMIT` free submissions (default `2`)
  - after quota is exhausted, ingest APIs return `USAGE_LIMIT_EXCEEDED`
  - admin can grant extra submission credits or mark users paid from `/admin`

## Chrome extension
- Source: `/Users/vishalchowdhary/Documents/Podcast/apps/extension`
- Package command: `npm run extension:package`
- Local load: `chrome://extensions` -> Developer mode -> Load unpacked

Connect flow:
1. In `/app`, generate one-time extension connect code.
2. Paste code in extension popup and connect (server target comes from `apps/extension/runtime-config.js`).
3. Capture current page; item is enqueued to your account feed.

## Feed and media
- Feed URL: `/rss/<feed_token>.xml`
- Digest feed URL: `/rss/digest/<digest_feed_token>.xml`
- Media URL: `/api/media/...`
- Digest media URL: `/api/digest-media/...`
- Media route supports `HEAD` and byte-range `206 Partial Content`

## Digest settings
Available in `/app/settings`:
- timezone-aware digest schedule controls:
  - daily: on/off for email + podcast, hour/minute, target length (5/15/30)
  - weekly: on/off for email + podcast, weekday/hour/minute, target length (5/15/30)
- separate digest feed controls:
  - copy digest feed URL
  - rotate digest feed token
- recent digest run history (status/source-count/email/podcast outcomes)

Digest APIs:
- `GET /api/digest/settings`
- `POST /api/digest/settings`
- `GET /api/digest/runs`
- `POST /api/digest-feed-token/rotate`

Scheduler trigger API (internal automation):
- `POST /api/internal/digests/tick` (Bearer secret protected via `DIGEST_SCHEDULER_SECRET`)

## Runtime profiles
- `simple`: local SQLite + local object storage
- `parity`: Docker Compose PostgreSQL + Azurite + python-tts
- `azure`: single VM compute + Azure PostgreSQL + Azure Blob

## Durable rollout status
Milestones `M35`-`M46` are implemented in repository assets:
- parity Docker Compose stack and profile env gates
- object storage abstraction (`local` + `azure_blob`)
- SQLite -> PostgreSQL migration/export/import scripts
- storage-backed media route with `HEAD`/`Range`
- queue resilience hardening and tests
- Bicep + azd IaC baseline
- VM deploy/systemd automation scripts
- staged VM sync/promote deployment helpers (`scripts/azure/push-to-vm.sh`, `scripts/azure/promote-runtime.sh`)
- ingress/TLS automation helpers (`scripts/azure/configure-nginx.sh`, `scripts/azure/configure-tls.sh`)
- durability snapshot/restore drill scripts and operations runbook
- CI matrix with simple + parity release gates

## Observability status
Current implementation:
- structured JSONL runtime logs in `/Users/vishalchowdhary/Documents/Podcast/.runtime/logs`
- support IDs included on API error payloads from shared error helper
- correlation propagation from worker to python-tts (`traceparent`, request/job/item IDs)
- admin analytics dashboard includes tabbed investor + operations views:
  - Investor Summary (acquisition/activation/MAU/readiness/power users/at-risk)
  - Growth & Activation (trend + conversion metrics)
  - Engagement & Retention (DAU/WAU/MAU + cohort retention)
  - Reliability (queue/retry/latency/error diagnostics)
  - Users (PII-masked by default with admin reveal option)
- admin analytics API surfaces:
  - `/api/admin/analytics/summary`
  - `/api/admin/analytics/timeseries`
  - `/api/admin/analytics/retention`
  - `/api/admin/analytics/users`
  - `/api/admin/analytics/export`
- analytics backfill/coverage command:
  - `npm run analytics:backfill`
- diagnostics scripts:
  - `npm run logs:collect`
  - `npm run logs:triage`

## Markdown Artifacts
Current (`M57`-`M64` implemented):
- URL/PDF/HTML snapshot extraction persists raw source artifacts and markdown artifacts in object storage.
- markdown artifacts are retained for reuse and can be viewed through authorized dashboard/API flows.
- raw artifacts use retention metadata (default target: 90 days), with purge tooling available:
  - `npm run artifacts:purge`
- migration helper to backfill markdown artifacts for ready legacy items:
  - `npm run artifacts:backfill`

## OAuth setup
Google + Apple setup guide:
- `/Users/vishalchowdhary/Documents/Podcast/docs/oauth-setup.md`

OAuth buttons show unavailable until provider env vars are configured.

## Known boundaries
- No OCR for scanned/image-heavy PDFs.
- No voice cloning.
- No native mobile app.

## Release certification
- Checklist: `/Users/vishalchowdhary/Documents/Podcast/docs/release-checklist.md`
- Contract gate script: `/Users/vishalchowdhary/Documents/Podcast/scripts/verify_podcast_contract.sh`
