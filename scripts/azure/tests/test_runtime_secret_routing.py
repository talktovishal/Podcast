import importlib.util
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from test_keyvault_exec import launcher


ROOT = Path(__file__).resolve().parents[3]
BASH = shutil.which("bash")
guard_spec = importlib.util.spec_from_file_location("legacy_guard", ROOT / "scripts/azure/assert-legacy-deploy.py")
guard = importlib.util.module_from_spec(guard_spec)
guard_spec.loader.exec_module(guard)


def clean_environment():
    environment = dict(os.environ)
    for name in launcher.SECRET_ENV_NAMES | {"ARTICLEPOD_SECRET_SOURCE", "ARTICLEPOD_KEYVAULT_MANIFEST"}:
        environment.pop(name, None)
    return environment


@unittest.skipUnless(BASH, "Bash is required for runtime routing checks")
class RoutingTests(unittest.TestCase):
    def run_router(self, service="web", arguments=None, settings=None):
        environment = clean_environment()
        environment.update(settings or {})
        return subprocess.run(
            [BASH, (ROOT / "scripts/azure/runtime-exec.sh").as_posix(), service]
            + (arguments or [BASH, "-c", "printf 'child-started'"]),
            env=environment, capture_output=True, text=True, timeout=15,
        )

    def test_legacy_default_preserves_arguments_and_environment(self):
        result = self.run_router(
            arguments=[BASH, "-c", 'printf "%s|%s|%s" "$ADMIN_PASSWORD" "$1" "$2"', "_", "with spaces", "x;y"],
            settings={"ADMIN_PASSWORD": "fixture-legacy"},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "fixture-legacy|with spaces|x;y")

    def test_explicit_legacy_mode_is_supported(self):
        result = self.run_router(settings={"ARTICLEPOD_SECRET_SOURCE": "environment"})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "child-started")

    def test_unknown_or_empty_mode_never_starts_child(self):
        for mode in ("", "invalid"):
            with self.subTest(mode=mode):
                result = self.run_router(settings={"ARTICLEPOD_SECRET_SOURCE": mode})
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "")
                self.assertIn("invalid secret source", result.stderr)

    def test_missing_vault_manifest_is_not_a_plaintext_fallback(self):
        result = self.run_router(settings={
            "ARTICLEPOD_SECRET_SOURCE": "keyvault",
            "ARTICLEPOD_KEYVAULT_MANIFEST": "/missing-articlepod-fixture-manifest.json",
            "ADMIN_PASSWORD": "fixture-retired",
        })
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertIn("Key Vault startup blocked:", result.stderr)
        self.assertNotIn("fixture-retired", result.stderr)

    def test_relative_or_empty_manifest_path_is_rejected(self):
        for manifest in ("", "relative.json"):
            with self.subTest(manifest=manifest):
                result = self.run_router(settings={
                    "ARTICLEPOD_SECRET_SOURCE": "keyvault",
                    "ARTICLEPOD_KEYVAULT_MANIFEST": manifest,
                })
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "")
                self.assertIn("absolute Key Vault manifest", result.stderr)

    def test_unknown_service_is_rejected(self):
        result = self.run_router(service="unknown")
        self.assertEqual(result.returncode, 64)
        self.assertEqual(result.stdout, "")

    def test_secret_name_listing_needs_no_manifest_or_identity(self):
        result = subprocess.run(
            [BASH, "-c", 'python3 "$1" --list-secret-names', "_",
             (ROOT / "scripts/azure/keyvault-exec.py").as_posix()],
            env=clean_environment(), capture_output=True, text=True, timeout=15,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(set(result.stdout.splitlines()), launcher.SECRET_ENV_NAMES)


@unittest.skipUnless(BASH, "Bash is required for environment rendering checks")
class RenderingTests(unittest.TestCase):
    def render(self, settings=None, existing=None):
        environment = clean_environment()
        environment.update({
            "APP_URL": "https://fixture.example",
            "STORAGE_BACKEND": "azure_blob",
            "AZURE_STORAGE_CONTAINER": "fixture",
            "PYTHON_TTS_URL": "http://127.0.0.1:8010",
            "METADATA_PRIMARY_BACKEND": "azure_table",
            "AZURE_TABLE_CONNECTION_STRING": "fixture-table-connection",
            "AZURE_STORAGE_CONNECTION_STRING": "fixture-storage-connection",
            "ADMIN_PASSWORD": "fixture-admin",
            "MEDIA_SIGNING_KEY": "m" * 64,
            "DIGEST_SCHEDULER_SECRET": "d" * 64,
        })
        environment.update(settings or {})
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "rendered.env"
            environment["OUT_FILE"] = output.as_posix()
            if existing is not None:
                output.write_text(existing, encoding="utf-8")
            result = subprocess.run(
                [BASH, (ROOT / "scripts/azure/render-env.sh").as_posix()],
                env=environment, capture_output=True, text=True, timeout=15,
            )
            content = output.read_text(encoding="utf-8") if output.exists() else None
            return result, content

    def test_legacy_values_and_explicit_signing_material_are_unchanged(self):
        result, content = self.render()
        self.assertEqual(result.returncode, 0, result.stderr)
        values = dict(line.split("=", 1) for line in content.splitlines())
        self.assertEqual(values["ADMIN_PASSWORD"], "fixture-admin")
        self.assertEqual(values["AZURE_STORAGE_CONNECTION_STRING"], "fixture-storage-connection")
        self.assertEqual(values["MEDIA_SIGNING_KEY"], "m" * 64)
        self.assertEqual(values["DIGEST_SCHEDULER_SECRET"], "d" * 64)
        self.assertNotIn("ARTICLEPOD_SECRET_SOURCE", values)

    def test_vault_mode_cannot_persist_any_registered_secret(self):
        settings = {name: f"fixture-sensitive-{name}" for name in launcher.SECRET_ENV_NAMES}
        settings.update({
            "ARTICLEPOD_SECRET_SOURCE": "keyvault",
            "DIGEST_SUMMARY_PROVIDER": "azure_openai",
            "AZURE_OPENAI_BASE_URL": "https://fixture.openai.azure.com",
        })
        result, content = self.render(settings)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("fixture-sensitive-", content + result.stdout + result.stderr)
        values = dict(line.split("=", 1) for line in content.splitlines())
        for name in launcher.SECRET_ENV_NAMES:
            self.assertIn(values.get(name), (None, ""), name)
        self.assertEqual(values["ARTICLEPOD_SECRET_SOURCE"], "keyvault")
        self.assertEqual(values["ARTICLEPOD_KEYVAULT_MANIFEST"], "/etc/articlepod/keyvault-secrets.json")
        self.assertEqual(values["DIGEST_SUMMARY_PROVIDER"], "azure_openai")
        self.assertEqual(values["APP_URL"], "https://fixture.example")
        public = launcher.parse_public_environment(content)
        self.assertEqual(public["METADATA_PRIMARY_BACKEND"], "azure_table")
        self.assertFalse(set(public) & launcher.SECRET_ENV_NAMES)

    def test_vault_mode_preserves_every_rendered_nonsecret_setting(self):
        legacy_result, legacy = self.render()
        vault_result, vault = self.render({"ARTICLEPOD_SECRET_SOURCE": "keyvault"})
        self.assertEqual(legacy_result.returncode, 0, legacy_result.stderr)
        self.assertEqual(vault_result.returncode, 0, vault_result.stderr)
        public = launcher.parse_public_environment(vault)
        public.pop("ARTICLEPOD_SECRET_SOURCE")
        public.pop("ARTICLEPOD_KEYVAULT_MANIFEST")
        legacy_values = dict(line.split("=", 1) for line in legacy.splitlines())
        self.assertEqual(public, {
            name: value for name, value in legacy_values.items()
            if name not in launcher.SECRET_ENV_NAMES
        })

    def test_invalid_configuration_does_not_overwrite_existing_output(self):
        for settings in (
            {"ARTICLEPOD_SECRET_SOURCE": ""},
            {"ARTICLEPOD_SECRET_SOURCE": "invalid"},
            {"ARTICLEPOD_SECRET_SOURCE": "keyvault", "ARTICLEPOD_KEYVAULT_MANIFEST": "relative.json"},
            {"ARTICLEPOD_SECRET_SOURCE": "keyvault", "ARTICLEPOD_KEYVAULT_MANIFEST": "/etc/fixture\nINJECTED=value"},
            {"ARTICLEPOD_SECRET_SOURCE": "keyvault", "AZURE_OPENAI_BASE_URL": "https://fixture.openai.azure.com", "DIGEST_SUMMARY_PROVIDER": ""},
            {"ARTICLEPOD_SECRET_SOURCE": "keyvault", "AZURE_STORAGE_ACCOUNT_URL": "https://fixture.blob.core.windows.net?sig=fixture-sensitive-url"},
            {"ARTICLEPOD_SECRET_SOURCE": "keyvault", "LOG_ROOT": "/tmp\nADMIN_PASSWORD=fixture-sensitive-injection"},
            {"ARTICLEPOD_SECRET_SOURCE": "keyvault", "LOG_ROOT": "/tmp\nNEXT_PHASE=phase-production-build"},
            {"ARTICLEPOD_SECRET_SOURCE": "keyvault", "LOG_ROOT": "/tmp\x85#fixture-sensitive-hidden"},
            {"ADMIN_PASSWORD": ""},
        ):
            with self.subTest(settings=settings):
                result, content = self.render(settings, existing="preserve-existing-output")
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(content, "preserve-existing-output")
                self.assertNotIn("fixture-sensitive", result.stdout + result.stderr)


class UnitWiringTests(unittest.TestCase):
    def test_services_keep_original_commands_behind_explicit_router(self):
        commands = {
            "web": "cd /opt/articlepod/apps/web && export RUNTIME_PROFILE=azure && npm run prisma:generate:ensure && exec node ../../scripts/azure/run-next-server.mjs",
            "worker": "cd /opt/articlepod/apps/worker && export RUNTIME_PROFILE=azure && npm run prisma:generate:ensure && exec ./node_modules/.bin/tsx src/index.ts",
            "worker-overflow": "cd /opt/articlepod/apps/worker && export RUNTIME_PROFILE=azure && npm run prisma:generate:ensure && exec ./node_modules/.bin/tsx src/index.ts",
            "python-tts": "cd /opt/articlepod/services/python-tts && ./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8010 --workers 1",
        }
        for service, command in commands.items():
            with self.subTest(service=service):
                unit = (ROOT / f"infra/systemd/articlepod-{service}.service").read_text()
                starts = [line.removeprefix("ExecStart=") for line in unit.splitlines() if line.startswith("ExecStart=")]
                self.assertEqual(len(starts), 1)
                self.assertEqual(shlex.split(starts[0]), [
                    "/usr/bin/env", "bash", "/opt/articlepod/scripts/azure/runtime-exec.sh",
                    service, "/usr/bin/env", "bash", "-lc", command,
                ])


class DeploymentGuardTests(unittest.TestCase):
    def test_legacy_and_missing_environment_files_are_accepted(self):
        with patch.dict(os.environ, {"ARTICLEPOD_SECRET_SOURCE": "environment"}):
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "fixture.env"
                guard.assert_legacy(path)
                for content in (
                    "ADMIN_PASSWORD=fixture-only\n",
                    "ARTICLEPOD_SECRET_SOURCE=environment\n",
                    '  ARTICLEPOD_SECRET_SOURCE = "environment"\n',
                ):
                    path.write_text(content, encoding="utf-8")
                    guard.assert_legacy(path)

    def test_existing_vault_or_ambiguous_configuration_cannot_be_overwritten(self):
        with patch.dict(os.environ, {"ARTICLEPOD_SECRET_SOURCE": "environment"}):
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "fixture.env"
                for content in (
                    "ARTICLEPOD_SECRET_SOURCE=keyvault\n",
                    "ARTICLEPOD_SECRET_SOURCE=environment\nARTICLEPOD_SECRET_SOURCE=keyvault\n",
                    "ARTICLEPOD_SECRET_SOURCE=\n",
                    "ARTICLEPOD_SECRET_SOURCE=unknown\n",
                    "  ARTICLEPOD_SECRET_SOURCE = keyvault\n",
                    '\ufeffARTICLEPOD_SECRET_SOURCE="keyvault"\n',
                ):
                    with self.subTest(content=content):
                        path.write_text(content, encoding="utf-8")
                        with self.assertRaisesRegex(ValueError, "^LEGACY_DEPLOY_CANNOT_OVERWRITE"):
                            guard.assert_legacy(path)
                        self.assertEqual(path.read_text(encoding="utf-8"), content)

    def test_legacy_helper_cannot_activate_vault_mode(self):
        for mode in ("keyvault", "", "unknown"):
            with self.subTest(mode=mode), patch.dict(os.environ, {"ARTICLEPOD_SECRET_SOURCE": mode}):
                with self.assertRaisesRegex(ValueError, "^LEGACY_DEPLOY_CANNOT_ACTIVATE"):
                    guard.assert_legacy("unused-file")

    def test_remote_guard_precedes_sync_and_environment_upload(self):
        script = (ROOT / "scripts/azure/deploy-changes.sh").read_text(encoding="utf-8")
        guard_position = script.index('< "$ROOT_DIR/scripts/azure/assert-legacy-deploy.py"')
        self.assertLess(guard_position, script.index('run_remote_disk_guard "pre-sync"'))
        self.assertLess(guard_position, script.index('"$ROOT_DIR/scripts/azure/push-to-vm.sh"'))
        self.assertLess(guard_position, script.index('OUT_FILE="$RENDER_ENV_TEMP"'))


if __name__ == "__main__":
    unittest.main()
