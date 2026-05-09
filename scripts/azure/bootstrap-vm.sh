#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo scripts/azure/bootstrap-vm.sh"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/azure/runtime-naming.sh
source "$ROOT_DIR/scripts/azure/runtime-naming.sh"

APP_USER="${APP_USER:-$RUNTIME_APP_USER}"
APP_GROUP="${APP_GROUP:-$RUNTIME_APP_GROUP}"
APP_HOME="${APP_HOME:-$RUNTIME_APP_DIR}"
ETC_DIR="${ETC_DIR:-$RUNTIME_ETC_DIR}"

apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  git \
  jq \
  rsync \
  ffmpeg \
  nginx \
  python3 \
  python3-venv \
  python3-pip \
  build-essential

if ! getent group "$APP_GROUP" >/dev/null 2>&1; then
  groupadd "$APP_GROUP"
fi

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash -g "$APP_GROUP" "$APP_USER"
fi

mkdir -p "$APP_HOME" "$ETC_DIR"
chown -R "$APP_USER":"$APP_GROUP" "$APP_HOME" "$ETC_DIR"

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

npm install -g pnpm@11.0.9

"$ROOT_DIR/scripts/azure/ensure-swap.sh"
"$ROOT_DIR/scripts/azure/configure-journald.sh"

echo "[bootstrap-vm] complete"
