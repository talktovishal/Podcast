import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from test_keyvault_exec import launcher


ROOT = Path(__file__).resolve().parents[3]
BASH = shutil.which("bash")
FIXTURE_PROGRAM = r'''
import importlib.util
import json
import os
from pathlib import Path
import sys

BASE = Path(__BASE__)
PYTHON = __PYTHON__
BASH = __BASH__
tool = Path(sys.argv[0]).name
args = sys.argv[1:]
control = json.loads((BASE / "control.json").read_text())
observed_names = (
    "ADMIN_PASSWORD", "MEDIA_SIGNING_KEY", "DATABASE_URL",
    "GITHUB_TOKEN", "NODE_OPTIONS", "UNREGISTERED_SECRET", "RUNTIME_PROFILE",
)

def record(stage, arguments=None):
    with (BASE / "calls.jsonl").open("a") as output:
        output.write(json.dumps({
            "stage": stage, "args": args if arguments is None else arguments,
            "cwd": os.getcwd(),
            "environment": {name: os.environ.get(name) for name in observed_names},
        }) + "\n")

if tool == "sudo":
    while args and args[0] in ("-H", "-n", "-u"):
        option = args.pop(0)
        if option == "-u":
            args.pop(0)
        if option == "-H":
            os.environ["HOME"] = str(BASE / "home")
    while args and "=" in args[0] and not args[0].startswith("/"):
        name, value = args.pop(0).split("=", 1)
        os.environ[name] = value
    if Path(args[0]).name in ("cleanup-vm-disk.sh", "install-systemd.sh", "ensure-swap.sh"):
        record(Path(args[0]).name)
        sys.exit(0)
    os.execvpe(args[0], args, os.environ)
elif tool == "id":
    print("1001")
elif tool == "chown":
    record("chown")
elif tool == "systemctl":
    record("systemctl")
    if args[0] == "is-enabled":
        sys.exit(0 if control.get("overflow") else 1)
elif tool == "corepack":
    record("corepack")
    if control.get("fail_command") in args:
        sys.exit(1)
elif tool == "bash":
    command = args[args.index("-c") + 1] if "-c" in args else args[args.index("-lc") + 1]
    if "import nltk" in command:
        record("python-setup" if "pip install" in command else "python-assets")
        sys.exit(0)
    record("bash")
    # Do not load real machine profiles during fixture execution.
    args = ["-c" if arg == "-lc" else arg for arg in args]
    os.execvpe(BASH, [BASH, *args], os.environ)
elif tool == "python3":
    if args and args[0].endswith("keyvault-exec.py"):
        spec = importlib.util.spec_from_file_location("fixture_launcher", args[0])
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        original_stat = module.os.fstat
        def root_owned(fd):
            fields = list(original_stat(fd))
            fields[4] = 0
            return os.stat_result(fields)
        module.os.fstat = root_owned
        original_load = module.load_environment
        def load(manifest, service, inherited):
            record("vault-service", [service])
            if control.get("fail_service") == service:
                raise module.SecretLoadError("KEYVAULT_HTTP_403")
            def fetch(url, headers, stage):
                if stage == "IDENTITY":
                    return {"access_token": "fixture-token"}
                reference = url.split("/secrets/", 1)[1].split("?", 1)[0]
                value = "postgresql://fixture.invalid/fixture" if reference.startswith("database-url/") else "fixture-only"
                return {"id": url.split("?", 1)[0], "value": value, "attributes": {"enabled": True}}
            return original_load(manifest, service, inherited, fetch=fetch)
        module.load_environment = load
        sys.argv = args
        sys.exit(module.main())
    os.execvpe(PYTHON, [PYTHON, *args], os.environ)
else:
    raise SystemExit("Unexpected fixture executable")
'''


class DeploymentSourceTests(unittest.TestCase):
    def test_build_and_operational_calls_have_explicit_credential_scopes(self):
        source = (ROOT / "scripts/azure/deploy-vm-runtime.sh").read_text()
        for command in ("prisma:generate", "run build", "pnpm install"):
            calls = [line for line in source.splitlines() if "run_app_cmd " in line and command in line]
            self.assertTrue(calls, command)
            self.assertTrue(all("run_app_cmd public " in line for line in calls), command)
        for command in ("db:bootstrap", "seed:demo", "tts:precompute"):
            calls = [line for line in source.splitlines() if "run_app_cmd " in line and command in line]
            self.assertTrue(calls, command)
            self.assertTrue(all("run_app_cmd ops " in line for line in calls), command)
        self.assertNotIn('eval "$1"', source)

    @unittest.skipUnless(BASH, "Bash is needed for the isolated cleanup function")
    def test_maintenance_preserves_legacy_trees_without_confirmed_legacy_configuration(self):
        source = (ROOT / "scripts/azure/cleanup-vm-disk.sh").read_text()
        body = source.split("clean_legacy_runtime_dirs() {\n", 1)[1].split("\n}\n", 1)[0]
        script = """
set -euo pipefail
legacy_runtime_in_use() { return 1; }
remove_if_present() { printf 'would-remove\\n'; }
clean_legacy_runtime_dirs() {
""" + body + """
}
clean_legacy_runtime_dirs
"""
        with tempfile.TemporaryDirectory() as directory:
            environment_file = Path(directory) / "runtime.env"
            for content in (
                "ARTICLEPOD_SECRET_SOURCE=keyvault\n",
                "ARTICLEPOD_SECRET_SOURCE=unknown\n",
                "ARTICLEPOD_SECRET_SOURCE=environment\nARTICLEPOD_SECRET_SOURCE=keyvault\n",
                "ARTICLEPOD_SECRET_SOURCE=environment\n",
                None,
            ):
                if content is None:
                    environment_file.unlink(missing_ok=True)
                else:
                    environment_file.write_text(content)
                result = subprocess.run(
                    [BASH, "-c", script], capture_output=True, text=True, timeout=15,
                    env={
                        **{name: value for name, value in os.environ.items() if name.upper() in launcher.HOST_ENV_NAMES},
                        "ROOT_DIR": ROOT.as_posix(),
                        "ENV_FILE": environment_file.as_posix(), "ARTICLEPOD_SECRET_SOURCE": "environment",
                        "LEGACY_RUNTIME_APP_DIR": "/fixture/app", "LEGACY_RUNTIME_APP_USER": "fixture",
                        "LEGACY_RUNTIME_STAGING_DIR": "/fixture/staging",
                    },
                )
                with self.subTest(content=content):
                    self.assertEqual(result.returncode, 0, result.stderr)
                    if content == "ARTICLEPOD_SECRET_SOURCE=environment\n":
                        self.assertEqual(result.stdout.count("would-remove"), 3)
                    else:
                        self.assertNotIn("would-remove", result.stdout)
                        self.assertIn("keeping legacy runtime trees", result.stdout)


@unittest.skipUnless(os.name == "posix" and BASH, "VM integration fixtures run on Linux without real sudo or services")
class DeploymentIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.app = self.base / "app with spaces"
        self.scripts = self.app / "scripts/azure"
        self.scripts.mkdir(parents=True)
        for name in ("deploy-vm-runtime.sh", "runtime-naming.sh", "keyvault-exec.py", "assert-legacy-deploy.py"):
            shutil.copyfile(ROOT / "scripts/azure" / name, self.scripts / name)
        for name in ("apps/web", "apps/worker", "services/python-tts"):
            (self.app / name).mkdir(parents=True)
        (self.app / "pnpm-lock.yaml").write_text("fixture")
        for name in ("requirements.txt", "requirements.providers.txt"):
            (self.app / "services/python-tts" / name).write_text("fixture")
        self.bin = self.base / "bin"
        self.bin.mkdir()
        program = FIXTURE_PROGRAM.replace("__BASE__", repr(str(self.base))).replace(
            "__PYTHON__", repr(sys.executable),
        ).replace("__BASH__", repr(BASH))
        for name in ("sudo", "id", "chown", "systemctl", "corepack", "bash", "python3"):
            executable = self.bin / name
            executable.write_text(f"#!{sys.executable}\n" + program)
            executable.chmod(0o755)
        self.public_file = self.base / "runtime.env"
        self.manifest_file = self.base / "manifest.json"
        self.manifest_file.write_text(json.dumps({
            "vault_url": "https://fixture-vault.vault.azure.net",
            "services": {
                service: {
                    name: name.lower().replace("_", "-") + "/" + "0" * 32
                    for name in ("ADMIN_PASSWORD", "MEDIA_SIGNING_KEY", "DATABASE_URL")
                }
                for service in ("ops", "web", "worker", "python-tts", "worker-overflow")
            },
        }))
        self.settings = {
            "RUNTIME_PROFILE": "azure", "APP_URL": "https://fixture.example",
            "METADATA_PRIMARY_BACKEND": "azure_table", "STORAGE_BACKEND": "azure_blob",
            "AZURE_STORAGE_CONTAINER": "fixture", "PYTHON_TTS_URL": "http://127.0.0.1:8010",
            "ARTICLEPOD_SECRET_SOURCE": "keyvault",
            "ARTICLEPOD_KEYVAULT_MANIFEST": str(self.manifest_file),
            **{name: str(self.base / "state" / name.lower()) for name in ("STORAGE_ROOT", "MEDIA_ROOT", "UPLOAD_ROOT")},
        }

    def run_deploy(self, source="keyvault", control=None, extra=None):
        self.public_file.write_text("".join(f"{key}={value}\n" for key, value in self.settings.items()))
        self.public_file.chmod(0o600)
        (self.base / "control.json").write_text(json.dumps(control or {}))
        inherited = {
            name: value for name, value in os.environ.items()
            if name.upper() in launcher.HOST_ENV_NAMES
        }
        inherited.update({
            "PATH": str(self.bin) + os.pathsep + inherited["PATH"],
            "APP_DIR": str(self.app), "STAGING_DIR": str(self.base / "staging"),
            "ENV_FILE": str(self.public_file), "APP_USER": "fixture",
            "ARTICLEPOD_SECRET_SOURCE": source, "DEPLOY_DEMO_SEED_MODE": "never",
            "ADMIN_PASSWORD": "fixture-retired", "GITHUB_TOKEN": "fixture-retired",
            "NODE_OPTIONS": "fixture-options", "UNREGISTERED_SECRET": "fixture-retired",
        })
        inherited.update(extra or {})
        result = subprocess.run(
            [BASH, str(self.scripts / "deploy-vm-runtime.sh")],
            env=inherited, capture_output=True, text=True, timeout=60,
        )
        calls_file = self.base / "calls.jsonl"
        calls = [json.loads(line) for line in calls_file.read_text().splitlines()] if calls_file.exists() else []
        return result, calls

    def test_vault_table_deploy_filters_builds_and_preserves_scoped_operations(self):
        result, calls = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("deployment complete", result.stdout)
        commands = [call for call in calls if call["stage"] == "corepack"]
        for call in commands:
            self.assertEqual(call["cwd"], str(self.app))
            environment = call["environment"]
            for name in ("GITHUB_TOKEN", "NODE_OPTIONS", "UNREGISTERED_SECRET"):
                self.assertIsNone(environment[name])
            if "tts:precompute" in call["args"]:
                self.assertEqual(environment["MEDIA_SIGNING_KEY"], "fixture-only")
            else:
                for name in ("MEDIA_SIGNING_KEY", "DATABASE_URL", "ADMIN_PASSWORD"):
                    self.assertIsNone(environment[name])
        self.assertFalse(any("seed:demo" in call["args"] or "db:bootstrap" in call["args"] for call in commands))
        setup = next(call for call in calls if call["stage"] == "python-setup")
        self.assertIsNone(setup["environment"]["ADMIN_PASSWORD"])
        self.assertFalse(any("-R" in call["args"] for call in calls if call["stage"] == "chown"))

    def test_vault_prisma_bootstrap_gets_resolved_database_url(self):
        self.settings["METADATA_PRIMARY_BACKEND"] = "prisma"
        result, calls = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        bootstrap = next(call for call in calls if call["stage"] == "corepack" and "db:bootstrap" in call["args"])
        self.assertEqual(bootstrap["environment"]["DATABASE_URL"], "postgresql://fixture.invalid/fixture")
        self.assertNotIn("fixture-only", result.stdout + result.stderr)

    def test_bad_reference_access_stops_before_any_mutating_step(self):
        result, calls = self.run_deploy(control={"fail_service": "worker"})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("KEYVAULT_HTTP_403", result.stderr)
        self.assertFalse(any(call["stage"] in ("chown", "corepack", "systemctl", "cleanup-vm-disk.sh") for call in calls))
        self.assertFalse((self.app / ".runtime").exists())

    def test_local_env_files_are_preserved_and_block_vault_deploy(self):
        local = self.app / "apps/web/.env.production.local"
        local.write_text("ADMIN_PASSWORD=fixture-retired\n")
        result, calls = self.run_deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(local.read_text(), "ADMIN_PASSWORD=fixture-retired\n")
        self.assertEqual(calls, [])

    def test_nonempty_public_credentials_block_before_commands(self):
        self.settings["ADMIN_PASSWORD"] = "fixture-retired"
        result, calls = self.run_deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("PLAINTEXT_SECRET_IN_PUBLIC_ENVIRONMENT", result.stderr)
        self.assertEqual(calls, [])

    def test_seed_request_is_rejected_even_before_vault_access(self):
        result, calls = self.run_deploy(extra={"DEPLOY_DEMO_SEED_MODE": "always"})
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])

    def test_full_dependency_rebuild_never_seeds_accounts_in_vault_mode(self):
        result, calls = self.run_deploy(extra={"DEPLOY_FORCE_FULL": "1"})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any("seed:demo" in call["args"] for call in calls))

    def test_unsafe_runtime_root_stops_before_directory_ownership_changes(self):
        self.settings["STORAGE_ROOT"] = "/tmp/.."
        result, calls = self.run_deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unsafe runtime directory", result.stderr)
        self.assertFalse(any(call["stage"] == "chown" for call in calls))

    def test_warm_python_asset_probe_uses_public_environment(self):
        first, _ = self.run_deploy()
        self.assertEqual(first.returncode, 0, first.stderr)
        python = self.app / "services/python-tts/.venv/bin/python3"
        python.parent.mkdir(parents=True)
        python.write_text("fixture")
        python.chmod(0o755)
        result, calls = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        probe = next(call for call in calls if call["stage"] == "python-assets")
        self.assertIsNone(probe["environment"]["ADMIN_PASSWORD"])
        self.assertIsNone(probe["environment"]["GITHUB_TOKEN"])

    def test_missing_optional_overflow_access_blocks_when_enabled(self):
        result, calls = self.run_deploy(
            control={"fail_service": "worker-overflow"},
            extra={"ENABLE_OVERFLOW_WORKER_SERVICE": "1"},
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(call["stage"] == "corepack" for call in calls))

    def test_preview_failure_does_not_report_success_or_restart_web(self):
        result, calls = self.run_deploy(control={"fail_command": "tts:precompute"})
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("deployment complete", result.stdout)
        self.assertFalse(any(
            call["stage"] == "systemctl" and "restart" in call["args"] and "articlepod-web.service" in call["args"]
            for call in calls
        ))

    def test_legacy_deploy_keeps_environment_and_never_contacts_vault(self):
        self.settings.pop("ARTICLEPOD_SECRET_SOURCE")
        self.settings.pop("ARTICLEPOD_KEYVAULT_MANIFEST")
        self.settings["ADMIN_PASSWORD"] = "fixture-legacy"
        result, calls = self.run_deploy(source="environment")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any(call["stage"] == "vault-service" for call in calls))
        commands = [call for call in calls if call["stage"] == "corepack"]
        self.assertTrue(commands)
        self.assertTrue(all(call["environment"]["ADMIN_PASSWORD"] == "fixture-legacy" for call in commands))

    def test_legacy_mode_cannot_deploy_over_vault_configuration(self):
        result, calls = self.run_deploy(source="environment")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
