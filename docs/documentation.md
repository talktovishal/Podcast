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
6. Logged-in users can submit message-first product feedback at `/app/feedback`.

## Accounts
Set passwords via environment variables before seeding (see `.env.example`):
- Demo account: `demo@articlepod.local` — password from `DEMO_PASSWORD` env var
- Admin account: `admin@articlepod.local` — password from `ADMIN_PASSWORD` env var
- Admin login redirects directly to `/admin` for faster dashboard access.
- Admin accounts cannot be deleted through `/api/account/delete` (protected server-side and hidden in dashboard UI).
- Successful auth updates coarse geo snapshots on user records (`firstSeen*` and `lastSeen*` with country/region/city when available from trusted proxy headers). Raw IPs are not persisted for profile analytics.
- Optional demographic survey is available in `/app/settings`:
  - skippable at any time
  - editable after save
  - deletable (responses are cleared and status returns to skipped)
- Free-tier quota:
  - non-paid users get `FREE_TRIAL_SUBMISSION_LIMIT` free submissions (default `2`)
  - after quota is exhausted, ingest APIs return `USAGE_LIMIT_EXCEEDED`
  - admin can grant extra submission credits or add complimentary Pro access from `/admin`
- Billing:
  - `/pricing` supports self-serve upgrade to Pro through Stripe-hosted Checkout when billing env vars are configured
  - `/app/settings` shows current billing state and links to Stripe Customer Portal for self-serve management
  - recurring billing state is synced from Stripe webhooks; card data is never stored in ArticlePod
- Feedback suggestions:
  - `/app/feedback` collects required freeform message plus optional type/feature metadata.
  - contact checkbox defaults to opt-in per submission.
  - admin can triage suggestions from `/admin`.

## Chrome extension
- Source: `/Users/vishalchowdhary/Documents/Podcast/apps/extension`
- Package command: `npm run extension:package`
- Icon generation command: `npm run extension:icons`
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
- RSS-generated media URLs are HMAC-signed and remain valid for 14 days so slower-refreshing podcast apps can keep playing existing enclosures.
- Published episodes default to MP3 (`audio/mpeg`) for feed compatibility across podcast clients.
- Episode descriptions are normalized to concise sentence summaries before RSS publication.
- Missing media self-heal:
  - if an episode object is missing but sibling `.mp3`/`.m4a` exists, feed/media routes reconcile metadata and continue serving immediately.
  - if no object exists, feed/media routes queue regeneration only when source inputs are still available; non-regenerable items are skipped without endless requeue.
- RSS endpoints use `Cache-Control: private, no-store` to reduce stale episode visibility after delete actions.
- Feed and digest RSS include both `<itunes:image>` and channel `<image>` artwork tags, pointing to branded podcast cover art.
- Bulk repair command: `npm run audio:backfill-mp3` converts/reconciles stored episodes to MP3 metadata in place.

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
- `azure`: single VM compute + Azure Blob, with `METADATA_PRIMARY_BACKEND` selecting either:
  - `prisma`: Prisma-backed metadata (legacy Azure PostgreSQL path)
  - `azure_table`: Azure Table as the primary operational metadata store, plus local SQLite for auxiliary low-cost/admin data

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

## Cost optimization rollout status
Current implementation baseline:
- always-on compute target shifted to `B2s`.
- local Kokoro lane locked to single worker (`TTS_WORKERS=1`) in VM service template.
- overflow worker role and queue-pressure hysteresis are implemented in worker runtime.
- Azure Table metadata primary store is implemented for operational state:
  - users/sessions/feed tokens/share tokens
  - items/jobs/episodes/chunk cache/item artifacts
  - digest settings/runs/episodes/scheduler ticks
  - extension auth and demographic survey state
- Azure Table metadata mirror adapter remains available for dual-write + canary compare support.
- cost-boundary controls now explicitly keep diagnostics out of the future Table-primary path:
  - `ANALYTICS_STORAGE_MODE`
  - `JOB_EVENT_STORAGE_MODE`
  - `DEMO_EXTRACTION_TRACE_ENABLED`
- Azure runtime helpers now support low-cost serverless metadata mode directly:
  - `METADATA_PRIMARY_BACKEND=azure_table`
  - default auxiliary `DATABASE_URL=file:/var/lib/articlepod/db.sqlite`
- migration scripts are available:
  - `npm run metadata:backfill`
  - `npm run metadata:check`
- cost guardrail automation scripts are available:
  - `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/configure-budget-alerts.sh`
  - `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/validate-overflow-guardrails.sh`
- live Azure low-cost cutover completed on 2026-03-17:
  - `articlepod.com` now runs on Azure `Standard_B2s`
  - operational metadata is served from Azure Table
  - durable media/artifacts are served from Azure Blob
  - local auxiliary SQLite is used for low-cost admin/runtime data
  - managed PostgreSQL is stopped and kept out of the hot path
  - exploratory PostgreSQL data was intentionally not migrated during this fresh-start testing phase

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
- admin feedback inbox:
  - appears in `/admin` below analytics/quota controls.
  - supports status transitions (`NEW`, `IN_REVIEW`, `PLANNED`, `DONE`, `DECLINED`).
  - supports mirror retry for failed/pending GitHub mirrors.
- diagnostics scripts:
  - `npm run logs:collect`
  - `npm run logs:triage`

## Feedback APIs
- `POST /api/feedback`
  - authenticated route
  - required: `message`
  - optional: `feedbackType`, `featureArea`, `allowEmailContact`, `sourcePath`
- `GET /api/admin/feedback`
  - admin-only list/filter/pagination route
- `POST /api/admin/feedback/[id]/status`
  - admin-only triage status update
- `POST /api/admin/feedback/[id]/mirror`
  - admin-only manual mirror retry

## GitHub mirror (optional)
- Enable by setting:
  - `GITHUB_FEEDBACK_MIRROR_ENABLED=1`
  - `GITHUB_FEEDBACK_OWNER`
  - `GITHUB_FEEDBACK_REPO`
  - `GITHUB_FEEDBACK_TOKEN`
  - optional `GITHUB_FEEDBACK_LABELS` (comma-separated)
- Mirror behavior is best-effort and never blocks user submission.
- Mirrored issue body excludes submitter email.

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
