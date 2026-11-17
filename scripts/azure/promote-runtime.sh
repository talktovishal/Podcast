#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo scripts/azure/promote-runtime.sh"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/azure/runtime-naming.sh
source "$ROOT_DIR/scripts/azure/runtime-naming.sh"
SYNC_EXCLUDES_FILE="$ROOT_DIR/scripts/azure/sync-excludes.txt"

STAGING_DIR="${STAGING_DIR:-$RUNTIME_STAGING_DIR}"
APP_DIR="${APP_DIR:-$RUNTIME_APP_DIR}"
APP_USER="${APP_USER:-$RUNTIME_APP_USER}"
APP_GROUP="${APP_GROUP:-$RUNTIME_APP_GROUP}"
ENV_FILE="${ENV_FILE:-$RUNTIME_ENV_FILE}"
SECRET_SOURCE="${ARTICLEPOD_SECRET_SOURCE-environment}"

if [[ ! -d "$STAGING_DIR" ]]; then
  echo "Missing staging directory: $STAGING_DIR"
  exit 1
fi

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  echo "Missing runtime user '$APP_USER'. Run bootstrap first."
  exit 1
fi

if [[ ! -f "$SYNC_EXCLUDES_FILE" ]]; then
  echo "Missing sync excludes file: $SYNC_EXCLUDES_FILE"
  exit 1
fi

rsync_args=(-az --delete --exclude-from="$SYNC_EXCLUDES_FILE")
case "$SECRET_SOURCE" in
  environment)
    mkdir -p "$APP_DIR"
    ;;
  keyvault)
    python3 "$ROOT_DIR/scripts/azure/keyvault-exec.py" --env-file "$ENV_FILE" --public-only -- \
      python3 "$ROOT_DIR/scripts/azure/check-vault-deployment.py" "$APP_DIR" "$STAGING_DIR" "$ENV_FILE"
    rsync_args+=(--chown="$APP_USER:$APP_GROUP")
    ;;
  *)
    echo "[promote-runtime] invalid secret source" >&2
    exit 2
    ;;
esac
rsync "${rsync_args[@]}" "$STAGING_DIR"/ "$APP_DIR"/

# Runtime configuration comes from the managed env file path.
# Remove any accidentally synced app-local .env files to avoid path/config drift.
if [[ "$SECRET_SOURCE" == "environment" ]]; then
  rm -f \
    "$APP_DIR/apps/web/.env" \
    "$APP_DIR/apps/worker/.env" \
    "$APP_DIR/services/python-tts/.env"
  chown -R "$APP_USER":"$APP_GROUP" "$APP_DIR"
fi

echo "[promote-runtime] promoted ${STAGING_DIR} -> ${APP_DIR}"
