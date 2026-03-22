#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo scripts/azure/configure-tls.sh"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/azure/runtime-naming.sh
source "$ROOT_DIR/scripts/azure/runtime-naming.sh"

PUBLIC_HOST="${PUBLIC_HOST:-}"
CANONICAL_HOST="${CANONICAL_HOST:-$PUBLIC_HOST}"
HOST_ALIASES="${HOST_ALIASES:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
VERIFY_HEALTH="${VERIFY_HEALTH:-1}"
VERIFY_HEALTH_RETRIES="${VERIFY_HEALTH_RETRIES:-15}"
VERIFY_HEALTH_DELAY="${VERIFY_HEALTH_DELAY:-2}"
UPSTREAM_HOST="${UPSTREAM_HOST:-127.0.0.1}"
UPSTREAM_PORT="${UPSTREAM_PORT:-3000}"
SITE_NAME="${SITE_NAME:-$RUNTIME_SERVICE_PREFIX}"

if [[ -z "$CANONICAL_HOST" ]]; then
  echo "Set CANONICAL_HOST (example: CANONICAL_HOST=articlepod.com)"
  exit 1
fi

if [[ -z "$LETSENCRYPT_EMAIL" ]]; then
  echo "Set LETSENCRYPT_EMAIL (example: LETSENCRYPT_EMAIL=you@example.com)"
  exit 1
fi

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

check_health_with_retries() {
  local url="$1"
  local retries="$2"
  local delay_secs="$3"
  local attempt
  local http_code
  local curl_exit

  for ((attempt = 1; attempt <= retries; attempt++)); do
    set +e
    http_code="$(curl -sS -o /dev/null -w "%{http_code}" "$url")"
    curl_exit=$?
    set -e

    if [[ "$curl_exit" -eq 0 && "$http_code" == "200" ]]; then
      return 0
    fi

    if (( attempt < retries )); then
      if [[ "$curl_exit" -eq 0 ]]; then
        echo "[configure-tls] health verification attempt ${attempt}/${retries} returned HTTP ${http_code}; retrying in ${delay_secs}s"
      else
        echo "[configure-tls] health verification attempt ${attempt}/${retries} failed (curl exit ${curl_exit}, http ${http_code}); retrying in ${delay_secs}s"
      fi
      sleep "$delay_secs"
    fi
  done

  return 1
}

if ! [[ "$VERIFY_HEALTH_RETRIES" =~ ^[0-9]+$ ]] || [[ "$VERIFY_HEALTH_RETRIES" -lt 1 ]]; then
  echo "Invalid VERIFY_HEALTH_RETRIES: $VERIFY_HEALTH_RETRIES (expected positive integer)"
  exit 2
fi

if ! [[ "$VERIFY_HEALTH_DELAY" =~ ^[0-9]+$ ]]; then
  echo "Invalid VERIFY_HEALTH_DELAY: $VERIFY_HEALTH_DELAY (expected non-negative integer)"
  exit 2
fi

declare -a tls_hosts=()
declare -A seen_hosts=()

tls_hosts+=("$CANONICAL_HOST")
seen_hosts["$CANONICAL_HOST"]=1

IFS=',' read -r -a raw_aliases <<< "$HOST_ALIASES"
for raw_alias in "${raw_aliases[@]}"; do
  alias_host="$(trim "$raw_alias")"
  if [[ -z "$alias_host" || -n "${seen_hosts[$alias_host]:-}" ]]; then
    continue
  fi
  seen_hosts["$alias_host"]=1
  tls_hosts+=("$alias_host")
done

if ! command -v certbot >/dev/null 2>&1; then
  apt-get update
  apt-get install -y --no-install-recommends certbot python3-certbot-nginx
fi

echo "[configure-tls] configuring baseline nginx HTTP ingress"
CANONICAL_HOST="$CANONICAL_HOST" \
HOST_ALIASES="$HOST_ALIASES" \
UPSTREAM_HOST="$UPSTREAM_HOST" \
UPSTREAM_PORT="$UPSTREAM_PORT" \
SITE_NAME="$SITE_NAME" \
FORCE_TLS=0 \
  "$ROOT_DIR/scripts/azure/configure-nginx.sh"

certbot_args=(
  certonly
  --nginx
  --non-interactive
  --agree-tos
  --keep-until-expiring
  --expand
  --cert-name "$CANONICAL_HOST"
  -m "$LETSENCRYPT_EMAIL"
)

for host in "${tls_hosts[@]}"; do
  certbot_args+=(-d "$host")
done

certbot "${certbot_args[@]}"

echo "[configure-tls] applying nginx TLS config with canonical redirects"
CANONICAL_HOST="$CANONICAL_HOST" \
HOST_ALIASES="$HOST_ALIASES" \
UPSTREAM_HOST="$UPSTREAM_HOST" \
UPSTREAM_PORT="$UPSTREAM_PORT" \
SITE_NAME="$SITE_NAME" \
FORCE_TLS=1 \
  "$ROOT_DIR/scripts/azure/configure-nginx.sh"

systemctl reload nginx

if [[ "$VERIFY_HEALTH" == "1" ]]; then
  if ! check_health_with_retries "https://${CANONICAL_HOST}/api/health" "$VERIFY_HEALTH_RETRIES" "$VERIFY_HEALTH_DELAY"; then
    echo "[configure-tls] health verification failed for https://${CANONICAL_HOST}/api/health"
    exit 1
  fi
fi

echo "[configure-tls] tls configured for hosts: ${tls_hosts[*]}"
