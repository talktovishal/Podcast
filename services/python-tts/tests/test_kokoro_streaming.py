import asyncio
import io
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import ModuleType, SimpleNamespace

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


@pytest.mark.parametrize("provider", ["kokoro", "melo"])
@pytest.mark.parametrize("fail_first", [False, True])
def test_concurrent_model_initialization_and_failed_retry(monkeypatch, provider, fail_first):
    entered = threading.Event()
    release = threading.Event()
    waiting = threading.Event()
    model = object()
    calls = []

    class ObservedLock:
        def __init__(self):
            self.lock = threading.Lock()
            self.attempts = 0

        def __enter__(self):
            self.attempts += 1
            if self.attempts == 2:
                waiting.set()
            self.lock.acquire()

        def __exit__(self, *_args):
            self.lock.release()

    def initialize(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            entered.set()
            assert release.wait(5), "test must release initialization"
            if fail_first:
                raise RuntimeError("controlled initialization failure")
        return model

    module = ModuleType("kokoro" if provider == "kokoro" else "melo.api")
    setattr(module, "KPipeline" if provider == "kokoro" else "TTS", initialize)
    if provider == "melo":
        monkeypatch.setitem(sys.modules, "melo", ModuleType("melo"))
    monkeypatch.setitem(sys.modules, module.__name__, module)
    monkeypatch.setattr(main, "_kokoro_pipelines", {})
    monkeypatch.setattr(main, "_melo_models", {})
    key = (provider, "a" if provider == "kokoro" else "EN")
    monkeypatch.setattr(main, "_MODEL_INIT_LOCKS", {key: ObservedLock()})
    load = (lambda: main._get_kokoro_pipeline("a")) if provider == "kokoro" else main._get_melo_model
    cache = main._kokoro_pipelines if provider == "kokoro" else main._melo_models

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(load)
        try:
            assert entered.wait(5)
            second = pool.submit(load)
            assert waiting.wait(5), "second caller must reach the initialization guard"
            assert len(calls) == 1
            assert cache == {}, "an unfinished model must not be published"
        finally:
            release.set()
        if fail_first:
            with pytest.raises(RuntimeError, match="controlled initialization failure"):
                first.result(timeout=5)
        else:
            assert first.result(timeout=5) is model
        assert second.result(timeout=5) is model

    assert load() is model
    assert len(calls) == (2 if fail_first else 1)


def test_different_model_languages_initialize_independently(monkeypatch):
    rendezvous = threading.Barrier(2)
    module = ModuleType("kokoro")

    def initialize(*, lang_code):
        rendezvous.wait(timeout=5)
        return lang_code

    module.KPipeline = initialize
    monkeypatch.setitem(sys.modules, "kokoro", module)
    monkeypatch.setattr(main, "_kokoro_pipelines", {})
    monkeypatch.setattr(main, "_MODEL_INIT_LOCKS", {})
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(main._get_kokoro_pipeline, "a")
        second = pool.submit(main._get_kokoro_pipeline, "b")
        assert first.result(timeout=5) == "a"
        assert second.result(timeout=5) == "b"


def test_kokoro_synthesis_does_not_check_melo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "_kokoro_health", lambda: main.ProviderHealth(available=True))

    def unexpected_melo_check():
        raise AssertionError("Kokoro synthesis must not discover Melo")

    monkeypatch.setattr(main, "_melo_health", unexpected_melo_check)
    monkeypatch.setattr(main, "_synthesize_kokoro_to_wav_bytes", lambda *_args: b"wav-fixture")
    monkeypatch.setattr(main, "_log_event", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(main, "_should_request_recycle", lambda _rss: False)
    response = main.synthesize(main.SynthesizePayload(provider="kokoro", voice="af_heart", text="Hello"), _make_request(), None)
    assert response.status_code == 200
    assert response.body == b"wav-fixture"


def test_discovery_reports_missing_melo_without_disabling_kokoro(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "optional_module_available", lambda name: name != "melo.api")
    health = main.health()
    assert health["providers"]["kokoro"]["available"] is True
    assert health["providers"]["melo"]["available"] is False
    assert main.providers(None)["providers"]["melo"]["reason"] == "melo package is not installed."
    with pytest.raises(HTTPException) as error:
        main.synthesize(main.SynthesizePayload(provider="melo", voice="EN-US", text="Hello"), _make_request(), None)
    assert error.value.status_code == 503


@pytest.mark.parametrize("fail", [False, True])
def test_melo_selected_provider_audio_error_and_cleanup(monkeypatch: pytest.MonkeyPatch, fail: bool) -> None:
    paths = []
    events = []
    samples = np.array([[0.25, 0.75], [-0.25, 0.25]], dtype=np.float32)

    class FakeMeloModel:
        hps = SimpleNamespace(data=SimpleNamespace(spk2id={"EN-US": 3}))

        def tts_to_file(self, text, speaker_id, path, *, speed):
            assert (text, speaker_id, speed) == ("Hello", 3, 1.0)
            paths.append(Path(path))
            if fail:
                raise RuntimeError("controlled provider-internal failure")
            sf.write(path, samples, 24_000)

    def unexpected_kokoro_check():
        raise AssertionError("Melo synthesis must not discover Kokoro")

    monkeypatch.setattr(main, "_kokoro_health", unexpected_kokoro_check)
    monkeypatch.setattr(main, "_melo_health", lambda: main.ProviderHealth(available=True))
    monkeypatch.setattr(main, "_get_melo_model", FakeMeloModel)
    monkeypatch.setattr(main, "_log_event", lambda *args, **kwargs: events.append((args, kwargs)))
    monkeypatch.setattr(main, "_should_request_recycle", lambda _rss: False)
    payload = main.SynthesizePayload(provider="melo", voice="EN-US", text="Hello")

    if fail:
        with pytest.raises(HTTPException) as error:
            main.synthesize(payload, _make_request(), None)
        assert error.value.status_code == 500
        assert error.value.detail == main.GENERIC_AUDIO_FAILURE_DETAIL
        assert any(kwargs.get("error_code") == "TTS_FAILED" for _, kwargs in events)
    else:
        response = main.synthesize(payload, _make_request(), None)
        assert response.status_code == 200
        assert response.media_type == "audio/wav"
        audio, sample_rate = sf.read(io.BytesIO(response.body), dtype="float32")
        assert sample_rate == 24_000
        assert response.headers["x-provider"] == "melo"
        np.testing.assert_allclose(audio, np.array([0.5, 0.0], dtype=np.float32), atol=1e-4)
        assert main._ACTIVE_SYNTH_REQUESTS == 1
        assert response.background is not None
        asyncio.run(response.background())

    assert len(paths) == 1
    assert not paths[0].exists()
    assert main._ACTIVE_SYNTH_REQUESTS == 0


@pytest.mark.parametrize("provider", ["kokoro", "melo"])
def test_rejected_voice_never_enters_model_or_leaks_request(monkeypatch: pytest.MonkeyPatch, provider: str) -> None:
    def unexpected_synthesis(*_args):
        raise AssertionError("unsupported voice must be rejected before inference")

    monkeypatch.setattr(main, "_provider_health", lambda selected: {selected: main.ProviderHealth(available=True)})
    monkeypatch.setattr(main, "_synthesize_kokoro_to_wav_bytes", unexpected_synthesis)
    monkeypatch.setattr(main, "_synthesize_melo", unexpected_synthesis)
    monkeypatch.setattr(main, "_log_event", lambda *_args, **_kwargs: None)
    with pytest.raises(HTTPException) as error:
        main.synthesize(main.SynthesizePayload(provider=provider, voice="unsupported", text="Hello"), _make_request(), None)
    assert error.value.status_code == 400
    assert main._ACTIVE_SYNTH_REQUESTS == 0


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
        lambda provider=None: {
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
        lambda provider=None: {
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
