import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

import test_vm_deployment_routing as vm_fixtures


ROOT = Path(__file__).resolve().parents[3]
BASH = shutil.which("bash")
spec = importlib.util.spec_from_file_location("deployment_check", ROOT / "scripts/azure/check-vault-deployment.py")
deployment_check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment_check)


class VaultDeploymentPathTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name).resolve()
        self.app = self.base / "app"
        self.app.mkdir()
        self.staging = self.base / "staging"
        self.public = self.base / "public.env"
        self.environment = {
            name: str(self.base / "data" / name.lower())
            for name in ("STORAGE_ROOT", "MEDIA_ROOT", "UPLOAD_ROOT", "LOG_ROOT")
        }
        self.environment["ARTICLEPOD_KEYVAULT_MANIFEST"] = str(self.base / "manifest.json")

    def check(self):
        deployment_check.check_deployment(self.app, self.staging, self.public, self.environment)

    def test_external_data_and_excluded_runtime_logs_are_supported(self):
        self.environment["LOG_ROOT"] = str(self.app / ".runtime/logs")
        self.check()
        self.assertFalse(self.staging.exists())

    def test_data_cannot_overlap_promotion_or_staging(self):
        for path in (self.app, self.app / "data", self.staging, self.staging / "data", self.base):
            with self.subTest(path=path):
                self.environment["STORAGE_ROOT"] = str(path)
                with self.assertRaises(ValueError):
                    self.check()

    def test_missing_or_system_data_roots_are_rejected(self):
        for path in ("", "/", "/var/lib", "/var/log", "/home/fixture", "/etc/articlepod"):
            with self.subTest(path=path):
                self.environment["STORAGE_ROOT"] = path
                with self.assertRaises(ValueError):
                    self.check()

    def test_configuration_inside_promotion_tree_is_rejected(self):
        self.environment["ARTICLEPOD_KEYVAULT_MANIFEST"] = str(self.app / ".runtime/manifest.json")
        with self.assertRaisesRegex(ValueError, "outside both deployment trees"):
            self.check()

    def test_local_environment_files_are_not_removed(self):
        local = self.app / ".env.production.local"
        local.write_text("fixture")
        with self.assertRaisesRegex(ValueError, "retire local environment"):
            self.check()
        self.assertEqual(local.read_text(), "fixture")

    @unittest.skipUnless(sys.platform.startswith("linux"), "Linux symlink semantics")
    def test_symlinks_cannot_hide_data_inside_staging(self):
        self.staging.mkdir()
        alias = self.base / "alias"
        alias.symlink_to(self.staging, target_is_directory=True)
        self.environment["STORAGE_ROOT"] = str(alias / "data")
        with self.assertRaisesRegex(ValueError, "overlap staging"):
            self.check()


class VaultWorkflowTests(unittest.TestCase):
    """Historical compatibility fixtures, not active production guarantees."""

    def test_vault_workflow_has_only_transport_secrets_and_never_renders_configuration(self):
        workflow = (ROOT / ".github/workflow-fixtures/deploy-azure-keyvault.yml").read_text(encoding="utf-8")
        self.assertEqual(set(re.findall(r"secrets\.([A-Z_]+)", workflow)), {
            "ARTICLEPOD_DEPLOY_SSH_KEY", "ARTICLEPOD_DEPLOY_KNOWN_HOSTS", "AZURE_VM_HOST", "AZURE_VM_USER",
        })
        self.assertIn("github.repository == 'talktovishal/Podcast' && github.ref == 'refs/heads/main'", workflow)
        self.assertIn("group: deploy-azure-main", workflow)
        self.assertIn("ARTICLEPOD_SECRET_SOURCE: keyvault", workflow)
        self.assertIn("--seed-mode never", workflow)
        self.assertIn("--skip-configure-ingress", workflow)
        self.assertNotIn("--render-env", workflow)
        self.assertNotIn("--skip-healthcheck", workflow)
        self.assertIn("if: always()", workflow)


@unittest.skipUnless(sys.platform.startswith("linux") and BASH, "Isolated Linux SSH/deployment fixtures")
class RemoteVaultIntegrationTests(unittest.TestCase):
    def setUp(self):
        vm_fixtures.DeploymentIntegrationTests.setUp(self)
        import grp
        import pwd
        self.user = pwd.getpwuid(os.getuid()).pw_name
        self.group = grp.getgrgid(os.getgid()).gr_name
        self.source = self.base / "source with spaces"
        self.local_scripts = self.source / "scripts/azure"
        self.local_scripts.mkdir(parents=True)
        names = (
            "runtime-naming.sh", "deployment-ssh.sh", "deploy-changes.sh", "push-to-vm.sh",
            "promote-runtime.sh", "deploy-vm-runtime.sh", "keyvault-exec.py", "runtime-exec.sh",
            "check-vault-deployment.py", "assert-legacy-deploy.py", "sync-excludes.txt",
        )
        for name in names:
            target = self.local_scripts / name
            shutil.copyfile(ROOT / "scripts/azure" / name, target)
            target.chmod(0o755 if name.endswith(".sh") else 0o644)
        units = self.source / "infra/systemd"
        units.mkdir(parents=True)
        for service in ("web", "worker", "python-tts", "worker-overflow"):
            content = (ROOT / "infra/systemd" / ("articlepod-" + service + ".service")).read_text()
            content = content.replace("/opt/articlepod/scripts/azure/runtime-exec.sh",
                                      '"' + str(self.app / "scripts/azure/runtime-exec.sh") + '"')
            content = content.replace("/etc/articlepod/articlepod.env", '"' + str(self.public_file) + '"')
            content = content.replace("User=articlepod", "User=" + self.user).replace("Group=articlepod", "Group=" + self.group)
            (units / ("articlepod-" + service + ".service")).write_text(content)
        for name in ("apps/web", "apps/worker", "services/python-tts"):
            (self.source / name).mkdir(parents=True)
        (self.source / "pnpm-lock.yaml").write_text("fixture")
        for name in ("requirements.txt", "requirements.providers.txt"):
            (self.source / "services/python-tts" / name).write_text("fixture")
        (self.source / "release.txt").write_text("new fixture release")
        (self.app / "release.txt").write_text("existing fixture release")
        self.preserved = self.app / ".runtime/preserved.txt"
        self.preserved.parent.mkdir()
        self.preserved.write_text("preserve fixture data")
        self.staging = self.base / "staging with spaces"
        self.key = self.base / "identity"
        subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(self.key)],
                       capture_output=True, check=True)
        self.pins = self.base / "known_hosts"
        self.pins.write_text("fixture.invalid " + self.key.with_suffix(".pub").read_text())

    def run_remote(self, control=None, options=None, extra=None):
        self.public_file.write_text("".join(f"{name}={value}\n" for name, value in self.settings.items()))
        self.public_file.chmod(0o600)
        (self.base / "control.json").write_text(json.dumps(control or {}))
        before = (self.public_file.read_bytes(), self.manifest_file.read_bytes())
        environment = {
            "PATH": str(self.bin) + os.pathsep + os.environ["PATH"], "HOME": str(self.base),
            "LANG": "C.UTF-8", "ARTICLEPOD_SECRET_SOURCE": "keyvault",
            "TARGET_HOST": "fixture.invalid", "TARGET_USER": self.user,
            "TARGET_SSH_KEY": str(self.key), "TARGET_KNOWN_HOSTS_FILE": str(self.pins),
            "RUNTIME_APP_DIR": str(self.app), "RUNTIME_STAGING_DIR": str(self.staging),
            "RUNTIME_ENV_FILE": str(self.public_file), "RUNTIME_APP_USER": self.user,
            "RUNTIME_APP_GROUP": self.group, "HEALTH_RETRIES": "1", "HEALTH_RETRY_DELAY": "0",
            "ADMIN_PASSWORD": "fixture-retired", "UNREGISTERED_SECRET": "fixture-retired",
            **(extra or {}),
        }
        environment = {name: value for name, value in environment.items() if value is not None}
        result = subprocess.run([BASH, str(self.local_scripts / "deploy-changes.sh"), *(options or [])],
                                env=environment, input="", text=True, encoding="utf-8",
                                capture_output=True, timeout=120)
        self.assertEqual((self.public_file.read_bytes(), self.manifest_file.read_bytes()), before)
        self.assertEqual(self.preserved.read_text(), "preserve fixture data")
        records = self.base / "calls.jsonl"
        calls = [json.loads(line) for line in records.read_text().splitlines()] if records.exists() else []
        return result, calls

    def test_full_remote_deploy_retains_configuration_data_and_no_seed_policy(self):
        result, calls = self.run_remote(extra={"DEPLOY_FORCE_FULL": "1"})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.app / "release.txt").read_text(), "new fixture release")
        self.assertEqual(len([call for call in calls if call["stage"] == "rsync"]), 2)
        self.assertFalse(any("seed:demo" in call["args"] for call in calls))
        self.assertFalse(any(call["stage"] == "cleanup-vm-disk.sh" for call in calls))
        self.assertFalse(any(call["stage"] == "chown" and "-R" in call["args"] for call in calls))
        health = next(call for call in calls if call["stage"] == "curl")
        self.assertEqual(health["args"][-1], "https://fixture.example/api/health")
        self.assertNotIn("fixture-retired", result.stdout + result.stderr)

    def test_missing_bootstrap_contract_stops_before_sync(self):
        result, calls = self.run_remote(control={"not_bootstrapped": True})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("vault bootstrap contract", result.stderr)
        self.assertFalse(any(call["stage"] == "rsync" for call in calls))
        self.assertEqual((self.app / "release.txt").read_text(), "existing fixture release")

    def test_missing_explicit_pins_stop_before_transport(self):
        for pins in (None, ""):
            with self.subTest(pins=pins):
                result, calls = self.run_remote(extra={"TARGET_KNOWN_HOSTS_FILE": pins})
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("requires explicit independently verified host pins", result.stderr)
                self.assertFalse(any(call["stage"] == "ssh" for call in calls))

    def test_provider_access_failure_stops_before_sync(self):
        result, calls = self.run_remote(control={"fail_service": "worker"})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("KEYVAULT_HTTP_403", result.stderr)
        self.assertFalse(any(call["stage"] == "rsync" for call in calls))

    def test_local_environment_is_preserved_and_blocks_promotion(self):
        local = self.app / "apps/web/.env.local"
        local.write_text("fixture-preserve")
        result, calls = self.run_remote()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(local.read_text(), "fixture-preserve")
        self.assertFalse(any(call["stage"] == "rsync" for call in calls))

    def test_active_overflow_is_preserved_without_explicit_policy(self):
        result, calls = self.run_remote(control={"overflow": True})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(any(call["stage"] == "vault-service" and call["args"] == ["worker-overflow"] for call in calls))
        self.assertTrue(any(call["stage"] == "systemctl" and "restart" in call["args"] and
                            "articlepod-worker-overflow.service" in call["args"] for call in calls))

    def test_explicit_overflow_disable_stops_an_existing_worker(self):
        result, calls = self.run_remote(control={"overflow": True}, options=["--disable-overflow-worker"])
        self.assertEqual(result.returncode, 0, result.stderr)
        overflow = [call for call in calls if call["stage"] == "systemctl" and
                    "articlepod-worker-overflow.service" in call["args"]]
        self.assertTrue(any("stop" in call["args"] for call in overflow))
        self.assertFalse(any("restart" in call["args"] for call in overflow))

    def test_explicit_overflow_enable_starts_the_selected_worker(self):
        result, calls = self.run_remote(options=["--enable-overflow-worker"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(any(call["stage"] == "systemctl" and "restart" in call["args"] and
                            "articlepod-worker-overflow.service" in call["args"] for call in calls))

    def test_insufficient_disk_does_not_delete_files_or_sync(self):
        result, calls = self.run_remote(control={"free_mb": 1})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("retire files separately", result.stdout + result.stderr)
        self.assertFalse(any(call["stage"] == "rsync" for call in calls))

    def test_health_failure_is_not_reported_as_success(self):
        result, calls = self.run_remote(control={"health_status": "503"})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("deployment finished but health check failed", result.stdout)
        self.assertTrue(any(call["stage"] == "rsync" for call in calls))


if __name__ == "__main__":
    unittest.main()
