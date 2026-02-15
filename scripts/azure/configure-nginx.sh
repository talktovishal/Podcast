#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo scripts/azure/configure-nginx.sh"
  exit 1
fi

PUBLIC_HOST="${PUBLIC_HOST:-}"
UPSTREAM_HOST="${UPSTREAM_HOST:-127.0.0.1}"
UPSTREAM_PORT="${UPSTREAM_PORT:-3000}"
SITE_NAME="${SITE_NAME:-listenlater}"

if [[ -z "$PUBLIC_HOST" ]]; then
  echo "Set PUBLIC_HOST (example: PUBLIC_HOST=listenlater-foo.eastus.cloudapp.azure.com)"
  exit 1
fi

CONF_PATH="/etc/nginx/sites-available/${SITE_NAME}.conf"
ENABLED_PATH="/etc/nginx/sites-enabled/${SITE_NAME}.conf"

cat > "$CONF_PATH" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${PUBLIC_HOST};

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
EOF

ln -sf "$CONF_PATH" "$ENABLED_PATH"
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl restart nginx

echo "[configure-nginx] configured ${PUBLIC_HOST} -> ${UPSTREAM_HOST}:${UPSTREAM_PORT}"
