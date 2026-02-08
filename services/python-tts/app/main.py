from __future__ import annotations

import io
import os
import tempfile
from dataclasses import dataclass
from typing import Any, Dict, Literal

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

app = FastAPI(title="ListenLater Python TTS")


class SynthesizePayload(BaseModel):
    provider: Literal["kokoro", "melo"]
    voice: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=1, max_length=12_000)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


@dataclass(frozen=True)
class ProviderHealth:
    available: bool
    reason: str | None = None


KOKORO_ENGLISH_VOICES = [
    "af_heart",
    "af_bella",
    "af_sarah",
    "af_nicole",
    "am_adam",
    "am_michael",
    "bf_emma",
    "bm_george",
]

MELO_ENGLISH_VOICES = [
    "EN-Default",
    "EN-US",
    "EN-BR",
    "EN_INDIA",
    "EN-AU",
]

_kokoro_pipelines: Dict[str, Any] = {}
_melo_models: Dict[str, Any] = {}


def _provider_health() -> Dict[str, ProviderHealth]:
    health: Dict[str, ProviderHealth] = {
        "kokoro": ProviderHealth(available=True),
        "melo": ProviderHealth(available=True),
    }

    try:
        import kokoro  # noqa: F401
    except Exception as exc:
        health["kokoro"] = ProviderHealth(available=False, reason=f"kokoro import failed: {exc}")

    try:
        import melo  # noqa: F401
    except Exception:
        # Fallback import path used by MeloTTS.
        try:
            from melo.api import TTS  # noqa: F401
        except Exception as exc:
            health["melo"] = ProviderHealth(available=False, reason=f"melo import failed: {exc}")

    return health


def _get_kokoro_pipeline(language_code: str) -> Any:
    if language_code not in _kokoro_pipelines:
        from kokoro import KPipeline

        _kokoro_pipelines[language_code] = KPipeline(lang_code=language_code)
    return _kokoro_pipelines[language_code]


def _synthesize_kokoro(text: str, voice: str, speed: float) -> tuple[np.ndarray, int]:
    if "_" not in voice:
        raise ValueError("Kokoro voice must include a language prefix (for example af_heart).")

    language_code = voice.split("_", 1)[0][0].lower()
    pipeline = _get_kokoro_pipeline(language_code)
    chunks: list[np.ndarray] = []

    try:
        try:
            segments = pipeline(text, voice=voice, speed=speed)
        except TypeError:
            segments = pipeline(text, voice=voice)

        for _graphemes, _phonemes, audio in segments:
            if audio is None:
                continue
            chunks.append(np.asarray(audio, dtype=np.float32))
    except Exception as exc:
        raise RuntimeError(f"Kokoro synthesis failed: {exc}") from exc

    if not chunks:
        raise RuntimeError("Kokoro synthesis returned no audio chunks.")

    return np.concatenate(chunks), 24_000


def _get_melo_model() -> Any:
    key = "EN"
    if key not in _melo_models:
        from melo.api import TTS

        _melo_models[key] = TTS(language="EN", device="auto")
    return _melo_models[key]


def _synthesize_melo(text: str, voice: str, speed: float) -> tuple[np.ndarray, int]:
    model = _get_melo_model()
    speaker_map = getattr(model.hps.data, "spk2id", {})
    if voice not in speaker_map:
        raise ValueError(f"Melo voice '{voice}' is not available.")

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
        temp_path = handle.name

    try:
        model.tts_to_file(text, speaker_map[voice], temp_path, speed=speed)
        audio, sample_rate = sf.read(temp_path, dtype="float32")
    except Exception as exc:
        raise RuntimeError(f"Melo synthesis failed: {exc}") from exc
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

    if isinstance(audio, np.ndarray) and audio.ndim > 1:
        audio = np.mean(audio, axis=1)

    return np.asarray(audio, dtype=np.float32), int(sample_rate)


def _audio_to_wav_bytes(audio: np.ndarray, sample_rate: int) -> bytes:
    stream = io.BytesIO()
    sf.write(stream, audio, sample_rate, format="WAV")
    return stream.getvalue()


@app.get("/health")
def health() -> dict[str, Any]:
    health_info = _provider_health()
    return {
        "status": "ok",
        "providers": {
            provider_id: {"available": value.available, "reason": value.reason}
            for provider_id, value in health_info.items()
        },
    }


@app.get("/v1/providers")
def providers() -> dict[str, Any]:
    health_info = _provider_health()
    return {
        "providers": {
            "kokoro": {
                "available": health_info["kokoro"].available,
                "reason": health_info["kokoro"].reason,
                "voices": KOKORO_ENGLISH_VOICES,
            },
            "melo": {
                "available": health_info["melo"].available,
                "reason": health_info["melo"].reason,
                "voices": MELO_ENGLISH_VOICES,
            },
        }
    }


@app.post("/v1/synthesize")
def synthesize(payload: SynthesizePayload) -> Response:
    health_info = _provider_health()
    provider_health = health_info[payload.provider]
    if not provider_health.available:
        raise HTTPException(status_code=503, detail=provider_health.reason or "Provider unavailable.")

    if payload.provider == "kokoro":
        if payload.voice not in KOKORO_ENGLISH_VOICES:
            raise HTTPException(status_code=400, detail=f"Unsupported Kokoro voice: {payload.voice}")
        audio, sample_rate = _synthesize_kokoro(payload.text, payload.voice, payload.speed)
    else:
        if payload.voice not in MELO_ENGLISH_VOICES:
            raise HTTPException(status_code=400, detail=f"Unsupported Melo voice: {payload.voice}")
        audio, sample_rate = _synthesize_melo(payload.text, payload.voice, payload.speed)

    wav_bytes = _audio_to_wav_bytes(audio, sample_rate)
    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "x-provider": payload.provider,
            "x-sample-rate": str(sample_rate),
        },
    )
