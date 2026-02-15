#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo scripts/azure/promote-runtime.sh"
  exit 1
fi

STAGING_DIR="${STAGING_DIR:-/home/azureuser/listenlater}"
APP_DIR="${APP_DIR:-/opt/listenlater}"
APP_USER="${APP_USER:-listenlater}"
APP_GROUP="${APP_GROUP:-listenlater}"

if [[ ! -d "$STAGING_DIR" ]]; then
  echo "Missing staging directory: $STAGING_DIR"
  exit 1
fi

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  echo "Missing runtime user '$APP_USER'. Run bootstrap first."
  exit 1
fi

mkdir -p "$APP_DIR"
rsync -az --delete "$STAGING_DIR"/ "$APP_DIR"/
chown -R "$APP_USER":"$APP_GROUP" "$APP_DIR"

echo "[promote-runtime] promoted ${STAGING_DIR} -> ${APP_DIR}"
