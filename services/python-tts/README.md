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

The [provider/asset manifest proposal](../../docs/architecture-followup-proposals.md#6-locked-provider-and-asset-manifest)
inventories pinned versus floating inputs and defines two-build/rollback
verification. It is design-only: no provider version, model, asset or live runtime
is upgraded or replaced, and current inputs are not claimed fully reproducible.

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

Provider discovery does not require model packages:

```bash
python3 -m unittest discover -s services/python-tts/tests -p test_provider_discovery.py -v
```

Relevant PRs also run the provider-isolation, streaming and logging tests using
the API requirements plus pytest, without downloading Kokoro/Melo models.
Synthesis checks only the requested provider. Missing optional Melo does not
disable Kokoro; unexpected discovery failures remain explicit.

### What each gate proves

| Gate | Evidence | Does not prove |
|---|---|---|
| `test_provider_discovery.py` | Missing optional modules are distinguished from unrelated import failures | Real model assets load |
| `test_kokoro_streaming.py` | Per-key initialization/retry, Kokoro segmented WAV, selected-provider isolation in both directions, Melo mono WAV/error/temp-file cleanup, invalid-voice rejection, request/recycle accounting | Real voice quality, model memory capacity, live-service correctness |
| `test_logging_split.py` | Activity/error separation and logging failure behavior | Production log retention/transport |
| `check_provider_gate_mutations.py` | New regressions fail for six controlled faults in disposable copies, including unsafe errors and missing cleanup | Full mutation coverage of the service |
| Real-provider E2E below | Fresh valid WAV from the installed providers in that test environment | Reproducible asset provenance or production capacity |

CI's `python-tts-unit` job runs the first four gates with API dependencies and
pytest, without heavyweight provider packages or model downloads. Existing
constructor concurrency and Kokoro error tests were retained rather than
duplicated. Added cases close the Melo-path and invalid-voice gaps. Controlled
fault copies are removed afterward and never modify the working service source.
Real-model, live-cloud and deployment validation remain separate evidence; no
such run or deployment is claimed by this dependency-light audit.

Run the real provider synthesis checks for both Kokoro and Melo:

```bash
cd /path/to/articlepod
./scripts/test-python-tts-e2e.sh
```

This test suite starts `python-tts`, calls `GET /health`, and verifies `POST /v1/synthesize` returns valid WAV data for both providers.
