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
- `UserDigestSettings` (per-user digest cadence/length/timezone defaults)
- `DigestFeedToken` (private digest RSS access token with rotation)
- `DigestRun` + `DigestEpisode` (daily/weekly digest execution state + published digest audio metadata)
- `SummaryRun` + `SummaryRunItem` + `SummaryEpisode` (manual Summary Studio execution state, selected source items, and optional published summary audio)
- `DigestSchedulerTick` (external scheduler signal queue)
- `UserDemographicSurvey` (optional self-reported age band + gender identity profile)
- `UserFeedback` (message-first user suggestions with optional metadata, contact preference, triage state, and mirror status)

Auth profile metadata on `User`:
- coarse geo snapshots from trusted proxy headers:
  - first-seen: `firstSeenAt`, `firstSeenCountryCode`, `firstSeenRegionCode`, `firstSeenCity`
  - last-seen: `lastSeenAt`, `lastSeenCountryCode`, `lastSeenRegionCode`, `lastSeenCity`
- raw IP values are not persisted in user profile data

Monetization/quota fields on `User`:
- `complimentaryPro` (manual support override for non-Stripe paid access)
- `billingProvider`, `billingCustomerId`, `billingSubscriptionId`
- `billingPriceId`, `billingPlanCode`, `billingStatus`, `billingEntitlementStatus`
- `billingLastPaymentStatus`, `billingLastInvoiceId`
- `billingCurrentPeriodEnd`, `billingCancelAtPeriodEnd`
- `billingLastStripeEventId`, `billingLastStripeEventCreatedAt`
- `billingLastSubscriptionEventAt`, `billingLastInvoiceEventAt`
- `billingUpdatedAt`
- `isPaid` (effective access cache derived from billing state + complimentary override)
- `submissionCount` (lifetime submission usage counter)
- `extraSubmissionCredits` (admin-granted free-tier extensions)
- `BillingWebhookEvent` (Stripe event idempotency + audit rows, including event/object ids, invoice ids, and apply result)
- `AnalyticsEvent` (raw behavior events for KPI/retention/user analytics)
- `AnalyticsDailyRollup` (daily additive counters for fast trend queries)
- `AnalyticsCoverage` (metric coverage/backfill metadata, including forward-only metrics)

## Ingestion sources
`Item.sourceType` supports:
- `URL`
- `PDF`
- `HTML_SNAPSHOT` (Chrome extension captured HTML)

The worker extraction adapter branches by source type:
- URL: SSRF-validated backend fetch (pinned IP candidates first, hostname fallback when needed) + readability + cleanup, with fetched challenge/interstitial HTML classified before generic extraction fallback messaging
- PDF: uploaded bytes from artifact storage + text extraction
- HTML snapshot: parse raw HTML directly, no server-side fetch; snapshot block/interstitial classification happens here on the server instead of in the popup, including lightweight verification shells

## Extraction Artifact Plane
Current behavior (`M57`-`M64` implemented):
- extraction emits both narration text and markdown from HTML/PDF/snapshot sources.
- worker persists dual artifacts in object storage:
  - raw source artifacts (`RAW_HTML`, `RAW_PDF`) with retention expiry (default target: 90 days)
  - cleaned extracted markdown artifact (`MARKDOWN`) retained for downstream workflows
  - summary markdown artifacts (`summaries/<user>/<run>/summary.md`) for manual summary publishing and reuse
  - generated item/digest/summary episode audio retained for 60 days from `publishedAt` before purge removes the blob/object and episode row
- metadata is normalized via `ItemArtifact` records:
  - `kind`, `storageKey`, `contentType`, `byteLength`, `expiresAt`, `createdAt`
- extracted-item markdown passes through shared rule-based cleanup before persistence:
  - remove obvious wrapper junk plus footer/legal/nav/share chrome while preserving richer source context such as links, raw URLs, bylines, dates, captions, and table structure in the durable `MARKDOWN` artifact
  - strip timestamp/read-time chrome, subscriber upsell fragments, and short trailing tag-list paragraphs without treating ordinary article mentions of `privacy` / `terms` as footer noise
  - normalize malformed leaked image wrapper fragments into URL-bearing stored content instead of silently deleting them
  - narration cleanup is the aggressive boundary: strip residual raw HTML tags, raw URLs, image assets/wrappers, leading metadata/standfirst/caption noise, and flatten legacy HTML/markdown table remnants before narration text is derived
  - shared markdown quality analysis reports stored-markdown wrapper/footer junk plus narration-surface URL, image, table, metadata, and low-signal residues for audits/tests
  - preserve substantive prose, headings, meaningful inline link text, and reusable source references in stored markdown
- narration input contract uses cleaned markdown-derived normalized text while preserving deterministic chunk/hash behavior.
- when cleanup leaves too little narratable prose, the worker fails the item with `EXTRACTION_EMPTY` instead of publishing junk audio.
- summary and digest markdown artifacts remain author-polished stored outputs, while their podcast narration and description path now runs a later shared cleanup over stored markdown that removes trailing `Sources` / `References` appendices and other speech-only residue.
- extraction-quality verification lives in `testing/extraction-quality/`, which reuses the same core URL and snapshot extraction code paths but stops before DB writes and TTS.

## Async pipeline
1. Web validates request and enqueues `Item` + `Job`.
   - before enqueue, submission quota is consumed atomically for non-paid users.
   - item episode jobs also enqueue a tiny dispatch message (`jobId`, `kind`) so workers can use a competing-consumer pull model without scanning the durable job table.
2. Worker reserves one visible dispatch message and then claims the matching durable job lease.
   - the durable job row carries `leaseId`, `leaseOwner`, `leaseExpiresAt`, `lastHeartbeatAt`, and `dispatchMessageId`.
   - only one worker may own the lease at a time; queue-only state is never the source of truth.
3. Worker extracts + normalizes text.
4. Worker chunks text deterministically and computes hash key.
5. Worker resolves TTS selection and uses chunk cache when available.
6. While long TTS runs are active, worker heartbeats both the queue reservation and durable lease.
7. Worker writes final audio artifact to object storage, stamps a 60-day expiry on the episode metadata, and upserts `Episode`.
8. Worker marks item/job `READY/SUCCEEDED` or `FAILED` with actionable error, then acknowledges or requeues the dispatch message.

## Billing flow
1. Authenticated user starts `Pro monthly` or `Pro annual` checkout from `/pricing` or `/app/settings`.
2. Web maps the approved internal plan key to the configured Stripe price id, reuses or creates a Stripe customer keyed to the local `User`, and creates a hosted Checkout session in subscription mode.
3. Stripe handles card capture and recurring billing outside ArticlePod; the redirect back to `/app/settings?billing=success` is treated only as a hint, not the access source of truth.
4. `checkout.session.completed` records the Stripe customer and subscription linkage locally and may leave the account in `INCOMPLETE` pending activation.
5. Subscription and invoice webhooks update the local billing cache on `User`, while `BillingWebhookEvent` rows record idempotency, stale-event ignores, and processing outcomes.
6. `invoice.paid` grants or extends access through `currentPeriodEnd`; `invoice.payment_failed` and `invoice.payment_action_required` surface payment-recovery states without relying on the redirect flow.
7. Effective paid access is derived from Stripe entitlement state plus `complimentaryPro`, then cached onto `User.isPaid` so existing quota gates stay fast.
8. `/app/settings` launches Stripe Customer Portal for self-serve updates, invoice history, cancelation, and payment-method management, while `/admin` shows read-only Stripe identifiers and dashboard links for support.

## Digest automation pipeline (`M72`-`M79`)
1. User configures digest preferences in `/app/settings` (daily/weekly email + podcast, timezone, schedule, target length).
2. Worker scheduler pass evaluates due windows from `UserDigestSettings`.
3. Scheduler enqueues idempotent `DigestRun` rows keyed by `(userId, cadence, periodKey)`.
4. Digest processor claims queued/retryable runs and loads markdown artifacts from READY source items in window.
5. Summary provider adapter generates digest markdown/text (stub, proxy, or Azure OpenAI depending on runtime env), while persisting provider/model/deployment/token usage metadata.
6. Processor persists summary/email artifacts to object storage; email sender adapter records stub delivery status.
7. When enabled, processor derives narration text from stored digest markdown with the shared summary cleanup pass, then synthesizes audio and upserts `DigestEpisode`.
8. Digest RSS route renders separate digest feed using `DigestFeedToken`; media served via digest media range route.

## Manual Summary Studio pipeline (`M86`-`M91`)
1. Signed-in user opens `/app/summary`.
2. Web lists READY items with markdown artifacts, default-selecting the last 7 days up to 30 items.
3. User optionally refines selection, title, target length (`5 / 15 / 30`), and podcast toggle, then creates a `SummaryRun`.
4. Worker claims queued/retryable summary runs and loads the selected markdown sources.
5. Summary provider chooses Azure OpenAI `nano` for `5` and `15` minute runs, `mini` for `30` minute runs, and retries nano failures once on mini.
6. Worker stores `summary.md` under deterministic `summaries/<user>/<run>/...` storage keys and records provider/model/deployment/token usage metadata.
7. When podcast generation is enabled, worker derives narration text from stored summary markdown with the shared summary cleanup pass, publishes `SummaryEpisode` audio, and surfaces it in the main private RSS/media feed alongside regular episodes.

## Admin analytics pipeline (`M66`-`M70`)
Event sources:
- web auth: `USER_SIGNUP`, `USER_LOGIN`
- ingest paths: `ITEM_SUBMITTED`
- worker completion: `ITEM_READY`, `ITEM_FAILED` (+ queue/processing duration metadata)
- media route: `PLAYBACK_STARTED` (deduped by user + media + day)

Storage/query model:
- write path records raw `AnalyticsEvent` rows plus `AnalyticsDailyRollup` updates.
- analytics APIs compute KPI/retention from indexed raw events with rollups available for additive trend acceleration.
- when Azure Table is the primary metadata backend, admin analytics can also derive signup/session/item/job state directly from primary entities so cost-optimized deployments do not render empty dashboards when auxiliary analytics event storage is disabled.
- `AnalyticsCoverage` surfaces historical/backfill confidence:
  - signups/logins/submissions/ready/failed can be backfilled
  - playback starts are forward-only from instrumentation start date.

Queue resilience:
- stale `PROCESSING` reclaim (`lockedAt` timeout)
- due-retry scheduling via `nextRetryAt`
- retry jitter to reduce thundering-herd retries

## Feedback suggestions pipeline (`M85`)
1. Authenticated user submits message-first feedback on `/app/feedback`.
2. API validates payload (`message` required; `feedbackType`/`featureArea` optional) and enforces rate limits.
3. Submission persists to `UserFeedback` with triage `status=NEW`.
4. Mirror adapter attempts to create a private GitHub issue when enabled.
5. Mirror outcome is persisted (`MIRRORED`, `FAILED`, or `SKIPPED`) without blocking successful feedback submission.
6. Admin inbox in `/admin` supports filter/search, status updates, and manual mirror retry.

Privacy contract:
- mirror payload includes feedback id/status/type/feature/message/contact flag/source path/timestamp
- mirror payload excludes submitter email and all auth/feed/media tokens

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
- manual summary markdown/audio artifacts for Summary Studio runs

## Media delivery contract
`/api/media/[...path]` and `/api/digest-media/[...path]` are storage-backed and enforce podcast-compatible semantics:
- stable media-token authorization scoped to the active feed token hash until the feed token is rotated
- RSS feed lookup prefers the token hash, but can self-heal legacy rows by matching the active plaintext token value and rewriting the stored hash when the two drift apart
- Newly created and rotated feed-token rows still retain plaintext `tokenValue` in the current implementation so authenticated settings pages can re-display the same private feed URL without forcing a surprise rotation
- Legacy hash-only feed-token rows remain active and are not auto-rotated; users must opt into a manual token rotation before ArticlePod replaces that URL
- `HEAD` with accurate `Content-Length`
- `GET` with byte-range `206 Partial Content`
- stable enclosure URLs from episode object keys
- published episode artifacts default to MP3 (`audio/mpeg`) for broader client codec support
- `/api/digest-media/[...path]` now serves both scheduled digest episodes and manual Summary Studio episodes
- missing-object repair path:
  - item media 404s can enqueue regeneration jobs and clear stale chunk cache references when source material is still available
  - if the expected key is missing but sibling `.mp3`/`.m4a` exists, episode metadata is reconciled in-place and served immediately

## Public episode share flow (`M104`)
1. An authenticated owner creates or reuses a stable item-scoped share row with scope `public_episode_item:<itemId>`.
2. The owner dashboard stores and displays an owner-only share URL shaped like `/share/episode/<shareId>/<sig>`.
3. The public share page resolves the share row by `shareId`, verifies the deterministic signature against the stored share-token hash and scope, and then loads the current item and episode for playback.
4. The page renders a branded, `noindex` landing page with audio playback, direct download, optional source attribution, and signup/pricing CTAs.
5. Playback and download requests go through `/api/share-media/[...path]`, which verifies a share-scoped media signature and then serves storage-backed audio with `HEAD`, byte-range, and `206 Partial Content` support.
6. Revoking the share deletes the underlying `ShareToken` row, immediately invalidating both the public page and any shared playback/download URLs.

Key invariants:
- public episode sharing is separate from workspace demo share links
- public episode sharing does not rotate or mutate private feed/media auth
- item scope is stable across normal episode regeneration, so the public page can continue serving the current episode for that item until revoked

Growth instrumentation:
- raw analytics events capture:
  - `SHARE_LINK_CREATED`
  - `SHARE_PAGE_VIEWED`
  - `SHARE_PLAYBACK_STARTED`
  - `SHARE_CTA_CLICKED`
- CTA clicks are logged through a small public redirect endpoint before sending users to `/` or `/pricing`

## Extension ingestion path
1. User is authenticated on web app.
2. Web mints one-time extension connect code (24-hour default).
3. Extension exchanges code for a scoped token that does not expire automatically.
4. Extension runs a popup-triggered smart-capture pass on the active tab:
   - detect a likely main-content root
   - do bounded safe load-more/read-more clicks and limited scroll passes when needed
   - stay conservative on thread/feed-style hosts
   - clone the final DOM and remove inert scripts, styles, templates, noscript blocks, and HTML comments
5. Extension calls `POST /api/items/html-snapshot`.
6. Item enters normal worker pipeline and appears in user feed.

Policy guardrails:
- capture only user-visible page content
- no credential forwarding/session replay to backend
- no bypass automation (paywall/DRM/headless bypass)

## Runtime profiles and parity
- `simple`: local SQLite + local object storage + local python-tts
- `parity`: Docker Compose with PostgreSQL + Azurite + python-tts + web + worker
- `azure`: single VM compute + Azure Blob, with metadata primary selected by `METADATA_PRIMARY_BACKEND`
  - `prisma`: legacy Azure PostgreSQL-backed metadata
  - `azure_table`: Azure Table-backed operational metadata with local SQLite reserved for auxiliary low-cost/admin state

Profile-aware Prisma generation is handled by `/Users/vishalchowdhary/Documents/Podcast/scripts/prisma-profile.mjs`.

## Durable Azure target (M35-M46)
Locked target architecture:
- Compute: single Linux VM running `web`, `worker`, and `python-tts` as `systemd` services (cost baseline: `Standard_B2s`, `TTS_WORKERS=1`)
- Optional overflow compute lane: `worker-overflow` service activated only under queue-pressure policy
- Durable operational metadata: Azure Table when `METADATA_PRIMARY_BACKEND=azure_table`
- Durable item dispatch: Azure Queue Storage in the same storage account when `ITEM_DISPATCH_BACKEND=azure_queue`
- Azure OpenAI account in `eastus` for summary generation (runtime uses API-key auth in v1)
- Rollback/canary metadata path: optional Prisma/PostgreSQL when explicitly enabled
- Durable artifacts: Azure Blob Storage
- Auxiliary local data: SQLite on VM for low-signal/admin-only state that does not need to sit in Azure Table
- Migration track: queue/item/digest metadata can still be dual-written to Azure Table mirror for canary comparison and phased cutover
- Diagnostic boundary: structured logs remain local by default; verbose diagnostics should not become Table-primary state
- Provisioning: Bicep + azd (`/Users/vishalchowdhary/Documents/Podcast/infra`)
- Deployment automation: `/Users/vishalchowdhary/Documents/Podcast/scripts/azure/*.sh`

Durability principle:
- VM loss must not lose customer records, episodes, or media objects.
- Recovery relies on re-provisioning compute, reconnecting to existing Azure Table + Queue + Blob state, and bootstrapping any auxiliary local SQLite tables as needed.

## Observability contract (M47+)
All runtime services emit structured JSON events with shared fields:
- `ts`, `level`, `service`, `env`, `msg`
- `error_code`, `support_id`
- correlation keys: `trace_id`, `span_id`, `request_id`, `job_id`, `item_id`

Local sink:
- `/Users/vishalchowdhary/Documents/Podcast/.runtime/logs/events/<service>/events.log.jsonl`
- `/Users/vishalchowdhary/Documents/Podcast/.runtime/logs/errors/<service>/errors.log.jsonl`
- retention is controlled by `LOG_MAX_BYTES`, `LOG_MAX_FILES`, `LOG_RETENTION_DAYS`, and `LOG_ERROR_RETENTION_DAYS`

Correlation propagation:
- internal calls carry `traceparent`, `x-request-id`, `x-job-id`, `x-item-id`
- worker binds correlation context per claimed job and propagates it to python-tts synth requests

Error response contract (API):
- `error_code`
- `error_message`
- `retry_recommended` (when applicable)
- `support_id` (for operator lookup)
