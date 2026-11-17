#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo scripts/azure/install-systemd.sh"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/azure/runtime-naming.sh
source "$ROOT_DIR/scripts/azure/runtime-naming.sh"

if [[ ! -f "$ROOT_DIR/scripts/azure/runtime-exec.sh" || ! -f "$ROOT_DIR/scripts/azure/keyvault-exec.py" ]]; then
  echo "[install-systemd] required runtime secret-routing files are missing" >&2
  exit 1
fi
SECRET_SOURCE="${ARTICLEPOD_SECRET_SOURCE-environment}"
case "$SECRET_SOURCE" in
  environment) ;;
  keyvault)
    python3 "$ROOT_DIR/scripts/azure/keyvault-exec.py" --env-file "$RUNTIME_ENV_FILE" --public-only -- /usr/bin/true
    ;;
  *)
    echo "[install-systemd] invalid secret source" >&2
    exit 2
    ;;
esac

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

read_env_value() {
  local key="$1"
  local line
  if [[ ! -f "$RUNTIME_ENV_FILE" ]]; then
    return 1
  fi
  line="$(grep -E "^${key}=" "$RUNTIME_ENV_FILE" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi
  echo "${line#*=}"
}

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
if [[ "$SECRET_SOURCE" == "environment" ]]; then
  install -m 0644 "$ROOT_DIR/infra/systemd/${MAINTENANCE_SERVICE}" "/etc/systemd/system/${MAINTENANCE_SERVICE}"
  install -m 0644 "$ROOT_DIR/infra/systemd/${MAINTENANCE_TIMER}" "/etc/systemd/system/${MAINTENANCE_TIMER}"
fi

if [[ "$SECRET_SOURCE" == "keyvault" ]]; then
  PYTHON_TTS_SYSTEMD_MEMORY_HIGH="$(read_env_value PYTHON_TTS_SYSTEMD_MEMORY_HIGH || true)"
  PYTHON_TTS_SYSTEMD_MEMORY_MAX="$(read_env_value PYTHON_TTS_SYSTEMD_MEMORY_MAX || true)"
  PYTHON_TTS_SYSTEMD_RESTART_SEC="$(read_env_value PYTHON_TTS_SYSTEMD_RESTART_SEC || true)"
else
  PYTHON_TTS_SYSTEMD_MEMORY_HIGH="${PYTHON_TTS_SYSTEMD_MEMORY_HIGH:-$(read_env_value PYTHON_TTS_SYSTEMD_MEMORY_HIGH || true)}"
  PYTHON_TTS_SYSTEMD_MEMORY_MAX="${PYTHON_TTS_SYSTEMD_MEMORY_MAX:-$(read_env_value PYTHON_TTS_SYSTEMD_MEMORY_MAX || true)}"
  PYTHON_TTS_SYSTEMD_RESTART_SEC="${PYTHON_TTS_SYSTEMD_RESTART_SEC:-$(read_env_value PYTHON_TTS_SYSTEMD_RESTART_SEC || true)}"
fi
PYTHON_TTS_DROPIN_DIR="/etc/systemd/system/${PYTHON_TTS_SERVICE}.d"
mkdir -p "$PYTHON_TTS_DROPIN_DIR"
cat > "${PYTHON_TTS_DROPIN_DIR}/10-memory-guardrails.conf" <<EOF
[Service]
MemoryAccounting=yes
MemoryHigh=${PYTHON_TTS_SYSTEMD_MEMORY_HIGH:-5G}
MemoryMax=${PYTHON_TTS_SYSTEMD_MEMORY_MAX:-6G}
OOMPolicy=stop
RestartSec=${PYTHON_TTS_SYSTEMD_RESTART_SEC:-3}
EOF

if [[ "$SECRET_SOURCE" == "environment" ]]; then
  cleanup_legacy_alias_conflicts
  "$ROOT_DIR/scripts/azure/configure-journald.sh"
fi
systemctl daemon-reload
systemctl enable "$PYTHON_TTS_SERVICE" "$WEB_SERVICE" "$WORKER_SERVICE"
if [[ "$SECRET_SOURCE" == "environment" ]]; then
  systemctl enable --now "$MAINTENANCE_TIMER"
fi
if [[ "$ENABLE_OVERFLOW_WORKER_SERVICE" == "1" ]]; then
  systemctl enable "$WORKER_OVERFLOW_SERVICE"
else
  if [[ "$SECRET_SOURCE" == "keyvault" ]]; then
    systemctl disable "$WORKER_OVERFLOW_SERVICE"
  else
    systemctl disable "$WORKER_OVERFLOW_SERVICE" >/dev/null 2>&1 || true
  fi
fi

echo "[install-systemd] runtime services installed (overflow enabled=${ENABLE_OVERFLOW_WORKER_SERVICE})"
