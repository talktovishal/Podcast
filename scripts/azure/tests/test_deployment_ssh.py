import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[3]
HELPER = ROOT / "scripts" / "azure" / "deployment-ssh.sh"
BASH = shutil.which("bash")


class WorkflowTransportTests(unittest.TestCase):
    """Historical compatibility fixtures, not active production guarantees."""

    def test_probe_is_main_only_pinned_and_guarded_before_execution(self):
        workflow = (ROOT / ".github/workflow-fixtures/probe-url-extraction.yml").read_text(encoding="utf-8")
        self.assertIn("github.repository == 'talktovishal/Podcast' && github.ref == 'refs/heads/main'", workflow)
        self.assertIn("group: deploy-azure-main", workflow)
        self.assertIn("AZURE_SSH_KNOWN_HOSTS: ${{ secrets.AZURE_SSH_KNOWN_HOSTS }}", workflow)
        self.assertIn("configure_deployment_ssh 15 15 4", workflow)
        self.assertEqual(workflow.count('ssh "${SSH_ARGS[@]}"'), 2)
        self.assertLess(workflow.index("assert-legacy-deploy.py"), workflow.index('remote_cmd='))
        self.assertIn("mktemp -d /tmp/articlepod-probe.XXXXXXXXXX", workflow)
        self.assertIn("setup-deployment-ssh.sh cleanup", workflow)
        self.assertIn('if [ "$probe_status" -eq 255 ]', workflow)
        self.assertNotIn("StrictHostKeyChecking no", workflow)
        self.assertNotIn("ssh-keyscan", workflow)
        self.assertNotIn("~/.ssh/config", workflow)
        self.assertNotIn("scp ", workflow)

    def test_production_is_main_only_and_pinned(self):
        workflow = (ROOT / ".github" / "workflow-fixtures" / "deploy-azure.yml").read_text(encoding="utf-8")
        self.assertIn(
            "if: github.repository == 'talktovishal/Podcast' && github.ref == 'refs/heads/main'",
            workflow,
        )
        self.assertIn("AZURE_SSH_KNOWN_HOSTS: ${{ secrets.AZURE_SSH_KNOWN_HOSTS }}", workflow)
        self.assertIn('ssh "${SSH_ARGS[@]}"', workflow)
        self.assertIn('--ssh-known-hosts "$RUNNER_TEMP/articlepod-ssh/known_hosts"', workflow)
        self.assertIn("configure_deployment_ssh 15 15 4", workflow)
        self.assertIn("- name: Remove temporary SSH credentials\n        if: always()", workflow)
        self.assertNotIn("StrictHostKeyChecking no", workflow)
        self.assertNotIn("ssh-keyscan", workflow)
        self.assertNotIn("~/.ssh/config", workflow)

    def test_deploy_propagates_pins_and_uses_shared_scp_options(self):
        source = (ROOT / "scripts" / "azure" / "deploy-changes.sh").read_text(encoding="utf-8")
        self.assertIn("export TARGET_KNOWN_HOSTS_FILE", source)
        self.assertIn('scp "${SCP_ARGS[@]}"', source)
        self.assertLess(
            source.index("configure_deployment_ssh "),
            source.index('probe_remote_ssh "$REMOTE"'),
        )


@unittest.skipUnless(sys.platform.startswith("linux") and BASH, "Linux transport fixture")
class DeploymentTransportTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="articlepod-ssh-test-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.directory = self.base / "operator's key files"
        self.directory.mkdir()
        self.key = self.directory / "identity"
        subprocess.run(
            ["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(self.key)],
            check=True, capture_output=True,
        )
        self.public_key = self.key.with_suffix(".pub").read_text().strip()
        self.pins = self.directory / "known hosts"
        self.write_pin("fixture.invalid")
        self.record = self.base / "calls.jsonl"
        self.bin = self.base / "bin"
        self.bin.mkdir()
        self.fake_tool("ssh", exit_on_server=True)
        self.env = {
            "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
            "HOME": str(self.base),
            "LANG": "C.UTF-8",
            "TARGET_HOST": "fixture.invalid",
            "TARGET_USER": "fixture",
            "TARGET_PORT": "22",
            "TARGET_SSH_KEY": str(self.key),
            "TARGET_KNOWN_HOSTS_FILE": str(self.pins),
            "FIXTURE_RECORD": str(self.record),
            "FIXTURE_HELPER": str(HELPER),
            "FIXTURE_PYTHON": sys.executable,
            "TARGET_PATH": "/tmp/fixture target",
        }

    def write_pin(self, host):
        self.pins.write_text(f"{host} {self.public_key}\n")

    def run_probe_step(self, status=0, guard_failure=False):
        workflow = (ROOT / ".github/workflow-fixtures/probe-url-extraction.yml").read_text(encoding="utf-8")
        step = workflow.split("      - name: Run VM URL probe\n", 1)[1].split("\n      - name:", 1)[0]
        script = textwrap.dedent(step.split("        run: |\n", 1)[1])
        directory = self.base / "articlepod-ssh"
        directory.mkdir()
        shutil.copyfile(self.key, directory / "identity")
        shutil.copyfile(self.pins, directory / "known_hosts")
        self.key = directory / "identity"
        self.pins = directory / "known_hosts"
        fake = self.bin / "ssh"
        fake.write_text(f"#!{sys.executable}\n" + textwrap.dedent(f"""
            import json, sys
            from pathlib import Path
            with Path({str(self.record)!r}).open("a") as output:
                output.write(json.dumps({{"tool": "ssh", "args": sys.argv[1:]}}) + "\\n")
            guard = sys.argv[-1].startswith("sudo -n python3")
            expected = "assert-legacy-deploy.py" if guard else "probe-url-extract.ts"
            assert sys.stdin.read() == (Path({str(ROOT)!r}) / "scripts/azure" / expected).read_text()
            if guard:
                sys.exit(1 if {guard_failure!r} else 0)
            if {status} != 255:
                print("== VM extraction probe ==")
                print(json.dumps({{"ok": {status} == 0, "fixture": True}}))
            sys.exit({status})
        """))
        fake.chmod(0o700)
        return subprocess.run(
            [BASH, "-c", script], cwd=ROOT,
            env=dict(self.env, RUNNER_TEMP=str(self.base), TARGET_URL="https://fixture.example/article",
                     FAIL_ON_ERROR="false"),
            capture_output=True, text=True, timeout=30,
        )

    def test_probe_step_uses_pins_for_guard_and_transmitted_code(self):
        result = self.run_probe_step()
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        self.assertEqual(len(calls), 2)
        for call in calls:
            self.assert_pinned(call["args"])
        payload = json.loads((self.base / "probe-url-extraction/probe.json").read_text())
        self.assertTrue(payload["ok"])

    def test_probe_step_refuses_unmatched_pins_before_network(self):
        self.write_pin("unrelated.invalid")
        result = self.run_probe_step()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("no stored host pin matches", result.stderr)
        self.assertEqual(self.calls(), [])

    def test_probe_step_stops_at_vault_configuration_guard(self):
        result = self.run_probe_step(guard_failure=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(self.calls()), 1)
        self.assertFalse((self.base / "probe-url-extraction").exists())

    def test_probe_step_transport_failure_cannot_be_tolerated(self):
        result = self.run_probe_step(status=255)
        self.assertEqual(result.returncode, 255)
        self.assertIn("fail_on_error cannot bypass trusted access", result.stdout)

    def test_probe_step_can_still_tolerate_a_structured_extraction_failure(self):
        result = self.run_probe_step(status=1)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("configured to continue", result.stdout)
        payload = json.loads((self.base / "probe-url-extraction/probe.json").read_text())
        self.assertFalse(payload["ok"])

    def fake_tool(self, name, exit_on_server=False):
        path = self.bin / name
        path.write_text(
            f"#!{sys.executable}\n"
            "import json, os, sys\n"
            "from pathlib import Path\n"
            "with open(os.environ['FIXTURE_RECORD'], 'a') as stream:\n"
            "    stream.write(json.dumps({'tool': Path(sys.argv[0]).name, 'args': sys.argv[1:]}) + '\\n')\n"
            f"sys.exit(97 if {exit_on_server!r} and '--server' in sys.argv else 0)\n"
        )
        path.chmod(0o700)

    def configure(self, env=None):
        return subprocess.run(
            [BASH, "--noprofile", "--norc", "-c", """
set -euo pipefail
source "$FIXTURE_HELPER"
configure_deployment_ssh 15 15 4
"$FIXTURE_PYTHON" -c '
import json, sys
n = int(sys.argv[1])
print(json.dumps({"rsh": sys.argv[2], "ssh": sys.argv[3:3+n], "scp": sys.argv[3+n:]}))
' "${#SSH_ARGS[@]}" "$(deployment_rsync_shell)" "${SSH_ARGS[@]}" "${SCP_ARGS[@]}"
"""],
            env=env or self.env, text=True, encoding="utf-8",
            capture_output=True, timeout=15,
        )

    def configured(self, env=None):
        result = self.configure(env)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def assert_pinned(self, arguments):
        for option in (
            "StrictHostKeyChecking=yes", "GlobalKnownHostsFile=/dev/null",
            "UpdateHostKeys=no", "VerifyHostKeyDNS=no", "IdentityAgent=none",
            "ForwardAgent=no", "ClearAllForwardings=yes",
            f'UserKnownHostsFile="{self.pins}"',
        ):
            index = arguments.index(option)
            self.assertEqual(arguments[index - 1], "-o")
        self.assertEqual(arguments[arguments.index("-F") + 1], "/dev/null")
        self.assertEqual(arguments[arguments.index("-i") + 1], str(self.key))

    def calls(self):
        if not self.record.exists():
            return []
        return [json.loads(line) for line in self.record.read_text().splitlines()]

    def test_shared_ssh_scp_options_preserve_literal_file_paths(self):
        configuration = self.configured()
        self.assert_pinned(configuration["ssh"])
        self.assert_pinned(configuration["scp"])
        self.assertEqual(configuration["ssh"][:2], ["-p", "22"])
        self.assertEqual(configuration["scp"][:2], ["-P", "22"])

    def test_openssh_parses_literal_pin_filename_and_disables_other_trust_sources(self):
        configuration = self.configured()
        result = subprocess.run(
            [shutil.which("ssh"), "-G", *configuration["ssh"], "fixture@fixture.invalid"],
            text=True, capture_output=True, timeout=15,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        settings = dict(line.split(" ", 1) for line in result.stdout.splitlines())
        self.assertEqual(settings["userknownhostsfile"].strip('"'), str(self.pins))
        self.assertEqual(settings["globalknownhostsfile"], "/dev/null")
        self.assertEqual(settings["stricthostkeychecking"], "true")
        self.assertEqual(settings["updatehostkeys"], "false")
        self.assertEqual(settings["verifyhostkeydns"], "false")
        self.assertEqual(settings["identityagent"], "none")

    def test_missing_empty_unmatched_and_unsafe_pin_files_fail_closed(self):
        cases = ("", str(self.base / "absent"), "relative", "/tmp/%h", "/tmp/$HOME",
                 '/tmp/a"b', "/tmp/back\\slash", "/tmp/line\nbreak")
        for path in cases:
            with self.subTest(path=path):
                result = self.configure(dict(self.env, TARGET_KNOWN_HOSTS_FILE=path))
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "")
        self.write_pin("unrelated.invalid")
        self.assertNotEqual(self.configure().returncode, 0)
        self.pins.write_text("")
        self.assertNotEqual(self.configure().returncode, 0)
        self.pins.unlink()
        self.pins.symlink_to(self.key.with_suffix(".pub"))
        self.assertNotEqual(self.configure().returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_invalid_target_values_are_rejected_before_transport(self):
        for name, values in {
            "TARGET_HOST": ("-oProxyCommand=bad", "host;bad", "host alias", ""),
            "TARGET_USER": ("-bad", "user@host", "user;bad", ""),
            "TARGET_PORT": ("0", "65536", "-1", "22 -oBad", "99999999999999", ""),
        }.items():
            for value in values:
                with self.subTest(name=name, value=value):
                    result = self.configure(dict(self.env, **{name: value}))
                    self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_hashed_host_and_nondefault_port_pins_are_supported(self):
        self.write_pin("[fixture.invalid]:2222")
        subprocess.run(["ssh-keygen", "-H", "-f", str(self.pins)], check=True, capture_output=True)
        self.configured(dict(self.env, TARGET_PORT="2222"))
        self.assertNotEqual(self.configure().returncode, 0)

    def test_ipv6_pin_lookup_is_port_specific(self):
        self.write_pin("[2001:db8::1]:2222")
        self.configured(dict(self.env, TARGET_HOST="2001:db8::1", TARGET_PORT="2222"))

    def test_legacy_local_settings_remain_supported_but_vault_requires_pins(self):
        env = dict(self.env)
        del env["TARGET_KNOWN_HOSTS_FILE"]
        configuration = self.configured(env)
        self.assertNotIn("-F", configuration["ssh"])
        self.assertNotIn("StrictHostKeyChecking=yes", configuration["ssh"])
        env["ARTICLEPOD_SECRET_SOURCE"] = "keyvault"
        self.assertNotEqual(self.configure(env).returncode, 0)

    def test_real_rsync_preserves_quoted_ssh_arguments_and_fails_with_transport(self):
        configuration = self.configured()
        source = self.base / "source"
        source.mkdir()
        (source / "fixture.txt").write_text("fixture")
        result = subprocess.run(
            ["rsync", "-an", "-e", configuration["rsh"], str(source) + "/",
             "fixture@fixture.invalid:/tmp/fixture"],
            env=self.env, text=True, capture_output=True, timeout=15,
        )
        self.assertNotEqual(result.returncode, 0)
        calls = self.calls()
        self.assertEqual(len(calls), 1, result.stderr)
        self.assertEqual(calls[0]["args"][:len(configuration["ssh"])], configuration["ssh"])
        self.assertIn("--server", calls[0]["args"])

    def test_full_sync_helper_propagates_pins_into_rsync(self):
        self.fake_tool("rsync")
        result = subprocess.run(
            [BASH, str(ROOT / "scripts" / "azure" / "push-to-vm.sh")],
            cwd=self.base, env=self.env, text=True, capture_output=True, timeout=15,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        self.assertEqual([call["tool"] for call in calls], ["ssh", "rsync"])
        self.assert_pinned(calls[0]["args"])
        self.assertIn("mkdir -p -- /tmp/fixture\\ target", calls[0]["args"])
        args = calls[1]["args"]
        self.assertEqual(args[args.index("-e") + 1], self.configured()["rsh"])

    def test_deployment_refuses_unmatched_pins_before_any_remote_call(self):
        self.write_pin("unrelated.invalid")
        result = subprocess.run(
            [BASH, str(ROOT / "scripts" / "azure" / "deploy-changes.sh"),
             "--skip-configure-ingress", "--skip-healthcheck"],
            env=self.env, text=True, capture_output=True, timeout=15,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("no stored host pin matches", result.stderr)
        self.assertEqual(self.calls(), [])

    def test_vault_configuration_overwrite_or_seeding_is_blocked_before_transport(self):
        for options in (["--render-env"], ["--configure-ingress"], ["--seed-mode", "always"]):
            result = subprocess.run(
                [BASH, str(ROOT / "scripts" / "azure" / "deploy-changes.sh"), *options],
                env=dict(self.env, ARTICLEPOD_SECRET_SOURCE="keyvault"),
                text=True, capture_output=True, timeout=15,
            )
            with self.subTest(options=options):
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("preserves VM configuration", result.stderr)
                self.assertEqual(self.calls(), [])

    def test_runner_credential_setup_and_cleanup_are_owned_and_private(self):
        environment = dict(self.env, RUNNER_TEMP=str(self.base), GITHUB_RUN_ID="1",
                           GITHUB_RUN_ATTEMPT="1", GITHUB_JOB="fixture",
                           AZURE_SSH_KEY=self.key.read_text(), AZURE_SSH_KNOWN_HOSTS=self.pins.read_text())
        script = ROOT / "scripts/azure/setup-deployment-ssh.sh"
        result = subprocess.run([BASH, str(script)], env=environment, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        directory = self.base / "articlepod-ssh"
        self.assertEqual(directory.stat().st_mode & 0o777, 0o700)
        self.assertEqual((directory / "identity").stat().st_mode & 0o777, 0o600)
        self.assertEqual(result.stdout, "")
        refused = subprocess.run([BASH, str(script), "cleanup"],
                                 env=dict(environment, GITHUB_RUN_ID="2"), capture_output=True)
        self.assertNotEqual(refused.returncode, 0)
        self.assertTrue((directory / "identity").exists())
        cleaned = subprocess.run([BASH, str(script), "cleanup"], env=environment, capture_output=True)
        self.assertEqual(cleaned.returncode, 0)
        self.assertFalse(directory.exists())

    def test_failed_runner_setup_removes_only_its_own_partial_files(self):
        environment = dict(self.env, RUNNER_TEMP=str(self.base), GITHUB_RUN_ID="1",
                           GITHUB_RUN_ATTEMPT="1", GITHUB_JOB="fixture",
                           AZURE_SSH_KEY="fixture-invalid-key", AZURE_SSH_KNOWN_HOSTS=self.pins.read_text())
        result = subprocess.run([BASH, str(ROOT / "scripts/azure/setup-deployment-ssh.sh")],
                                env=environment, text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("fixture-invalid-key", result.stdout + result.stderr)
        self.assertFalse((self.base / "articlepod-ssh").exists())


if __name__ == "__main__":
    unittest.main()
