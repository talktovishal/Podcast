# Environment Profiles

ArticlePod now uses profile-driven runtime contracts so local and Azure behavior stay aligned.

## Profile selection
- `RUNTIME_PROFILE=simple` -> SQLite + local object storage
- `RUNTIME_PROFILE=parity` -> PostgreSQL + Azurite (Blob API) + Docker Compose
- `RUNTIME_PROFILE=azure` -> Azure PostgreSQL + Azure Blob + VM runtime

Profile examples:
- `/Users/vishalchowdhary/Documents/Podcast/.env.simple.example`
- `/Users/vishalchowdhary/Documents/Podcast/.env.parity.example`
- `/Users/vishalchowdhary/Documents/Podcast/.env.azure.example`

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
- `APP_URL` (public HTTPS URL)
- `STORAGE_BACKEND=azure_blob`
- `AZURE_STORAGE_CONTAINER`
- One of:
  - `AZURE_STORAGE_CONNECTION_STRING`
  - `AZURE_STORAGE_ACCOUNT_URL` + `AZURE_STORAGE_SAS_TOKEN`
- `PYTHON_TTS_URL`

## Shared auth/admin
- `DEMO_EMAIL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- Optional OAuth:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `APPLE_CLIENT_ID`
  - `APPLE_CLIENT_SECRET`

## Worker controls
- `WORKER_POLL_MS`
- `WORKER_STALE_PROCESSING_MS` (default `180000`; stale `PROCESSING` jobs are auto-reclaimed after 3 minutes)
- `WORKER_RETRY_POLL_MS`

## Observability and logging (all profiles)
- `LOG_ROOT` (default: `/Users/vishalchowdhary/Documents/Podcast/.runtime/logs`)
- `LOG_RETENTION_DAYS` (default: `14`)
- `LOG_MAX_BYTES` (default: `1048576` = 1 MB per log file)
- `LOG_MAX_FILES` (default: `10`)
- `LISTENLATER_CONSOLE_LOGS` (set `1` to mirror JSON logs to stdout)

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
