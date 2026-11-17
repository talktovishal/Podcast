#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo scripts/azure/configure-journald.sh"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/azure/runtime-naming.sh
source "$ROOT_DIR/scripts/azure/runtime-naming.sh"

ENV_FILE="${ENV_FILE:-$RUNTIME_ENV_FILE}"
JOURNAL_CONF_DIR="/etc/systemd/journald.conf.d"
JOURNAL_CONF_FILE="$JOURNAL_CONF_DIR/60-${RUNTIME_SERVICE_PREFIX}-disk-guard.conf"

read_env_file_value() {
  local key="$1"
  local line=""

  [[ -f "$ENV_FILE" ]] || return 1
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 1
  printf '%s' "${line#*=}"
}

resolve_setting() {
  local key="$1"
  local fallback="$2"
  local value="${!key:-}"

  if [[ -z "$value" ]]; then
    value="$(read_env_file_value "$key" || true)"
  fi

  if [[ -z "$value" ]]; then
    value="$fallback"
  fi

  printf '%s' "$value"
}

VM_JOURNAL_MAX_USE="$(resolve_setting VM_JOURNAL_MAX_USE 200M)"
VM_JOURNAL_KEEP_FREE="$(resolve_setting VM_JOURNAL_KEEP_FREE 1G)"
VM_JOURNAL_RETENTION="$(resolve_setting VM_JOURNAL_RETENTION 7day)"

mkdir -p "$JOURNAL_CONF_DIR"

TMP_CONF="$(mktemp)"
cat > "$TMP_CONF" <<EOF
[Journal]
SystemMaxUse=${VM_JOURNAL_MAX_USE}
SystemKeepFree=${VM_JOURNAL_KEEP_FREE}
MaxRetentionSec=${VM_JOURNAL_RETENTION}
EOF

if [[ -f "$JOURNAL_CONF_FILE" ]] && cmp -s "$TMP_CONF" "$JOURNAL_CONF_FILE"; then
  rm -f "$TMP_CONF"
  echo "[configure-journald] journald already configured at $JOURNAL_CONF_FILE"
  exit 0
fi

install -m 0644 "$TMP_CONF" "$JOURNAL_CONF_FILE"
rm -f "$TMP_CONF"
systemctl restart systemd-journald

echo "[configure-journald] configured journald (max_use=${VM_JOURNAL_MAX_USE}, keep_free=${VM_JOURNAL_KEEP_FREE}, retention=${VM_JOURNAL_RETENTION})"
