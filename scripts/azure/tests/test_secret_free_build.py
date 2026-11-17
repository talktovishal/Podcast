import importlib.util
import io
import os
from contextlib import redirect_stderr
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch


path = Path(__file__).parents[1] / "verify-secret-free-build.py"
spec = importlib.util.spec_from_file_location("verify_secret_free_build", path)
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class SecretFreeBuildTests(unittest.TestCase):
    def test_only_host_environment_is_inherited(self):
        environment = build.build_environment({
            "Path": "fixture-path", "SystemRoot": "fixture-system",
            "ADMIN_PASSWORD": "fixture-retired", "DATABASE_URL": "fixture-db",
            "AZURE_STORAGE_CONNECTION_STRING": "fixture-storage",
            "GITHUB_TOKEN": "fixture-ci", "AZURE_CLIENT_SECRET": "fixture-admin",
            "NODE_OPTIONS": "fixture-injected", "NEXT_PHASE": "fixture-phase",
        }, "azure_table")
        self.assertEqual(environment["Path"], "fixture-path")
        self.assertEqual(environment["SystemRoot"], "fixture-system")
        for key in ("ADMIN_PASSWORD", "DATABASE_URL", "AZURE_STORAGE_CONNECTION_STRING",
                    "GITHUB_TOKEN", "AZURE_CLIENT_SECRET", "NODE_OPTIONS", "NEXT_PHASE"):
            self.assertNotIn(key, environment)
        self.assertEqual(environment["RUNTIME_PROFILE"], "azure")
        self.assertEqual(environment["METADATA_PRIMARY_BACKEND"], "azure_table")
        self.assertEqual(environment["METADATA_MIRROR_DUAL_WRITE"], "1")

    def test_each_metadata_backend_is_preserved(self):
        for backend in ("azure_table", "prisma"):
            self.assertEqual(build.build_environment({}, backend)["METADATA_PRIMARY_BACKEND"], backend)

    def test_local_environment_files_block_before_any_command(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            web = root / "apps" / "web"
            web.mkdir(parents=True)
            for parent in (root, web):
                for name in build.LOCAL_ENV_FILES:
                    with self.subTest(parent=parent, name=name):
                        target = parent / name
                        target.write_text("ADMIN_PASSWORD=fixture-private", encoding="utf-8")
                        with patch.object(build, "ROOT", root), patch.object(build.subprocess, "run") as run:
                            with self.assertRaisesRegex(RuntimeError, "^LOCAL_ENV_FILES_PRESENT$"):
                                build.verify("azure_table")
                            run.assert_not_called()
                        target.unlink()

    def test_examples_are_not_loaded_or_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env.azure.example").write_text("ADMIN_PASSWORD=fixture-example", encoding="utf-8")
            build.check_local_env_files(root)

    def test_captured_child_output_is_decoded_as_utf8(self):
        output = build.run_stage(
            [sys.executable, "-c", "import sys; sys.stdout.buffer.write(bytes([0xe2, 0x86, 0x90]))"],
            Path(__file__).parent,
            build.build_environment(os.environ, "azure_table"),
            "UTF8_FIXTURE",
            timeout=10,
        )
        self.assertEqual(output, "\u2190")

    def test_compiled_guard_requires_an_exact_success_marker_for_both_secrets(self):
        results = [Mock(returncode=0, stdout="EXPECTED_RUNTIME_SECRET_GUARD", stderr="") for _ in range(2)]
        with patch.object(build.subprocess, "run", side_effect=results) as run:
            build.verify_compiled_runtime("fixture-node", Path("fixture-route"), Path("."), {})
        self.assertEqual(run.call_count, 2)
        self.assertIn("next/dist/server/require-hook", run.call_args_list[0].args[0][2])
        self.assertEqual(run.call_args_list[1].kwargs["env"], {"DIGEST_SCHEDULER_SECRET": "fixture-runtime-probe"})

    def test_other_errors_and_successful_imports_cannot_pass_the_runtime_guard(self):
        for result in (
            Mock(returncode=1, stdout="", stderr="source text includes DIGEST_SCHEDULER_SECRET must be set"),
            Mock(returncode=0, stdout="", stderr=""),
            Mock(returncode=1, stdout="EXPECTED_RUNTIME_SECRET_GUARD", stderr="fixture later failure"),
        ):
            with self.subTest(result=result), patch.object(build.subprocess, "run", return_value=result):
                with redirect_stderr(io.StringIO()), self.assertRaisesRegex(RuntimeError, "COMPILED_RUNTIME_DIGEST_SCHEDULER_SECRET_GUARD_FAILED"):
                    build.verify_compiled_runtime("fixture-node", Path("fixture-route"), Path("."), {})


if __name__ == "__main__":
    unittest.main()
