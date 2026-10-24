#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -lt 2 ]]; then
  echo "[runtime-exec] service name and command are required" >&2
  exit 64
fi

service="$1"
shift
case "$service" in
  web|worker|python-tts|worker-overflow|ops) ;;
  *)
    echo "[runtime-exec] unsupported service" >&2
    exit 64
    ;;
esac

case "${ARTICLEPOD_SECRET_SOURCE-environment}" in
  environment)
    exec "$@"
    ;;
  keyvault)
    root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
    manifest="${ARTICLEPOD_KEYVAULT_MANIFEST-/etc/articlepod/keyvault-secrets.json}"
    if [[ -z "$manifest" || "$manifest" != /* ]]; then
      echo "[runtime-exec] an absolute Key Vault manifest path is required" >&2
      exit 64
    fi
    exec python3 "$root_dir/scripts/azure/keyvault-exec.py" \
      --manifest "$manifest" --service "$service" -- "$@"
    ;;
  *)
    echo "[runtime-exec] invalid secret source" >&2
    exit 64
    ;;
esac
