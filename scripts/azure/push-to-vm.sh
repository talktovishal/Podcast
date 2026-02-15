#!/usr/bin/env bash
set -euo pipefail

TARGET_HOST="${TARGET_HOST:-}"
TARGET_USER="${TARGET_USER:-azureuser}"
TARGET_PATH="${TARGET_PATH:-/home/${TARGET_USER}/listenlater}"
TARGET_PORT="${TARGET_PORT:-22}"

if [[ -z "$TARGET_HOST" ]]; then
  echo "Set TARGET_HOST (example: TARGET_HOST=1.2.3.4 scripts/azure/push-to-vm.sh)"
  exit 1
fi

REMOTE="${TARGET_USER}@${TARGET_HOST}"
ssh -p "$TARGET_PORT" "$REMOTE" "mkdir -p '$TARGET_PATH'"

rsync -az --delete \
  -e "ssh -p $TARGET_PORT" \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude '.runtime' \
  ./ "${REMOTE}:${TARGET_PATH}/"

echo "[push-to-vm] synced to ${REMOTE}:${TARGET_PATH}"
