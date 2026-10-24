import importlib.util
from pathlib import Path
import unittest

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


if __name__ == "__main__":
    unittest.main()
