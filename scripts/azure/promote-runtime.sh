#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo scripts/azure/promote-runtime.sh"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/azure/runtime-naming.sh
source "$ROOT_DIR/scripts/azure/runtime-naming.sh"

STAGING_DIR="${STAGING_DIR:-$RUNTIME_STAGING_DIR}"
APP_DIR="${APP_DIR:-$RUNTIME_APP_DIR}"
APP_USER="${APP_USER:-$RUNTIME_APP_USER}"
APP_GROUP="${APP_GROUP:-$RUNTIME_APP_GROUP}"

if [[ ! -d "$STAGING_DIR" ]]; then
  echo "Missing staging directory: $STAGING_DIR"
  exit 1
fi

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  echo "Missing runtime user '$APP_USER'. Run bootstrap first."
  exit 1
fi

mkdir -p "$APP_DIR"
rsync -az --delete \
  --exclude '.runtime/' \
  --exclude 'services/python-tts/.venv' \
  --exclude 'apps/web/.env' \
  --exclude 'apps/web/.env.*' \
  --exclude 'apps/worker/.env' \
  --exclude 'apps/worker/.env.*' \
  --exclude 'services/python-tts/.env' \
  --exclude 'services/python-tts/.env.*' \
  "$STAGING_DIR"/ "$APP_DIR"/

# Runtime configuration comes from the managed env file path.
# Remove any accidentally synced app-local .env files to avoid path/config drift.
rm -f \
  "$APP_DIR/apps/web/.env" \
  "$APP_DIR/apps/worker/.env" \
  "$APP_DIR/services/python-tts/.env"

chown -R "$APP_USER":"$APP_GROUP" "$APP_DIR"

echo "[promote-runtime] promoted ${STAGING_DIR} -> ${APP_DIR}"
