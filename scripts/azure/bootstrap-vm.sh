#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo scripts/azure/bootstrap-vm.sh"
  exit 1
fi

APP_USER="${APP_USER:-listenlater}"
APP_GROUP="${APP_GROUP:-listenlater}"
APP_HOME="/opt/listenlater"

apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  git \
  jq \
  ffmpeg \
  nginx \
  python3 \
  python3-venv \
  python3-pip \
  build-essential

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$APP_USER"
fi

mkdir -p "$APP_HOME" /etc/listenlater
chown -R "$APP_USER":"$APP_GROUP" "$APP_HOME" /etc/listenlater

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

npm install -g pnpm@9.15.4

echo "[bootstrap-vm] complete"
