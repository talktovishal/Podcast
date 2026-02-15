#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

print_usage() {
  cat <<'EOF'
Usage: ./scripts/azure/deploy-changes.sh --host <vm-ip-or-fqdn> [options]

Deployment-only helper for an already-provisioned Azure VM.
This script performs:
1) local -> VM staging sync
2) VM promote to /opt/listenlater
3) VM runtime deploy (build + service restart)

Options:
  --host <value>         VM public IP or FQDN (required unless TARGET_HOST is set)
  --user <value>         SSH user (default: azureuser)
  --path <value>         VM staging path (default: /home/<user>/listenlater)
  --ssh-key <value>      SSH private key path (default: ~/.ssh/articlepod_azure)
  --ssh-port <value>     SSH port (default: 22)
  --app-dir <value>      Runtime app dir on VM (default: /opt/listenlater)
  --health-url <value>   Health endpoint to verify after deploy
  --skip-healthcheck     Skip post-deploy health validation
  -h, --help             Show this help message

Environment variable equivalents:
  TARGET_HOST, TARGET_USER, TARGET_PATH, TARGET_SSH_KEY, TARGET_PORT, APP_DIR, HEALTH_URL
EOF
}

TARGET_HOST="${TARGET_HOST:-}"
TARGET_USER="${TARGET_USER:-azureuser}"
TARGET_PATH="${TARGET_PATH:-/home/${TARGET_USER}/listenlater}"
TARGET_SSH_KEY="${TARGET_SSH_KEY:-$HOME/.ssh/articlepod_azure}"
TARGET_PORT="${TARGET_PORT:-22}"
APP_DIR="${APP_DIR:-/opt/listenlater}"
HEALTH_URL="${HEALTH_URL:-}"
HEALTH_URL_EXPLICIT=0
SKIP_HEALTHCHECK=0

is_ip_host() {
  local host="$1"
  # Treat raw IP literals (IPv4/IPv6) as non-TLS defaults.
  [[ "$host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && return 0
  [[ "$host" =~ : ]] && return 0
  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      TARGET_HOST="${2:-}"
      shift 2
      ;;
    --user)
      TARGET_USER="${2:-}"
      shift 2
      ;;
    --path)
      TARGET_PATH="${2:-}"
      shift 2
      ;;
    --ssh-key)
      TARGET_SSH_KEY="${2:-}"
      shift 2
      ;;
    --ssh-port)
      TARGET_PORT="${2:-}"
      shift 2
      ;;
    --app-dir)
      APP_DIR="${2:-}"
      shift 2
      ;;
    --health-url)
      HEALTH_URL="${2:-}"
      HEALTH_URL_EXPLICIT=1
      shift 2
      ;;
    --skip-healthcheck)
      SKIP_HEALTHCHECK=1
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      print_usage
      exit 2
      ;;
  esac
done

if [[ -z "$TARGET_HOST" ]]; then
  echo "Missing target host. Set --host or TARGET_HOST."
  exit 2
fi

if [[ -n "$TARGET_SSH_KEY" && ! -f "$TARGET_SSH_KEY" ]]; then
  echo "SSH key not found: $TARGET_SSH_KEY"
  exit 1
fi

echo "[deploy-changes] syncing code to ${TARGET_USER}@${TARGET_HOST}:${TARGET_PATH}"
TARGET_HOST="$TARGET_HOST" \
TARGET_USER="$TARGET_USER" \
TARGET_PATH="$TARGET_PATH" \
TARGET_SSH_KEY="$TARGET_SSH_KEY" \
TARGET_PORT="$TARGET_PORT" \
"$ROOT_DIR/scripts/azure/push-to-vm.sh"

SSH_ARGS=(-p "$TARGET_PORT" -o StrictHostKeyChecking=accept-new)
if [[ -n "$TARGET_SSH_KEY" ]]; then
  SSH_ARGS+=(-i "$TARGET_SSH_KEY")
fi

REMOTE="${TARGET_USER}@${TARGET_HOST}"

echo "[deploy-changes] promoting staged code + deploying runtime on VM"
ssh "${SSH_ARGS[@]}" "$REMOTE" "sudo STAGING_DIR='$TARGET_PATH' '$TARGET_PATH/scripts/azure/promote-runtime.sh' && sudo APP_DIR='$APP_DIR' '$APP_DIR/scripts/azure/deploy-vm-runtime.sh'"

if [[ "$SKIP_HEALTHCHECK" == "1" ]]; then
  echo "[deploy-changes] done (health check skipped)"
  exit 0
fi

if [[ -z "$HEALTH_URL" ]]; then
  if is_ip_host "$TARGET_HOST"; then
    HEALTH_URL="http://${TARGET_HOST}:3000/api/health"
  else
    HEALTH_URL="https://${TARGET_HOST}/api/health"
  fi
fi

echo "[deploy-changes] verifying health at ${HEALTH_URL}"
if curl -fsS "$HEALTH_URL"; then
  echo
  echo "[deploy-changes] done"
  exit 0
fi

if [[ "$HEALTH_URL_EXPLICIT" == "0" ]]; then
  FALLBACK_URL="http://${TARGET_HOST}:3000/api/health"
  echo "[deploy-changes] primary health check failed, trying ${FALLBACK_URL}"
  if curl -fsS "$FALLBACK_URL"; then
    echo
    echo "[deploy-changes] done (fallback health endpoint)"
    exit 0
  fi
fi

echo "[deploy-changes] deployment finished but health check failed"
exit 1
