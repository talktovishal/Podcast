FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    XDG_DATA_HOME=/usr/local/share \
    NLTK_DATA=/usr/local/share/nltk_data

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg wget git && rm -rf /var/lib/apt/lists/*

COPY services/python-tts/requirements.txt ./requirements.txt
COPY services/python-tts/requirements.providers.txt ./requirements.providers.txt

RUN pip install --no-cache-dir -r requirements.txt -r requirements.providers.txt
RUN mkdir -p /usr/local/share/nltk_data /usr/local/share/unidic
RUN python - <<'PY'
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
        nltk.download(package_name, download_dir="/usr/local/share/nltk_data", quiet=False)
PY

COPY services/python-tts/app ./app

# Run as non-root user for container security.
RUN addgroup --system app && adduser --system --ingroup app app
USER app

EXPOSE 8010

# TTS_WORKERS controls uvicorn worker count (default 1).
# Set TTS_WORKERS=2 (or higher) in your env to enable concurrent synthesis.
# Each worker loads the model independently; ensure sufficient RAM per worker.
ENV TTS_WORKERS=1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8010 --workers ${TTS_WORKERS}"]
