import base64
import contextlib
import hashlib
import hmac
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
import unittest
from unittest import mock
import uuid

from nacl.exceptions import CryptoError
from nacl.public import PrivateKey, SealedBox


SCRIPT = Path(__file__).resolve().parents[1] / "sealed_export.py"
REPO = SCRIPT.parents[2]
SPEC = importlib.util.spec_from_file_location("sealed_export", SCRIPT)
migration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(migration)


def context(root: Path) -> dict[str, str]:
    sha = "a" * 40
    return {
        "GITHUB_ACTIONS": "true",
        "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_REPOSITORY": "talktovishal/Podcast",
        "GITHUB_REPOSITORY_ID": "1152527211",
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": (
            "talktovishal/Podcast/.github/workflows/"
            "migrate-deployment-secrets.yml@refs/heads/main"
        ),
        "GITHUB_WORKFLOW_SHA": sha,
        "GITHUB_SHA": sha,
        "EXPECTED_SOURCE_SHA": sha,
        "GITHUB_RUN_ID": "123456789",
        "GITHUB_RUN_ATTEMPT": "2",
        "RUNNER_ENVIRONMENT": "github-hosted",
        "RUNNER_OS": "Linux",
        "RUNNER_TEMP": str(root),
    }


def synthetic_values() -> dict[str, str]:
    return {
        name: f"synthetic-only:{name}: \r\n quote'\" \\ \u00e9 \U0001f600 \n"
        for name in migration.SOURCE_SECRET_NAMES
    }


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.env = context(self.root)
        self.source = migration.validate_context(self.env)
        self.values = synthetic_values()
        self.recipient = PrivateKey.generate()
        patch = mock.patch.object(
            migration,
            "DESTINATION_PUBLIC_KEY",
            base64.b64encode(bytes(self.recipient.public_key)).decode("ascii"),
        )
        patch.start()
        self.addCleanup(patch.stop)

    def manifest(self, values=None):
        return json.loads(
            migration.build_manifest(
                self.source,
                self.values if values is None else values,
                "synthetic-only-source-read-private-key\n",
            )
        )

    def decrypt(self, manifest):
        box = SealedBox(self.recipient)
        return {
            name: box.decrypt(base64.b64decode(value, validate=True)).decode("utf-8")
            for name, value in manifest["encrypted_values"].items()
        }

    def test_context_rejects_each_wrong_trust_binding(self):
        for name in (
            "GITHUB_ACTIONS",
            "GITHUB_EVENT_NAME",
            "GITHUB_REPOSITORY",
            "GITHUB_REPOSITORY_ID",
            "GITHUB_REF",
            "GITHUB_WORKFLOW_REF",
            "RUNNER_ENVIRONMENT",
            "RUNNER_OS",
        ):
            for value in ("", "unexpected"):
                with self.subTest(name=name, value=value):
                    with self.assertRaises(migration.ExportError):
                        migration.validate_context({**self.env, name: value})

    def test_expected_and_workflow_sha_must_match_full_dispatch_sha(self):
        for name in ("GITHUB_SHA", "EXPECTED_SOURCE_SHA", "GITHUB_WORKFLOW_SHA"):
            for value in ("", "a" * 39, "A" * 40, "b" * 40, "main", "a" * 40 + "\n"):
                with self.subTest(name=name, value=value):
                    with self.assertRaises(migration.ExportError):
                        migration.validate_context({**self.env, name: value})

    def test_run_bindings_preserve_json_types(self):
        self.assertIs(type(self.source["source_repository_id"]), int)
        self.assertIs(type(self.source["source_run_attempt"]), int)
        self.assertIs(type(self.source["source_run_id"]), str)
        for name in ("GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"):
            for value in ("", "0", "01", "-1", "+1", "1.0", "1\n", "1" * 21):
                with self.subTest(name=name, value=value):
                    with self.assertRaises(migration.ExportError):
                        migration.validate_context({**self.env, name: value})

    def test_exact_40_ciphertexts_and_38_byte_exact_proofs(self):
        manifest = self.manifest()
        self.assertEqual(
            set(manifest),
            {
                "schema_version",
                "manifest_id",
                "source_repository",
                "source_repository_id",
                "source_sha",
                "source_run_id",
                "source_run_attempt",
                "destination_repository",
                "destination_repository_id",
                "destination_environment",
                "destination_environment_public_key_id",
                "encrypted_values",
            },
        )
        self.assertEqual(uuid.UUID(manifest["manifest_id"]).version, 4)
        self.assertEqual(manifest["source_repository_id"], 1152527211)
        self.assertEqual(manifest["destination_repository_id"], 1431956894)
        self.assertEqual(
            manifest["destination_repository"], "talktovishal/Podcast-Deploy"
        )
        self.assertEqual(manifest["destination_environment"], "production")
        self.assertEqual(
            manifest["destination_environment_public_key_id"], "3380204578043523366"
        )
        for name in (
            "schema_version",
            "source_repository_id",
            "destination_repository_id",
            "source_run_attempt",
        ):
            self.assertIs(type(manifest[name]), int)
        self.assertIs(type(manifest["source_run_id"]), str)
        actual = self.decrypt(manifest)
        self.assertEqual(len(actual), 40)
        self.assertEqual(
            set(actual),
            set(migration.SOURCE_SECRET_NAMES)
            | {
                "ARTICLEPOD_SOURCE_READ_KEY",
                "MIGRATION_PROOF_KEY",
                "MIGRATION_PROOF_EXPECTED",
            },
        )
        for name, value in self.values.items():
            self.assertEqual(actual[name].encode("utf-8"), value.encode("utf-8"))
        key = base64.b64decode(actual["MIGRATION_PROOF_KEY"], validate=True)
        self.assertEqual(len(key), 32)
        expected = json.loads(actual["MIGRATION_PROOF_EXPECTED"])
        self.assertEqual(
            set(expected),
            {
                "schema_version",
                "manifest_id",
                "source_repository",
                "source_sha",
                "source_run_id",
                "source_run_attempt",
                "destination_repository",
                "destination_repository_id",
                "destination_environment",
                "digests",
            },
        )
        for name in set(expected) - {"digests"}:
            self.assertEqual(expected[name], manifest[name])
        self.assertEqual(
            set(expected["digests"]), set(self.values) | {"ARTICLEPOD_SOURCE_READ_KEY"}
        )
        self.assertEqual(len(expected["digests"]), 38)
        for name, digest in expected["digests"].items():
            message = (
                b"ArticlePod GitHub secret migration v1\x00"
                + name.encode("utf-8")
                + b"\x00"
                + actual[name].encode("utf-8")
            )
            independently_computed = hmac.new(key, message, hashlib.sha256).hexdigest()
            self.assertTrue(hmac.compare_digest(digest, independently_computed))
        self.assertNotIn("synthetic-only", json.dumps(manifest))
        self.assertNotIn(actual["MIGRATION_PROOF_KEY"], json.dumps(manifest))

    def test_wrong_recipient_and_tampered_ciphertext_cannot_decrypt(self):
        ciphertext = base64.b64decode(self.manifest()["encrypted_values"]["APP_URL"])
        with self.assertRaises(CryptoError):
            SealedBox(PrivateKey.generate()).decrypt(ciphertext)
        corrupt = ciphertext[:-1] + bytes([ciphertext[-1] ^ 1])
        with self.assertRaises(CryptoError):
            SealedBox(self.recipient).decrypt(corrupt)

    def test_manifest_proof_keys_and_ciphertexts_are_fresh(self):
        first, second = self.manifest(), self.manifest()
        self.assertNotEqual(first["manifest_id"], second["manifest_id"])
        self.assertNotEqual(
            first["encrypted_values"]["APP_URL"], second["encrypted_values"]["APP_URL"]
        )
        self.assertNotEqual(
            self.decrypt(first)["MIGRATION_PROOF_KEY"],
            self.decrypt(second)["MIGRATION_PROOF_KEY"],
        )

    def test_exact_name_set_rejects_missing_or_additional_values(self):
        absent = dict(self.values)
        absent.pop("APP_URL")
        for values in (absent, {**self.values, "GITHUB_TOKEN": "synthetic-only-extra"}):
            with self.assertRaisesRegex(
                migration.ExportError, "secret_name_set_rejected"
            ):
                self.manifest(values)

    def test_empty_null_and_multibyte_oversize_values_fail_closed(self):
        for value in ("", "\x00", "x" * 49153, "\u00e9" * 24577, None):
            with self.subTest(value_type=type(value).__name__):
                with self.assertRaises(migration.ExportError):
                    self.manifest({**self.values, "APP_URL": value})

    def test_whitespace_and_maximum_secret_lengths_are_not_transformed(self):
        values = {name: "x" * 49152 for name in self.values}
        values["APP_URL"] = " \t\r\n"
        manifest = self.manifest(values)
        self.assertLess(
            len(json.dumps(manifest).encode()), migration.MAX_MANIFEST_BYTES
        )
        actual = self.decrypt(manifest)
        for name, value in values.items():
            self.assertEqual(actual[name], value)

    def test_manifest_bound_is_enforced(self):
        with mock.patch.object(migration, "MAX_MANIFEST_BYTES", 100):
            with self.assertRaisesRegex(
                migration.ExportError, "manifest_size_rejected"
            ):
                self.manifest()

    def test_proof_domain_name_and_value_all_matter(self):
        key = bytes(range(32))
        actual = migration.proof_digest(key, "APP_URL", "synthetic-only")
        self.assertNotEqual(
            actual, migration.proof_digest(key, "APP_ADMIN_PASSWORD", "synthetic-only")
        )
        self.assertNotEqual(
            actual, migration.proof_digest(key, "APP_URL", "synthetic-only\n")
        )
        self.assertNotEqual(
            actual,
            hmac.new(key, b"APP_URL\x00synthetic-only", hashlib.sha256).hexdigest(),
        )

    def test_key_generation_is_fresh_isolated_and_cleaned(self):
        with mock.patch.object(
            migration.subprocess, "run", wraps=subprocess.run
        ) as run:
            first_private, first_public = migration.generate_source_read_key(self.root)
        child_env = run.call_args.kwargs["env"]
        self.assertEqual(set(child_env) - {"SystemRoot"}, {"PATH", "LANG", "LC_ALL"})
        self.assertEqual(run.call_args.kwargs["stdout"], subprocess.DEVNULL)
        self.assertEqual(run.call_args.kwargs["stderr"], subprocess.DEVNULL)
        self.assertFalse((self.root / migration.KEY_DIRECTORY).exists())
        second_private, second_public = migration.generate_source_read_key(self.root)
        self.assertNotEqual(first_private, second_private)
        self.assertNotEqual(first_public, second_public)
        self.assertTrue(
            first_private.startswith("-----BEGIN OPENSSH PRIVATE KEY-----\n")
        )
        self.assertTrue(first_public.startswith(b"ssh-ed25519 "))
        self.assertFalse((self.root / migration.KEY_DIRECTORY).exists())

    def test_failed_or_interrupted_key_generation_cleans_only_its_files(self):
        unrelated = self.root / "preserve.txt"
        unrelated.write_text("synthetic-only")
        for failure in (
            subprocess.CalledProcessError(1, "ssh-keygen"),
            migration.ExportError("export_interrupted"),
        ):

            def fail(*_args, **_kwargs):
                (self.root / migration.KEY_DIRECTORY / "identity").write_text(
                    "synthetic-only"
                )
                raise failure

            with mock.patch.object(migration.subprocess, "run", side_effect=fail):
                with self.assertRaises(type(failure)):
                    migration.generate_source_read_key(self.root)
            self.assertFalse((self.root / migration.KEY_DIRECTORY).exists())
            self.assertEqual(unrelated.read_text(), "synthetic-only")

    def test_preexisting_key_directory_is_not_overwritten(self):
        directory = self.root / migration.KEY_DIRECTORY
        directory.mkdir()
        identity = directory / "identity"
        identity.write_text("synthetic-only-preexisting")
        with self.assertRaises(FileExistsError):
            migration.generate_source_read_key(self.root)
        self.assertEqual(identity.read_text(), "synthetic-only-preexisting")

    def test_artifact_has_only_two_bounded_files_and_no_overwrite(self):
        payload = json.dumps(self.manifest()).encode()
        migration.write_artifact(self.root, payload, b"synthetic-only-public-key")
        output = self.root / migration.OUTPUT_DIRECTORY
        self.assertEqual(
            {item.name for item in output.iterdir()},
            {
                "sealed-secrets.json",
                "articlepod-source-read.pub",
            },
        )
        if os.name != "nt":
            self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o700)
        with self.assertRaises(FileExistsError):
            migration.write_artifact(self.root, b"replacement", b"replacement")
        self.assertEqual((output / "sealed-secrets.json").read_bytes(), payload)
        with self.assertRaises(migration.ExportError):
            migration.write_artifact(self.root, payload, b"x" * 1025)
        with self.assertRaises(migration.ExportError):
            migration.write_artifact(self.root, b"x" * (4 * 1024 * 1024 + 1), b"public")

    def test_full_synthetic_export_ignores_unlisted_credentials(self):
        env = {**self.env, **{f"MIGRATE_{k}": v for k, v in self.values.items()}}
        env["GITHUB_TOKEN"] = "synthetic-only-never-export"
        env["MIGRATE_UNLISTED_SECRET"] = "synthetic-only-never-export"
        env["DESTINATION_PUBLIC_KEY"] = "not-an-input"
        migration.export(env)
        output = self.root / migration.OUTPUT_DIRECTORY
        manifest = json.loads((output / migration.MANIFEST_FILENAME).read_bytes())
        self.assertEqual(len(self.decrypt(manifest)), 40)
        self.assertTrue(
            (output / migration.PUBLIC_KEY_FILENAME)
            .read_bytes()
            .startswith(b"ssh-ed25519 ")
        )
        self.assertFalse((self.root / migration.KEY_DIRECTORY).exists())
        self.assertEqual(
            {item.name for item in self.root.iterdir()}, {migration.OUTPUT_DIRECTORY}
        )

    def test_bad_context_or_missing_value_stops_before_key_generation(self):
        with mock.patch.object(migration, "generate_source_read_key") as generate:
            with self.assertRaises(migration.ExportError):
                migration.export({**self.env, "GITHUB_REF": "refs/heads/feature"})
            with self.assertRaises(migration.ExportError):
                migration.export(self.env)
            generate.assert_not_called()
        self.assertEqual(list(self.root.iterdir()), [])

    def test_cli_consumes_only_allowlisted_env_and_prints_fixed_status(self):
        env = {**self.env, **{f"MIGRATE_{k}": v for k, v in self.values.items()}}
        env["GITHUB_TOKEN"] = "synthetic-only-never-export"
        captured = {}

        def inspect(received):
            captured.update(received)
            self.assertFalse(
                any(f"MIGRATE_{name}" in os.environ for name in self.values)
            )

        out = io.StringIO()
        with (
            mock.patch.dict(os.environ, env, clear=True),
            mock.patch.object(migration.sys, "argv", [str(SCRIPT)]),
            mock.patch.object(migration, "export", side_effect=inspect),
            contextlib.redirect_stdout(out),
        ):
            self.assertEqual(migration.main(), 0)
        self.assertNotIn("GITHUB_TOKEN", captured)
        self.assertEqual(
            out.getvalue(),
            "Sealed export prepared: 40 encrypted values, 2 artifact files.\n",
        )

    def test_tool_exception_is_redacted_and_failure_is_nonzero(self):
        error = subprocess.CalledProcessError(1, ["synthetic-only-secret-argument"])
        output = io.StringIO()
        with (
            mock.patch.object(migration.sys, "argv", [str(SCRIPT)]),
            mock.patch.object(migration, "export", side_effect=error),
            contextlib.redirect_stderr(output),
        ):
            self.assertEqual(migration.main(), 1)
        self.assertEqual(
            output.getvalue(),
            "::error::Secret migration failed: tooling_or_io_error.\n",
        )

    def test_cli_rejects_arbitrary_recipient_or_output_arguments(self):
        output = io.StringIO()
        with (
            mock.patch.object(
                migration.sys, "argv", [str(SCRIPT), "--recipient", "other"]
            ),
            contextlib.redirect_stderr(output),
        ):
            self.assertEqual(migration.main(), 1)
        self.assertEqual(
            output.getvalue(), "::error::Secret migration failed: arguments_rejected.\n"
        )


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.workflow = (REPO / migration.WORKFLOW_PATH).read_text()

    def test_credentials_exist_only_in_final_encryption_step(self):
        steps = re.split(r"^      - name: ", self.workflow, flags=re.MULTILINE)[1:]
        consumers = [step for step in steps if "${{ secrets." in step]
        self.assertEqual(len(consumers), 1)
        self.assertTrue(consumers[0].startswith("Seal the exact approved values"))
        injected = re.findall(
            r"^          MIGRATE_(\w+): \$\{\{ secrets\.(\w+) \}\}$",
            consumers[0],
            flags=re.MULTILINE,
        )
        self.assertEqual(len(injected), 37)
        self.assertEqual(
            {name for name, _ in injected}, set(migration.SOURCE_SECRET_NAMES)
        )
        self.assertTrue(all(name == secret for name, secret in injected))
        self.assertEqual(self.workflow.count("${{ secrets."), 37)
        self.assertNotIn("toJSON", self.workflow)
        self.assertNotIn("secrets.GITHUB_TOKEN", self.workflow)
        self.assertNotIn("id-token:", self.workflow)

    def test_dispatch_sha_and_production_source_guards_precede_credentials(self):
        for text in (
            "workflow_dispatch:",
            "required: true",
            "environment: production",
            "github.repository == 'talktovishal/Podcast'",
            "github.repository_id == '1152527211'",
            "github.ref == 'refs/heads/main'",
            "runs-on: ubuntu-24.04",
            "persist-credentials: false",
            "ref: ${{ github.sha }}",
            "group: deploy-azure-main",
            "cancel-in-progress: false",
        ):
            self.assertIn(text, self.workflow)
        self.assertEqual(
            self.workflow.count(
                "EXPECTED_SOURCE_SHA: ${{ inputs.expected_source_sha }}"
            ),
            2,
        )
        self.assertLess(
            self.workflow.index("--validate-context"),
            self.workflow.index("--require-hashes"),
        )
        self.assertLess(
            self.workflow.index("--require-hashes"), self.workflow.index("${{ secrets.")
        )
        self.assertLess(
            self.workflow.index("discover -s"), self.workflow.index("${{ secrets.")
        )
        self.assertNotRegex(
            self.workflow, r"(?m)^  (push|pull_request|workflow_call|schedule):"
        )

    def test_artifact_allowlist_retention_and_cleanup_are_fixed(self):
        self.assertIn("name: articlepod-sealed-secret-transfer", self.workflow)
        self.assertIn("retention-days: 1", self.workflow)
        self.assertIn("overwrite: false", self.workflow)
        self.assertIn("if-no-files-found: error", self.workflow)
        self.assertIn("include-hidden-files: false", self.workflow)
        paths = re.findall(
            r"^            \$\{\{ runner.temp \}\}/(.+)$", self.workflow, re.MULTILINE
        )
        self.assertEqual(
            paths,
            [
                "articlepod-sealed-secret-transfer/sealed-secrets.json",
                "articlepod-sealed-secret-transfer/articlepod-source-read.pub",
            ],
        )
        self.assertIn(
            "if: always()\n        run: python3 -I scripts/secret-migration/sealed_export.py --cleanup",
            self.workflow,
        )
        actions = re.findall(r"uses: ([^ \n]+)", self.workflow)
        self.assertEqual(len(actions), 2)
        self.assertTrue(
            all(
                re.fullmatch(r"actions/[\w-]+@[0-9a-f]{40}", action)
                for action in actions
            )
        )

    def test_no_application_dependencies_or_deployment_commands(self):
        for forbidden in (
            "pnpm ",
            "npm ",
            "az login",
            "ssh-keyscan",
            "deploy-changes.sh",
            "deploy-vm-runtime.sh",
            "curl ",
            "git push",
            "gh api",
        ):
            self.assertNotIn(forbidden, self.workflow)
        self.assertIn("--only-binary=:all:", self.workflow)
        self.assertIn("--no-deps", self.workflow)
        self.assertIn("--isolated install", self.workflow)


if __name__ == "__main__":
    unittest.main()
