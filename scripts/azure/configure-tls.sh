#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo scripts/azure/configure-tls.sh"
  exit 1
fi

PUBLIC_HOST="${PUBLIC_HOST:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
VERIFY_HEALTH="${VERIFY_HEALTH:-1}"

if [[ -z "$PUBLIC_HOST" ]]; then
  echo "Set PUBLIC_HOST (example: PUBLIC_HOST=listenlater-foo.eastus.cloudapp.azure.com)"
  exit 1
fi

if [[ -z "$LETSENCRYPT_EMAIL" ]]; then
  echo "Set LETSENCRYPT_EMAIL (example: LETSENCRYPT_EMAIL=you@example.com)"
  exit 1
fi

if ! command -v certbot >/dev/null 2>&1; then
  apt-get update
  apt-get install -y --no-install-recommends certbot python3-certbot-nginx
fi

certbot \
  --nginx \
  --non-interactive \
  --agree-tos \
  --redirect \
  -m "$LETSENCRYPT_EMAIL" \
  -d "$PUBLIC_HOST"

systemctl reload nginx

if [[ "$VERIFY_HEALTH" == "1" ]]; then
  curl -fsS "https://${PUBLIC_HOST}/api/health" >/dev/null
fi

echo "[configure-tls] tls configured for ${PUBLIC_HOST}"
