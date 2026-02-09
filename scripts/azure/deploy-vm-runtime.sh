#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/listenlater}"
ENV_FILE="${ENV_FILE:-/etc/listenlater/listenlater.env}"
APP_USER="${APP_USER:-listenlater}"

if [[ ! -d "$APP_DIR" ]]; then
  echo "Missing app directory: $APP_DIR"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

cd "$APP_DIR"

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  echo "Missing runtime user '$APP_USER'. Run bootstrap first."
  exit 1
fi

sudo -u "$APP_USER" bash -lc '
  set -euo pipefail
  cd /opt/listenlater
  npx pnpm install --frozen-lockfile
  npx pnpm --filter @listenlater/web run prisma:generate
  npx pnpm --filter @listenlater/worker run prisma:generate
  npx pnpm --filter @listenlater/web run build
  npx pnpm --filter @listenlater/worker run build
  cd services/python-tts
  python3 -m venv .venv
  ./.venv/bin/pip install --upgrade pip
  ./.venv/bin/pip install -r requirements.txt -r requirements.providers.txt
'

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

sudo -u "$APP_USER" bash -lc 'cd /opt/listenlater && RUNTIME_PROFILE=azure npx pnpm --filter @listenlater/web run db:bootstrap'
sudo -u "$APP_USER" bash -lc 'cd /opt/listenlater && RUNTIME_PROFILE=azure npx pnpm --filter @listenlater/web run seed:demo'

sudo scripts/azure/install-systemd.sh
sudo systemctl restart listenlater-python-tts.service listenlater-web.service listenlater-worker.service
sudo systemctl status --no-pager listenlater-python-tts.service listenlater-web.service listenlater-worker.service

echo "[deploy-vm-runtime] deployment complete"
