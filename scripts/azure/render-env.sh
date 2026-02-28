#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/azure/runtime-naming.sh
source "$ROOT_DIR/scripts/azure/runtime-naming.sh"

OUT_FILE="${OUT_FILE:-$RUNTIME_ENV_FILE}"
STATE_ROOT_DEFAULT="/var/lib/${RUNTIME_SERVICE_PREFIX}"

required=(
  DATABASE_URL
  APP_URL
  STORAGE_BACKEND
  AZURE_STORAGE_CONTAINER
  PYTHON_TTS_URL
)

for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required env var: $key"
    exit 1
  fi
done

hash_secret() {
  local input="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    printf "%s" "$input" | sha256sum | awk '{print $1}'
  else
    printf "%s" "$input" | shasum -a 256 | awk '{print $1}'
  fi
}

derive_secret() {
  local purpose="$1"
  local entropy_source=""
  if [[ -n "${AZURE_STORAGE_CONNECTION_STRING:-}" ]]; then
    entropy_source="${AZURE_STORAGE_CONNECTION_STRING}"
  elif [[ -n "${AZURE_STORAGE_ACCOUNT_URL:-}" || -n "${AZURE_STORAGE_SAS_TOKEN:-}" ]]; then
    entropy_source="${AZURE_STORAGE_ACCOUNT_URL:-}|${AZURE_STORAGE_SAS_TOKEN:-}"
  else
    entropy_source="${DATABASE_URL}|${APP_URL}|${ADMIN_PASSWORD:-}"
  fi
  hash_secret "${purpose}|${DATABASE_URL}|${APP_URL}|${entropy_source}"
}

DIGEST_SCHEDULER_SECRET="${DIGEST_SCHEDULER_SECRET:-$(derive_secret "digest_scheduler")}"
MEDIA_SIGNING_KEY="${MEDIA_SIGNING_KEY:-$(derive_secret "media_signing")}"

if [[ "${#DIGEST_SCHEDULER_SECRET}" -lt 32 ]]; then
  echo "DIGEST_SCHEDULER_SECRET must be at least 32 characters"
  exit 1
fi

if [[ "${#MEDIA_SIGNING_KEY}" -lt 32 ]]; then
  echo "MEDIA_SIGNING_KEY must be at least 32 characters"
  exit 1
fi

mkdir -p "$(dirname "$OUT_FILE")"

cat > "$OUT_FILE" <<ENVFILE
RUNTIME_PROFILE=azure
DATABASE_URL=${DATABASE_URL}
APP_URL=${APP_URL}
STORAGE_BACKEND=${STORAGE_BACKEND}
AZURE_STORAGE_CONTAINER=${AZURE_STORAGE_CONTAINER}
AZURE_STORAGE_CREATE_CONTAINER=${AZURE_STORAGE_CREATE_CONTAINER:-1}
AZURE_STORAGE_CONNECTION_STRING=${AZURE_STORAGE_CONNECTION_STRING:-}
AZURE_STORAGE_ACCOUNT_URL=${AZURE_STORAGE_ACCOUNT_URL:-}
AZURE_STORAGE_SAS_TOKEN=${AZURE_STORAGE_SAS_TOKEN:-}
STORAGE_ROOT=${STORAGE_ROOT:-${STATE_ROOT_DEFAULT}/storage}
MEDIA_ROOT=${MEDIA_ROOT:-${STATE_ROOT_DEFAULT}/media}
UPLOAD_ROOT=${UPLOAD_ROOT:-${STATE_ROOT_DEFAULT}/uploads}
PYTHON_TTS_URL=${PYTHON_TTS_URL}
PYTHON_TTS_TIMEOUT_MS=${PYTHON_TTS_TIMEOUT_MS:-120000}
WORKER_POLL_MS=${WORKER_POLL_MS:-2500}
WORKER_STALE_PROCESSING_MS=${WORKER_STALE_PROCESSING_MS:-900000}
WORKER_RETRY_POLL_MS=${WORKER_RETRY_POLL_MS:-5000}
DEMO_EMAIL=${DEMO_EMAIL:-demo@articlepod.local}
DEMO_PASSWORD=${DEMO_PASSWORD:-}
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@articlepod.local}
ADMIN_PASSWORD=${ADMIN_PASSWORD:?"ADMIN_PASSWORD env var is required"}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}
APPLE_CLIENT_ID=${APPLE_CLIENT_ID:-}
APPLE_CLIENT_SECRET=${APPLE_CLIENT_SECRET:-}
DIGEST_SCHEDULER_SECRET=${DIGEST_SCHEDULER_SECRET}
MEDIA_SIGNING_KEY=${MEDIA_SIGNING_KEY}
ENVFILE

echo "[render-env] wrote $OUT_FILE"
