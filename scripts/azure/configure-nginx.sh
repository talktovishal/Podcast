#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo scripts/azure/configure-nginx.sh"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/azure/runtime-naming.sh
source "$ROOT_DIR/scripts/azure/runtime-naming.sh"

PUBLIC_HOST="${PUBLIC_HOST:-}"
CANONICAL_HOST="${CANONICAL_HOST:-$PUBLIC_HOST}"
HOST_ALIASES="${HOST_ALIASES:-}"
UPSTREAM_HOST="${UPSTREAM_HOST:-127.0.0.1}"
UPSTREAM_PORT="${UPSTREAM_PORT:-3000}"
SITE_NAME="${SITE_NAME:-$RUNTIME_SERVICE_PREFIX}"
FORCE_TLS="${FORCE_TLS:-auto}"

if [[ -z "$CANONICAL_HOST" ]]; then
  echo "Set CANONICAL_HOST (example: CANONICAL_HOST=articlepod.com)"
  exit 1
fi

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

declare -a alias_hosts=()
declare -A seen_hosts=()

IFS=',' read -r -a raw_aliases <<< "$HOST_ALIASES"
for raw_alias in "${raw_aliases[@]}"; do
  alias_host="$(trim "$raw_alias")"
  if [[ -z "$alias_host" || "$alias_host" == "$CANONICAL_HOST" ]]; then
    continue
  fi
  if [[ -n "${seen_hosts[$alias_host]:-}" ]]; then
    continue
  fi
  seen_hosts["$alias_host"]=1
  alias_hosts+=("$alias_host")
done

alias_server_names=""
if [[ "${#alias_hosts[@]}" -gt 0 ]]; then
  alias_server_names="${alias_hosts[*]}"
fi

TLS_CERT_DIR="/etc/letsencrypt/live/${CANONICAL_HOST}"
TLS_CERT_PATH="${TLS_CERT_PATH:-${TLS_CERT_DIR}/fullchain.pem}"
TLS_KEY_PATH="${TLS_KEY_PATH:-${TLS_CERT_DIR}/privkey.pem}"
tls_enabled=0

case "$FORCE_TLS" in
  1|true|TRUE|yes|YES)
    tls_enabled=1
    ;;
  0|false|FALSE|no|NO)
    tls_enabled=0
    ;;
  auto|"")
    if [[ -f "$TLS_CERT_PATH" && -f "$TLS_KEY_PATH" ]]; then
      tls_enabled=1
    fi
    ;;
  *)
    echo "Invalid FORCE_TLS value '$FORCE_TLS' (expected auto|1|0)"
    exit 2
    ;;
esac

if [[ "$tls_enabled" == "1" ]]; then
  if [[ ! -f "$TLS_CERT_PATH" || ! -f "$TLS_KEY_PATH" ]]; then
    echo "TLS requested but cert files are missing:"
    echo "  cert: $TLS_CERT_PATH"
    echo "  key:  $TLS_KEY_PATH"
    exit 1
  fi
fi

canonical_scheme="http"
if [[ "$tls_enabled" == "1" ]]; then
  canonical_scheme="https"
fi

CONF_PATH="/etc/nginx/sites-available/${SITE_NAME}.conf"
ENABLED_PATH="/etc/nginx/sites-enabled/${SITE_NAME}.conf"

cat > "$CONF_PATH" <<NGINX
# managed by scripts/azure/configure-nginx.sh
NGINX

if [[ "$tls_enabled" == "1" ]]; then
  cat >> "$CONF_PATH" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${CANONICAL_HOST};
    return 301 https://${CANONICAL_HOST}\$request_uri;
}

NGINX
else
  cat >> "$CONF_PATH" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${CANONICAL_HOST};

    client_max_body_size 100m;

    location / {
        proxy_pass http://${UPSTREAM_HOST}:${UPSTREAM_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

NGINX
fi

if [[ -n "$alias_server_names" ]]; then
  cat >> "$CONF_PATH" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${alias_server_names};
    return 301 ${canonical_scheme}://${CANONICAL_HOST}\$request_uri;
}

NGINX
fi

if [[ "$tls_enabled" == "1" ]]; then
  cat >> "$CONF_PATH" <<NGINX
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${CANONICAL_HOST};

    ssl_certificate ${TLS_CERT_PATH};
    ssl_certificate_key ${TLS_KEY_PATH};

    client_max_body_size 100m;

    location / {
        proxy_pass http://${UPSTREAM_HOST}:${UPSTREAM_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

NGINX

  if [[ -n "$alias_server_names" ]]; then
    cat >> "$CONF_PATH" <<NGINX
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${alias_server_names};

    ssl_certificate ${TLS_CERT_PATH};
    ssl_certificate_key ${TLS_KEY_PATH};

    return 301 https://${CANONICAL_HOST}\$request_uri;
}

NGINX
  fi
fi

ln -sf "$CONF_PATH" "$ENABLED_PATH"
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl restart nginx

echo "[configure-nginx] configured canonical=${CANONICAL_HOST} aliases='${alias_server_names}' tls=${tls_enabled} upstream=${UPSTREAM_HOST}:${UPSTREAM_PORT}"
