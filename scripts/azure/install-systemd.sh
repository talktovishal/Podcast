#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo scripts/azure/install-systemd.sh"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/azure/runtime-naming.sh
source "$ROOT_DIR/scripts/azure/runtime-naming.sh"

PYTHON_TTS_SERVICE="$(runtime_service_name python-tts)"
WEB_SERVICE="$(runtime_service_name web)"
WORKER_SERVICE="$(runtime_service_name worker)"
WORKER_OVERFLOW_SERVICE="$(runtime_service_name worker-overflow)"
MAINTENANCE_SERVICE="${RUNTIME_SERVICE_PREFIX}-maintenance.service"
MAINTENANCE_TIMER="${RUNTIME_SERVICE_PREFIX}-maintenance.timer"
LEGACY_PYTHON_TTS_SERVICE="$(legacy_runtime_service_name python-tts)"
LEGACY_WEB_SERVICE="$(legacy_runtime_service_name web)"
LEGACY_WORKER_SERVICE="$(legacy_runtime_service_name worker)"
ENABLE_OVERFLOW_WORKER_SERVICE="${ENABLE_OVERFLOW_WORKER_SERVICE:-0}"

cleanup_legacy_alias_conflicts() {
  local service
  local legacy_path

  for service in "$LEGACY_PYTHON_TTS_SERVICE" "$LEGACY_WEB_SERVICE" "$LEGACY_WORKER_SERVICE"; do
    legacy_path="/etc/systemd/system/${service}"
    if [[ -e "$legacy_path" ]]; then
      systemctl disable "$service" >/dev/null 2>&1 || true
      rm -f "$legacy_path"
    fi
  done
}

install -m 0644 "$ROOT_DIR/infra/systemd/${PYTHON_TTS_SERVICE}" "/etc/systemd/system/${PYTHON_TTS_SERVICE}"
install -m 0644 "$ROOT_DIR/infra/systemd/${WEB_SERVICE}" "/etc/systemd/system/${WEB_SERVICE}"
install -m 0644 "$ROOT_DIR/infra/systemd/${WORKER_SERVICE}" "/etc/systemd/system/${WORKER_SERVICE}"
install -m 0644 "$ROOT_DIR/infra/systemd/${WORKER_OVERFLOW_SERVICE}" "/etc/systemd/system/${WORKER_OVERFLOW_SERVICE}"
install -m 0644 "$ROOT_DIR/infra/systemd/${MAINTENANCE_SERVICE}" "/etc/systemd/system/${MAINTENANCE_SERVICE}"
install -m 0644 "$ROOT_DIR/infra/systemd/${MAINTENANCE_TIMER}" "/etc/systemd/system/${MAINTENANCE_TIMER}"

cleanup_legacy_alias_conflicts
"$ROOT_DIR/scripts/azure/configure-journald.sh"
systemctl daemon-reload
systemctl enable "$PYTHON_TTS_SERVICE" "$WEB_SERVICE" "$WORKER_SERVICE"
systemctl enable --now "$MAINTENANCE_TIMER"
if [[ "$ENABLE_OVERFLOW_WORKER_SERVICE" == "1" ]]; then
  systemctl enable "$WORKER_OVERFLOW_SERVICE"
else
  systemctl disable "$WORKER_OVERFLOW_SERVICE" >/dev/null 2>&1 || true
fi

echo "[install-systemd] services installed (overflow enabled=${ENABLE_OVERFLOW_WORKER_SERVICE}, maintenance timer=${MAINTENANCE_TIMER})"
