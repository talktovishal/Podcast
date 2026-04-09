# Product Documentation

Related indexes:

- Docs index: `/Users/vishalchowdhary/Documents/Podcast/docs/README.md`
- Scripts index: `/Users/vishalchowdhary/Documents/Podcast/scripts/README.md`

## What ArticlePod does

ArticlePod converts URLs, PDFs, and Chrome-captured HTML snapshots into private podcast episodes and publishes them through a private RSS feed.

## User flow

1. Sign in with local credentials (or OAuth when configured).
2. Submit URL, upload PDF, or capture page from Chrome extension, with optional importance and comma-separated tags.
3. Item enters `QUEUED` -> `PROCESSING` -> `READY/FAILED`.
4. Episode appears in recent items and private RSS feed.
5. Optional digest automation generates daily/weekly summary runs (email stub + optional digest podcast) based on user settings.
6. Logged-in users can open Summaries at `/app/summary` to generate a polished manual markdown roundup and optional podcast from selected saved articles.
7. Logged-in users can submit message-first product feedback at `/app/feedback`.
8. Logged-in users can save highlighted text from the Chrome extension into `/app/snippets`, where ArticlePod keeps the excerpt plus richer context and page metadata for later review.

## Accounts

Set passwords via environment variables before seeding (see `.env.example`):

- Demo account: `demo@articlepod.local` — password from `DEMO_PASSWORD` env var
- Chrome Web Store reviewer account: `chrome-reviewer@articlepod.com` by default — seeded only when `WEBSTORE_REVIEWER_PASSWORD` is set, and provisioned with complimentary Pro access so review captures do not hit normal quota limits
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
  - paid access is plan-specific by default:
    - `Pro monthly`: 12 new podcast episodes per 24 hours and 5 manual summaries per 7 days
    - `Pro annual`: 15 new podcast episodes per 24 hours and 10 manual summaries per 7 days
  - after paid users fill the current 24-hour episode-start window, new submissions are still accepted and queued for the next available Pro window
  - paid submissions only hard-fail once the deferred overflow queue reaches its cap (default: `30`)
- Billing:
  - `/pricing` supports self-serve upgrade to `Pro monthly` or `Pro annual` through Stripe-hosted Checkout when billing env vars are configured
  - `/pricing` now presents `Starter`, `Pro monthly` at `$15/mo`, and `Pro annual` at `$130/yr`
  - the annual plan is intentionally positioned as the strongest offer: it saves nearly 30% and carries the higher 15-episode / 10-summary capacity
  - `/pricing` includes explicit billing policy copy: billed upfront, auto-renews until canceled, and access stays active through the current paid period after cancelation
  - browser clients send only approved internal plan keys; raw Stripe price ids are never accepted from the browser
  - `/app` and `/app/settings` show current live plan, renewal date, cancel-at-period-end state, pending activation, and payment-issue recovery messaging, then link to Stripe Customer Portal for self-serve management
  - admins and allowlisted tester emails also get a `Billing mode` control in `/app/settings` so they can persist `Live billing` or `Sandbox billing` for end-to-end checkout testing
  - sandbox billing uses separate customer/subscription state and separate webhook handling, but never changes live access, quotas, or summary limits
  - recurring billing state is synced from Stripe webhooks; card data is never stored in ArticlePod and Checkout redirects do not grant access on their own
  - admin quota controls expose read-only Stripe customer/subscription/invoice identifiers plus Stripe Dashboard links for support
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

1. In `/app/chrome-extension`, generate one-time extension connect code (24-hour default).
2. Paste code in extension popup and connect; runtime config still points to `https://articlepod.com`, while the packaged manifest keeps broad HTTP/HTTPS host access so users can capture arbitrary pages without a second Chrome site-access prompt.
3. The popup keeps capture metadata inside a compact optional box with a visible `Optional` badge, includes a small footer `articlepod.com` hyperlink, and after capture the queued button state disables repeat clicks for that same page so the capture feels complete without extra page-level overlays.
4. The server classifies the uploaded snapshot as a readable article vs. a block/interstitial page, including lightweight Cloudflare `Verifying...` challenge shells; the popup itself stays mostly focused on DOM capture and cleanup.
5. Chrome Web Store reviewers should use the dedicated reviewer login, then open `/app/chrome-extension`; the page auto-prepares a fresh one-time connect code on load. The installed extension token remains long-lived after pairing, but the connect code itself intentionally stays one-time and time-limited.
6. The right-click snippet actions now save more than flat text: each snippet can include sanitized selection HTML, derived markdown context, section-heading path, and normalized page metadata so later review has more structure.

## Workspace layout

- `/app` is a focused creation workspace:
  - the header now uses the simplest possible billing control: free users get a single `Upgrade to Pro` action, while paid users get one clickable billing pill that opens Stripe billing; `/app/settings` keeps the fuller plan, renewal, and invoice controls
  - `Add New Episode`
  - `Recent items`
  - primary single-line inputs now support keyboard-first submit behavior, so pressing `Enter` triggers the obvious primary action in auth, episode submission, summary creation, and admin search/save flows
  - submit forms keep the required source input primary and tuck `Title`, `Importance`, and comma-separated `Tags` into a lighter `Optional details` panel that starts collapsed and remembers the user’s last toggle state
  - recent items render importance/tag metadata and support quick filtering by importance or tag
  - single-row desktop nav for the other signed-in pages, plus a logout icon
  - mobile/smaller screens wrap the nav instead of hiding destinations offscreen
  - `Feedback` stays lightly accented instead of using the darkest accent treatment
- `/app/podcast-apps` is the dedicated feed-setup page:
  - private feed URL, podcast-app onboarding shortcuts, digest feed access, and feed rotation at the top
  - setup notes and future walkthrough/video space below the live tools
- `/app/chrome-extension` is the dedicated capture-setup page:
  - extension install/connect/revoke controls at the top
  - setup notes and future walkthrough/video space below the live tools
- `/app/snippets` is the saved-selection review page:
  - newest-first snippet cards
  - comment editing and delete actions
  - richer structured context, section path, and page metadata when available from the extension capture
- `/app/settings` is the account/configuration home:
  - voice settings first, then digest scheduling, then billing
  - demographic profile and digest history follow the core settings
- Self-serve `Delete account` is intentionally hidden from the UI for now, while the protected backend route remains in place.

## Feed and media

- Auth explainer: `/Users/vishalchowdhary/Documents/Podcast/docs/feed-auth-model.md`
- Feed URL: `/rss/<feed_token>.xml`
- Digest feed URL: `/rss/digest/<digest_feed_token>.xml`
- Media URL: `/api/media/...`
- Digest media URL: `/api/digest-media/...`
- Media route supports `HEAD` and byte-range `206 Partial Content`
- Main feed contains regular item episodes plus any podcast-enabled manual summary episodes.
- Digest feed is reserved for scheduled digest episodes.
- RSS-generated media URLs are HMAC-signed per episode and remain stable until the owning feed token is rotated, so enclosure URLs do not churn between feed refreshes.
- RSS feed routes also include a compatibility fallback for legacy token rows whose stored plaintext token and stored hash drifted apart during storage cutovers: the feed request repairs the hash in place and continues serving the same feed URL instead of returning `404`.
- Newly created and rotated item/digest feed-token rows currently retain plaintext `tokenValue` for dashboard compatibility, so users can re-open `/app/settings` without silently invalidating an already-subscribed private feed URL.
- Legacy hash-only item/digest feed-token rows stay active until the user deliberately rotates them, and the dashboard warns before that re-subscribe-required step.
- RSS feeds emit deterministic channel `pubDate` and `lastBuildDate`, and RSS `HEAD` mirrors the same feed headers as `GET`.
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

## Summaries

Available in `/app/summary`:

- default selection = READY items with markdown artifacts from the last 7 days
- manual searchable item selection with a 30-item cap
- optional custom summary title
- length presets:
  - `Quick (5)`
  - `Standard (15)`
  - `Deep Dive (30)`
- podcast generation toggle enabled by default
- recent summary run history with markdown preview for completed runs

Summary output shape:

- title
- intro / hook
- key themes
- notable developments
- why it matters
- source list

Summaries APIs:

- `GET /api/summary/items`
- `POST /api/summary/runs`
- `GET /api/summary/runs/[id]/markdown`

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
- compact HTML extraction-selection scorecards are now stored directly on `Item` rows in both Prisma and Azure Table primary modes:
  - `extractionEngine`
  - `extractionSelectionMode`
  - `extractionScoreMargin`
  - `extractionSummaryJson`
  - `extractionSelectionRecordedAt`
- inspection workflow:
  - `pnpm --filter @articlepod/web run ops:extraction-selection-report -- --limit 200`
  - the same command works against local Prisma or Azure Table primary depending on runtime env
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
- Azure OpenAI summary generation is now wired as an Azure-native dependency:
  - `scripts/azure/provision-openai.sh` creates or reuses an Azure OpenAI account in `eastus`
  - `digest-summary-nano` is the default deployment for `5` and `15` minute summary runs
  - `digest-summary-mini` is used for `30` minute runs and as a retry fallback when nano returns invalid or empty output

## Observability status

Current implementation:

- structured JSONL runtime logs in `/Users/vishalchowdhary/Documents/Podcast/.runtime/logs`
- activity logs (`DEBUG`/`INFO`/`WARN`) write to `events/<service>/events.log.jsonl`
- `ERROR`/`FATAL` logs write to `errors/<service>/errors.log.jsonl`
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
- when `METADATA_PRIMARY_BACKEND=azure_table`, admin analytics derives signup/session/item/job metrics directly from Azure Table primary data so `/admin` stays accurate even when `ANALYTICS_STORAGE_MODE=off`; playback starts remain dependent on auxiliary analytics events.
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

- URL/PDF/HTML snapshot extraction persists raw source artifacts and cleaned extracted markdown artifacts in object storage.
- URL HTML extraction now runs both the existing `Readability` path and `defuddle` against the same HTML, scores both candidates, and logs the winning engine plus per-engine diagnostics before persistence.
- cleaned extracted markdown is the canonical `MARKDOWN` artifact used for narration text, chunk hashing, and episode descriptions.
- source-item persistence cleanup is now conservative: it removes obvious wrapper junk plus footer/legal/navigation/share noise while preserving richer source context such as links, raw URLs, bylines, dates, captions, and table structure in `MARKDOWN`.
- malformed leaked image wrapper fragments are normalized into URL-bearing stored content instead of being dropped outright, so the durable artifact keeps useful references while narration still suppresses them.
- cleanup also removes isolated ISO/display timestamps, read-time pills, subscriber upsell paragraphs, and short trailing tag-list blocks; footer/legal detection is intentionally narrower so normal article prose is not flagged just for mentioning privacy/terms.
- HTML-to-markdown conversion still flattens table-heavy extracted shells into readable markdown/text, while narration normalization also flattens legacy HTML/markdown table remnants so TTS does not speak tag names like `td` / `th`.
- narration cleanup is now the aggressive step: it strips raw URLs, image assets/wrappers, leading metadata, standfirsts, caption/credit-only lines, citation/source tails, and residual raw HTML before TTS, hashing, and episode-description generation.
- shared markdown quality analysis now distinguishes between stored-markdown wrapper/footer junk and URL/image/table/metadata residue that incorrectly survives narration prep.
- generated summary and digest markdown remain stored as authored markdown for reuse, but their podcast narration/description path now derives from a later shared cleanup pass over stored markdown so trailing `Sources` / `References` appendices and similar speech-only residue are stripped before audio.
- low-signal source pages fail with `EXTRACTION_EMPTY` when too little narratable prose remains after cleanup.
- markdown artifacts are retained for reuse and can be viewed through authorized dashboard/API flows.
- generated item, digest, and summary MP3 episodes now carry a 60-day retention expiry and disappear from feed/playback surfaces once expired.
- raw artifacts use retention metadata (default target: 90 days), with purge tooling available:
  - `npm run artifacts:purge`
- migration helper to backfill the 60-day audio expiry onto existing stored episodes:
  - `npm run audio:backfill-retention`
- migration helper to backfill markdown artifacts for ready legacy items:
  - `npm run artifacts:backfill`
- migration helper to clean existing stored markdown artifacts in place and queue regeneration when hashes change:
  - `npm run artifacts:cleanup-markdown`
- on-demand extraction quality tooling:
  - `npm run extraction-quality:audit`
  - `npm run extraction-quality:test -- --limit 20`

## OAuth setup

Google + Facebook + Apple setup guide:

- `/Users/vishalchowdhary/Documents/Podcast/docs/oauth-setup.md`

Only configured OAuth buttons are shown on the root auth landing page (`/`); unconfigured providers stay hidden until their env vars are set.
The root page now acts as the public homepage surface: it keeps the auth card primary, uses concise busy-reader/private-feed marketing copy on the adjacent panel, and avoids a duplicate bottom footer so the page stays tight on desktop. `/login` remains available only as a compatibility redirect back to `/`.

The secondary public marketing pages (`/product`, `/pricing`, `/resources`, `/faq`, `/about`) now follow the same chrome principle: keep the shared top navigation plus the bottom CTA, but do not repeat the site links or ArticlePod summary again in a footer.

## Known boundaries

- No OCR for scanned/image-heavy PDFs.
- No voice cloning.
- No native mobile app.

## Release certification

- Checklist: `/Users/vishalchowdhary/Documents/Podcast/docs/release-checklist.md`
- Contract gate script: `/Users/vishalchowdhary/Documents/Podcast/scripts/verify_podcast_contract.sh`
