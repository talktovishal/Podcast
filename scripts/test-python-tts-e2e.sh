#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

./scripts/bootstrap-python-tts.sh

VENV_PYTHON="${ROOT_DIR}/services/python-tts/.venv/bin/python"
"${VENV_PYTHON}" -m pip install -r "${ROOT_DIR}/services/python-tts/requirements.test.txt"

cd "${ROOT_DIR}/services/python-tts"
"${VENV_PYTHON}" -m pytest -q tests/test_e2e.py
