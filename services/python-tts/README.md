# Python TTS Service

Local adapter service for open-source providers used by ArticlePod:
- `Kokoro-82M`
- `MeloTTS v3`

Current product behavior:
- End-user voice selection in the web app is Kokoro-only.
- Melo remains installed for internal testing/experimentation.

## Setup

```bash
cd /path/to/articlepod
./scripts/bootstrap-python-tts.sh
```

This script provisions:
- Python 3.11 virtualenv at `services/python-tts/.venv`
- provider dependencies from `requirements.providers.txt`
- runtime language assets required by both models (spaCy, UniDic, NLTK)

Parity Docker builds now preload the same runtime language assets, so the local Docker stack matches the bootstrap script more closely.

Manual fallback (if needed):

```bash
cd services/python-tts
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements.providers.txt
```

## Run

```bash
cd services/python-tts
source .venv/bin/activate
uvicorn app.main:app --reload --port 8010
```

## Endpoints

- `GET /health`: service status + provider availability.
- `GET /v1/providers`: provider metadata + voice IDs.
- `POST /v1/synthesize`: synthesize WAV audio.

Example synthesize request:

```bash
curl -sS -X POST "http://127.0.0.1:8010/v1/synthesize" \
  -H "content-type: application/json" \
  -d '{"provider":"kokoro","voice":"af_heart","text":"Hello from ArticlePod"}' \
  --output sample.wav
```

## End-to-end tests

Run the real provider synthesis checks for both Kokoro and Melo:

```bash
cd /path/to/articlepod
./scripts/test-python-tts-e2e.sh
```

This test suite starts `python-tts`, calls `GET /health`, and verifies `POST /v1/synthesize` returns valid WAV data for both providers.
