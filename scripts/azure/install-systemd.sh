#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo scripts/azure/install-systemd.sh"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

install -m 0644 "$ROOT_DIR/infra/systemd/listenlater-python-tts.service" /etc/systemd/system/listenlater-python-tts.service
install -m 0644 "$ROOT_DIR/infra/systemd/listenlater-web.service" /etc/systemd/system/listenlater-web.service
install -m 0644 "$ROOT_DIR/infra/systemd/listenlater-worker.service" /etc/systemd/system/listenlater-worker.service

systemctl daemon-reload
systemctl enable listenlater-python-tts.service listenlater-web.service listenlater-worker.service

echo "[install-systemd] services installed and enabled"
