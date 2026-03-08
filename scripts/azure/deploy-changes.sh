#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=scripts/azure/runtime-naming.sh
source "$ROOT_DIR/scripts/azure/runtime-naming.sh"

print_usage() {
  cat <<EOF
Usage: ./scripts/azure/deploy-changes.sh --host <vm-ip-or-fqdn> [options]

Deployment-only helper for an already-provisioned Azure VM.
This script performs:
1) local -> VM staging sync
2) VM promote to ${RUNTIME_APP_DIR}
3) VM runtime deploy (build + service restart)

Options:
  --host <value>         VM public IP or FQDN (required unless TARGET_HOST is set)
  --user <value>         SSH user (default: azureuser)
  --path <value>         VM staging path (default: ${RUNTIME_STAGING_DIR})
  --ssh-key <value>      SSH private key path (default: ~/.ssh/articlepod_azure)
  --ssh-port <value>     SSH port (default: 22)
  --app-dir <value>      Runtime app dir on VM (default: ${RUNTIME_APP_DIR})
  --health-url <value>   Health endpoint to verify after deploy
  --health-retries <n>   Health-check retry count (default: 15)
  --health-delay <secs>  Delay between health retries (default: 2)
  --full-deploy          Force full runtime setup (dependencies + python-tts + demo seed)
  --render-env           Generate and upload runtime env file to VM before deploying
  --canonical-host <h>   Canonical public host for ingress/TLS (default: host from APP_URL)
  --host-aliases <list>  Comma-separated alias hosts redirected to canonical host
  --letsencrypt-email <e> Email used for certbot when ingress/TLS automation is enabled
  --configure-ingress    Configure nginx + TLS on VM after runtime deploy (default: enabled)
  --skip-configure-ingress
                         Skip nginx/TLS automation for this deploy
  --seed-mode <value>    Demo seed policy: auto|always|never (default: auto)
  --enable-overflow-worker
                         Enable systemd overflow worker service on VM
  --disable-overflow-worker
                         Disable systemd overflow worker service on VM (default)
  --skip-healthcheck     Skip post-deploy health validation
  -h, --help             Show this help message

Environment variable equivalents:
  TARGET_HOST, TARGET_USER, TARGET_PATH, TARGET_SSH_KEY, TARGET_PORT, APP_DIR, HEALTH_URL,
  HEALTH_RETRIES, HEALTH_RETRY_DELAY, DEPLOY_FORCE_FULL, DEPLOY_RENDER_ENV, DEPLOY_DEMO_SEED_MODE,
  CANONICAL_HOST, HOST_ALIASES, LETSENCRYPT_EMAIL, DEPLOY_CONFIGURE_INGRESS, APP_DOMAIN_ALIASES,
  ENABLE_OVERFLOW_WORKER_SERVICE

When --render-env is used, the following env vars are forwarded to render-env.sh:
  DATABASE_URL, APP_URL, STORAGE_BACKEND, AZURE_STORAGE_CONTAINER,
  AZURE_STORAGE_CONNECTION_STRING, PYTHON_TTS_URL, TTS_WORKERS,
  METADATA_PRIMARY_BACKEND, METADATA_MIRROR_*, AZURE_TABLE_*, WORKER_OVERFLOW_*, OVERFLOW_PYTHON_TTS_*,
  ADMIN_PASSWORD, DEMO_PASSWORD
EOF
}

derive_host_from_url() {
  local raw_url="$1"
  if [[ -z "$raw_url" ]]; then
    return 0
  fi
  local without_scheme="$raw_url"
  without_scheme="${without_scheme#*://}"
  without_scheme="${without_scheme%%/*}"
  without_scheme="${without_scheme%%\?*}"
  without_scheme="${without_scheme%%\#*}"
  without_scheme="${without_scheme##*@}"
  without_scheme="${without_scheme%%:*}"
  printf '%s' "$without_scheme"
}

parse_bool() {
  local raw="$1"
  case "$raw" in
    1|true|TRUE|yes|YES)
      echo "1"
      ;;
    0|false|FALSE|no|NO)
      echo "0"
      ;;
    *)
      return 1
      ;;
  esac
}

TARGET_HOST="${TARGET_HOST:-}"
TARGET_USER="${TARGET_USER:-azureuser}"
TARGET_PATH="${TARGET_PATH:-$RUNTIME_STAGING_DIR}"
TARGET_SSH_KEY="${TARGET_SSH_KEY:-$HOME/.ssh/articlepod_azure}"
TARGET_PORT="${TARGET_PORT:-22}"
APP_DIR="${APP_DIR:-$RUNTIME_APP_DIR}"
HEALTH_URL="${HEALTH_URL:-}"
HEALTH_URL_EXPLICIT=0
SKIP_HEALTHCHECK=0
HEALTH_RETRIES="${HEALTH_RETRIES:-15}"
HEALTH_RETRY_DELAY="${HEALTH_RETRY_DELAY:-2}"
DEPLOY_FORCE_FULL="${DEPLOY_FORCE_FULL:-0}"
DEPLOY_RENDER_ENV="${DEPLOY_RENDER_ENV:-0}"
DEPLOY_DEMO_SEED_MODE="${DEPLOY_DEMO_SEED_MODE:-auto}"
ENABLE_OVERFLOW_WORKER_SERVICE="${ENABLE_OVERFLOW_WORKER_SERVICE:-0}"
CANONICAL_HOST="${CANONICAL_HOST:-}"
HOST_ALIASES="${HOST_ALIASES:-${APP_DOMAIN_ALIASES:-}}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
DEPLOY_CONFIGURE_INGRESS="${DEPLOY_CONFIGURE_INGRESS:-1}"

is_ip_host() {
  local host="$1"
  # Treat raw IP literals (IPv4/IPv6) as non-TLS defaults.
  [[ "$host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && return 0
  [[ "$host" =~ : ]] && return 0
  return 1
}

check_health_with_retries() {
  local url="$1"
  local retries="$2"
  local delay_secs="$3"
  local attempt

  for ((attempt = 1; attempt <= retries; attempt++)); do
    if curl -fsS "$url"; then
      return 0
    fi
    if (( attempt < retries )); then
      echo "[deploy-changes] health check attempt ${attempt}/${retries} failed; retrying in ${delay_secs}s"
      sleep "$delay_secs"
    fi
  done

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
    --health-retries)
      HEALTH_RETRIES="${2:-}"
      shift 2
      ;;
    --health-delay)
      HEALTH_RETRY_DELAY="${2:-}"
      shift 2
      ;;
    --full-deploy)
      DEPLOY_FORCE_FULL=1
      shift
      ;;
    --render-env)
      DEPLOY_RENDER_ENV=1
      shift
      ;;
    --canonical-host)
      CANONICAL_HOST="${2:-}"
      shift 2
      ;;
    --host-aliases)
      HOST_ALIASES="${2:-}"
      shift 2
      ;;
    --letsencrypt-email)
      LETSENCRYPT_EMAIL="${2:-}"
      shift 2
      ;;
    --configure-ingress)
      DEPLOY_CONFIGURE_INGRESS=1
      shift
      ;;
    --skip-configure-ingress)
      DEPLOY_CONFIGURE_INGRESS=0
      shift
      ;;
    --seed-mode)
      DEPLOY_DEMO_SEED_MODE="${2:-}"
      shift 2
      ;;
    --skip-healthcheck)
      SKIP_HEALTHCHECK=1
      shift
      ;;
    --enable-overflow-worker)
      ENABLE_OVERFLOW_WORKER_SERVICE=1
      shift
      ;;
    --disable-overflow-worker)
      ENABLE_OVERFLOW_WORKER_SERVICE=0
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

if ! [[ "$HEALTH_RETRIES" =~ ^[0-9]+$ ]] || [[ "$HEALTH_RETRIES" -lt 1 ]]; then
  echo "Invalid HEALTH_RETRIES: $HEALTH_RETRIES (expected positive integer)"
  exit 2
fi

if ! [[ "$HEALTH_RETRY_DELAY" =~ ^[0-9]+$ ]]; then
  echo "Invalid HEALTH_RETRY_DELAY: $HEALTH_RETRY_DELAY (expected non-negative integer)"
  exit 2
fi

if ! DEPLOY_CONFIGURE_INGRESS="$(parse_bool "$DEPLOY_CONFIGURE_INGRESS")"; then
  echo "Invalid DEPLOY_CONFIGURE_INGRESS: $DEPLOY_CONFIGURE_INGRESS (expected 1|0|true|false|yes|no)"
  exit 2
fi

case "$DEPLOY_DEMO_SEED_MODE" in
  auto|always|never)
    ;;
  *)
    echo "Invalid seed mode: $DEPLOY_DEMO_SEED_MODE (expected auto|always|never)"
    exit 2
    ;;
esac

if [[ -z "$CANONICAL_HOST" ]]; then
  CANONICAL_HOST="$(derive_host_from_url "${APP_URL:-}")"
fi

if [[ "$DEPLOY_CONFIGURE_INGRESS" == "1" ]]; then
  if [[ -z "$CANONICAL_HOST" ]]; then
    echo "Missing canonical host. Set CANONICAL_HOST or APP_URL when ingress automation is enabled."
    exit 2
  fi
  if is_ip_host "$CANONICAL_HOST"; then
    echo "CANONICAL_HOST must be a DNS hostname (not an IP) for certbot: $CANONICAL_HOST"
    exit 2
  fi
  if [[ -z "$LETSENCRYPT_EMAIL" ]]; then
    echo "Missing LETSENCRYPT_EMAIL while ingress automation is enabled."
    exit 2
  fi
fi

if [[ "$DEPLOY_RENDER_ENV" == "1" && -n "${APP_URL:-}" && -n "$CANONICAL_HOST" ]]; then
  APP_URL_HOST="$(derive_host_from_url "$APP_URL")"
  if [[ -n "$APP_URL_HOST" && "$APP_URL_HOST" != "$CANONICAL_HOST" ]]; then
    echo "APP_URL host ($APP_URL_HOST) does not match CANONICAL_HOST ($CANONICAL_HOST)."
    exit 2
  fi
fi

echo "[deploy-changes] syncing code to ${TARGET_USER}@${TARGET_HOST}:${TARGET_PATH}"
TARGET_HOST="$TARGET_HOST" \
TARGET_USER="$TARGET_USER" \
TARGET_PATH="$TARGET_PATH" \
TARGET_SSH_KEY="$TARGET_SSH_KEY" \
TARGET_PORT="$TARGET_PORT" \
"$ROOT_DIR/scripts/azure/push-to-vm.sh"

# SSH args: use -i for key, -p for port, no extra verify flags (handled by ~/.ssh/config)
SSH_ARGS=()
if [[ -n "$TARGET_SSH_KEY" ]]; then
  SSH_ARGS+=(-i "$TARGET_SSH_KEY")
fi
SSH_ARGS+=(-p "$TARGET_PORT")

# SCP args mirror
SCP_ARGS=()
if [[ -n "$TARGET_SSH_KEY" ]]; then
  SCP_ARGS+=(-i "$TARGET_SSH_KEY")
fi
SCP_ARGS+=(-P "$TARGET_PORT")

REMOTE="${TARGET_USER}@${TARGET_HOST}"

# --- Render and upload runtime env file if requested ---
if [[ "$DEPLOY_RENDER_ENV" == "1" ]]; then
  echo "[deploy-changes] rendering runtime env file locally and uploading to VM"
  RENDER_ENV_TEMP="$(mktemp)"
  OUT_FILE="$RENDER_ENV_TEMP" "$ROOT_DIR/scripts/azure/render-env.sh"

  REMOTE_TEMP="/tmp/articlepod-env-upload-$$"
  scp "${SCP_ARGS[@]}" "$RENDER_ENV_TEMP" "${REMOTE}:${REMOTE_TEMP}"
  rm -f "$RENDER_ENV_TEMP"

  RUNTIME_ENV_DIR="$(dirname "$RUNTIME_ENV_FILE")"
  ssh "${SSH_ARGS[@]}" "$REMOTE" \
    "sudo mkdir -p '$RUNTIME_ENV_DIR' && sudo mv '$REMOTE_TEMP' '$RUNTIME_ENV_FILE' && sudo chown root:$RUNTIME_APP_GROUP '$RUNTIME_ENV_FILE' && sudo chmod 640 '$RUNTIME_ENV_FILE'"
  echo "[deploy-changes] uploaded env file to $RUNTIME_ENV_FILE"
fi

echo "[deploy-changes] promoting staged code + deploying runtime on VM"
echo "[deploy-changes] runtime options: full=${DEPLOY_FORCE_FULL}, seed=${DEPLOY_DEMO_SEED_MODE}, ingress=${DEPLOY_CONFIGURE_INGRESS}, overflow=${ENABLE_OVERFLOW_WORKER_SERVICE}"

CANONICAL_HOST_Q="$(printf '%q' "$CANONICAL_HOST")"
HOST_ALIASES_Q="$(printf '%q' "$HOST_ALIASES")"
LETSENCRYPT_EMAIL_Q="$(printf '%q' "$LETSENCRYPT_EMAIL")"

REMOTE_INGRESS_SCRIPT=""
if [[ "$DEPLOY_CONFIGURE_INGRESS" == "1" ]]; then
  REMOTE_INGRESS_SCRIPT=$(cat <<EOF
echo "[deploy-changes] configuring nginx ingress for canonical host '${CANONICAL_HOST}'"
sudo CANONICAL_HOST=${CANONICAL_HOST_Q} HOST_ALIASES=${HOST_ALIASES_Q} '$APP_DIR/scripts/azure/configure-nginx.sh'
echo "[deploy-changes] configuring TLS certificate + redirects for '${CANONICAL_HOST}'"
sudo CANONICAL_HOST=${CANONICAL_HOST_Q} HOST_ALIASES=${HOST_ALIASES_Q} LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL_Q} '$APP_DIR/scripts/azure/configure-tls.sh'
EOF
)
fi

REMOTE_DEPLOY_SCRIPT=$(cat <<EOF
set -euo pipefail
if ! id -u '$RUNTIME_APP_USER' >/dev/null 2>&1; then
  echo "[deploy-changes] runtime user '$RUNTIME_APP_USER' missing on VM; running bootstrap"
  sudo '$TARGET_PATH/scripts/azure/bootstrap-vm.sh'
fi
sudo STAGING_DIR='$TARGET_PATH' APP_DIR='$APP_DIR' '$TARGET_PATH/scripts/azure/promote-runtime.sh'
sudo APP_DIR='$APP_DIR' DEPLOY_FORCE_FULL='$DEPLOY_FORCE_FULL' DEPLOY_DEMO_SEED_MODE='$DEPLOY_DEMO_SEED_MODE' ENABLE_OVERFLOW_WORKER_SERVICE='$ENABLE_OVERFLOW_WORKER_SERVICE' '$APP_DIR/scripts/azure/deploy-vm-runtime.sh'
${REMOTE_INGRESS_SCRIPT}
EOF
)
ssh "${SSH_ARGS[@]}" "$REMOTE" "$REMOTE_DEPLOY_SCRIPT"

if [[ "$SKIP_HEALTHCHECK" == "1" ]]; then
  echo "[deploy-changes] done (health check skipped)"
  exit 0
fi

if [[ -z "$HEALTH_URL" ]]; then
  if [[ -n "$CANONICAL_HOST" ]] && ! is_ip_host "$CANONICAL_HOST"; then
    HEALTH_URL="https://${CANONICAL_HOST}/api/health"
  elif is_ip_host "$TARGET_HOST"; then
    HEALTH_URL="http://${TARGET_HOST}:3000/api/health"
  else
    HEALTH_URL="https://${TARGET_HOST}/api/health"
  fi
fi

echo "[deploy-changes] verifying health at ${HEALTH_URL}"
if check_health_with_retries "$HEALTH_URL" "$HEALTH_RETRIES" "$HEALTH_RETRY_DELAY"; then
  echo
  echo "[deploy-changes] done"
  exit 0
fi

if [[ "$HEALTH_URL_EXPLICIT" == "0" ]] && is_ip_host "$TARGET_HOST"; then
  FALLBACK_URL="http://${TARGET_HOST}:3000/api/health"
  echo "[deploy-changes] primary health check failed, trying ${FALLBACK_URL}"
  if check_health_with_retries "$FALLBACK_URL" "$HEALTH_RETRIES" "$HEALTH_RETRY_DELAY"; then
    echo
    echo "[deploy-changes] done (fallback health endpoint)"
    exit 0
  fi
fi

echo "[deploy-changes] deployment finished but health check failed"
exit 1
