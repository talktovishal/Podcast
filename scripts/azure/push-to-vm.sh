#!/usr/bin/env bash
set -euo pipefail

TARGET_HOST="${TARGET_HOST:-}"
TARGET_USER="${TARGET_USER:-azureuser}"
TARGET_PATH="${TARGET_PATH:-/home/${TARGET_USER}/listenlater}"
TARGET_PORT="${TARGET_PORT:-22}"
TARGET_SSH_KEY="${TARGET_SSH_KEY:-}"

if [[ -z "$TARGET_HOST" ]]; then
  echo "Set TARGET_HOST (example: TARGET_HOST=1.2.3.4 scripts/azure/push-to-vm.sh)"
  exit 1
fi

REMOTE="${TARGET_USER}@${TARGET_HOST}"

SSH_ARGS=(-p "$TARGET_PORT")
if [[ -n "$TARGET_SSH_KEY" ]]; then
  SSH_ARGS+=(-i "$TARGET_SSH_KEY")
fi

ssh "${SSH_ARGS[@]}" "$REMOTE" "mkdir -p '$TARGET_PATH'"

rsync -az --delete \
  -e "ssh ${SSH_ARGS[*]}" \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'apps/web/.env' \
  --exclude 'apps/web/.env.*' \
  --exclude 'apps/worker/.env' \
  --exclude 'apps/worker/.env.*' \
  --exclude 'services/python-tts/.env' \
  --exclude 'services/python-tts/.env.*' \
  --exclude 'node_modules' \
  --exclude '.venv' \
  --exclude 'services/python-tts/.venv' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude '.runtime' \
  ./ "${REMOTE}:${TARGET_PATH}/"

echo "[push-to-vm] synced to ${REMOTE}:${TARGET_PATH}"
