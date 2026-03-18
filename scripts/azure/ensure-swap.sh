#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo scripts/azure/ensure-swap.sh"
  exit 1
fi

SWAPFILE_PATH="${SWAPFILE_PATH:-/swapfile}"
SWAPFILE_GB="${SWAPFILE_GB:-4}"
SWAPPINESS="${SWAPPINESS:-10}"
VFS_CACHE_PRESSURE="${VFS_CACHE_PRESSURE:-50}"
SYSCTL_CONF="${SYSCTL_CONF:-/etc/sysctl.d/60-articlepod-memory.conf}"

if ! [[ "$SWAPFILE_GB" =~ ^[0-9]+$ ]] || [[ "$SWAPFILE_GB" -lt 1 ]]; then
  echo "SWAPFILE_GB must be a positive integer, got: $SWAPFILE_GB" >&2
  exit 2
fi

target_bytes=$((SWAPFILE_GB * 1024 * 1024 * 1024))
current_swap_bytes="$(awk '/^SwapTotal:/ { print $2 * 1024 }' /proc/meminfo)"
swap_path_escaped="${SWAPFILE_PATH//\//\\/}"

create_or_resize_swapfile() {
  swapoff "$SWAPFILE_PATH" >/dev/null 2>&1 || true
  rm -f "$SWAPFILE_PATH"

  if ! fallocate -l "${SWAPFILE_GB}G" "$SWAPFILE_PATH" 2>/dev/null; then
    dd if=/dev/zero of="$SWAPFILE_PATH" bs=1M count="$((SWAPFILE_GB * 1024))" status=progress
  fi

  chmod 600 "$SWAPFILE_PATH"
  mkswap "$SWAPFILE_PATH" >/dev/null
}

if [[ ! -f "$SWAPFILE_PATH" ]] || [[ "$current_swap_bytes" -lt "$target_bytes" ]]; then
  create_or_resize_swapfile
fi

if ! swapon --show=NAME | grep -Fxq "$SWAPFILE_PATH"; then
  swapon "$SWAPFILE_PATH"
fi

if ! grep -qE "^[^#]*[[:space:]]${swap_path_escaped}[[:space:]]+none[[:space:]]+swap[[:space:]]" /etc/fstab; then
  printf "%s none swap sw 0 0\n" "$SWAPFILE_PATH" >> /etc/fstab
fi

cat > "$SYSCTL_CONF" <<EOF
vm.swappiness=${SWAPPINESS}
vm.vfs_cache_pressure=${VFS_CACHE_PRESSURE}
EOF

sysctl --system >/dev/null

echo "[ensure-swap] enabled ${SWAPFILE_GB}G swap at ${SWAPFILE_PATH} (swappiness=${SWAPPINESS}, vfs_cache_pressure=${VFS_CACHE_PRESSURE})"
