#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[parity-down] stopping parity stack..."
docker compose -f docker-compose.parity.yml down

echo "[parity-down] done."
