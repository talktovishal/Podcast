# Python TTS Service

Local adapter service for open-source providers used by ListenLater:
- `Kokoro-82M`
- `MeloTTS v3`

## Setup

```bash
cd services/python-tts
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements.providers.txt
```

Optional (recommended for Melo English tokenization):

```bash
python -m unidic download
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
  -d '{"provider":"kokoro","voice":"af_heart","text":"Hello from ListenLater"}' \
  --output sample.wav
```
