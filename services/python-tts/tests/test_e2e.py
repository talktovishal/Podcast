from __future__ import annotations

import json
import os
import socket
import subprocess
import time
from pathlib import Path
from urllib import error, request

import pytest

ROOT_DIR = Path(__file__).resolve().parents[1]
STARTUP_TIMEOUT_SECONDS = int(os.getenv("PYTHON_TTS_E2E_STARTUP_TIMEOUT", "240"))
REQUEST_TIMEOUT_SECONDS = int(os.getenv("PYTHON_TTS_E2E_REQUEST_TIMEOUT", "360"))


def _pick_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as handle:
        handle.bind(("127.0.0.1", 0))
        return int(handle.getsockname()[1])


def _request_json(
    base_url: str,
    method: str,
    path: str,
    payload: dict[str, object] | None = None,
    timeout_seconds: int = REQUEST_TIMEOUT_SECONDS,
) -> tuple[int, dict[str, str], bytes]:
    data = None
    headers: dict[str, str] = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["content-type"] = "application/json"

    req = request.Request(
        f"{base_url}{path}",
        data=data,
        headers=headers,
        method=method,
    )
    try:
        with request.urlopen(req, timeout=timeout_seconds) as response:
            return response.status, dict(response.headers.items()), response.read()
    except error.HTTPError as exc:
        return exc.code, dict(exc.headers.items()), exc.read()
    except error.URLError:
        return 0, {}, b""
    except TimeoutError:
        return 0, {}, b""


@pytest.fixture(scope="session")
def tts_base_url() -> str:
    python_bin = ROOT_DIR / ".venv" / "bin" / "python"
    if not python_bin.exists():
        pytest.skip("python-tts virtualenv is missing. Run scripts/bootstrap-python-tts.sh first.")

    port = _pick_free_port()
    base_url = f"http://127.0.0.1:{port}"
    process = subprocess.Popen(
        [str(python_bin), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)],
        cwd=ROOT_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
    )

    deadline = time.time() + STARTUP_TIMEOUT_SECONDS
    try:
        while time.time() < deadline:
            if process.poll() is not None:
                pytest.fail("python-tts server exited before becoming healthy.")

            status, _, body = _request_json(base_url, "GET", "/health", timeout_seconds=5)
            if status == 200:
                payload = json.loads(body.decode("utf-8"))
                if payload.get("status") == "ok":
                    break
            time.sleep(1)
        else:
            pytest.fail("python-tts server did not become healthy before timeout.")

        yield base_url
    finally:
        process.terminate()
        try:
            process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)


def test_health_reports_open_source_providers_available(tts_base_url: str) -> None:
    status, _, body = _request_json(tts_base_url, "GET", "/health")
    assert status == 200
    payload = json.loads(body.decode("utf-8"))
    providers = payload["providers"]
    assert providers["kokoro"]["available"] is True, providers["kokoro"].get("reason")
    assert providers["melo"]["available"] is True, providers["melo"].get("reason")


@pytest.mark.parametrize(
    ("provider", "voice", "text"),
    [
        ("kokoro", "af_heart", "End to end Kokoro synthesis check."),
        ("melo", "EN-Default", "End to end Melo synthesis check."),
    ],
)
def test_synthesize_returns_wav_audio(tts_base_url: str, provider: str, voice: str, text: str) -> None:
    status, headers, body = _request_json(
        tts_base_url,
        "POST",
        "/v1/synthesize",
        payload={"provider": provider, "voice": voice, "text": text, "speed": 1.0},
    )
    assert status == 200, body.decode("utf-8", errors="replace")
    content_type = (headers.get("content-type") or headers.get("Content-Type") or "").lower()
    assert content_type.startswith("audio/wav"), content_type
    assert len(body) > 1024
    assert body[0:4] == b"RIFF"
    assert body[8:12] == b"WAVE"
