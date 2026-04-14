import io
import sys
import time
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from fastapi import HTTPException
from starlette.requests import Request

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from app import main


def _make_request() -> Request:
    return Request({"type": "http", "headers": []})


@pytest.fixture(autouse=True)
def _restore_recycle_state() -> None:
    original_threshold_mb = main.PYTHON_TTS_RECYCLE_RSS_MB
    original_idle_seconds = main.PYTHON_TTS_RECYCLE_IDLE_SECONDS
    original_threshold_bytes = main.PYTHON_TTS_RECYCLE_RSS_BYTES
    original_active_requests = main._ACTIVE_SYNTH_REQUESTS
    original_recycle_requested = main._RECYCLE_REQUESTED
    original_recycle_thread = main._RECYCLE_THREAD
    original_last_activity = main._LAST_SYNTH_ACTIVITY_MONOTONIC
    try:
        yield
    finally:
        main.PYTHON_TTS_RECYCLE_RSS_MB = original_threshold_mb
        main.PYTHON_TTS_RECYCLE_IDLE_SECONDS = original_idle_seconds
        main.PYTHON_TTS_RECYCLE_RSS_BYTES = original_threshold_bytes
        main._ACTIVE_SYNTH_REQUESTS = original_active_requests
        main._RECYCLE_REQUESTED = original_recycle_requested
        main._RECYCLE_THREAD = original_recycle_thread
        main._LAST_SYNTH_ACTIVITY_MONOTONIC = original_last_activity


def test_synthesize_kokoro_to_wav_bytes_streams_segments(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakePipeline:
        def __call__(self, text: str, *, voice: str, speed: float = 1.0):
            assert text == "hello"
            assert voice == "af_heart"
            assert speed == 1.0
            yield ("a", "a", np.array([0.25, -0.25], dtype=np.float32))
            yield ("b", "b", np.array([0.5], dtype=np.float32))

    monkeypatch.setattr(main, "_get_kokoro_pipeline", lambda language_code: FakePipeline())

    wav_bytes = main._synthesize_kokoro_to_wav_bytes("hello", "af_heart", 1.0)
    audio, sample_rate = sf.read(io.BytesIO(wav_bytes), dtype="float32")

    assert sample_rate == 24_000
    assert audio.shape == (3,)
    np.testing.assert_allclose(audio, np.array([0.25, -0.25, 0.5], dtype=np.float32), atol=1e-4)


def test_synthesize_returns_safe_message_on_unexpected_kokoro_error(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    original_events_path = main.LOG_EVENTS_PATH
    original_errors_path = main.LOG_ERRORS_PATH
    original_retention = main.LOG_RETENTION_DAYS
    original_error_retention = main.LOG_ERROR_RETENTION_DAYS

    main.LOG_EVENTS_PATH = tmp_path / "events" / "python-tts" / "events.log.jsonl"
    main.LOG_ERRORS_PATH = tmp_path / "errors" / "python-tts" / "errors.log.jsonl"
    main.LOG_RETENTION_DAYS = 7
    main.LOG_ERROR_RETENTION_DAYS = 30

    monkeypatch.setattr(
        main,
        "_provider_health",
        lambda: {
            "kokoro": main.ProviderHealth(available=True),
            "melo": main.ProviderHealth(available=True),
        },
    )
    monkeypatch.setattr(main, "_synthesize_kokoro_to_wav_bytes", lambda *_args, **_kwargs: (_ for _ in ()).throw(MemoryError("oom")))

    payload = main.SynthesizePayload(provider="kokoro", voice="af_heart", text="hello")

    try:
        with pytest.raises(HTTPException) as exc_info:
            main.synthesize(payload, _make_request(), None)

        assert exc_info.value.status_code == 500
        assert exc_info.value.detail == main.GENERIC_AUDIO_FAILURE_DETAIL

        errors_content = main.LOG_ERRORS_PATH.read_text(encoding="utf-8")
        assert "TTS synth unexpected failure" in errors_content
        assert '"error_code": "INTERNAL_ERROR"' in errors_content
        assert "oom" in errors_content
    finally:
        main.LOG_EVENTS_PATH = original_events_path
        main.LOG_ERRORS_PATH = original_errors_path
        main.LOG_RETENTION_DAYS = original_retention
        main.LOG_ERROR_RETENTION_DAYS = original_error_retention


def test_synthesize_marks_sidecar_for_recycle_on_high_rss(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        main,
        "_provider_health",
        lambda: {
            "kokoro": main.ProviderHealth(available=True),
            "melo": main.ProviderHealth(available=True),
        },
    )
    monkeypatch.setattr(main, "_synthesize_kokoro_to_wav_bytes", lambda *_args, **_kwargs: b"wav-bytes")
    monkeypatch.setattr(main, "_read_current_rss_bytes", lambda: 2 * 1024 * 1024)

    main.PYTHON_TTS_RECYCLE_RSS_MB = 1
    main.PYTHON_TTS_RECYCLE_RSS_BYTES = main.PYTHON_TTS_RECYCLE_RSS_MB * 1024 * 1024

    payload = main.SynthesizePayload(provider="kokoro", voice="af_heart", text="hello")
    response = main.synthesize(payload, _make_request(), None)

    assert response.body == b"wav-bytes"
    assert main._RECYCLE_REQUESTED is True
    assert main._ACTIVE_SYNTH_REQUESTS == 1

    main._finish_synth_request()
    assert main._ACTIVE_SYNTH_REQUESTS == 0


def test_should_restart_after_idle_waits_for_no_active_requests() -> None:
    main.PYTHON_TTS_RECYCLE_IDLE_SECONDS = 5.0
    main._RECYCLE_REQUESTED = True
    main._ACTIVE_SYNTH_REQUESTS = 0
    main._LAST_SYNTH_ACTIVITY_MONOTONIC = 100.0

    assert main._should_restart_after_idle(now=104.9) is False
    assert main._should_restart_after_idle(now=105.0) is True

    main._ACTIVE_SYNTH_REQUESTS = 1
    assert main._should_restart_after_idle(now=time.monotonic() + 30) is False
