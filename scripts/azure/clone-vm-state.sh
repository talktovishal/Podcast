#!/usr/bin/env bash
set -euo pipefail

SOURCE_HOST="${SOURCE_HOST:-135.119.62.64}"
TARGET_HOST="${TARGET_HOST:-}"
SOURCE_USER="${SOURCE_USER:-azureuser}"
TARGET_USER="${TARGET_USER:-azureuser}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/articlepod_azure}"
SSH_PORT="${SSH_PORT:-22}"

usage() {
  cat <<EOF
Usage: scripts/azure/clone-vm-state.sh --target-host <ip-or-fqdn> [options]

Copies the live runtime env, local auxiliary state, and Let's Encrypt cert material
from the current production VM to a new VM before first start.

Options:
  --source-host <host>   Source VM host (default: ${SOURCE_HOST})
  --target-host <host>   Target VM host (required)
  --source-user <user>   Source SSH user (default: ${SOURCE_USER})
  --target-user <user>   Target SSH user (default: ${TARGET_USER})
  --ssh-key <path>       SSH private key (default: ${SSH_KEY})
  --ssh-port <port>      SSH port (default: ${SSH_PORT})
  -h, --help             Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-host)
      SOURCE_HOST="${2:-}"
      shift 2
      ;;
    --target-host)
      TARGET_HOST="${2:-}"
      shift 2
      ;;
    --source-user)
      SOURCE_USER="${2:-}"
      shift 2
      ;;
    --target-user)
      TARGET_USER="${2:-}"
      shift 2
      ;;
    --ssh-key)
      SSH_KEY="${2:-}"
      shift 2
      ;;
    --ssh-port)
      SSH_PORT="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$TARGET_HOST" ]]; then
  echo "Missing --target-host." >&2
  exit 1
fi

SSH_ARGS=(-p "$SSH_PORT" -i "$SSH_KEY" -o StrictHostKeyChecking=no -o BatchMode=yes)

source_remote="${SOURCE_USER}@${SOURCE_HOST}"
target_remote="${TARGET_USER}@${TARGET_HOST}"

ssh "${SSH_ARGS[@]}" "$target_remote" \
  "sudo mkdir -p /etc/articlepod /var/lib/articlepod /etc/letsencrypt/live /etc/letsencrypt/archive /etc/letsencrypt/renewal"

ssh "${SSH_ARGS[@]}" "$source_remote" \
  "sudo tar czf - -C / \
    etc/articlepod/articlepod.env \
    var/lib/articlepod \
    etc/letsencrypt/live/articlepod.com \
    etc/letsencrypt/archive/articlepod.com \
    etc/letsencrypt/renewal/articlepod.com.conf" |
  ssh "${SSH_ARGS[@]}" "$target_remote" "sudo tar xzf - -C /"

echo "[clone-vm-state] cloned runtime env, local state, and certificate material to ${TARGET_HOST}"
