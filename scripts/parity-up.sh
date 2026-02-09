#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[parity-up] validating parity environment..."
node ./scripts/check-env.mjs --profile parity

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
