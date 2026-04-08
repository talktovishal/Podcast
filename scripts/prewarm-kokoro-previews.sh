#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ "${ENABLE_PYTHON_TTS_DEV:-1}" == "0" ]]; then
  echo "[prewarm] Skipping Kokoro preview prewarm because ENABLE_PYTHON_TTS_DEV=0."
  exit 0
fi

HEALTH_URL="${PYTHON_TTS_URL:-http://127.0.0.1:8010}/health"
MAX_ATTEMPTS="${KOKORO_PREWARM_MAX_ATTEMPTS:-90}"
SLEEP_SECONDS="${KOKORO_PREWARM_SLEEP_SECONDS:-2}"
PRECOMPUTE_MAX_ATTEMPTS="${KOKORO_PREWARM_PRECOMPUTE_MAX_ATTEMPTS:-5}"

attempt=1
while [[ "${attempt}" -le "${MAX_ATTEMPTS}" ]]; do
  if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
    break
  fi
  sleep "${SLEEP_SECONDS}"
  attempt=$((attempt + 1))
done

if [[ "${attempt}" -gt "${MAX_ATTEMPTS}" ]]; then
  echo "[prewarm] python-tts was not reachable at ${HEALTH_URL}; skipping preview prewarm."
  exit 0
fi

attempt=1
while [[ "${attempt}" -le "${PRECOMPUTE_MAX_ATTEMPTS}" ]]; do
  output=""
  if output="$(npx pnpm --filter @articlepod/web run tts:precompute 2>&1)"; then
    printf '%s\n' "${output}"
    echo "[prewarm] Kokoro preview cache is ready."
    exit 0
  fi

  if [[ "${attempt}" -lt "${PRECOMPUTE_MAX_ATTEMPTS}" ]]; then
    echo "[prewarm] Kokoro preview precompute attempt ${attempt}/${PRECOMPUTE_MAX_ATTEMPTS} failed; retrying."
    sleep "${SLEEP_SECONDS}"
    attempt=$((attempt + 1))
    continue
  fi

  printf '%s\n' "${output}"
  echo "[prewarm] Kokoro preview precompute failed after ${PRECOMPUTE_MAX_ATTEMPTS} attempts; app will lazily generate previews if needed."
  exit 0
done

exit 0
