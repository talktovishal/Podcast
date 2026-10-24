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

public_file=/etc/articlepod/articlepod.env
public_only=0
shell_command=0
if [[ "${1-}" == "--env-file" ]]; then
  public_file="${2-}"
  if [[ "$#" -lt 3 || "$public_file" != /* ]]; then
    echo "[runtime-exec] an absolute public environment path and command are required" >&2
    exit 64
  fi
  shift 2
fi
if [[ "${1-}" == "--public-only" ]]; then
  public_only=1
  shift
fi
if [[ "${1-}" == "--shell" ]]; then
  if [[ "$#" -ne 2 || -z "$2" ]]; then
    echo "[runtime-exec] --shell requires one command string" >&2
    exit 64
  fi
  shell_command=1
  shift
fi
if [[ "$#" -eq 0 ]]; then
  echo "[runtime-exec] a command is required" >&2
  exit 64
fi

case "${ARTICLEPOD_SECRET_SOURCE-environment}" in
  environment)
    if [[ "$shell_command" == "1" ]]; then
      exec /usr/bin/env bash -lc "$1"
    fi
    exec "$@"
    ;;
  keyvault)
    root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
    launcher_args=(--env-file "$public_file")
    if [[ "$public_only" == "1" ]]; then
      launcher_args+=(--public-only)
    else
      launcher_args+=(--service "$service")
    fi
    if [[ "$shell_command" == "1" ]]; then
      set -- /usr/bin/env bash --noprofile --norc -c "$1"
    fi
    if [[ "$service" == "worker-overflow" && "$public_only" == "0" ]]; then
      set -- /usr/bin/env WORKER_ROLE=overflow WORKER_OVERFLOW_ENABLED=1 "$@"
    fi
    exec python3 "$root_dir/scripts/azure/keyvault-exec.py" \
      "${launcher_args[@]}" -- "$@"
    ;;
  *)
    echo "[runtime-exec] invalid secret source" >&2
    exit 64
    ;;
esac
