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
