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
run_python_tts_setup
run_app_cmd "RUNTIME_PROFILE=azure npx pnpm --filter @listenlater/web run db:bootstrap"
run_app_cmd "RUNTIME_PROFILE=azure npx pnpm --filter @listenlater/web run seed:demo"

sudo scripts/azure/install-systemd.sh
sudo systemctl restart listenlater-python-tts.service listenlater-web.service listenlater-worker.service
sudo systemctl status --no-pager listenlater-python-tts.service listenlater-web.service listenlater-worker.service

echo "[deploy-vm-runtime] deployment complete"
