# Environment Profiles

ArticlePod now uses profile-driven runtime contracts so local and Azure behavior stay aligned.

## Profile selection
- `RUNTIME_PROFILE=simple` -> SQLite + local object storage
- `RUNTIME_PROFILE=parity` -> PostgreSQL + Azurite (Blob API) + Docker Compose
- `RUNTIME_PROFILE=azure` -> Azure PostgreSQL + Azure Blob + VM runtime

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
- `DATABASE_URL` (Azure PostgreSQL URL)
- `APP_URL` (public HTTPS URL; production value is `https://articlepod.com`)
- `STORAGE_BACKEND=azure_blob`
- `AZURE_STORAGE_CONTAINER`
- One of:
  - `AZURE_STORAGE_CONNECTION_STRING`
  - `AZURE_STORAGE_ACCOUNT_URL` + `AZURE_STORAGE_SAS_TOKEN`
- `PYTHON_TTS_URL`

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
- Optional OAuth:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `APPLE_CLIENT_ID`
  - `APPLE_CLIENT_SECRET`

## Worker controls
- `WORKER_POLL_MS`
- `WORKER_STALE_PROCESSING_MS` (default `180000`; stale `PROCESSING` jobs are auto-reclaimed after 3 minutes)
- `WORKER_RETRY_POLL_MS`
- `WORKER_RAW_ARTIFACT_RETENTION_DAYS` (default `90`; expires `RAW_HTML`/`RAW_PDF` artifacts while keeping markdown artifacts)

## Digest controls
- `DIGEST_INTERNAL_SCHEDULER_ENABLED` (`1` default; set `0` to rely only on external tick calls)
- `DIGEST_SCHEDULER_TICK_MS` (default `60000`)
- `DIGEST_SCHEDULER_SECRET` (required to authorize `POST /api/internal/digests/tick`)
- `DIGEST_RUN_MAX_RETRY_ATTEMPTS` (default `3`)
- `DIGEST_SUMMARY_PROVIDER` (`stub` default, `proxy` supported)
- `DIGEST_SUMMARY_PROXY_URL` (required when `DIGEST_SUMMARY_PROVIDER=proxy`)
- `DIGEST_SUMMARY_TIMEOUT_MS` (default `30000`)
- `DIGEST_EMAIL_PROVIDER` (`stub` default)

## Observability and logging (all profiles)
- `LOG_ROOT` (default: `.runtime/logs` relative to repo root)
- `LOG_RETENTION_DAYS` (default: `14`)
- `LOG_MAX_BYTES` (default: `1048576` = 1 MB per log file)
- `LOG_MAX_FILES` (default: `10`)
- `ARTICLEPOD_CONSOLE_LOGS` (set `1` to mirror JSON logs to stdout)
- `PODCAST_REQUEST_LOGGING` (default: `1`; set `0` to disable detailed RSS/media request diagnostics in web logs)
- Legacy fallback: `LISTENLATER_CONSOLE_LOGS`

## Telemetry wiring (Azure + parity)
- `OTEL_ENABLED` (`1` to enable OTel exporters when configured)
- `OTEL_SERVICE_NAME` (service tag override)
- `AZURE_MONITOR_CONNECTION_STRING` (Azure Monitor exporter connection string)

## Validation commands
- `npm run check:env:simple`
- `npm run check:env:parity`
- `npm run check:env:azure`

`run.sh` runs profile-aware checks automatically:
- `./run.sh --profile simple`
- `./run.sh --profile parity`
- `./run.sh --profile azure`
