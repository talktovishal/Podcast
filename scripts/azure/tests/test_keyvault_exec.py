import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
import urllib.error


path = Path(__file__).parents[1] / "keyvault-exec.py"
spec = importlib.util.spec_from_file_location("keyvault_exec", path)
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)

VERSION = "0" * 32
VAULT = "https://fixture-vault.vault.azure.net"
REFERENCE = f"fixture-secret/{VERSION}"
MANIFEST = {
    "vault_url": VAULT,
    "services": {
        "web": {"MEDIA_SIGNING_KEY": REFERENCE},
        "python-tts": {"PYTHON_TTS_SECRET": REFERENCE},
    },
}


def secret_response(**overrides):
    return {
        "id": f"{VAULT}/secrets/{REFERENCE}",
        "value": "fixture-only-secret",
        "attributes": {"enabled": True},
        **overrides,
    }


def fetch_mock(response=None):
    return Mock(side_effect=[
        {"access_token": "fixture-only-identity-token"},
        secret_response() if response is None else response,
    ])


class ManifestTests(unittest.TestCase):
    def test_accepts_only_named_service_references(self):
        self.assertEqual(
            launcher.validate_manifest(MANIFEST, "web"),
            (VAULT, {"MEDIA_SIGNING_KEY": REFERENCE}),
        )

    def test_rejects_non_azure_or_credential_bearing_vault_urls(self):
        for url in (
            "http://fixture-vault.vault.azure.net",
            f"{VAULT}.example.com", f"{VAULT}/", f"{VAULT}?secret=fixture",
            "https://user:fixture@fixture-vault.vault.azure.net",
            "https://127.0.0.1",
        ):
            with self.subTest(url=url):
                manifest = {**MANIFEST, "vault_url": url}
                with self.assertRaisesRegex(launcher.SecretLoadError, "^INVALID_VAULT_URL$"):
                    launcher.validate_manifest(manifest, "web")

    def test_rejects_unknown_and_missing_fields(self):
        for manifest in (
            [], {}, {**MANIFEST, "password": "fixture-only"},
            {**MANIFEST, "services": {}},
            {**MANIFEST, "services": {"unconfigured": {"MEDIA_SIGNING_KEY": REFERENCE}}},
            {**MANIFEST, "services": {"web": {}}},
            {**MANIFEST, "services": {"web": {"PATH": REFERENCE}}},
        ):
            with self.subTest(manifest=manifest):
                with self.assertRaises(launcher.SecretLoadError):
                    launcher.validate_manifest(manifest, "web")

    def test_requires_exact_versions_and_validates_other_service_maps(self):
        for reference in ("fixture-secret", "fixture-secret/latest", "../secret/" + VERSION, 42):
            manifest = copy.deepcopy(MANIFEST)
            manifest["services"]["python-tts"]["PYTHON_TTS_SECRET"] = reference
            with self.subTest(reference=reference):
                with self.assertRaisesRegex(launcher.SecretLoadError, "^SECRET_VERSION_REQUIRED$"):
                    launcher.validate_manifest(manifest, "web")

    def test_missing_service_is_not_a_plaintext_fallback(self):
        with self.assertRaisesRegex(launcher.SecretLoadError, "^SERVICE_NOT_CONFIGURED$"):
            launcher.validate_manifest(MANIFEST, "worker")

    def test_duplicate_json_fields_are_rejected(self):
        with self.assertRaisesRegex(launcher.SecretLoadError, "^DUPLICATE_JSON_FIELD$"):
            json.loads('{"web": {}, "web": {}}', object_pairs_hook=launcher.unique_object)

    def test_untrusted_file_ownership_or_write_access_is_rejected(self):
        for uid, mode in ((1000, 0o644), (0, 0o664), (0, 0o646)):
            metadata = Mock(st_mode=stat.S_IFREG | mode, st_uid=uid, st_size=10)
            with self.subTest(uid=uid, mode=mode), tempfile.TemporaryFile(mode="w+") as source:
                with patch.object(launcher.os, "open", return_value=os.dup(source.fileno())):
                    with patch.object(launcher.os, "fstat", return_value=metadata):
                        with patch.object(launcher.os, "name", "posix"):
                            with self.assertRaisesRegex(launcher.SecretLoadError, "^MANIFEST_MUST_BE_ROOT"):
                                launcher.read_manifest("fixture-manifest")


class EnvironmentTests(unittest.TestCase):
    def test_registry_covers_existing_runtime_secret_variables(self):
        root = path.parents[2]
        definitions = (
            root / "apps/web/src/lib/env.ts",
            root / "apps/worker/src/lib/env.ts",
            root / "services/python-tts/app/main.py",
        )
        observed = set()
        for definition in definitions:
            source = definition.read_text(encoding="utf-8")
            names = re.findall(r'process\.env\.([A-Z][A-Z0-9_]*)|os\.getenv\("([A-Z][A-Z0-9_]*)"', source)
            observed.update(
                name for pair in names for name in pair
                if re.search(r"(PASSWORD|SECRET|TOKEN|API_KEY|CONNECTION_STRING|DATABASE_URL)$", name)
            )
        self.assertFalse(observed - launcher.SECRET_ENV_NAMES)

    def test_injects_only_service_secrets_without_mutating_input(self):
        inherited = {name: "fixture-retired" for name in launcher.SECRET_ENV_NAMES}
        inherited["PATH"] = "fixture-path"
        fetch = fetch_mock()
        result = launcher.load_environment(MANIFEST, "web", inherited, fetch=fetch)
        self.assertEqual(result, {"PATH": "fixture-path", "MEDIA_SIGNING_KEY": "fixture-only-secret"})
        self.assertEqual(inherited["ADMIN_PASSWORD"], "fixture-retired")
        identity_call, vault_call = fetch.call_args_list
        self.assertEqual(identity_call.args[1], {"Metadata": "true"})
        self.assertTrue(identity_call.args[0].startswith("http://169.254.169.254/metadata/"))
        self.assertNotIn("client_id", identity_call.args[0])
        self.assertEqual(vault_call.args[0], f"{VAULT}/secrets/{REFERENCE}?api-version=7.4")
        self.assertEqual(vault_call.args[1], {"Authorization": "Bearer fixture-only-identity-token"})

    def test_aliases_share_one_version_lookup(self):
        manifest = copy.deepcopy(MANIFEST)
        manifest["services"]["web"]["DIGEST_SCHEDULER_SECRET"] = REFERENCE
        fetch = fetch_mock()
        result = launcher.load_environment(manifest, "web", {}, fetch=fetch)
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual(result["MEDIA_SIGNING_KEY"], result["DIGEST_SCHEDULER_SECRET"])

    def test_malformed_manifest_does_not_contact_identity(self):
        fetch = Mock()
        with self.assertRaises(launcher.SecretLoadError):
            launcher.load_environment({}, "web", {}, fetch=fetch)
        fetch.assert_not_called()

    def test_missing_identity_token_blocks_vault_request(self):
        for value in (None, "", " ", 123):
            fetch = Mock(return_value={"access_token": value})
            with self.subTest(value=value):
                with self.assertRaisesRegex(launcher.SecretLoadError, "^IDENTITY_TOKEN_MISSING$"):
                    launcher.load_environment(MANIFEST, "web", {}, fetch=fetch)
                self.assertEqual(fetch.call_count, 1)

    def test_missing_empty_or_nul_secret_is_rejected(self):
        for value in (None, "", "fixture\0secret", 123):
            with self.subTest(value=value):
                with self.assertRaisesRegex(launcher.SecretLoadError, "^KEYVAULT_SECRET_INVALID$"):
                    launcher.load_environment(
                        MANIFEST, "web", {}, fetch=fetch_mock(secret_response(value=value)),
                    )

    def test_wrong_returned_version_is_rejected(self):
        with self.assertRaisesRegex(launcher.SecretLoadError, "^KEYVAULT_SECRET_VERSION_MISMATCH$"):
            launcher.load_environment(
                MANIFEST, "web", {}, fetch=fetch_mock(secret_response(id=f"{VAULT}/secrets/other/{VERSION}")),
            )

    def test_disabled_expired_future_or_invalid_attributes_are_rejected(self):
        for attributes in (
            None, {}, {"enabled": False}, {"enabled": "true"},
            {"enabled": True, "exp": 1}, {"enabled": True, "nbf": 10**15},
            {"enabled": True, "exp": True}, {"enabled": True, "exp": float("nan")},
        ):
            with self.subTest(attributes=attributes):
                with self.assertRaises(launcher.SecretLoadError):
                    launcher.load_environment(
                        MANIFEST, "web", {}, fetch=fetch_mock(secret_response(attributes=attributes)),
                    )

    def test_partial_secret_failure_never_returns_environment(self):
        manifest = copy.deepcopy(MANIFEST)
        manifest["services"]["web"]["ADMIN_PASSWORD"] = f"fixture-second/{VERSION}"
        fetch = Mock(side_effect=[
            {"access_token": "fixture-only"}, secret_response(),
            launcher.SecretLoadError("KEYVAULT_HTTP_403"),
        ])
        with self.assertRaisesRegex(launcher.SecretLoadError, "^KEYVAULT_HTTP_403$"):
            launcher.load_environment(manifest, "web", {"ADMIN_PASSWORD": "fixture-retired"}, fetch=fetch)


class HttpTests(unittest.TestCase):
    def test_retries_transient_failures_only_with_a_bound(self):
        for status in (429, 500, 502, 503, 504):
            opener = Mock()
            opener.open.side_effect = [
                urllib.error.HTTPError("fixture", status, "fixture-private", {}, None)
                for _ in range(3)
            ]
            sleep = Mock()
            with self.subTest(status=status):
                with self.assertRaisesRegex(launcher.SecretLoadError, f"^KEYVAULT_HTTP_{status}$"):
                    launcher.request_json("https://fixture", {}, "KEYVAULT", opener=opener, sleep=sleep)
                self.assertEqual(opener.open.call_count, 3)
                self.assertEqual([call.args[0] for call in sleep.call_args_list], [1, 2])

    def test_permissions_missing_versions_and_redirects_fail_without_retry(self):
        for status in (301, 302, 307, 401, 403, 404):
            opener = Mock()
            opener.open.side_effect = urllib.error.HTTPError("fixture", status, "fixture-private", {}, None)
            sleep = Mock()
            with self.subTest(status=status):
                with self.assertRaisesRegex(launcher.SecretLoadError, f"^KEYVAULT_HTTP_{status}$"):
                    launcher.request_json("https://fixture", {}, "KEYVAULT", opener=opener, sleep=sleep)
                opener.open.assert_called_once()
                sleep.assert_not_called()

    def test_transient_failure_can_recover(self):
        opener = Mock()
        opener.open.side_effect = [TimeoutError("fixture-private"), io.BytesIO(b'{"ok":true}')]
        self.assertEqual(
            launcher.request_json("https://fixture", {}, "IDENTITY", opener=opener, sleep=Mock()),
            {"ok": True},
        )

    def test_connection_failures_are_redacted(self):
        opener = Mock()
        opener.open.side_effect = urllib.error.URLError("fixture-private-token")
        with self.assertRaisesRegex(launcher.SecretLoadError, "^IDENTITY_CONNECTION_FAILED$"):
            launcher.request_json("https://fixture", {}, "IDENTITY", opener=opener, sleep=Mock())
        self.assertEqual(opener.open.call_count, 3)

    def test_invalid_and_oversized_responses_are_redacted(self):
        for payload in (b"fixture-private-secret", b'["fixture"]', b"\xff", b"x" * 1_048_577):
            opener = Mock()
            opener.open.return_value = io.BytesIO(payload)
            with self.subTest(size=len(payload)):
                with self.assertRaises(launcher.SecretLoadError) as raised:
                    launcher.request_json("https://fixture", {}, "KEYVAULT", opener=opener)
                self.assertNotIn("fixture-private", str(raised.exception))

    def test_proxies_and_redirects_are_disabled(self):
        opener = Mock()
        opener.open.return_value = io.BytesIO(b"{}")
        with patch.object(launcher.urllib.request, "build_opener", return_value=opener) as build:
            launcher.request_json("https://fixture", {}, "KEYVAULT")
        handlers = build.call_args.args
        self.assertEqual(handlers[0].proxies, {})
        self.assertIsInstance(handlers[1], launcher.NoRedirects)
        self.assertIsNone(handlers[1].redirect_request(None, None, 302, "", {}, "https://elsewhere"))


class CommandTests(unittest.TestCase):
    def test_failure_does_not_execute_child_or_print_values(self):
        args = ["keyvault-exec.py", "--manifest", "fixture.json", "--service", "web", "--", "node"]
        stderr = io.StringIO()
        with patch.object(sys, "argv", args), contextlib.redirect_stderr(stderr):
            with patch.object(launcher, "read_manifest", side_effect=OSError("fixture-private-secret")):
                with patch.object(launcher.os, "execvpe") as execute:
                    self.assertEqual(launcher.main(), 1)
                    execute.assert_not_called()
        self.assertEqual(stderr.getvalue(), "Key Vault startup blocked: CONFIGURATION_OR_EXECUTION_FAILED\n")

    def test_all_secrets_resolve_before_exec_and_arguments_are_preserved(self):
        args = ["keyvault-exec.py", "--manifest", "fixture.json", "--service", "web", "--", "node", "server.mjs"]
        with patch.object(sys, "argv", args), patch.object(launcher, "read_manifest", return_value=MANIFEST):
            with patch.object(launcher, "load_environment", return_value={"MEDIA_SIGNING_KEY": "fixture-only"}):
                with patch.object(launcher.os, "execvpe") as execute:
                    launcher.main()
                    execute.assert_called_once_with(
                        "node", ["node", "server.mjs"], {"MEDIA_SIGNING_KEY": "fixture-only"},
                    )


if __name__ == "__main__":
    unittest.main()
