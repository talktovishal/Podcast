"""Verify isolated Azure-profile builds, never production deployment artifacts."""

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
HOST_ENV_NAMES = frozenset({
    "PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP",
    "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
})
LOCAL_ENV_FILES = (".env", ".env.local", ".env.production", ".env.production.local")


def build_environment(inherited, backend):
    environment = {key: value for key, value in inherited.items() if key.upper() in HOST_ENV_NAMES}
    environment.update({
        "NODE_ENV": "production", "RUNTIME_PROFILE": "azure",
        "METADATA_PRIMARY_BACKEND": backend, "METADATA_MIRROR_BACKEND": "azure_table",
        "METADATA_MIRROR_DUAL_WRITE": "1", "STORAGE_BACKEND": "azure_blob",
        "APP_URL": "http://127.0.0.1:3000", "AZURE_STORAGE_CONTAINER": "articlepod-build",
        "AZURE_TABLE_PREFIX": "articlepodbuild", "ARTICLEPOD_BOOTSTRAP_ADMIN_ON_STARTUP": "1",
        "NEXT_TELEMETRY_DISABLED": "1", "OTEL_ENABLED": "0",
    })
    return environment


def check_local_env_files(root):
    for directory in (root, root / "apps" / "web"):
        for name in LOCAL_ENV_FILES:
            if os.path.lexists(directory / name):
                raise RuntimeError("LOCAL_ENV_FILES_PRESENT")


def run_stage(command, cwd, environment, stage, timeout=600):
    result = subprocess.run(
        command, cwd=cwd, env=environment, capture_output=True, text=True, encoding="utf-8",
        stdin=subprocess.DEVNULL, timeout=timeout,
    )
    if result.returncode:
        # Child inputs contain only public test settings, not runtime credentials.
        print((result.stdout + result.stderr)[-16_384:], file=sys.stderr)
        raise RuntimeError(stage + "_FAILED")
    return result.stdout


def verify_compiled_runtime(node, route, web, environment):
    probe = """
require("next/dist/server/require-hook");
try {
  require(process.argv[1]);
  process.exitCode = 2;
} catch (error) {
  if (error.message === process.argv[2]) {
    process.stdout.write("EXPECTED_RUNTIME_SECRET_GUARD");
  } else {
    console.error(JSON.stringify({ name: error.name, code: error.code, message: error.message }));
    process.exitCode = 1;
  }
}
"""
    for secret_name, extras in (
        ("DIGEST_SCHEDULER_SECRET", {}),
        ("MEDIA_SIGNING_KEY", {"DIGEST_SCHEDULER_SECRET": "fixture-runtime-probe"}),
    ):
        expected = f"{secret_name} must be set when RUNTIME_PROFILE is not 'simple'"
        result = subprocess.run(
            [node, "--eval", probe, str(route), expected],
            cwd=web, env={**environment, **extras}, capture_output=True, text=True, encoding="utf-8",
            stdin=subprocess.DEVNULL, timeout=30,
        )
        if result.returncode or result.stdout != "EXPECTED_RUNTIME_SECRET_GUARD":
            print(result.stderr[-16_384:], file=sys.stderr)
            raise RuntimeError(f"COMPILED_RUNTIME_{secret_name}_GUARD_FAILED")


def verify(backend):
    check_local_env_files(ROOT)
    node = shutil.which("node")
    if not node:
        raise RuntimeError("NODE_REQUIRED")
    web = ROOT / "apps" / "web"
    prisma = web / "node_modules" / "prisma" / "build" / "index.js"
    next_cli = web / "node_modules" / "next" / "dist" / "bin" / "next"
    if not prisma.is_file() or not next_cli.is_file():
        raise RuntimeError("INSTALLED_DEPENDENCIES_REQUIRED")
    environment = build_environment(os.environ, backend)
    schema = run_stage([
        node, "--input-type=module", "--eval",
        "import { resolvePrismaSchemaPath } from './scripts/prisma-profile.mjs';"
        "process.stdout.write(resolvePrismaSchemaPath());",
    ], ROOT, environment, "SCHEMA_SELECTION", timeout=30).strip()

    # Direct CLI generation also works on Windows. Invalidate only its generated
    # cache marker so subsequent normal commands cannot reuse the wrong profile.
    (ROOT / ".cache" / "prisma-generate-state.json").unlink(missing_ok=True)
    run_stage([node, str(prisma), "generate", "--schema", str(ROOT / schema)], web, environment, "PRISMA_GENERATION")
    run_stage([node, str(next_cli), "build"], web, environment, "PUBLIC_BUILD")

    route = web / ".next" / "server" / "app" / "api" / "auth" / "providers" / "route.js"
    if not route.is_file():
        raise RuntimeError("COMPILED_RUNTIME_ROUTE_MISSING")
    verify_compiled_runtime(node, route, web, environment)
    print(f"Secret-free {backend} build and compiled runtime secret guards passed.")
    print("These are isolated verification artifacts, not production deployment output.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata-backend", choices=("azure_table", "prisma"), default="azure_table")
    args = parser.parse_args()
    try:
        verify(args.metadata_backend)
        return 0
    except RuntimeError as error:
        print(f"Secret-free build verification blocked: {error}", file=sys.stderr)
    except (OSError, subprocess.SubprocessError, UnicodeError):
        print("Secret-free build verification blocked: EXECUTION_FAILED", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
