#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="${ROOT_DIR}/services/python-tts"
VENV_DIR="${SERVICE_DIR}/.venv"
PYTHON_BIN="${VENV_DIR}/bin/python"
UVICORN_BIN="${VENV_DIR}/bin/uvicorn"
REQUIREMENTS_FILE="${SERVICE_DIR}/requirements.txt"
PROVIDERS_FILE="${SERVICE_DIR}/requirements.providers.txt"
TARGET_PYTHON="${PYTHON_TTS_PYTHON_VERSION:-3.11}"
STAMP_FILE="${VENV_DIR}/.listenlater-python-tts-ready"
STAMP_VERSION="2"

if [[ "${ENABLE_PYTHON_TTS_DEV:-1}" == "0" ]]; then
  echo "[python-tts] Skipping bootstrap because ENABLE_PYTHON_TTS_DEV=0."
  exit 0
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "[python-tts] Error: 'uv' is required to provision python-tts. Install uv and retry."
  exit 1
fi

create_venv() {
  echo "[python-tts] Creating virtualenv with Python ${TARGET_PYTHON}..."
  if [[ -d "${VENV_DIR}" ]]; then
    rm -r "${VENV_DIR}"
  fi
  uv venv --python "${TARGET_PYTHON}" "${VENV_DIR}"
}

if [[ ! -x "${PYTHON_BIN}" ]]; then
  create_venv
fi

python_minor="$("${PYTHON_BIN}" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
if [[ "${python_minor}" != "3.11" ]]; then
  echo "[python-tts] Existing venv is Python ${python_minor}; recreating with Python 3.11 for provider compatibility."
  create_venv
fi

requirements_hash="$(shasum "${REQUIREMENTS_FILE}" "${PROVIDERS_FILE}" | shasum | awk '{print $1}')"
expected_stamp="${STAMP_VERSION}:${requirements_hash}"
current_stamp="$(cat "${STAMP_FILE}" 2>/dev/null || true)"

if [[ ! -x "${UVICORN_BIN}" ]] || [[ "${current_stamp}" != "${expected_stamp}" ]]; then
  echo "[python-tts] Installing Python dependencies..."
  "${PYTHON_BIN}" -m ensurepip --upgrade >/dev/null 2>&1 || true
  uv pip install --python "${PYTHON_BIN}" -r "${REQUIREMENTS_FILE}"
  uv pip install --python "${PYTHON_BIN}" -r "${PROVIDERS_FILE}"
fi

echo "[python-tts] Ensuring runtime language assets..."
"${PYTHON_BIN}" - <<'PY'
from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

import nltk


def run_module(module: str, *args: str) -> None:
    subprocess.run([sys.executable, "-m", module, *args], check=True)


if importlib.util.find_spec("en_core_web_sm") is None:
    run_module("spacy", "download", "en_core_web_sm")

import unidic  # noqa: E402

dicdir = Path(unidic.DICDIR)
if not (dicdir / "mecabrc").exists():
    run_module("unidic", "download")

required_nltk = {
    "averaged_perceptron_tagger_eng": "taggers/averaged_perceptron_tagger_eng",
    "averaged_perceptron_tagger": "taggers/averaged_perceptron_tagger",
    "cmudict": "corpora/cmudict",
}

for package_name, resource_path in required_nltk.items():
    try:
        nltk.data.find(resource_path)
    except LookupError:
        nltk.download(package_name, quiet=False)
PY

echo "${expected_stamp}" > "${STAMP_FILE}"
echo "[python-tts] Bootstrap complete."
