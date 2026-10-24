import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

path = Path(__file__).parents[1] / "publication-preflight.py"
spec = importlib.util.spec_from_file_location("publication_preflight", path)
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class InventoryOutputTests(unittest.TestCase):
    def test_only_fixed_status_fields_are_accepted(self):
        import json
        status = {key: True for key in preflight.BOOLEAN_FIELDS - {"check_error"}}
        self.assertEqual(preflight.safe_result(json.dumps(status)), status)

    def test_secret_bearing_fields_are_rejected(self):
        with self.assertRaises(ValueError):
            preflight.safe_result('{"password": "fixture-not-a-real-password"}')

    def test_strings_cannot_masquerade_as_flags(self):
        with self.assertRaises(ValueError):
            preflight.safe_result('{"web_running": "secret-bearing-text"}')

    def test_incomplete_inventory_is_rejected(self):
        with self.assertRaises(ValueError):
            preflight.safe_result('{"web_running": true}')

    def test_remote_program_is_valid_python(self):
        compile(preflight.REMOTE_CHECK, "<remote-check>", "exec")

    def test_host_key_error_is_classified_without_echoing_host(self):
        result = preflight.ssh_failure_code("private-host: Host key verification failed.")
        self.assertEqual(result, "SSH_HOST_KEY_NOT_TRUSTED")

    def test_unknown_ssh_error_does_not_echo_payload(self):
        self.assertEqual(preflight.ssh_failure_code("untrusted remote output"), "SSH_REMOTE_CHECK_FAILED")

    def test_authentication_denial_is_distinct_from_host_verification(self):
        self.assertEqual(
            preflight.ssh_failure_code("Permission denied (publickey)."),
            "SSH_AUTHENTICATION_DENIED",
        )

    def test_changed_host_key_is_not_treated_as_a_missing_pin(self):
        self.assertEqual(
            preflight.ssh_failure_code("WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! Host key verification failed."),
            "SSH_HOST_KEY_CHANGED",
        )
        self.assertEqual(
            preflight.ssh_failure_code("No ED25519 host key is known for private-host and you have requested strict checking."),
            "SSH_HOST_KEY_NOT_PINNED",
        )

    def test_pin_diagnostics_only_return_booleans(self):
        results = [Mock(returncode=0), Mock(returncode=1, stdout="")]
        with patch.object(preflight.subprocess, "run", side_effect=results) as run:
            result = preflight.pin_diagnostics("fixture-host", Path("fixture-known-hosts"), "ssh-ed25519 fixture-key")
        self.assertEqual(result, {
            "pin_diagnostics_available": True,
            "pin_file_has_valid_keys": True,
            "pin_file_matches_target": False,
            "pin_payload_is_single_public_key": True,
        })
        self.assertEqual([call.args[0][0] for call in run.call_args_list], ["ssh-keygen", "ssh-keygen"])

    def test_matching_pin_does_not_echo_host_or_key(self):
        results = [Mock(returncode=0), Mock(returncode=0, stdout="fixture-private-output")]
        with patch.object(preflight.subprocess, "run", side_effect=results):
            result = preflight.pin_diagnostics("fixture-host", Path("fixture-known-hosts"), "fixture-host ssh-ed25519 fixture-key")
        self.assertTrue(result["pin_file_matches_target"])
        self.assertFalse(result["pin_payload_is_single_public_key"])
        self.assertTrue(all(type(value) is bool for value in result.values()))

    def test_diagnostic_failure_preserves_a_redacted_unavailable_result(self):
        with patch.object(preflight.subprocess, "run", side_effect=OSError("fixture-private-output")):
            self.assertEqual(
                preflight.pin_diagnostics("fixture-host", Path("fixture-known-hosts"), "fixture-input"),
                {"pin_diagnostics_available": False},
            )


if __name__ == "__main__":
    unittest.main()
