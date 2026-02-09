#!/usr/bin/env bash
set -euo pipefail

TARGET_HOST="${TARGET_HOST:-}"
TARGET_USER="${TARGET_USER:-azureuser}"
TARGET_PATH="${TARGET_PATH:-/opt/listenlater}"

if [[ -z "$TARGET_HOST" ]]; then
  echo "Set TARGET_HOST (example: TARGET_HOST=1.2.3.4 scripts/azure/push-to-vm.sh)"
  exit 1
fi

rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'dist' \
  ./ "${TARGET_USER}@${TARGET_HOST}:${TARGET_PATH}/"

echo "[push-to-vm] synced to ${TARGET_USER}@${TARGET_HOST}:${TARGET_PATH}"
