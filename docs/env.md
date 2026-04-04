# Environment Profiles

ArticlePod now uses profile-driven runtime contracts so local and Azure behavior stay aligned.

## Profile selection
- `RUNTIME_PROFILE=simple` -> SQLite + local object storage
- `RUNTIME_PROFILE=parity` -> PostgreSQL + Azurite (Blob API) + Docker Compose
- `RUNTIME_PROFILE=azure` -> Azure VM runtime + Azure Blob, with either Prisma/PostgreSQL or Azure Table as the operational metadata backend

Profile examples (copy to `.env` and fill in passwords):
- `.env.simple.example`
- `.env.parity.example`

## Required by profile

### `simple`
- `DATABASE_URL`
- `APP_URL`

Recommended:
- `STORAGE_BACKEND=local`
- `STORAGE_ROOT`
- `MEDIA_ROOT`
- `UPLOAD_ROOT`

### `parity`
- `DATABASE_URL` (PostgreSQL URL)
- `APP_URL`
- `STORAGE_BACKEND=azure_blob`
- `AZURE_STORAGE_CONNECTION_STRING` (Azulite/dev connection string)
- `AZURE_STORAGE_CONTAINER`
- `PYTHON_TTS_URL`

### `azure`
- `DATABASE_URL`
  - use a local SQLite path such as `file:/var/lib/articlepod/db.sqlite` when `METADATA_PRIMARY_BACKEND=azure_table`
  - use an Azure PostgreSQL URL only when Prisma/PostgreSQL remains the primary metadata backend or you are running rollback/canary flows
- `APP_URL` (public HTTPS URL; production value is `https://articlepod.com`)
- `STORAGE_BACKEND=azure_blob`
- `AZURE_STORAGE_CONTAINER`
- `DIGEST_SCHEDULER_SECRET` (recommended explicit secret, minimum 32 chars)
- `MEDIA_SIGNING_KEY` (recommended explicit secret, minimum 32 chars)
- One of:
  - `AZURE_STORAGE_CONNECTION_STRING`
  - `AZURE_STORAGE_ACCOUNT_URL` + `AZURE_STORAGE_SAS_TOKEN`
- `PYTHON_TTS_URL`
- `PYTHON_TTS_TIMEOUT_MS` (Azure deploy helper defaults to `300000` on the cost-optimized B2s VM profile)
- `TTS_WORKERS` (set to `1` for the cost-optimized B2s baseline)
- If `DIGEST_SUMMARY_PROVIDER=azure_openai`:
  - `AZURE_OPENAI_BASE_URL`
  - `AZURE_OPENAI_API_KEY`
  - `AZURE_OPENAI_SUMMARY_NANO_DEPLOYMENT`
  - `AZURE_OPENAI_SUMMARY_MINI_DEPLOYMENT`

Azure deploy helper behavior:
- `scripts/azure/render-env.sh` forwards `DIGEST_SCHEDULER_SECRET` and `MEDIA_SIGNING_KEY` when provided.
- when `METADATA_PRIMARY_BACKEND=azure_table`, `scripts/azure/render-env.sh` now defaults `DATABASE_URL` to `file:/var/lib/articlepod/db.sqlite` if you do not provide one explicitly.
- when Azure OpenAI vars are present and `DIGEST_SUMMARY_PROVIDER` is unset, `scripts/azure/render-env.sh` defaults the summary provider to `azure_openai`.
- in Azure Table primary mode, low-cost diagnostics default to:
  - `ANALYTICS_STORAGE_MODE=off`
  - `JOB_EVENT_STORAGE_MODE=off`
  - `DEMO_EXTRACTION_TRACE_ENABLED=0`
- If either value is unset, a deterministic 64-char SHA-256 fallback is derived from existing Azure/database app secrets so non-simple profile startup contracts remain satisfied.

Deploy-time ingress/TLS variables (used by `scripts/azure/deploy-changes.sh`):
- `CANONICAL_HOST` (defaults from `APP_URL` host when set)
- `HOST_ALIASES` (comma-separated alias hosts, example: `www.articlepod.com`)
- `LETSENCRYPT_EMAIL`
- `DEPLOY_CONFIGURE_INGRESS` (`1` by default; set `0` to skip ingress/TLS automation)
- `APP_DOMAIN_ALIASES` (alias helper for CI; maps to `HOST_ALIASES` when unset)

## Shared auth/admin
- `DEMO_EMAIL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `FREE_TRIAL_SUBMISSION_LIMIT` (default `2`; non-paid ingest quota before paid/admin override required)
- `PRO_MONTHLY_DAILY_PODCAST_LIMIT` (default `12`; `Pro monthly` guardrail for new podcast episodes created in the last 24 hours)
- `PRO_MONTHLY_WEEKLY_SUMMARY_LIMIT` (default `5`; `Pro monthly` guardrail for manual summaries created in the last 7 days)
- `PRO_ANNUAL_DAILY_PODCAST_LIMIT` (default `15`; `Pro annual` guardrail for new podcast episodes created in the last 24 hours)
- `PRO_ANNUAL_WEEKLY_SUMMARY_LIMIT` (default `10`; `Pro annual` guardrail for manual summaries created in the last 7 days)
- `EXTENSION_CONNECT_CODE_TTL_MINUTES` (default `1440`; one-time connect code lifetime)
- Optional OAuth:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `FACEBOOK_APP_ID`
  - `FACEBOOK_APP_SECRET`
  - `APPLE_CLIENT_ID`
  - `APPLE_CLIENT_SECRET`
- Optional geo header overrides (defaults already support Vercel + Cloudflare):
  - `GEO_HEADER_COUNTRY`
  - `GEO_HEADER_REGION`
  - `GEO_HEADER_CITY`

## Feedback mirror (optional)
- `GITHUB_FEEDBACK_MIRROR_ENABLED` (`1` to mirror feedback into private GitHub issues; default `0`)
- `GITHUB_FEEDBACK_OWNER`
- `GITHUB_FEEDBACK_REPO`
- `GITHUB_FEEDBACK_TOKEN` (issues write token)
- `GITHUB_FEEDBACK_LABELS` (comma-separated labels, default `feedback`)

Behavior:
- When disabled or unset, feedback remains DB-only.
- Mirror failures do not block user submission and can be retried from admin inbox.

## Billing (optional)
- `BILLING_SANDBOX_ALLOWLIST_EMAILS` (comma-separated extra email allowlist for non-admin tester accounts that may switch to sandbox billing in Settings; this extends the checked-in internal tester defaults rather than replacing them)
- `STRIPE_LIVE_SECRET_KEY` (required for default live Checkout and Customer Portal sessions)
- `STRIPE_LIVE_WEBHOOK_SECRET` (required to verify `POST /api/billing/webhook`)
- `STRIPE_LIVE_PRICE_PRO_MONTHLY` (live recurring monthly price id for the Pro plan)
- `STRIPE_LIVE_PRICE_PRO_ANNUAL` (live recurring yearly price id for the Pro annual plan)
- `STRIPE_LIVE_BILLING_PORTAL_CONFIGURATION_ID` (optional explicit live portal configuration; default Stripe portal config is used when unset)
- `STRIPE_SANDBOX_SECRET_KEY` (required for tester-only sandbox Checkout and Customer Portal sessions)
- `STRIPE_SANDBOX_WEBHOOK_SECRET` (required to verify `POST /api/billing/webhook/sandbox`)
- `STRIPE_SANDBOX_PRICE_PRO_MONTHLY` (sandbox recurring monthly price id for the Pro plan)
- `STRIPE_SANDBOX_PRICE_PRO_ANNUAL` (sandbox recurring yearly price id for the Pro annual plan)
- `STRIPE_SANDBOX_BILLING_PORTAL_CONFIGURATION_ID` (optional explicit sandbox portal configuration; default Stripe portal config is used when unset)
- Compatibility aliases during rollout:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_PRO_MONTHLY`
  - `STRIPE_PRICE_PRO_ANNUAL`
  - `STRIPE_BILLING_PORTAL_CONFIGURATION_ID`
  - These older names are treated as live-lane aliases when the new `STRIPE_LIVE_*` names are absent. Prefer the lane-specific names for new deploys.

Behavior:
- Live billing stays the default for every user.
- Only admins and emails listed in `BILLING_SANDBOX_ALLOWLIST_EMAILS` can switch to sandbox billing from `/app/settings`.
- Sandbox billing stores separate customer/subscription/payment state and never changes live access, quotas, or summary limits.
- Billing routes for a lane stay unavailable until that lane's Stripe secret key and at least one Pro price id are set.
- ArticlePod stores only Stripe customer/subscription metadata, local entitlement state, latest invoice/payment state, and webhook audit metadata; card details remain in Stripe-hosted flows.
- Use separate Stripe secret keys, price ids, portal configuration ids, and webhook secrets for each environment and for each lane.
- Never mix live Stripe credentials into local, staging, or sandbox-only test flows.
- If you need to pause new self-serve checkout without breaking existing billing management, unset the price ids for the affected lane and keep that lane's secret key + webhook secret configured so Portal and webhook sync continue to work for existing subscribers or testers.

## Worker controls
- `PINNED_FETCH_IPV6_ENABLED` (`0` default for Azure, otherwise enabled unless overridden; disable IPv6 pinned-IP fetch attempts on single-stack hosts)
- `WORKER_ROLE` (`primary` default; set `overflow` for a queue-pressure-triggered overflow worker process)
- `WORKER_OVERFLOW_ENABLED` (`0` default; set `1` to let overflow workers process jobs when pressure policy is active)
- `WORKER_OVERFLOW_POLICY_EVAL_MS` (default `15000`; queue-pressure evaluation interval)
- `WORKER_OVERFLOW_ACTIVATE_QUEUE_DEPTH` (default `8`; overflow activates when eligible queue depth is at or above this)
- `WORKER_OVERFLOW_DEACTIVATE_QUEUE_DEPTH` (default `2`; overflow can deactivate once queue depth drops to/below this)
- `WORKER_OVERFLOW_ACTIVATE_OLDEST_MS` (default `300000`; overflow activates when oldest eligible job age reaches this)
- `WORKER_OVERFLOW_DEACTIVATE_OLDEST_MS` (default `120000`; overflow can deactivate once oldest eligible age drops to/below this)
- `WORKER_OVERFLOW_MIN_ACTIVE_MS` (default `180000`; minimum active duration to avoid policy thrash)
- `OVERFLOW_PYTHON_TTS_URL` (optional external python-tts endpoint used by overflow workers)
- `OVERFLOW_PYTHON_TTS_TIMEOUT_MS` (default inherits `PYTHON_TTS_TIMEOUT_MS`)
- `OVERFLOW_PYTHON_TTS_SECRET` (optional auth secret for overflow python-tts endpoint)
- `ITEM_DISPATCH_BACKEND` (`auto` default; chooses `azure_queue` when Azure Blob credentials are present, otherwise `prisma`)
- `ITEM_DISPATCH_QUEUE_NAME` (default `${BRAND_SLUG}-item-dispatch`; queue name used by Azure Queue Storage or the local Prisma dispatch adapter)
- `ITEM_DISPATCH_CREATE_QUEUE` (`1` default; create the Azure queue automatically when missing)
- `ITEM_DISPATCH_VISIBILITY_MS` (default follows `WORKER_STALE_PROCESSING_MS`; lease/visibility timeout for a reserved item job)
- `ITEM_DISPATCH_HEARTBEAT_MS` (default `30000`; heartbeat interval that renews the dispatch reservation and durable lease while TTS runs)
- `ITEM_DISPATCH_MAX_DELIVERIES` (default `8`; poison-message ceiling before an item job is failed and the dispatch message is removed)
- `WORKER_INSTANCE_ID` (optional explicit worker identity; defaults to `<hostname>:<pid>` and is stored on durable job leases)
- `WORKER_POLL_MS`
- `WORKER_STALE_PROCESSING_MS` (default `900000`; stale `PROCESSING` jobs are considered stalled after 15 minutes without progress)
- `WORKER_MAX_STALE_RETRIES` (default `1`; a stalled job gets one automatic reclaim before it is marked `PROCESSING_TIMEOUT`)
- `WORKER_MAX_PROCESSING_MS` (default `2700000`; actively progressing work is stopped after 45 minutes)
- `WORKER_RETRY_POLL_MS`
- `WORKER_RAW_ARTIFACT_RETENTION_DAYS` (default `90`; expires `RAW_HTML`/`RAW_PDF` artifacts while keeping markdown artifacts)
- `AUDIO_RETENTION_DAYS` (default `60`; stamps item/digest/summary episode audio expiry from `publishedAt` for feed/media hiding + purge)
- `WORKER_QUEUE_PRESSURE_SOURCE` (`prisma` default; set `mirror` to drive overflow policy from metadata mirror snapshots)

## Metadata primary + mirror controls
- `METADATA_PRIMARY_BACKEND` (`prisma` default, `azure_table` supported)
  - `prisma`: Prisma-backed operational metadata (`simple` = SQLite, `parity`/legacy `azure` = PostgreSQL)
  - `azure_table`: Azure Table becomes the operational metadata store for accounts, sessions, items, jobs, episodes, digest state, and quota state
- `METADATA_MIRROR_BACKEND` (`none` default, `azure_table` supported)
- `METADATA_MIRROR_DUAL_WRITE` (`0` default; set `1` to dual-write queue/item/digest projections)
- `METADATA_CANARY_COMPARE` (`0` default; set `1` to log queue snapshot diffs between Prisma and mirror)
- `AZURE_TABLE_CONNECTION_STRING` (preferred auth for Azure Table primary/mirror)
- `AZURE_TABLE_ACCOUNT_URL` + `AZURE_TABLE_SAS_TOKEN` (alternative auth pair)
- `AZURE_TABLE_PREFIX` (default `articlepod`; table names derive from this prefix)
- `AZURE_TABLE_CREATE_TABLES` (`1` default; set `0` to require pre-provisioned tables)

Recommended low-cost Azure setting:
- `METADATA_PRIMARY_BACKEND=azure_table`
- `DATABASE_URL=file:/var/lib/articlepod/db.sqlite`
- `ITEM_DISPATCH_BACKEND=azure_queue`
- `WORKER_QUEUE_PRESSURE_SOURCE=prisma`
- `METADATA_MIRROR_BACKEND=none` unless you are actively dual-writing for rollback certification

Parity note:
- When you point `AZURE_STORAGE_CONNECTION_STRING` at Azurite for parity tests, include both `BlobEndpoint=...` and `QueueEndpoint=...` so the item dispatch queue and blob artifacts share the same emulator account.

## Digest controls
- `DIGEST_INTERNAL_SCHEDULER_ENABLED` (`1` default; set `0` to rely only on external tick calls)
- `DIGEST_SCHEDULER_TICK_MS` (default `60000`)
- `DIGEST_SCHEDULER_SECRET` (required to authorize `POST /api/internal/digests/tick`)
- `DIGEST_RUN_MAX_RETRY_ATTEMPTS` (default `3`)
- `DIGEST_SUMMARY_PROVIDER` (`stub` default, `proxy` and `azure_openai` supported)
- `DIGEST_SUMMARY_PROXY_URL` (required when `DIGEST_SUMMARY_PROVIDER=proxy`)
- `DIGEST_SUMMARY_TIMEOUT_MS` (default `30000`)
- `DIGEST_EMAIL_PROVIDER` (`stub` default)
- `AZURE_OPENAI_BASE_URL` (required when `DIGEST_SUMMARY_PROVIDER=azure_openai`)
- `AZURE_OPENAI_API_KEY` (required when `DIGEST_SUMMARY_PROVIDER=azure_openai`)
- `AZURE_OPENAI_SUMMARY_NANO_DEPLOYMENT` (default `digest-summary-nano`)
- `AZURE_OPENAI_SUMMARY_MINI_DEPLOYMENT` (default `digest-summary-mini`)

## Observability and logging (all profiles)
- `LOG_ROOT` (default: `.runtime/logs` relative to repo root)
- `LOG_RETENTION_DAYS` (default: `14`; Azure deploy helper now defaults VM envs to `7`)
- `LOG_ERROR_RETENTION_DAYS` (default: `max(LOG_RETENTION_DAYS, 30)` in app code; Azure deploy helper defaults VM envs to `30`)
- `LOG_MAX_BYTES` (default: `1048576` = 1 MB per log file)
- `LOG_MAX_FILES` (default: `10`)
- `ARTICLEPOD_CONSOLE_LOGS` (set `1` to mirror JSON logs to stdout)
- `PODCAST_REQUEST_LOGGING` (default: `1`; set `0` to disable detailed RSS/media request diagnostics in web logs)
- `ANALYTICS_STORAGE_MODE` (`full` default; set `off` in cost-optimized Azure mode to keep analytics out of the primary metadata store)
  - with `METADATA_PRIMARY_BACKEND=azure_table`, admin analytics still derives signup/session/item/job views from primary-store data; `PLAYBACK_STARTED` remains unavailable unless auxiliary analytics storage is enabled.
- `JOB_EVENT_STORAGE_MODE` (`database` default; set `off` to keep worker job-event firehose in local logs only)
- `DEMO_EXTRACTION_TRACE_ENABLED` (`1` default; set `0` to disable persisted demo extraction traces)
- Legacy fallback: `LISTENLATER_CONSOLE_LOGS`

## Telemetry wiring (Azure + parity)
- `OTEL_ENABLED` (`1` to enable OTel exporters when configured)
- `OTEL_SERVICE_NAME` (service tag override)
- `AZURE_MONITOR_CONNECTION_STRING` (Azure Monitor exporter connection string)

Cost-optimized Azure guidance:
- Keep structured logs on local disk (`LOG_ROOT`) and rotate them.
- Activity logs (`DEBUG`/`INFO`/`WARN`) now write under `LOG_ROOT/events/<service>/events.log.jsonl`.
- Error logs (`ERROR`/`FATAL`) now write under `LOG_ROOT/errors/<service>/errors.log.jsonl`.
- Archive rotated logs to Blob if retention is needed after VM replacement.
- Do not use Azure Table for verbose logs, request traces, or analytics firehose data.
- Treat local SQLite in Azure Table primary mode as auxiliary state for low-signal/admin-only features, not as the primary durable store.
- Azure VM disk guard defaults:
  - `VM_JOURNAL_MAX_USE` (default: `200M`) caps systemd journal growth.
  - `VM_JOURNAL_KEEP_FREE` (default: `1G`) asks journald to preserve root-disk headroom.
  - `VM_JOURNAL_RETENTION` (default: `7day`) bounds journal retention by time.
  - `VM_CLEANUP_MIN_FREE_MB` (default: `3072`) triggers pressure cleanup of caches and staging artifacts.
  - `scripts/azure/cleanup-vm-disk.sh` is installed behind `articlepod-maintenance.timer` and runs every 6 hours, pruning staging-only artifacts (`exports/`, `.worktrees/`, test reports, stale env uploads), vacuuming journald, and applying separate time-based cleanup to `events/` vs `errors/` log trees before escalating to cache cleanup when free space drops below the configured floor.

## Validation commands
- `npm run check:env:simple`
- `npm run check:env:parity`
- `npm run check:env:azure`

`run.sh` runs profile-aware checks automatically:
- `./run.sh --profile simple`
- `./run.sh --profile parity`
- `./run.sh --profile azure`

Quick web-only local testing:
- `./run.sh --web`
- fastest repeat loop: `./run.sh --web --fast`

Fast repeat local testing after the initial bootstrap:
- `./run.sh --fast`
- `./run.sh --skip-bootstrap`
- `./run.sh --clean --web --fast` to clear stale Next.js caches before restarting
