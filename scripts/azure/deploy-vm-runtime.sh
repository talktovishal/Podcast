#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/azure/runtime-naming.sh
source "$ROOT_DIR/scripts/azure/runtime-naming.sh"

APP_DIR="${APP_DIR:-$RUNTIME_APP_DIR}"
ENV_FILE="${ENV_FILE:-$RUNTIME_ENV_FILE}"
APP_USER="${APP_USER:-$RUNTIME_APP_USER}"
APP_GROUP="${APP_GROUP:-$APP_USER}"

PYTHON_TTS_SERVICE="$(runtime_service_name python-tts)"
WEB_SERVICE="$(runtime_service_name web)"
WORKER_SERVICE="$(runtime_service_name worker)"

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

read_env_value() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi
  echo "${line#*=}"
}

remove_app_local_env_files() {
  rm -f \
    "$APP_DIR/apps/web/.env" \
    "$APP_DIR/apps/worker/.env" \
    "$APP_DIR/services/python-tts/.env"
}

ensure_runtime_dirs() {
  local runtime_paths=()
  local storage_root=""
  local media_root=""
  local upload_root=""

  storage_root="$(read_env_value STORAGE_ROOT || true)"
  media_root="$(read_env_value MEDIA_ROOT || true)"
  upload_root="$(read_env_value UPLOAD_ROOT || true)"

  [[ -n "$storage_root" ]] && runtime_paths+=("$storage_root")
  [[ -n "$media_root" ]] && runtime_paths+=("$media_root")
  [[ -n "$upload_root" ]] && runtime_paths+=("$upload_root")

  if [[ "${#runtime_paths[@]}" -eq 0 ]]; then
    return
  fi

  for path in "${runtime_paths[@]}"; do
    mkdir -p "$path"
  done
  chown -R "$APP_USER":"$APP_GROUP" "${runtime_paths[@]}"
}

run_python_tts_setup() {
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

    cd "$APP_DIR/services/python-tts"
    if [[ ! -x .venv/bin/python3 ]]; then
      python3 -m venv .venv
    fi

    ./.venv/bin/pip install --upgrade pip
    ./.venv/bin/pip install -r requirements.txt -r requirements.providers.txt

    ./.venv/bin/python - <<'"'"'PY'"'"'
from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

import nltk


def run_module(module: str, *args: str) -> None:
    subprocess.run([sys.executable, "-m", module, *args], check=True)


if importlib.util.find_spec("en_core_web_sm") is None:
    run_module("spacy", "download", "en_core_web_sm")

import unidic  # noqa: E402

dicdir = Path(unidic.DICDIR)
if not (dicdir / "mecabrc").exists():
    run_module("unidic", "download")

required_nltk = {
    "averaged_perceptron_tagger_eng": "taggers/averaged_perceptron_tagger_eng",
    "averaged_perceptron_tagger": "taggers/averaged_perceptron_tagger",
    "cmudict": "corpora/cmudict",
}

for package_name, resource_path in required_nltk.items():
    try:
        nltk.data.find(resource_path)
    except LookupError:
        nltk.download(package_name, quiet=False)
PY
  '
}

run_tts_preview_precompute() {
  if ! run_app_cmd "RUNTIME_PROFILE=azure npx pnpm --filter @articlepod/web run tts:precompute"; then
    echo "[deploy-vm-runtime] warning: tts preview precompute failed; previews will be generated on demand" >&2
  fi
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

remove_app_local_env_files
ensure_runtime_dirs
run_app_cmd "npx pnpm install --frozen-lockfile"
run_app_cmd "RUNTIME_PROFILE=azure npx pnpm --filter @articlepod/web run prisma:generate"
run_app_cmd "RUNTIME_PROFILE=azure npx pnpm --filter @articlepod/worker run prisma:generate"
run_app_cmd "RUNTIME_PROFILE=azure npx pnpm --filter @articlepod/web run build"
run_app_cmd "RUNTIME_PROFILE=azure npx pnpm --filter @articlepod/worker run build"
run_python_tts_setup
run_app_cmd "RUNTIME_PROFILE=azure npx pnpm --filter @articlepod/web run db:bootstrap"
run_app_cmd "RUNTIME_PROFILE=azure npx pnpm --filter @articlepod/web run seed:demo"

sudo "$ROOT_DIR/scripts/azure/install-systemd.sh"
sudo systemctl restart "$PYTHON_TTS_SERVICE"
run_tts_preview_precompute
sudo systemctl restart "$WEB_SERVICE" "$WORKER_SERVICE"
sudo systemctl status --no-pager "$PYTHON_TTS_SERVICE" "$WEB_SERVICE" "$WORKER_SERVICE"

echo "[deploy-vm-runtime] deployment complete"
