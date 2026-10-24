#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/azure/runtime-naming.sh
source "$ROOT_DIR/scripts/azure/runtime-naming.sh"

APP_DIR="${APP_DIR:-$RUNTIME_APP_DIR}"
STAGING_DIR="${STAGING_DIR:-$RUNTIME_STAGING_DIR}"
ENV_FILE="${ENV_FILE:-$RUNTIME_ENV_FILE}"
APP_USER="${APP_USER:-$RUNTIME_APP_USER}"
APP_GROUP="${APP_GROUP:-$APP_USER}"
DEPLOY_FORCE_FULL="${DEPLOY_FORCE_FULL:-0}"
DEPLOY_DEMO_SEED_MODE="${DEPLOY_DEMO_SEED_MODE:-auto}"
ENABLE_OVERFLOW_WORKER_SERVICE="${ENABLE_OVERFLOW_WORKER_SERVICE:-0}"
SECRET_SOURCE="${ARTICLEPOD_SECRET_SOURCE-environment}"

DEPLOY_STATE_DIR="$APP_DIR/.runtime/deploy-state"
LOCK_HASH_FILE="$DEPLOY_STATE_DIR/pnpm-lock.sha256"
PYTHON_REQ_HASH_FILE="$DEPLOY_STATE_DIR/python-tts-requirements.sha256"
DEMO_SEED_MARKER_FILE="$DEPLOY_STATE_DIR/demo-seed.done"

PYTHON_TTS_SERVICE="$(runtime_service_name python-tts)"
WEB_SERVICE="$(runtime_service_name web)"
WORKER_SERVICE="$(runtime_service_name worker)"
WORKER_OVERFLOW_SERVICE="$(runtime_service_name worker-overflow)"

if [[ ! -d "$APP_DIR" ]]; then
  echo "Missing app directory: $APP_DIR"
  exit 1
fi

case "$SECRET_SOURCE" in
  environment|keyvault) ;;
  *)
    echo "[deploy-vm-runtime] invalid secret source" >&2
    exit 2
    ;;
esac

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ "$SECRET_SOURCE" == "environment" && -f "$LEGACY_RUNTIME_ENV_FILE" ]]; then
    echo "[deploy-vm-runtime] env file missing at $ENV_FILE; copying legacy env from $LEGACY_RUNTIME_ENV_FILE"
    mkdir -p "$(dirname "$ENV_FILE")"
    cp "$LEGACY_RUNTIME_ENV_FILE" "$ENV_FILE"
  else
    echo "Missing env file: $ENV_FILE"
    exit 1
  fi
fi

if [[ "$SECRET_SOURCE" == "environment" ]]; then
  python3 "$ROOT_DIR/scripts/azure/assert-legacy-deploy.py" "$ENV_FILE"
fi

cd "$APP_DIR"

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  echo "Missing runtime user '$APP_USER'. Run bootstrap first."
  exit 1
fi

case "$DEPLOY_DEMO_SEED_MODE" in
  auto|always|never)
    ;;
  *)
    echo "Invalid DEPLOY_DEMO_SEED_MODE: $DEPLOY_DEMO_SEED_MODE (expected: auto|always|never)"
    exit 2
    ;;
esac

if [[ "$SECRET_SOURCE" == "keyvault" && "$DEPLOY_DEMO_SEED_MODE" != "never" ]]; then
  echo "[deploy-vm-runtime] Key Vault deployment requires DEPLOY_DEMO_SEED_MODE=never; rotate accounts separately" >&2
  exit 2
fi

run_app_cmd() {
  local scope="$1"
  shift
  if [[ "$#" -eq 0 ]]; then
    echo "[deploy-vm-runtime] a scoped command is required" >&2
    return 2
  fi
  case "$scope" in
    public|ops|web|worker|python-tts|worker-overflow) ;;
    *)
      echo "[deploy-vm-runtime] invalid command credential scope" >&2
      return 2
      ;;
  esac
  if [[ "$SECRET_SOURCE" == "keyvault" ]]; then
    local launcher_args=(--env-file "$ENV_FILE")
    if [[ "$scope" == "public" ]]; then
      launcher_args+=(--public-only)
    else
      launcher_args+=(--service "$scope")
    fi
    sudo -H -u "$APP_USER" python3 "$ROOT_DIR/scripts/azure/keyvault-exec.py" \
      "${launcher_args[@]}" -- /usr/bin/env bash --noprofile --norc -c '
        set -euo pipefail
        cd -- "$1"
        shift
        exec "$@"
      ' _ "$APP_DIR" "$@"
    return
  fi
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
    exec "$@"
  ' _ "$@"
}

read_env_value() {
  local key="$1"
  if [[ "$SECRET_SOURCE" == "keyvault" ]]; then
    run_app_cmd public python3 -c \
      'import os, sys; sys.stdout.write(os.environ.get(sys.argv[1], ""))' "$key"
    return
  fi
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi
  echo "${line#*=}"
}

hash_files() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$@" | sha256sum | awk '{print $1}'
  else
    shasum -a 256 "$@" | shasum -a 256 | awk '{print $1}'
  fi
}

read_state_value() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    return 1
  fi
  tr -d '[:space:]' < "$path"
}

write_state_value() {
  local path="$1"
  local value="$2"
  mkdir -p "$DEPLOY_STATE_DIR"
  printf "%s\n" "$value" > "$path"
  chown "$APP_USER":"$APP_GROUP" "$path"
}

ensure_deploy_state_dir() {
  mkdir -p "$DEPLOY_STATE_DIR"
  chown "$APP_USER":"$APP_GROUP" "$APP_DIR/.runtime" "$DEPLOY_STATE_DIR"
}

remove_app_local_env_files() {
  rm -f \
    "$APP_DIR/apps/web/.env" \
    "$APP_DIR/apps/worker/.env" \
    "$APP_DIR/services/python-tts/.env"
}

assert_no_vault_local_env_files() {
  local directory name
  for directory in "$APP_DIR" "$APP_DIR/apps/web" "$APP_DIR/apps/worker" "$APP_DIR/services/python-tts"; do
    for name in .env .env.local .env.production .env.production.local .env.azure; do
      if [[ -e "$directory/$name" || -L "$directory/$name" ]]; then
        echo "[deploy-vm-runtime] local environment files must be reviewed and retired before Key Vault deployment" >&2
        return 1
      fi
    done
  done
}

ensure_runtime_dirs() {
  local runtime_paths=()
  local storage_root=""
  local media_root=""
  local upload_root=""
  local database_url=""
  local sqlite_path=""
  local resolved_path=""

  if [[ "$SECRET_SOURCE" == "keyvault" ]]; then
    storage_root="$(read_env_value STORAGE_ROOT)"
    media_root="$(read_env_value MEDIA_ROOT)"
    upload_root="$(read_env_value UPLOAD_ROOT)"
  else
    storage_root="$(read_env_value STORAGE_ROOT || true)"
    media_root="$(read_env_value MEDIA_ROOT || true)"
    upload_root="$(read_env_value UPLOAD_ROOT || true)"
    database_url="$(read_env_value DATABASE_URL || true)"
  fi

  [[ -n "$storage_root" ]] && runtime_paths+=("$storage_root")
  [[ -n "$media_root" ]] && runtime_paths+=("$media_root")
  [[ -n "$upload_root" ]] && runtime_paths+=("$upload_root")

  if [[ "$database_url" == file:* ]]; then
    sqlite_path="${database_url#file:}"
    sqlite_path="${sqlite_path%%\?*}"
    sqlite_path="${sqlite_path%%\#*}"
    if [[ -n "$sqlite_path" ]]; then
      runtime_paths+=("$(dirname "$sqlite_path")")
    fi
  fi

  if [[ "${#runtime_paths[@]}" -eq 0 ]]; then
    return
  fi

  for path in "${runtime_paths[@]}"; do
    if [[ "$SECRET_SOURCE" == "keyvault" ]]; then
      resolved_path="$(realpath -m -- "$path")"
      if [[ "$path" != /* ]] || [[ "$resolved_path" =~ ^/(etc|usr|var|home|opt|tmp|mnt|srv|root|bin|sbin|lib|lib64|boot|proc|sys|dev|run)?$ ]]; then
        echo "[deploy-vm-runtime] unsafe runtime directory" >&2
        return 1
      fi
    fi
  done
  for path in "${runtime_paths[@]}"; do
    mkdir -p "$path"
  done
  if [[ "$SECRET_SOURCE" == "keyvault" ]]; then
    chown "$APP_USER":"$APP_GROUP" "${runtime_paths[@]}"
  else
    chown -R "$APP_USER":"$APP_GROUP" "${runtime_paths[@]}"
  fi

  if [[ -n "$sqlite_path" ]]; then
    touch "$sqlite_path"
    chown "$APP_USER":"$APP_GROUP" "$sqlite_path"
  fi
}

run_pnpm_install_if_needed() {
  local current_lock_hash
  local previous_lock_hash=""
  local install_reason=""
  current_lock_hash="$(hash_files "$APP_DIR/pnpm-lock.yaml")"

  if [[ "$DEPLOY_FORCE_FULL" == "1" ]]; then
    install_reason="forced full deploy"
  elif [[ ! -d "$APP_DIR/node_modules" ]]; then
    install_reason="node_modules missing"
  elif ! previous_lock_hash="$(read_state_value "$LOCK_HASH_FILE")"; then
    install_reason="first tracked deploy (no lock hash marker)"
  elif [[ "$current_lock_hash" != "$previous_lock_hash" ]]; then
    install_reason="pnpm-lock.yaml changed"
  fi

  if [[ -n "$install_reason" ]]; then
    echo "[deploy-vm-runtime] running pnpm install (${install_reason})"
    run_app_cmd public /usr/bin/env CI=true corepack pnpm install --frozen-lockfile
    write_state_value "$LOCK_HASH_FILE" "$current_lock_hash"
  else
    echo "[deploy-vm-runtime] skipping pnpm install (lockfile unchanged)"
  fi
}

run_python_tts_setup() {
  run_app_cmd public /usr/bin/env APP_DIR="$APP_DIR" bash --noprofile --norc -c '
    set -euo pipefail
    cd "$APP_DIR/services/python-tts"
    if [[ ! -x .venv/bin/python3 ]]; then
      python3 -m venv .venv
    fi

    rm -rf /home/"$(whoami)"/.cache/pip || true

    # Keep installs disk-bounded on standard VM sizes (avoid CUDA wheels/cache).
    ./.venv/bin/pip install --upgrade pip
    PIP_NO_CACHE_DIR=1 PIP_EXTRA_INDEX_URL=https://download.pytorch.org/whl/cpu \
      ./.venv/bin/pip install --no-cache-dir torch==2.10.0 torchaudio==2.10.0
    PIP_NO_CACHE_DIR=1 PIP_EXTRA_INDEX_URL=https://download.pytorch.org/whl/cpu \
      ./.venv/bin/pip install --no-cache-dir -r requirements.txt -r requirements.providers.txt

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

python_tts_assets_ready() {
  local runner=(sudo -u "$APP_USER" APP_DIR="$APP_DIR" bash -lc)
  if [[ "$SECRET_SOURCE" == "keyvault" ]]; then
    runner=(run_app_cmd public /usr/bin/env APP_DIR="$APP_DIR" bash --noprofile --norc -c)
  fi
  "${runner[@]}" '
    set -euo pipefail
    cd "$APP_DIR/services/python-tts"
    [[ -x .venv/bin/python3 ]] || exit 1

    ./.venv/bin/python - <<'"'"'PY'"'"'
import importlib.util
from pathlib import Path

import nltk
import unidic

if importlib.util.find_spec("en_core_web_sm") is None:
    raise SystemExit(1)

dicdir = Path(unidic.DICDIR)
if not (dicdir / "mecabrc").exists():
    raise SystemExit(1)

required_nltk = (
    "taggers/averaged_perceptron_tagger_eng",
    "taggers/averaged_perceptron_tagger",
    "corpora/cmudict",
)

for resource_path in required_nltk:
    nltk.data.find(resource_path)
PY
  '
}

run_python_tts_setup_if_needed() {
  local current_requirements_hash
  local previous_requirements_hash=""
  local setup_reason=""

  current_requirements_hash="$(hash_files \
    "$APP_DIR/services/python-tts/requirements.txt" \
    "$APP_DIR/services/python-tts/requirements.providers.txt")"

  if [[ "$DEPLOY_FORCE_FULL" == "1" ]]; then
    setup_reason="forced full deploy"
  elif [[ ! -x "$APP_DIR/services/python-tts/.venv/bin/python3" ]]; then
    setup_reason="python-tts virtualenv missing"
  elif ! previous_requirements_hash="$(read_state_value "$PYTHON_REQ_HASH_FILE")"; then
    setup_reason="first tracked deploy (no requirements hash marker)"
  elif [[ "$current_requirements_hash" != "$previous_requirements_hash" ]]; then
    setup_reason="python-tts requirements changed"
  elif ! python_tts_assets_ready; then
    setup_reason="python-tts language assets missing"
  fi

  if [[ -n "$setup_reason" ]]; then
    echo "[deploy-vm-runtime] running python-tts setup (${setup_reason})"
    run_python_tts_setup
    write_state_value "$PYTHON_REQ_HASH_FILE" "$current_requirements_hash"
  else
    echo "[deploy-vm-runtime] skipping python-tts setup (requirements/assets unchanged)"
  fi
}

run_tts_preview_precompute() {
  if ! run_app_cmd ops /usr/bin/env RUNTIME_PROFILE=azure corepack pnpm --filter @articlepod/web run tts:precompute; then
    if [[ "$SECRET_SOURCE" == "keyvault" ]]; then
      echo "[deploy-vm-runtime] Key Vault preview precompute failed; deployment is incomplete" >&2
      return 1
    fi
    echo "[deploy-vm-runtime] warning: tts preview precompute failed; previews will be generated on demand" >&2
  fi
}

run_demo_seed_if_needed() {
  if [[ "$SECRET_SOURCE" == "keyvault" ]]; then
    echo "[deploy-vm-runtime] skipping demo seed in Key Vault mode, including full dependency rebuilds"
    return
  fi
  local run_seed=0
  local seed_reason=""

  if [[ "$DEPLOY_FORCE_FULL" == "1" ]]; then
    run_seed=1
    seed_reason="forced full deploy"
  elif [[ "$DEPLOY_DEMO_SEED_MODE" == "always" ]]; then
    run_seed=1
    seed_reason="DEPLOY_DEMO_SEED_MODE=always"
  elif [[ "$DEPLOY_DEMO_SEED_MODE" == "auto" && ! -f "$DEMO_SEED_MARKER_FILE" ]]; then
    run_seed=1
    seed_reason="first tracked deploy (no seed marker)"
  fi

  if [[ "$run_seed" == "1" ]]; then
    echo "[deploy-vm-runtime] running demo seed (${seed_reason})"
    run_app_cmd ops /usr/bin/env RUNTIME_PROFILE=azure corepack pnpm --filter @articlepod/web run seed:demo
    write_state_value "$DEMO_SEED_MARKER_FILE" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  else
    echo "[deploy-vm-runtime] skipping demo seed (mode=${DEPLOY_DEMO_SEED_MODE})"
  fi
}

if [[ "$SECRET_SOURCE" == "keyvault" ]]; then
  assert_no_vault_local_env_files
  metadata_primary_backend="$(read_env_value METADATA_PRIMARY_BACKEND)"
  run_app_cmd public /usr/bin/env bash --noprofile --norc -c '
    for tool in node corepack python3; do
      if ! command -v "$tool" >/dev/null 2>&1; then
        echo "[deploy-vm-runtime] required tool missing from non-login PATH: $tool" >&2
        exit 1
      fi
    done
  '
  for service in ops web worker python-tts; do
    run_app_cmd "$service" /usr/bin/true
  done
  if [[ "$ENABLE_OVERFLOW_WORKER_SERVICE" == "1" ]]; then
    run_app_cmd worker-overflow /usr/bin/true
  fi
  if [[ "$metadata_primary_backend" == "prisma" ]]; then
    run_app_cmd ops python3 -c '
import os, sys
if not os.environ.get("DATABASE_URL", "").startswith(("postgresql://", "postgres://")):
    print("[deploy-vm-runtime] Key Vault Azure/Prisma deployment requires a PostgreSQL DATABASE_URL", file=sys.stderr)
    sys.exit(1)
'
  fi
else
  metadata_primary_backend="$(read_env_value METADATA_PRIMARY_BACKEND || true)"
  metadata_primary_backend="${metadata_primary_backend:-prisma}"

  if ! sudo -u "$APP_USER" ENV_FILE="$ENV_FILE" bash -lc '
  set -euo pipefail
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    export "$key=$value"
  done < "$ENV_FILE"
  '; then
    echo "Failed to load env from $ENV_FILE"
    exit 1
  fi

  if [[ "$metadata_primary_backend" != "azure_table" ]] && ! sudo -u "$APP_USER" ENV_FILE="$ENV_FILE" bash -lc '
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
fi

if [[ "$(id -u)" -eq 0 ]]; then
  "$ROOT_DIR/scripts/azure/ensure-swap.sh"
fi
if [[ "$SECRET_SOURCE" == "environment" ]]; then
  remove_app_local_env_files
fi
ensure_runtime_dirs
ensure_deploy_state_dir
sudo APP_DIR="$APP_DIR" STAGING_DIR="$STAGING_DIR" ENV_FILE="$ENV_FILE" ARTICLEPOD_SECRET_SOURCE="$SECRET_SOURCE" "$ROOT_DIR/scripts/azure/cleanup-vm-disk.sh"
run_pnpm_install_if_needed
run_app_cmd public /usr/bin/env RUNTIME_PROFILE=azure corepack pnpm --filter @articlepod/web run prisma:generate
run_app_cmd public /usr/bin/env RUNTIME_PROFILE=azure corepack pnpm --filter @articlepod/worker run prisma:generate
run_app_cmd public /usr/bin/env RUNTIME_PROFILE=azure corepack pnpm --filter @articlepod/web run build
run_app_cmd public /usr/bin/env RUNTIME_PROFILE=azure corepack pnpm --filter @articlepod/worker run build
run_python_tts_setup_if_needed
if [[ "$metadata_primary_backend" != "azure_table" ]]; then
  run_app_cmd ops /usr/bin/env RUNTIME_PROFILE=azure corepack pnpm --filter @articlepod/web run db:bootstrap
fi
run_demo_seed_if_needed

sudo ENABLE_OVERFLOW_WORKER_SERVICE="$ENABLE_OVERFLOW_WORKER_SERVICE" "$ROOT_DIR/scripts/azure/install-systemd.sh"
sudo systemctl restart "$PYTHON_TTS_SERVICE"
run_tts_preview_precompute
sudo systemctl restart "$WEB_SERVICE" "$WORKER_SERVICE"
if systemctl is-enabled "$WORKER_OVERFLOW_SERVICE" >/dev/null 2>&1; then
  sudo systemctl restart "$WORKER_OVERFLOW_SERVICE"
  sudo systemctl status --no-pager "$PYTHON_TTS_SERVICE" "$WEB_SERVICE" "$WORKER_SERVICE" "$WORKER_OVERFLOW_SERVICE"
else
  sudo systemctl status --no-pager "$PYTHON_TTS_SERVICE" "$WEB_SERVICE" "$WORKER_SERVICE"
fi

echo "[deploy-vm-runtime] deployment complete"
