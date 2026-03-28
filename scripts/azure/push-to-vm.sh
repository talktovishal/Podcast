#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/azure/runtime-naming.sh
source "$ROOT_DIR/scripts/azure/runtime-naming.sh"
SYNC_EXCLUDES_FILE="$ROOT_DIR/scripts/azure/sync-excludes.txt"

TARGET_HOST="${TARGET_HOST:-}"
TARGET_USER="${TARGET_USER:-azureuser}"
TARGET_PATH="${TARGET_PATH:-$RUNTIME_STAGING_DIR}"
TARGET_PORT="${TARGET_PORT:-22}"
TARGET_SSH_KEY="${TARGET_SSH_KEY:-}"
LEGACY_RSYNC_CONNECT_TIMEOUT="${PUSH_TO_VM_RSYNC_CONNECT_TIMEOUT:-}"
PUSH_TO_VM_SSH_CONNECT_TIMEOUT="${PUSH_TO_VM_SSH_CONNECT_TIMEOUT:-${LEGACY_RSYNC_CONNECT_TIMEOUT:-15}}"
PUSH_TO_VM_SSH_SERVER_ALIVE_INTERVAL="${PUSH_TO_VM_SSH_SERVER_ALIVE_INTERVAL:-15}"
PUSH_TO_VM_SSH_SERVER_ALIVE_COUNT_MAX="${PUSH_TO_VM_SSH_SERVER_ALIVE_COUNT_MAX:-4}"
PUSH_TO_VM_RSYNC_TIMEOUT="${PUSH_TO_VM_RSYNC_TIMEOUT:-300}"

if [[ -z "$TARGET_HOST" ]]; then
  echo "Set TARGET_HOST (example: TARGET_HOST=1.2.3.4 scripts/azure/push-to-vm.sh)"
  exit 1
fi

if [[ ! -f "$SYNC_EXCLUDES_FILE" ]]; then
  echo "Missing sync excludes file: $SYNC_EXCLUDES_FILE"
  exit 1
fi

REMOTE="${TARGET_USER}@${TARGET_HOST}"

SSH_ARGS=(-p "$TARGET_PORT")
if [[ -n "$TARGET_SSH_KEY" ]]; then
  SSH_ARGS+=(-i "$TARGET_SSH_KEY")
fi
SSH_ARGS+=(
  -o BatchMode=yes
  -o ConnectTimeout="$PUSH_TO_VM_SSH_CONNECT_TIMEOUT"
  -o ServerAliveInterval="$PUSH_TO_VM_SSH_SERVER_ALIVE_INTERVAL"
  -o ServerAliveCountMax="$PUSH_TO_VM_SSH_SERVER_ALIVE_COUNT_MAX"
)

ssh "${SSH_ARGS[@]}" "$REMOTE" "mkdir -p '$TARGET_PATH'"

# rsync's --contimeout only applies to daemon transport, not the SSH transport used here.
# Keep the legacy env name as an alias for SSH connect timeout so CI/local callers remain compatible.
echo "[push-to-vm] syncing with ssh connect timeout=${PUSH_TO_VM_SSH_CONNECT_TIMEOUT}s and rsync io timeout=${PUSH_TO_VM_RSYNC_TIMEOUT}s"

rsync -az --delete \
  -e "ssh ${SSH_ARGS[*]}" \
  --timeout="$PUSH_TO_VM_RSYNC_TIMEOUT" \
  --stats \
  --exclude-from="$SYNC_EXCLUDES_FILE" \
  ./ "${REMOTE}:${TARGET_PATH}/"

echo "[push-to-vm] synced to ${REMOTE}:${TARGET_PATH}"
