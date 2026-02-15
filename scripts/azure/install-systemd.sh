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

install -m 0644 "$ROOT_DIR/infra/systemd/${PYTHON_TTS_SERVICE}" "/etc/systemd/system/${PYTHON_TTS_SERVICE}"
install -m 0644 "$ROOT_DIR/infra/systemd/${WEB_SERVICE}" "/etc/systemd/system/${WEB_SERVICE}"
install -m 0644 "$ROOT_DIR/infra/systemd/${WORKER_SERVICE}" "/etc/systemd/system/${WORKER_SERVICE}"

systemctl daemon-reload
systemctl enable "$PYTHON_TTS_SERVICE" "$WEB_SERVICE" "$WORKER_SERVICE"

echo "[install-systemd] services installed and enabled"
