import contextlib
import io
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

from test_keyvault_exec import MANIFEST, REFERENCE, fetch_mock, launcher


PUBLIC_CONFIG = """RUNTIME_PROFILE=azure
APP_URL=https://fixture.example
METADATA_PRIMARY_BACKEND=azure_table
STORAGE_BACKEND=azure_blob
AZURE_STORAGE_CONTAINER=fixture
PYTHON_TTS_URL=http://127.0.0.1:8010
ARTICLEPOD_SECRET_SOURCE=keyvault
ARTICLEPOD_KEYVAULT_MANIFEST=/etc/articlepod/fixture-secrets.json
"""


class PublicConfigurationTests(unittest.TestCase):
    def test_registry_covers_rendered_settings_without_accepting_secret_names(self):
        root = Path(__file__).resolve().parents[3]
        script = (root / "scripts/azure/render-env.sh").read_text(encoding="utf-8")
        rendered = script.split("render_environment() {\n", 1)[1].split("\n}\n", 1)[0]
        names = set(re.findall(r"([A-Z][A-Z0-9_]*)=", rendered))
        self.assertFalse(names - launcher.PUBLIC_ENV_NAMES - launcher.SECRET_ENV_NAMES)
        self.assertFalse(launcher.PUBLIC_ENV_NAMES & launcher.SECRET_ENV_NAMES)
        self.assertFalse(launcher.PUBLIC_ENV_NAMES & launcher.HOST_ENV_NAMES)

    def test_all_registered_secret_values_are_rejected_and_empty_slots_are_removed(self):
        for name in launcher.SECRET_ENV_NAMES:
            with self.subTest(name=name):
                self.assertNotIn(name, launcher.parse_public_environment(PUBLIC_CONFIG + f"{name}=\n"))
                with self.assertRaisesRegex(launcher.SecretLoadError, "^PLAINTEXT_SECRET_IN_PUBLIC_ENVIRONMENT$"):
                    launcher.parse_public_environment(PUBLIC_CONFIG + f"{name}=fixture-retired\n")

    def test_duplicate_fields_including_empty_secrets_are_rejected(self):
        for suffix in (
            "APP_URL=https://second.example\n",
            "ADMIN_PASSWORD=\nADMIN_PASSWORD=\n",
            "ARTICLEPOD_SECRET_SOURCE=environment\n",
        ):
            with self.subTest(suffix=suffix):
                with self.assertRaisesRegex(launcher.SecretLoadError, "^DUPLICATE_PUBLIC_ENVIRONMENT_FIELD$"):
                    launcher.parse_public_environment(PUBLIC_CONFIG + suffix)

    def test_unknown_fields_and_interpreter_overrides_are_rejected(self):
        for name in ("UNREVIEWED_SETTING", "NODE_OPTIONS", "NEXT_PHASE", "PYTHONPATH", "PATH", "BASH_ENV", "AZURE_CLIENT_SECRET"):
            with self.subTest(name=name):
                with self.assertRaisesRegex(launcher.SecretLoadError, "^UNSUPPORTED_PUBLIC_ENVIRONMENT_FIELD$"):
                    launcher.parse_public_environment(PUBLIC_CONFIG + f"{name}=fixture-only\n")

    def test_shell_syntax_and_control_characters_are_not_configuration(self):
        for suffix in ("export LOG_ROOT=/tmp\n", "LOG_ROOT\n", " LOG_ROOT=/tmp\n",
                       "LOG_ROOT='/tmp'\n", 'LOG_ROOT="/tmp"\n', "LOG_ROOT=/tmp \n",
                       "LOG_ROOT=/tmp\\value\n", "LOG_ROOT=/tmp\0value\n"):
            with self.subTest(suffix=suffix), self.assertRaises(launcher.SecretLoadError):
                launcher.parse_public_environment(PUBLIC_CONFIG + suffix)

    def test_bom_crlf_comments_and_literal_values_are_supported_without_expansion(self):
        content = "\ufeff" + PUBLIC_CONFIG.replace("\n", "\r\n") + "# fixture comment\r\nLOG_ROOT=/tmp/$(fixture-command)\r\n"
        result = launcher.parse_public_environment(content)
        self.assertEqual(result["LOG_ROOT"], "/tmp/$(fixture-command)")
        self.assertEqual(result["RUNTIME_PROFILE"], "azure")

    def test_alternate_line_separators_cannot_hide_secret_values(self):
        for separator in ("\r", "\v", "\f", "\x1c", "\x85", "\u2028", "\u2029", "\0"):
            with self.subTest(separator=separator):
                with self.assertRaisesRegex(launcher.SecretLoadError, "^INVALID_PUBLIC_ENVIRONMENT_LINE$"):
                    launcher.parse_public_environment(PUBLIC_CONFIG + f"ADMIN_PASSWORD={separator}#fixture-retired\n")

    def test_vault_mode_and_explicit_runtime_profile_are_required(self):
        for old, new in (
            ("SOURCE=keyvault", "SOURCE=environment"),
            ("RUNTIME_PROFILE=azure", "RUNTIME_PROFILE=simple"),
            ("METADATA_PRIMARY_BACKEND=azure_table", "METADATA_PRIMARY_BACKEND=unknown"),
            ("STORAGE_BACKEND=azure_blob", "STORAGE_BACKEND=local"),
            ("AZURE_STORAGE_CONTAINER=fixture", "AZURE_STORAGE_CONTAINER="),
            ("/etc/articlepod/fixture-secrets.json", "relative.json"),
            ("/etc/articlepod/fixture-secrets.json", ""),
        ):
            with self.subTest(new=new), self.assertRaises(launcher.SecretLoadError):
                launcher.parse_public_environment(PUBLIC_CONFIG.replace(old, new))

    def test_endpoint_credentials_queries_and_fragments_are_not_public_settings(self):
        for endpoint in (
            "https://fixture-user@fixture.example",
            "https://fixture.example?sig=fixture-only",
            "https://fixture.example#fixture",
            "file:///fixture", "https://[invalid", "https://bad host",
        ):
            with self.subTest(endpoint=endpoint), self.assertRaises(launcher.SecretLoadError):
                launcher.parse_public_environment(PUBLIC_CONFIG.replace("https://fixture.example", endpoint))

    def test_only_host_settings_are_inherited_and_file_settings_are_authoritative(self):
        inherited = {
            "Path": "fixture-path", "HOME": "fixture-home", "APP_URL": "https://stale.example",
            "ADMIN_PASSWORD": "fixture-retired", "AZURE_CLIENT_SECRET": "fixture-admin",
            "GITHUB_TOKEN": "fixture-ci", "NODE_OPTIONS": "fixture-options", "NEXT_PHASE": "phase-production-build",
            "UNREGISTERED_SECRET": "fixture-extra",
        }
        original = dict(inherited)
        with patch.object(launcher, "read_protected_text", return_value=PUBLIC_CONFIG):
            result = launcher.load_public_environment(Path(__file__).resolve(), inherited)
        self.assertEqual(inherited, original)
        self.assertEqual(result, {
            "Path": "fixture-path", "HOME": "fixture-home",
            **launcher.parse_public_environment(PUBLIC_CONFIG),
        })

    def test_relative_public_file_is_rejected_before_reading(self):
        with patch.object(launcher, "read_protected_text") as read:
            with self.assertRaisesRegex(launcher.SecretLoadError, "^PUBLIC_ENVIRONMENT_PATH_MUST_BE_ABSOLUTE$"):
                launcher.load_public_environment(Path("relative.env"), {})
            read.assert_not_called()


class ProtectedFileTests(unittest.TestCase):
    def read_fixture(self, content, metadata, kind="PUBLIC_ENVIRONMENT"):
        with tempfile.TemporaryFile(mode="w+b") as source:
            source.write(content)
            source.seek(0)
            with patch.object(launcher.os, "open", return_value=os.dup(source.fileno())):
                with patch.object(launcher.os, "fstat", return_value=metadata):
                    with patch.object(launcher.os, "name", "posix"):
                        return launcher.read_protected_text("fixture-config", kind)

    def test_root_owned_write_protected_file_is_read(self):
        content = PUBLIC_CONFIG.encode("utf-8")
        result = self.read_fixture(content, Mock(st_mode=stat.S_IFREG | 0o640, st_uid=0, st_size=len(content)))
        self.assertEqual(result, PUBLIC_CONFIG)

    def test_unsafe_files_and_ownership_are_rejected(self):
        for mode, uid, size in (
            (stat.S_IFREG | 0o644, 1000, 10),
            (stat.S_IFREG | 0o664, 0, 10),
            (stat.S_IFREG | 0o646, 0, 10),
            (stat.S_IFDIR | 0o755, 0, 10),
            (stat.S_IFIFO | 0o600, 0, 0),
            (stat.S_IFREG | 0o640, 0, 65_537),
        ):
            with self.subTest(mode=mode, uid=uid, size=size), self.assertRaises(launcher.SecretLoadError):
                self.read_fixture(b"fixture", Mock(st_mode=mode, st_uid=uid, st_size=size))

    def test_file_growth_after_stat_is_still_bounded(self):
        for kind in ("PUBLIC_ENVIRONMENT", "MANIFEST"):
            with self.subTest(kind=kind), self.assertRaisesRegex(launcher.SecretLoadError, f"^UNSAFE_{kind}_FILE$"):
                self.read_fixture(b"x" * 65_537, Mock(st_mode=stat.S_IFREG | 0o640, st_uid=0, st_size=1), kind)

    @unittest.skipUnless(os.name == "posix", "Linux file-opening protections")
    def test_final_symlinks_and_fifos_do_not_open_as_regular_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "target"
            target.write_text(PUBLIC_CONFIG)
            link = Path(directory) / "link"
            link.symlink_to(target)
            with self.assertRaises(OSError):
                launcher.read_protected_text(link, "PUBLIC_ENVIRONMENT")
            fifo = Path(directory) / "fifo"
            os.mkfifo(fifo)
            result = subprocess.run(
                [sys.executable, launcher.__file__, "--env-file", str(fifo), "--public-only", "--", "never-executed"],
                capture_output=True, text=True, timeout=5,
            )
            self.assertEqual(result.returncode, 1)
            self.assertEqual(result.stdout, "")
            self.assertEqual(result.stderr, "Key Vault startup blocked: UNSAFE_PUBLIC_ENVIRONMENT_FILE\n")


class PublicCommandTests(unittest.TestCase):
    def arguments(self, *options):
        return ["keyvault-exec.py", *options, "--", "fixture-command", "with spaces", "x;y"]

    def test_candidate_validation_never_executes_reads_a_file_or_contacts_identity(self):
        args = ["keyvault-exec.py", "--check-public-env-stdin"]
        stdout = io.StringIO()
        with patch.object(sys, "argv", args), patch.object(sys, "stdin", Mock(buffer=io.BytesIO(PUBLIC_CONFIG.encode()))):
            with contextlib.redirect_stdout(stdout), patch.object(launcher, "read_protected_text") as read:
                with patch.object(launcher.os, "execvpe") as execute, patch.object(launcher, "load_environment") as load:
                    self.assertEqual(launcher.main(), 0)
        read.assert_not_called()
        execute.assert_not_called()
        load.assert_not_called()
        self.assertEqual(stdout.getvalue(), "")

    def test_invalid_candidates_fail_without_echoing_input(self):
        for content, reason in (
            ((PUBLIC_CONFIG + "ADMIN_PASSWORD=fixture-retired\n").encode(), "PLAINTEXT_SECRET_IN_PUBLIC_ENVIRONMENT"),
            (b"x" * 65_537, "PUBLIC_ENVIRONMENT_TOO_LARGE"),
            (b"\xff", "CONFIGURATION_OR_EXECUTION_FAILED"),
        ):
            args = ["keyvault-exec.py", "--check-public-env-stdin"]
            stdout, stderr = io.StringIO(), io.StringIO()
            with self.subTest(reason=reason), patch.object(sys, "argv", args):
                with patch.object(sys, "stdin", Mock(buffer=io.BytesIO(content))):
                    with contextlib.redirect_stderr(stderr), contextlib.redirect_stdout(stdout):
                        with patch.object(launcher.os, "execvpe") as execute:
                            self.assertEqual(launcher.main(), 1)
                            execute.assert_not_called()
            self.assertEqual(stdout.getvalue(), "")
            self.assertEqual(stderr.getvalue(), f"Key Vault startup blocked: {reason}\n")

    def test_public_only_executes_without_reading_manifest_or_fetching_secrets(self):
        args = self.arguments("--env-file", str(Path(__file__).resolve()), "--public-only")
        with patch.object(sys, "argv", args), patch.object(launcher, "read_protected_text", return_value=PUBLIC_CONFIG):
            with patch.object(launcher, "read_manifest") as manifest, patch.object(launcher, "load_environment") as load:
                with patch.object(launcher.os, "execvpe") as execute:
                    launcher.main()
        manifest.assert_not_called()
        load.assert_not_called()
        command, arguments, environment = execute.call_args.args
        self.assertEqual(command, "fixture-command")
        self.assertEqual(arguments, ["fixture-command", "with spaces", "x;y"])
        self.assertEqual(environment["RUNTIME_PROFILE"], "azure")
        self.assertFalse(set(environment) & launcher.SECRET_ENV_NAMES)

    def test_operations_receive_only_the_configured_versioned_service_secrets(self):
        manifest = {**MANIFEST, "services": {"ops": {"MEDIA_SIGNING_KEY": REFERENCE}}}
        fetch = fetch_mock()
        load = launcher.load_environment
        args = self.arguments("--env-file", str(Path(__file__).resolve()), "--service", "ops")
        with patch.object(sys, "argv", args), patch.dict(os.environ, {"ADMIN_PASSWORD": "fixture-retired", "NEXT_PHASE": "phase-production-build"}):
            with patch.object(launcher, "read_protected_text", return_value=PUBLIC_CONFIG):
                with patch.object(launcher, "read_manifest", return_value=manifest) as read:
                    with patch.object(launcher, "load_environment", side_effect=lambda *args: load(*args, fetch=fetch)):
                        with patch.object(launcher.os, "execvpe") as execute:
                            launcher.main()
        read.assert_called_once_with(Path("/etc/articlepod/fixture-secrets.json"))
        environment = execute.call_args.args[2]
        self.assertEqual(environment["MEDIA_SIGNING_KEY"], "fixture-only-secret")
        self.assertEqual(environment["APP_URL"], "https://fixture.example")
        self.assertNotIn("ADMIN_PASSWORD", environment)
        self.assertNotIn("NEXT_PHASE", environment)
        self.assertEqual(fetch.call_count, 2)

    def test_unsafe_public_input_never_executes_or_prints_content(self):
        args = self.arguments("--env-file", str(Path(__file__).resolve()), "--public-only")
        stderr = io.StringIO()
        with patch.object(sys, "argv", args), contextlib.redirect_stderr(stderr):
            with patch.object(launcher, "read_protected_text", return_value=PUBLIC_CONFIG + "ADMIN_PASSWORD=fixture-retired\n"):
                with patch.object(launcher.os, "execvpe") as execute, patch.object(launcher, "load_environment") as load:
                    self.assertEqual(launcher.main(), 1)
        execute.assert_not_called()
        load.assert_not_called()
        self.assertEqual(stderr.getvalue(), "Key Vault startup blocked: PLAINTEXT_SECRET_IN_PUBLIC_ENVIRONMENT\n")

    def test_ambiguous_modes_are_rejected_before_access(self):
        for options in (
            ("--public-only",),
            ("--env-file", "fixture", "--manifest", "fixture.json", "--service", "ops"),
            ("--env-file", "fixture", "--public-only", "--service", "ops"),
            ("--env-file", "fixture"),
            ("--env-file", "fixture", "--list-secret-names"),
            ("--check-public-env-stdin",),
        ):
            with self.subTest(options=options), patch.object(sys, "argv", self.arguments(*options)):
                with contextlib.redirect_stderr(io.StringIO()), patch.object(launcher, "read_protected_text") as read:
                    with self.assertRaises(SystemExit) as error:
                        launcher.main()
                    self.assertEqual(error.exception.code, 2)
                    read.assert_not_called()

    @unittest.skipUnless(os.name == "posix", "Process replacement is exercised on Linux")
    def test_real_public_child_receives_no_inherited_credentials(self):
        program = """
import importlib.util, os, sys
spec = importlib.util.spec_from_file_location("fixtures", sys.argv[1])
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)
launcher = fixtures.launcher
launcher.read_protected_text = lambda *_: fixtures.PUBLIC_CONFIG + "LOG_ROOT=/tmp/$(fixture-command)\\n"
os.environ.update(ADMIN_PASSWORD="fixture-retired", GITHUB_TOKEN="fixture-ci", NODE_OPTIONS="fixture-options")
child = (
    "import os; "
    "assert os.environ['RUNTIME_PROFILE'] == 'azure'; "
    "assert os.environ['LOG_ROOT'] == '/tmp/$(fixture-command)'; "
    "assert not any(name in os.environ for name in ('ADMIN_PASSWORD', 'GITHUB_TOKEN', 'NODE_OPTIONS')); "
    "print('public-child-ok')"
)
sys.argv = ["keyvault-exec.py", "--env-file", sys.argv[1], "--public-only", "--", sys.executable, "-c", child]
launcher.main()
"""
        result = subprocess.run(
            [sys.executable, "-c", program, str(Path(__file__).resolve())],
            capture_output=True, text=True, timeout=15,
            env={**os.environ, "PYTHONPATH": str(Path(__file__).parent)},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "public-child-ok\n")


if __name__ == "__main__":
    unittest.main()
