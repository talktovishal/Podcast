"""Verify new provider regressions reject controlled faults in disposable copies."""

import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


SERVICE_ROOT = Path(__file__).resolve().parents[1]
MELO_TEST = "test_melo_selected_provider_audio_error_and_cleanup"
VOICE_TEST = "test_rejected_voice_never_enters_model_or_leaks_request"
MUTATIONS = [
    ("cross-provider-discovery", MELO_TEST, [
        ("_provider_health(payload.provider)", "_provider_health()", 1),
    ]),
    ("incorrect-mono-audio", MELO_TEST, [
        ("audio = np.mean(audio, axis=1)", "audio = audio[:, 0]", 1),
    ]),
    ("leaked-temporary-audio", MELO_TEST, [
        ("os.remove(temp_path)", "pass", 1),
    ]),
    ("unsafe-error-detail", MELO_TEST, [
        ("raise HTTPException(status_code=500, detail=GENERIC_AUDIO_FAILURE_DETAIL) from exc",
         "raise HTTPException(status_code=500, detail=str(exc)) from exc", 2),
    ]),
    ("leaked-active-request", MELO_TEST, [
        ("if response is None:\n            _finish_synth_request()", "if response is None:\n            pass", 1),
    ]),
    ("missing-voice-validation", VOICE_TEST, [
        ("if payload.voice not in KOKORO_ENGLISH_VOICES:", "if False:", 1),
        ("if payload.voice not in MELO_ENGLISH_VOICES:", "if False:", 1),
    ]),
]


def main() -> None:
    source = (SERVICE_ROOT / "app/main.py").read_text()
    with tempfile.TemporaryDirectory(prefix="articlepod-provider-gates-") as directory:
        for name, test_name, replacements in MUTATIONS:
            case = Path(directory) / name
            shutil.copytree(SERVICE_ROOT / "app", case / "app", ignore=shutil.ignore_patterns("__pycache__"))
            (case / "tests").mkdir()
            (case / "tmp").mkdir()
            shutil.copy2(SERVICE_ROOT / "tests/test_kokoro_streaming.py", case / "tests/test_kokoro_streaming.py")
            mutated = source
            for old, new, count in replacements:
                if mutated.count(old) != count:
                    raise RuntimeError(f"{name}: mutation target changed; update the controlled check")
                mutated = mutated.replace(old, new)
            (case / "app/main.py").write_text(mutated)
            result = subprocess.run(
                [sys.executable, "-m", "pytest", "-q", "tests/test_kokoro_streaming.py", "-k", test_name],
                cwd=case,
                env={
                    **os.environ, "PYTHONPATH": str(case), "TMPDIR": str(case / "tmp"),
                    "LOG_ROOT": str(case / "logs"), "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
                },
                capture_output=True, text=True, timeout=60, check=False,
            )
            output = result.stdout + result.stderr
            expected_failure = f"FAILED tests/test_kokoro_streaming.py::{test_name}"
            if result.returncode != 1 or expected_failure not in output:
                raise RuntimeError(f"{name}: expected the selected regression to fail\n{output[-4000:]}")
            print(f"{name}: selected regression rejected the controlled fault")


if __name__ == "__main__":
    main()
