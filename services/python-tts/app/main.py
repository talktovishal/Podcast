from __future__ import annotations

import hmac
import importlib.util
import io
import json
import logging
import os
import secrets
import threading
import tempfile
import time
from datetime import datetime, timezone
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Literal

import numpy as np
import soundfile as sf
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

app = FastAPI(title="ArticlePod Python TTS")

# Optional shared secret between caller (worker) and this sidecar.
# When set, every non-health request must include the matching X-Sidecar-Secret header.
_SIDECAR_SECRET: str = os.getenv("PYTHON_TTS_SECRET", "")


def _require_sidecar_auth(request: Request) -> None:
    if not _SIDECAR_SECRET:
        # No secret configured — allow all (local dev without auth).
        return
    header_value = request.headers.get("x-sidecar-secret", "")
    if not secrets.compare_digest(header_value, _SIDECAR_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")


def _default_log_root() -> Path:
    cwd = Path.cwd()
    try:
        project_root = cwd.parents[1]
    except IndexError:
        project_root = cwd
    return project_root / ".runtime" / "logs"


def _read_non_negative_int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        parsed = int(raw)
    except ValueError:
        return default
    return max(0, parsed)


def _read_non_negative_float_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        parsed = float(raw)
    except ValueError:
        return default
    return max(0.0, parsed)


LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_ROOT = Path(os.getenv("LOG_ROOT", str(_default_log_root())))
LOG_EVENTS_PATH = LOG_ROOT / "events" / "python-tts" / "events.log.jsonl"
LOG_ERRORS_PATH = LOG_ROOT / "errors" / "python-tts" / "errors.log.jsonl"
LOG_MAX_BYTES = int(os.getenv("LOG_MAX_BYTES", str(1 * 1024 * 1024)))
LOG_MAX_FILES = int(os.getenv("LOG_MAX_FILES", "10"))
LOG_RETENTION_DAYS = int(os.getenv("LOG_RETENTION_DAYS", "14"))
LOG_ERROR_RETENTION_DAYS = int(os.getenv("LOG_ERROR_RETENTION_DAYS", str(max(LOG_RETENTION_DAYS, 30))))
TTS_MAX_TEXT_CHARS = int(os.getenv("TTS_MAX_TEXT_CHARS", "120000"))
ERROR_LEVELS = {"ERROR", "FATAL"}
GENERIC_AUDIO_FAILURE_DETAIL = "Audio processing failed. Please retry."
TEMPORARY_AUDIO_FAILURE_DETAIL = "Audio processing is temporarily unavailable. Please retry shortly."
PYTHON_TTS_RECYCLE_RSS_MB = _read_non_negative_int_env("PYTHON_TTS_RECYCLE_RSS_MB", 0)
PYTHON_TTS_RECYCLE_IDLE_SECONDS = _read_non_negative_float_env("PYTHON_TTS_RECYCLE_IDLE_SECONDS", 0.0)
PYTHON_TTS_RECYCLE_RSS_BYTES = PYTHON_TTS_RECYCLE_RSS_MB * 1024 * 1024

logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO))

_SYNTH_STATE_LOCK = threading.Lock()
_ACTIVE_SYNTH_REQUESTS = 0
_RECYCLE_REQUESTED = False
_RECYCLE_THREAD: threading.Thread | None = None
_LAST_SYNTH_ACTIVITY_MONOTONIC = time.monotonic()


def _utc_now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _log_sink_for_level(level: str) -> tuple[Path, int]:
    if level in ERROR_LEVELS:
        return LOG_ERRORS_PATH, LOG_ERROR_RETENTION_DAYS
    return LOG_EVENTS_PATH, LOG_RETENTION_DAYS


def _rotate_logs_if_needed(log_path: Path, retention_days: int) -> None:
    try:
        if log_path.exists() and log_path.stat().st_size > LOG_MAX_BYTES:
            timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%S")
            rotated = log_path.with_name(f"{log_path.name}.{timestamp}")
            log_path.rename(rotated)
            log_path.touch(exist_ok=True)
    except Exception:
        return

    try:
        cutoff = time.time() - retention_days * 24 * 60 * 60
        kept = 0
        rotated_logs = sorted(
            [entry for entry in log_path.parent.glob(f"{log_path.name}.*") if entry.is_file()],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        for stale in rotated_logs:
            stale_mtime = stale.stat().st_mtime
            if stale_mtime < cutoff or kept >= LOG_MAX_FILES:
                stale.unlink(missing_ok=True)
                continue
            kept += 1
    except Exception:
        pass


def _extract_trace_id(traceparent: str | None) -> str | None:
    if not traceparent:
        return None
    parts = traceparent.split("-")
    if len(parts) != 4:
        return None
    return parts[1]


def _extract_span_id(traceparent: str | None) -> str | None:
    if not traceparent:
        return None
    parts = traceparent.split("-")
    if len(parts) != 4:
        return None
    return parts[2]


def _safe_user_hash(raw: str | None) -> str | None:
    if not raw:
        return None
    import hashlib

    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def _log_event(
    level: str,
    msg: str,
    *,
    error_code: str | None = None,
    request_id: str | None = None,
    job_id: str | None = None,
    item_id: str | None = None,
    traceparent: str | None = None,
    attrs: dict[str, Any] | None = None,
) -> None:
    log_path, retention_days = _log_sink_for_level(level)
    event = {
        "ts": _utc_now_iso(),
        "level": level,
        "service": "python-tts",
        "env": os.getenv("RUNTIME_PROFILE", "simple"),
        "msg": msg,
        "error_code": error_code,
        "trace_id": _extract_trace_id(traceparent),
        "span_id": _extract_span_id(traceparent),
        "request_id": request_id,
        "job_id": job_id,
        "item_id": item_id,
        "user_id_hash": _safe_user_hash(os.getenv("DEMO_EMAIL")),
        "attrs": attrs or {},
    }
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, ensure_ascii=True) + "\n")
        _rotate_logs_if_needed(log_path, retention_days)
    except Exception as exc:
        logging.warning("Structured log write failed for %s: %s", log_path, exc)


def _request_context(request: Request) -> dict[str, str | None]:
    return {
        "traceparent": request.headers.get("traceparent"),
        "request_id": request.headers.get("x-request-id"),
        "job_id": request.headers.get("x-job-id"),
        "item_id": request.headers.get("x-item-id"),
    }


def _read_current_rss_bytes() -> int | None:
    status_path = Path("/proc/self/status")
    try:
        for line in status_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("VmRSS:"):
                parts = line.split()
                if len(parts) >= 2:
                    return int(parts[1]) * 1024
                return None
    except Exception:
        return None
    return None


def _state_snapshot() -> tuple[int, bool]:
    with _SYNTH_STATE_LOCK:
        return _ACTIVE_SYNTH_REQUESTS, _RECYCLE_REQUESTED


def _note_synth_started() -> None:
    global _ACTIVE_SYNTH_REQUESTS, _LAST_SYNTH_ACTIVITY_MONOTONIC
    with _SYNTH_STATE_LOCK:
        _ACTIVE_SYNTH_REQUESTS += 1
        _LAST_SYNTH_ACTIVITY_MONOTONIC = time.monotonic()


def _should_request_recycle(rss_bytes: int | None) -> bool:
    return PYTHON_TTS_RECYCLE_RSS_BYTES > 0 and rss_bytes is not None and rss_bytes >= PYTHON_TTS_RECYCLE_RSS_BYTES


def _request_process_recycle(
    request_ctx: dict[str, str | None],
    *,
    rss_bytes: int,
    provider: str,
    text_chars: int,
) -> None:
    global _RECYCLE_REQUESTED

    with _SYNTH_STATE_LOCK:
        if _RECYCLE_REQUESTED:
            return
        _RECYCLE_REQUESTED = True
        active_requests = _ACTIVE_SYNTH_REQUESTS

    _log_event(
        "WARN",
        "python-tts recycle requested after high RSS",
        error_code="TTS_RECYCLE_REQUESTED",
        request_id=request_ctx["request_id"],
        job_id=request_ctx["job_id"],
        item_id=request_ctx["item_id"],
        traceparent=request_ctx["traceparent"],
        attrs={
            "provider": provider,
            "text_chars": text_chars,
            "rss_mb": round(rss_bytes / (1024 * 1024), 2),
            "rss_threshold_mb": PYTHON_TTS_RECYCLE_RSS_MB,
            "idle_seconds": PYTHON_TTS_RECYCLE_IDLE_SECONDS,
            "active_requests": active_requests,
        },
    )


def _should_restart_after_idle(now: float | None = None) -> bool:
    current_time = time.monotonic() if now is None else now
    with _SYNTH_STATE_LOCK:
        if not _RECYCLE_REQUESTED or _ACTIVE_SYNTH_REQUESTS > 0:
            return False
        idle_for = current_time - _LAST_SYNTH_ACTIVITY_MONOTONIC
    return idle_for >= PYTHON_TTS_RECYCLE_IDLE_SECONDS


def _trigger_process_restart() -> None:
    logging.shutdown()
    os._exit(0)


def _recycle_when_idle() -> None:
    global _RECYCLE_THREAD

    wait_seconds = 0.25 if PYTHON_TTS_RECYCLE_IDLE_SECONDS <= 0 else min(1.0, PYTHON_TTS_RECYCLE_IDLE_SECONDS)
    while True:
        if _should_restart_after_idle():
            rss_bytes = _read_current_rss_bytes()
            _log_event(
                "WARN",
                "python-tts recycling after idle threshold",
                error_code="TTS_RECYCLE",
                attrs={
                    "rss_mb": round(rss_bytes / (1024 * 1024), 2) if rss_bytes is not None else None,
                    "rss_threshold_mb": PYTHON_TTS_RECYCLE_RSS_MB,
                    "idle_seconds": PYTHON_TTS_RECYCLE_IDLE_SECONDS,
                },
            )
            with _SYNTH_STATE_LOCK:
                _RECYCLE_THREAD = None
            _trigger_process_restart()
            return

        with _SYNTH_STATE_LOCK:
            if not _RECYCLE_REQUESTED:
                _RECYCLE_THREAD = None
                return

        time.sleep(wait_seconds)


def _arm_recycle_thread_if_needed() -> None:
    global _RECYCLE_THREAD

    with _SYNTH_STATE_LOCK:
        if not _RECYCLE_REQUESTED or _ACTIVE_SYNTH_REQUESTS > 0 or _RECYCLE_THREAD is not None:
            return
        _RECYCLE_THREAD = threading.Thread(target=_recycle_when_idle, name="python-tts-recycle", daemon=True)
        recycle_thread = _RECYCLE_THREAD

    recycle_thread.start()


def _finish_synth_request() -> None:
    global _ACTIVE_SYNTH_REQUESTS, _LAST_SYNTH_ACTIVITY_MONOTONIC

    with _SYNTH_STATE_LOCK:
        _ACTIVE_SYNTH_REQUESTS = max(0, _ACTIVE_SYNTH_REQUESTS - 1)
        _LAST_SYNTH_ACTIVITY_MONOTONIC = time.monotonic()

    _arm_recycle_thread_if_needed()


class SynthesizePayload(BaseModel):
    provider: Literal["kokoro", "melo"]
    voice: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=1, max_length=TTS_MAX_TEXT_CHARS)
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
NLTK_RESOURCE_PATHS = {
    "averaged_perceptron_tagger_eng": "taggers/averaged_perceptron_tagger_eng",
    "cmudict": "corpora/cmudict",
}


def _kokoro_health() -> ProviderHealth:
    if importlib.util.find_spec("kokoro") is None:
        return ProviderHealth(available=False, reason="kokoro package is not installed.")

    if importlib.util.find_spec("en_core_web_sm") is None:
        return ProviderHealth(
            available=False,
            reason="spaCy model 'en_core_web_sm' is missing. Run scripts/bootstrap-python-tts.sh.",
        )

    return ProviderHealth(available=True)


def _melo_health() -> ProviderHealth:
    if importlib.util.find_spec("melo.api") is None:
        return ProviderHealth(available=False, reason="melo package is not installed.")

    try:
        import unidic

        mecabrc = Path(unidic.DICDIR) / "mecabrc"
        if not mecabrc.exists():
            return ProviderHealth(
                available=False,
                reason="UniDic dictionary is missing. Run scripts/bootstrap-python-tts.sh.",
            )
    except Exception as exc:
        return ProviderHealth(available=False, reason=f"unidic check failed: {exc}")

    try:
        import nltk

        for resource_path in NLTK_RESOURCE_PATHS.values():
            nltk.data.find(resource_path)
    except LookupError:
        return ProviderHealth(
            available=False,
            reason="NLTK data is missing (averaged_perceptron_tagger_eng/cmudict). Run scripts/bootstrap-python-tts.sh.",
        )
    except Exception as exc:
        return ProviderHealth(available=False, reason=f"nltk check failed: {exc}")

    return ProviderHealth(available=True)


def _provider_health() -> Dict[str, ProviderHealth]:
    return {
        "kokoro": _kokoro_health(),
        "melo": _melo_health(),
    }


def _get_kokoro_pipeline(language_code: str) -> Any:
    if language_code not in _kokoro_pipelines:
        from kokoro import KPipeline

        _kokoro_pipelines[language_code] = KPipeline(lang_code=language_code)
    return _kokoro_pipelines[language_code]


def _synthesize_kokoro_to_wav_bytes(text: str, voice: str, speed: float) -> bytes:
    if "_" not in voice:
        raise ValueError("Kokoro voice must include a language prefix (for example af_heart).")

    language_code = voice.split("_", 1)[0][0].lower()
    pipeline = _get_kokoro_pipeline(language_code)
    stream = io.BytesIO()
    wrote_audio = False

    try:
        with sf.SoundFile(stream, mode="w", samplerate=24_000, channels=1, format="WAV", subtype="PCM_16") as sink:
            try:
                segments = pipeline(text, voice=voice, speed=speed)
            except TypeError:
                segments = pipeline(text, voice=voice)

            for _graphemes, _phonemes, audio in segments:
                if audio is None:
                    continue
                segment = np.asarray(audio, dtype=np.float32)
                if segment.ndim > 1:
                    segment = np.mean(segment, axis=1)
                sink.write(segment)
                wrote_audio = True
    except Exception as exc:
        raise RuntimeError(f"Kokoro synthesis failed: {exc}") from exc

    if not wrote_audio:
        raise RuntimeError("Kokoro synthesis returned no audio chunks.")

    return stream.getvalue()


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
    rss_bytes = _read_current_rss_bytes()
    active_requests, recycle_requested = _state_snapshot()
    return {
        "status": "ok",
        "providers": {
            provider_id: {"available": value.available, "reason": value.reason}
            for provider_id, value in health_info.items()
        },
        "process": {
            "rss_bytes": rss_bytes,
            "rss_mb": round(rss_bytes / (1024 * 1024), 2) if rss_bytes is not None else None,
            "recycle_threshold_mb": PYTHON_TTS_RECYCLE_RSS_MB or None,
            "recycle_idle_seconds": PYTHON_TTS_RECYCLE_IDLE_SECONDS,
            "recycle_requested": recycle_requested,
            "active_synth_requests": active_requests,
        },
    }


@app.get("/v1/providers")
def providers(_auth: None = Depends(_require_sidecar_auth)) -> dict[str, Any]:
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
def synthesize(payload: SynthesizePayload, request: Request, _auth: None = Depends(_require_sidecar_auth)) -> Response:
    started = time.perf_counter()
    request_ctx = _request_context(request)
    response: Response | None = None
    _note_synth_started()
    _log_event(
        "INFO",
        "TTS synth request received",
        request_id=request_ctx["request_id"],
        job_id=request_ctx["job_id"],
        item_id=request_ctx["item_id"],
        traceparent=request_ctx["traceparent"],
        attrs={"provider": payload.provider, "voice": payload.voice, "text_chars": len(payload.text)},
    )
    try:
        health_info = _provider_health()
        provider_health = health_info[payload.provider]
        if not provider_health.available:
            _log_event(
                "ERROR",
                "TTS provider unavailable",
                error_code="TTS_UNAVAILABLE",
                request_id=request_ctx["request_id"],
                job_id=request_ctx["job_id"],
                item_id=request_ctx["item_id"],
                traceparent=request_ctx["traceparent"],
                attrs={"provider": payload.provider, "reason": provider_health.reason},
            )
            raise HTTPException(status_code=503, detail=TEMPORARY_AUDIO_FAILURE_DETAIL)

        if payload.provider == "kokoro":
            if payload.voice not in KOKORO_ENGLISH_VOICES:
                raise HTTPException(status_code=400, detail=f"Unsupported Kokoro voice: {payload.voice}")
            wav_bytes = _synthesize_kokoro_to_wav_bytes(payload.text, payload.voice, payload.speed)
            sample_rate = 24_000
        else:
            if payload.voice not in MELO_ENGLISH_VOICES:
                raise HTTPException(status_code=400, detail=f"Unsupported Melo voice: {payload.voice}")
            audio, sample_rate = _synthesize_melo(payload.text, payload.voice, payload.speed)
            wav_bytes = _audio_to_wav_bytes(audio, sample_rate)
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        rss_bytes = _read_current_rss_bytes()
        if _should_request_recycle(rss_bytes):
            _request_process_recycle(
                request_ctx,
                rss_bytes=rss_bytes,
                provider=payload.provider,
                text_chars=len(payload.text),
            )

        _log_event(
            "INFO",
            "TTS synth completed",
            request_id=request_ctx["request_id"],
            job_id=request_ctx["job_id"],
            item_id=request_ctx["item_id"],
            traceparent=request_ctx["traceparent"],
            attrs={
                "provider": payload.provider,
                "voice": payload.voice,
                "sample_rate": sample_rate,
                "duration_ms": elapsed_ms,
                "bytes": len(wav_bytes),
                "rss_mb": round(rss_bytes / (1024 * 1024), 2) if rss_bytes is not None else None,
                "recycle_requested": _state_snapshot()[1],
            },
        )
        response = Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "x-provider": payload.provider,
                "x-sample-rate": str(sample_rate),
            },
            background=BackgroundTask(_finish_synth_request),
        )
        return response
    except HTTPException as exc:
        _log_event(
            "WARN",
            "TTS synth rejected",
            error_code="INVALID_INPUT",
            request_id=request_ctx["request_id"],
            job_id=request_ctx["job_id"],
            item_id=request_ctx["item_id"],
            traceparent=request_ctx["traceparent"],
            attrs={"provider": payload.provider, "status": exc.status_code, "detail": exc.detail},
        )
        raise
    except ValueError as exc:
        _log_event(
            "WARN",
            "TTS synth invalid value",
            error_code="INVALID_INPUT",
            request_id=request_ctx["request_id"],
            job_id=request_ctx["job_id"],
            item_id=request_ctx["item_id"],
            traceparent=request_ctx["traceparent"],
            attrs={"provider": payload.provider, "detail": str(exc)},
        )
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        _log_event(
            "ERROR",
            "TTS synth runtime failure",
            error_code="TTS_FAILED",
            request_id=request_ctx["request_id"],
            job_id=request_ctx["job_id"],
            item_id=request_ctx["item_id"],
            traceparent=request_ctx["traceparent"],
            attrs={"provider": payload.provider, "detail": str(exc)},
        )
        raise HTTPException(status_code=500, detail=GENERIC_AUDIO_FAILURE_DETAIL) from exc
    except Exception as exc:
        _log_event(
            "ERROR",
            "TTS synth unexpected failure",
            error_code="INTERNAL_ERROR",
            request_id=request_ctx["request_id"],
            job_id=request_ctx["job_id"],
            item_id=request_ctx["item_id"],
            traceparent=request_ctx["traceparent"],
            attrs={"provider": payload.provider, "detail": str(exc)},
        )
        raise HTTPException(status_code=500, detail=GENERIC_AUDIO_FAILURE_DETAIL) from exc
    finally:
        if response is None:
            _finish_synth_request()
