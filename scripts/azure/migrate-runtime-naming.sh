#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo scripts/azure/migrate-runtime-naming.sh"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/azure/runtime-naming.sh
source "$ROOT_DIR/scripts/azure/runtime-naming.sh"

timestamp="$(date +%Y%m%d%H%M%S)"

backup_path_if_needed() {
  local path="$1"
  if [[ -e "$path" && ! -L "$path" ]]; then
    local backup_path="${path}.pre-articlepod-${timestamp}"
    mv "$path" "$backup_path"
    echo "[migrate-runtime-naming] backed up $path -> $backup_path"
  fi
}

if ! getent group "$RUNTIME_APP_GROUP" >/dev/null 2>&1; then
  groupadd "$RUNTIME_APP_GROUP"
fi

if ! id -u "$RUNTIME_APP_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash -g "$RUNTIME_APP_GROUP" "$RUNTIME_APP_USER"
fi

mkdir -p "$RUNTIME_APP_DIR" "$RUNTIME_ETC_DIR"

if [[ -d "$LEGACY_RUNTIME_APP_DIR" && ! -L "$LEGACY_RUNTIME_APP_DIR" ]]; then
  rsync -az "$LEGACY_RUNTIME_APP_DIR"/ "$RUNTIME_APP_DIR"/
fi

if [[ -d "$LEGACY_RUNTIME_ETC_DIR" && ! -L "$LEGACY_RUNTIME_ETC_DIR" ]]; then
  rsync -az "$LEGACY_RUNTIME_ETC_DIR"/ "$RUNTIME_ETC_DIR"/
fi

if [[ -f "$LEGACY_RUNTIME_ENV_FILE" ]]; then
  cp "$LEGACY_RUNTIME_ENV_FILE" "$RUNTIME_ENV_FILE"
fi

chown -R "$RUNTIME_APP_USER":"$RUNTIME_APP_GROUP" "$RUNTIME_APP_DIR" "$RUNTIME_ETC_DIR"

backup_path_if_needed "$LEGACY_RUNTIME_APP_DIR"
ln -sfn "$RUNTIME_APP_DIR" "$LEGACY_RUNTIME_APP_DIR"

backup_path_if_needed "$LEGACY_RUNTIME_ETC_DIR"
ln -sfn "$RUNTIME_ETC_DIR" "$LEGACY_RUNTIME_ETC_DIR"

"$ROOT_DIR/scripts/azure/install-systemd.sh"

PYTHON_TTS_SERVICE="$(runtime_service_name python-tts)"
WEB_SERVICE="$(runtime_service_name web)"
WORKER_SERVICE="$(runtime_service_name worker)"

if [[ -f "$RUNTIME_ENV_FILE" && -d "$RUNTIME_APP_DIR" ]]; then
  systemctl restart "$PYTHON_TTS_SERVICE" "$WEB_SERVICE" "$WORKER_SERVICE"
  systemctl status --no-pager "$PYTHON_TTS_SERVICE" "$WEB_SERVICE" "$WORKER_SERVICE"
else
  echo "[migrate-runtime-naming] runtime env or app dir missing; skipped service restart"
fi

echo "[migrate-runtime-naming] migration complete"
