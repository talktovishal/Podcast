#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo scripts/azure/cleanup-vm-disk.sh"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/azure/runtime-naming.sh
source "$ROOT_DIR/scripts/azure/runtime-naming.sh"

APP_DIR="${APP_DIR:-$RUNTIME_APP_DIR}"
STAGING_DIR="${STAGING_DIR:-$RUNTIME_STAGING_DIR}"
ENV_FILE="${ENV_FILE:-$RUNTIME_ENV_FILE}"

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

remove_if_present() {
  local path="$1"

  if [[ -e "$path" ]]; then
    rm -rf "$path"
    echo "[cleanup-vm-disk] removed $path"
  fi
}

get_disk_probe_path() {
  if [[ -e "$APP_DIR" ]]; then
    printf '%s' "$APP_DIR"
  elif [[ -e "$STAGING_DIR" ]]; then
    printf '%s' "$STAGING_DIR"
  else
    printf '/'
  fi
}

get_free_mb() {
  local probe_path
  probe_path="$(get_disk_probe_path)"
  df -Pm "$probe_path" | awk 'NR==2 {print $4}'
}

vacuum_journal() {
  if ! command -v journalctl >/dev/null 2>&1; then
    return
  fi

  journalctl --vacuum-time="$VM_JOURNAL_RETENTION" --vacuum-size="$VM_JOURNAL_MAX_USE" >/dev/null 2>&1 || true
}

clean_staging_artifacts() {
  remove_if_present "$STAGING_DIR/exports"
  remove_if_present "$STAGING_DIR/.worktrees"
  remove_if_present "$STAGING_DIR/.runtime"
  remove_if_present "$STAGING_DIR/.turbo"
  remove_if_present "$STAGING_DIR/coverage"
  remove_if_present "$STAGING_DIR/playwright-report"
  remove_if_present "$STAGING_DIR/test-results"
  remove_if_present "$STAGING_DIR/node_modules"
  remove_if_present "$STAGING_DIR/.venv"
  remove_if_present "$STAGING_DIR/services/python-tts/.venv"
  remove_if_present "$STAGING_DIR/apps/web/.next"
}

clean_runtime_non_artifacts() {
  remove_if_present "$APP_DIR/exports"
  remove_if_present "$APP_DIR/.worktrees"
  remove_if_present "$APP_DIR/.turbo"
  remove_if_present "$APP_DIR/coverage"
  remove_if_present "$APP_DIR/playwright-report"
  remove_if_present "$APP_DIR/test-results"
}

clean_temp_uploads() {
  find /tmp -maxdepth 1 -name 'articlepod-env-upload-*' -mtime +1 -print -exec rm -rf {} + 2>/dev/null || true
}

clean_app_log_archives() {
  if [[ ! -d "$LOG_ROOT" ]]; then
    return
  fi

  find "$LOG_ROOT" -type f -name '*.jsonl.*' -mtime +"$LOG_RETENTION_DAYS" -print -delete 2>/dev/null || true
  find "$LOG_ROOT" -type d -empty -delete 2>/dev/null || true
}

pressure_cleanup() {
  echo "[cleanup-vm-disk] free space below ${VM_CLEANUP_MIN_FREE_MB} MB; running pressure cleanup"

  apt-get clean >/dev/null 2>&1 || true

  rm -rf \
    /home/azureuser/.cache/pip \
    /home/articlepod/.cache/pip \
    /root/.cache/pip \
    /home/azureuser/.npm/_cacache \
    /home/articlepod/.npm/_cacache \
    /root/.npm/_cacache \
    /home/azureuser/.local/share/pnpm/store \
    /home/articlepod/.local/share/pnpm/store \
    /root/.local/share/pnpm/store \
    /home/azureuser/.pnpm-store \
    /home/articlepod/.pnpm-store \
    /root/.pnpm-store \
    "$APP_DIR/apps/web/.next/cache" \
    || true
}

print_usage_summary() {
  echo "[cleanup-vm-disk] top disk usage summary"
  du -x -m -d 1 /opt /home /var 2>/dev/null | sort -n | tail -n 15 || true
  if command -v journalctl >/dev/null 2>&1; then
    journalctl --disk-usage || true
  fi
}

LOG_ROOT="$(resolve_setting LOG_ROOT "$APP_DIR/.runtime/logs")"
if [[ "$LOG_ROOT" != /* ]]; then
  LOG_ROOT="$APP_DIR/$LOG_ROOT"
fi
LOG_RETENTION_DAYS="$(resolve_setting LOG_RETENTION_DAYS 7)"
VM_JOURNAL_MAX_USE="$(resolve_setting VM_JOURNAL_MAX_USE 200M)"
VM_JOURNAL_RETENTION="$(resolve_setting VM_JOURNAL_RETENTION 7day)"
VM_CLEANUP_MIN_FREE_MB="$(resolve_setting VM_CLEANUP_MIN_FREE_MB 3072)"

FREE_BEFORE="$(get_free_mb)"
echo "[cleanup-vm-disk] free space before cleanup: ${FREE_BEFORE} MB"

vacuum_journal
clean_staging_artifacts
clean_runtime_non_artifacts
clean_temp_uploads
clean_app_log_archives

FREE_AFTER_BASIC="$(get_free_mb)"
if [[ "$FREE_AFTER_BASIC" -lt "$VM_CLEANUP_MIN_FREE_MB" ]]; then
  pressure_cleanup
fi

FREE_AFTER="$(get_free_mb)"
echo "[cleanup-vm-disk] free space after cleanup: ${FREE_AFTER} MB"

if [[ "$FREE_AFTER" -lt "$VM_CLEANUP_MIN_FREE_MB" ]]; then
  print_usage_summary
fi
