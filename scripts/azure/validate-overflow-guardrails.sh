#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/articlepod/articlepod.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

load_env() {
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
    local key="${line%%=*}"
    local value="${line#*=}"
    export "$key=$value"
  done < "$ENV_FILE"
}

as_int() {
  local raw="$1"
  if [[ "$raw" =~ ^[0-9]+$ ]]; then
    echo "$raw"
  else
    echo 0
  fi
}

load_env

ACTIVATE_DEPTH="$(as_int "${WORKER_OVERFLOW_ACTIVATE_QUEUE_DEPTH:-8}")"
DEACTIVATE_DEPTH="$(as_int "${WORKER_OVERFLOW_DEACTIVATE_QUEUE_DEPTH:-2}")"
ACTIVATE_AGE_MS="$(as_int "${WORKER_OVERFLOW_ACTIVATE_OLDEST_MS:-300000}")"
DEACTIVATE_AGE_MS="$(as_int "${WORKER_OVERFLOW_DEACTIVATE_OLDEST_MS:-120000}")"
MIN_ACTIVE_MS="$(as_int "${WORKER_OVERFLOW_MIN_ACTIVE_MS:-180000}")"

if (( DEACTIVATE_DEPTH > ACTIVATE_DEPTH )); then
  echo "Invalid guardrail: deactivate queue depth (${DEACTIVATE_DEPTH}) must be <= activate depth (${ACTIVATE_DEPTH})." >&2
  exit 1
fi

if (( DEACTIVATE_AGE_MS > ACTIVATE_AGE_MS )); then
  echo "Invalid guardrail: deactivate age (${DEACTIVATE_AGE_MS}) must be <= activate age (${ACTIVATE_AGE_MS})." >&2
  exit 1
fi

if (( MIN_ACTIVE_MS <= 0 )); then
  echo "Invalid guardrail: WORKER_OVERFLOW_MIN_ACTIVE_MS must be > 0." >&2
  exit 1
fi

if [[ "${WORKER_OVERFLOW_ENABLED:-0}" == "1" && -z "${OVERFLOW_PYTHON_TTS_URL:-}" ]]; then
  echo "Guardrail violation: overflow is enabled but OVERFLOW_PYTHON_TTS_URL is empty." >&2
  exit 1
fi

echo "[validate-overflow-guardrails] OK"
echo "  WORKER_OVERFLOW_ENABLED=${WORKER_OVERFLOW_ENABLED:-0}"
echo "  WORKER_OVERFLOW_ACTIVATE_QUEUE_DEPTH=${ACTIVATE_DEPTH}"
echo "  WORKER_OVERFLOW_DEACTIVATE_QUEUE_DEPTH=${DEACTIVATE_DEPTH}"
echo "  WORKER_OVERFLOW_ACTIVATE_OLDEST_MS=${ACTIVATE_AGE_MS}"
echo "  WORKER_OVERFLOW_DEACTIVATE_OLDEST_MS=${DEACTIVATE_AGE_MS}"
echo "  WORKER_OVERFLOW_MIN_ACTIVE_MS=${MIN_ACTIVE_MS}"
