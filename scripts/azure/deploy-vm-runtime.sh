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

run_app_cmd() {
  local cmd="$1"
  sudo -u "$APP_USER" APP_DIR="$APP_DIR" ENV_FILE="$ENV_FILE" bash -lc '
    set -euo pipefail
    load_env_file() {
      while IFS= read -r line || [[ -n "$line" ]]; do
        [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
        local key="${line%%=*}"
        local value="${line#*=}"
        export "$key=$value"
      done < "$ENV_FILE"
    }
    load_env_file
    cd "$APP_DIR"
    eval "$1"
  ' _ "$cmd"
}

if ! sudo -u "$APP_USER" ENV_FILE="$ENV_FILE" bash -lc '
  set -euo pipefail
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    export "$key=$value"
  done < "$ENV_FILE"
  [[ -n "${DATABASE_URL:-}" ]]
'; then
  echo "DATABASE_URL is missing in $ENV_FILE"
  exit 1
fi

run_app_cmd "npx pnpm install --frozen-lockfile"
run_app_cmd "RUNTIME_PROFILE=azure npx pnpm --filter @listenlater/web run prisma:generate"
run_app_cmd "RUNTIME_PROFILE=azure npx pnpm --filter @listenlater/worker run prisma:generate"
run_app_cmd "RUNTIME_PROFILE=azure npx pnpm --filter @listenlater/web run build"
run_app_cmd "RUNTIME_PROFILE=azure npx pnpm --filter @listenlater/worker run build"
run_app_cmd "cd services/python-tts && python3 -m venv .venv && ./.venv/bin/pip install --upgrade pip && ./.venv/bin/pip install -r requirements.txt -r requirements.providers.txt"
run_app_cmd "RUNTIME_PROFILE=azure npx pnpm --filter @listenlater/web run db:bootstrap"
run_app_cmd "RUNTIME_PROFILE=azure npx pnpm --filter @listenlater/web run seed:demo"

sudo scripts/azure/install-systemd.sh
sudo systemctl restart listenlater-python-tts.service listenlater-web.service listenlater-worker.service
sudo systemctl status --no-pager listenlater-python-tts.service listenlater-web.service listenlater-worker.service

echo "[deploy-vm-runtime] deployment complete"
