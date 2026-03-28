import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from app import main


def test_log_event_splits_activity_and_errors(tmp_path: Path) -> None:
    original_events_path = main.LOG_EVENTS_PATH
    original_errors_path = main.LOG_ERRORS_PATH
    original_retention = main.LOG_RETENTION_DAYS
    original_error_retention = main.LOG_ERROR_RETENTION_DAYS

    main.LOG_EVENTS_PATH = tmp_path / "events" / "python-tts" / "events.log.jsonl"
    main.LOG_ERRORS_PATH = tmp_path / "errors" / "python-tts" / "errors.log.jsonl"
    main.LOG_RETENTION_DAYS = 7
    main.LOG_ERROR_RETENTION_DAYS = 30

    try:
        main._log_event("INFO", "healthy")
        main._log_event("ERROR", "boom", error_code="INTERNAL_ERROR")

        events_content = main.LOG_EVENTS_PATH.read_text(encoding="utf-8").strip().splitlines()
        errors_content = main.LOG_ERRORS_PATH.read_text(encoding="utf-8").strip().splitlines()

        assert len(events_content) == 1
        assert len(errors_content) == 1
        assert '"level": "INFO"' in events_content[0]
        assert '"msg": "healthy"' in events_content[0]
        assert '"level": "ERROR"' in errors_content[0]
        assert '"error_code": "INTERNAL_ERROR"' in errors_content[0]
    finally:
        main.LOG_EVENTS_PATH = original_events_path
        main.LOG_ERRORS_PATH = original_errors_path
        main.LOG_RETENTION_DAYS = original_retention
        main.LOG_ERROR_RETENTION_DAYS = original_error_retention
