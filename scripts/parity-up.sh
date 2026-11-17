#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

dump_compose_diagnostics() {
  local exit_code="$1"
  if [[ "$exit_code" -eq 0 ]]; then
    return
  fi

  echo "[parity-up] startup failed, collecting docker compose diagnostics..."
  docker compose -f docker-compose.parity.yml ps || true
  docker compose -f docker-compose.parity.yml logs --no-color --tail=200 web worker azurite postgres python-tts || true
}

trap 'dump_compose_diagnostics "$?"' EXIT

PARITY_ENV_FILE=".env.parity"
if [[ ! -f "$PARITY_ENV_FILE" && -f ".env.parity.example" ]]; then
  PARITY_ENV_FILE=".env.parity.example"
fi

if [[ -f "$PARITY_ENV_FILE" ]]; then
  echo "[parity-up] loading environment from ${PARITY_ENV_FILE}..."
  set -a
  # shellcheck disable=SC1090
  source "$PARITY_ENV_FILE"
  set +a
fi

echo "[parity-up] validating parity environment..."
node ./scripts/check-env.mjs --profile parity

if [[ "${PARITY_PRESERVE_DATA:-0}" != "1" ]]; then
  echo "[parity-up] resetting parity volumes (set PARITY_PRESERVE_DATA=1 to keep existing data)..."
  docker compose -f docker-compose.parity.yml down -v --remove-orphans >/dev/null 2>&1 || true
fi

echo "[parity-up] starting docker compose parity stack..."
docker compose -f docker-compose.parity.yml up -d --build

echo "[parity-up] waiting for python-tts health..."
for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:8010/health" >/dev/null 2>&1; then
    echo "[parity-up] python-tts is healthy."
    break
  fi
  sleep 2
done

echo "[parity-up] waiting for web readiness..."
for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:3000/login" >/dev/null 2>&1; then
    echo "[parity-up] web is reachable."
    break
  fi
  sleep 2
done

echo "[parity-up] services:"
docker compose -f docker-compose.parity.yml ps
