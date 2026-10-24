"""One-time fixed-recipient export. Never run locally with real credentials."""

import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import stat
import subprocess
import sys
import uuid
from collections.abc import Mapping


SOURCE_REPOSITORY = "talktovishal/Podcast"
SOURCE_REPOSITORY_ID = 1152527211
DESTINATION_REPOSITORY = "talktovishal/Podcast-Deploy"
DESTINATION_REPOSITORY_ID = 1431956894
DESTINATION_ENVIRONMENT = "production"
DESTINATION_KEY_ID = "3380204578043523366"
DESTINATION_PUBLIC_KEY = "ewHO348nnu4z1c8MHyJNndxnvYbckcX7GBv59wEGHVw="
WORKFLOW_PATH = ".github/workflows/migrate-deployment-secrets.yml"
HMAC_DOMAIN = b"ArticlePod GitHub secret migration v1\x00"
MAX_SECRET_BYTES = 49152
MAX_MANIFEST_BYTES = 4 * 1024 * 1024
MAX_PUBLIC_KEY_BYTES = 1024
KEY_DIRECTORY = "articlepod-secret-migration-key"
OUTPUT_DIRECTORY = "articlepod-sealed-secret-transfer"
MANIFEST_FILENAME = "sealed-secrets.json"
PUBLIC_KEY_FILENAME = "articlepod-source-read.pub"
SOURCE_SECRET_NAMES = (
    "ADMIN_PASSWORD",
    "APP_ADMIN_PASSWORD",
    "APP_AZURE_OPENAI_API_KEY",
    "APP_AZURE_OPENAI_BASE_URL",
    "APP_AZURE_OPENAI_SUMMARY_MINI_DEPLOYMENT",
    "APP_AZURE_OPENAI_SUMMARY_NANO_DEPLOYMENT",
    "APP_AZURE_STORAGE_CONNECTION_STRING",
    "APP_BILLING_SANDBOX_ALLOWLIST_EMAILS",
    "APP_DATABASE_URL",
    "APP_DEMO_PASSWORD",
    "APP_DOMAIN_ALIASES",
    "APP_GOOGLE_CLIENT_ID",
    "APP_GOOGLE_CLIENT_SECRET",
    "APP_STRIPE_BILLING_PORTAL_CONFIGURATION_ID",
    "APP_STRIPE_LIVE_BILLING_PORTAL_CONFIGURATION_ID",
    "APP_STRIPE_LIVE_PRICE_PRO_ANNUAL",
    "APP_STRIPE_LIVE_PRICE_PRO_MONTHLY",
    "APP_STRIPE_LIVE_SECRET_KEY",
    "APP_STRIPE_LIVE_WEBHOOK_SECRET",
    "APP_STRIPE_PRICE_PRO_ANNUAL",
    "APP_STRIPE_PRICE_PRO_MONTHLY",
    "APP_STRIPE_SANDBOX_BILLING_PORTAL_CONFIGURATION_ID",
    "APP_STRIPE_SANDBOX_PRICE_PRO_ANNUAL",
    "APP_STRIPE_SANDBOX_PRICE_PRO_MONTHLY",
    "APP_STRIPE_SANDBOX_SECRET_KEY",
    "APP_STRIPE_SANDBOX_WEBHOOK_SECRET",
    "APP_STRIPE_SECRET_KEY",
    "APP_STRIPE_WEBHOOK_SECRET",
    "APP_URL",
    "APP_WEBSTORE_REVIEWER_EMAIL",
    "APP_WEBSTORE_REVIEWER_PASSWORD",
    "AZURE_SSH_KEY",
    "AZURE_SSH_KNOWN_HOSTS",
    "AZURE_VM_HOST",
    "DEMO_PASSWORD",
    "LETSENCRYPT_EMAIL",
    "APP_SMOKE_FEED_TOKEN",
)
GENERATED_SECRET_NAMES = (
    "ARTICLEPOD_SOURCE_READ_KEY",
    "MIGRATION_PROOF_KEY",
    "MIGRATION_PROOF_EXPECTED",
)


class ExportError(Exception):
    """Fixed diagnostic codes only, never secret values or untrusted metadata."""


def validate_context(env: Mapping[str, str]) -> dict[str, str | int]:
    required = {
        "GITHUB_ACTIONS": "true",
        "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_REPOSITORY": SOURCE_REPOSITORY,
        "GITHUB_REPOSITORY_ID": str(SOURCE_REPOSITORY_ID),
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": f"{SOURCE_REPOSITORY}/{WORKFLOW_PATH}@refs/heads/main",
        "RUNNER_ENVIRONMENT": "github-hosted",
        "RUNNER_OS": "Linux",
    }
    if any(env.get(name) != value for name, value in required.items()):
        raise ExportError("source_context_rejected")
    sha = env.get("GITHUB_SHA", "")
    if (
        not re.fullmatch(r"[0-9a-f]{40}", sha)
        or env.get("EXPECTED_SOURCE_SHA") != sha
        or env.get("GITHUB_WORKFLOW_SHA") != sha
    ):
        raise ExportError("source_sha_rejected")
    run_id = env.get("GITHUB_RUN_ID", "")
    attempt = env.get("GITHUB_RUN_ATTEMPT", "")
    if not all(re.fullmatch(r"[1-9][0-9]{0,19}", item) for item in (run_id, attempt)):
        raise ExportError("source_run_rejected")
    return {
        "source_repository": SOURCE_REPOSITORY,
        "source_repository_id": SOURCE_REPOSITORY_ID,
        "source_sha": sha,
        "source_run_id": run_id,
        "source_run_attempt": int(attempt),
    }


def validate_values(values: Mapping[str, str], names: tuple[str, ...]) -> None:
    if set(values) != set(names):
        raise ExportError("secret_name_set_rejected")
    for value in values.values():
        if not isinstance(value, str) or not value or "\x00" in value:
            raise ExportError("empty_or_invalid_secret")
        if len(value.encode("utf-8")) > MAX_SECRET_BYTES:
            raise ExportError("secret_size_rejected")


def proof_digest(key: bytes, name: str, value: str) -> str:
    message = HMAC_DOMAIN + name.encode("utf-8") + b"\x00" + value.encode("utf-8")
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def build_manifest(
    source: Mapping[str, str | int], values: Mapping[str, str], source_read_key: str
) -> bytes:
    # Import only after the credential-free, hash-locked installation.
    from nacl.public import PublicKey, SealedBox

    validate_values(values, SOURCE_SECRET_NAMES)
    migrated = {**values, "ARTICLEPOD_SOURCE_READ_KEY": source_read_key}
    validate_values(migrated, SOURCE_SECRET_NAMES + ("ARTICLEPOD_SOURCE_READ_KEY",))
    bindings = {
        "schema_version": 1,
        "manifest_id": str(uuid.uuid4()),
        "source_repository": source["source_repository"],
        "source_sha": source["source_sha"],
        "source_run_id": source["source_run_id"],
        "source_run_attempt": source["source_run_attempt"],
        "destination_repository": DESTINATION_REPOSITORY,
        "destination_repository_id": DESTINATION_REPOSITORY_ID,
        "destination_environment": DESTINATION_ENVIRONMENT,
    }
    proof_key = secrets.token_bytes(32)
    expected = {
        **bindings,
        "digests": {
            name: proof_digest(proof_key, name, value)
            for name, value in migrated.items()
        },
    }
    all_values = {
        **migrated,
        "MIGRATION_PROOF_KEY": base64.b64encode(proof_key).decode("ascii"),
        "MIGRATION_PROOF_EXPECTED": json.dumps(
            expected, ensure_ascii=True, sort_keys=True, separators=(",", ":")
        ),
    }
    validate_values(all_values, SOURCE_SECRET_NAMES + GENERATED_SECRET_NAMES)
    recipient = PublicKey(base64.b64decode(DESTINATION_PUBLIC_KEY, validate=True))
    box = SealedBox(recipient)
    manifest = {
        **bindings,
        "source_repository_id": SOURCE_REPOSITORY_ID,
        "destination_environment_public_key_id": DESTINATION_KEY_ID,
        "encrypted_values": {
            name: base64.b64encode(box.encrypt(value.encode("utf-8"))).decode("ascii")
            for name, value in all_values.items()
        },
    }
    payload = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    if len(payload) > MAX_MANIFEST_BYTES:
        raise ExportError("manifest_size_rejected")
    return payload


def runner_temp(env: Mapping[str, str]) -> Path:
    value = env.get("RUNNER_TEMP", "")
    path = Path(value)
    if not value or not path.is_absolute() or not path.is_dir() or path.is_symlink():
        raise ExportError("runner_temp_rejected")
    return path.resolve(strict=True)


def cleanup_key_directory(root: Path) -> None:
    directory = root / KEY_DIRECTORY
    if directory.is_symlink():
        raise ExportError("key_directory_rejected")
    if directory.exists():
        for name in ("identity", "identity.pub"):
            (directory / name).unlink(missing_ok=True)
        directory.rmdir()


def generate_source_read_key(root: Path) -> tuple[str, bytes]:
    directory = root / KEY_DIRECTORY
    directory.mkdir(mode=0o700)
    try:
        keygen = shutil.which("ssh-keygen")
        if not keygen:
            raise ExportError("ssh_keygen_unavailable")
        child_env = {"PATH": os.defpath, "LANG": "C", "LC_ALL": "C"}
        if os.name == "nt":
            child_env["SystemRoot"] = os.environ["SystemRoot"]
        identity = directory / "identity"
        subprocess.run(
            [
                keygen,
                "-q",
                "-t",
                "ed25519",
                "-N",
                "",
                "-C",
                "articlepod-source-read",
                "-f",
                str(identity),
            ],
            env=child_env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=30,
            check=True,
        )
        identity.chmod(0o600)
        if os.name != "nt" and (
            stat.S_IMODE(directory.stat().st_mode) != 0o700
            or stat.S_IMODE(identity.stat().st_mode) != 0o600
        ):
            raise ExportError("key_permissions_rejected")
        private_key = identity.read_bytes()
        public_key = identity.with_suffix(".pub").read_bytes()
        if (
            not private_key.startswith(b"-----BEGIN OPENSSH PRIVATE KEY-----\n")
            or len(private_key) > MAX_SECRET_BYTES
            or len(public_key) > MAX_PUBLIC_KEY_BYTES
            or not re.fullmatch(
                rb"ssh-ed25519 [A-Za-z0-9+/]+=* articlepod-source-read\r?\n", public_key
            )
        ):
            raise ExportError("generated_key_rejected")
        return private_key.decode("ascii"), public_key
    finally:
        cleanup_key_directory(root)


def write_artifact(root: Path, manifest: bytes, public_key: bytes) -> None:
    if (
        not manifest
        or len(manifest) > MAX_MANIFEST_BYTES
        or not public_key
        or len(public_key) > MAX_PUBLIC_KEY_BYTES
    ):
        raise ExportError("artifact_size_rejected")
    directory = root / OUTPUT_DIRECTORY
    directory.mkdir(mode=0o700)
    for name, payload in (
        (MANIFEST_FILENAME, manifest),
        (PUBLIC_KEY_FILENAME, public_key),
    ):
        with (directory / name).open("xb") as output:
            output.write(payload)


def export(env: Mapping[str, str]) -> None:
    source = validate_context(env)
    root = runner_temp(env)
    values = {name: env.get(f"MIGRATE_{name}", "") for name in SOURCE_SECRET_NAMES}
    validate_values(values, SOURCE_SECRET_NAMES)
    private_key, public_key = generate_source_read_key(root)
    manifest = build_manifest(source, values, private_key)
    write_artifact(root, manifest, public_key)


def interrupted(_signum: int, _frame: object) -> None:
    raise ExportError("export_interrupted")


def main() -> int:
    os.umask(0o077)
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        if sys.argv[1:] == ["--validate-context"]:
            validate_context(os.environ)
            runner_temp(os.environ)
            print("Source migration context verified.")
        elif sys.argv[1:] == ["--cleanup"]:
            cleanup_key_directory(runner_temp(os.environ))
        elif not sys.argv[1:]:
            # Do not leave injected values available to subprocesses or imports.
            env = {
                name: os.environ[name]
                for name in (
                    "GITHUB_ACTIONS",
                    "GITHUB_EVENT_NAME",
                    "GITHUB_REPOSITORY",
                    "GITHUB_REPOSITORY_ID",
                    "GITHUB_REF",
                    "GITHUB_WORKFLOW_REF",
                    "GITHUB_WORKFLOW_SHA",
                    "GITHUB_SHA",
                    "EXPECTED_SOURCE_SHA",
                    "GITHUB_RUN_ID",
                    "GITHUB_RUN_ATTEMPT",
                    "RUNNER_ENVIRONMENT",
                    "RUNNER_OS",
                    "RUNNER_TEMP",
                )
                if name in os.environ
            }
            for name in SOURCE_SECRET_NAMES:
                env[f"MIGRATE_{name}"] = os.environ.pop(f"MIGRATE_{name}", "")
            export(env)
            print("Sealed export prepared: 40 encrypted values, 2 artifact files.")
        else:
            raise ExportError("arguments_rejected")
    except ExportError as error:
        print(f"::error::Secret migration failed: {error}.", file=sys.stderr)
        return 1
    except (OSError, ValueError, ImportError, subprocess.SubprocessError):
        # Boundary redaction: tool/library exception text can contain arguments.
        print("::error::Secret migration failed: tooling_or_io_error.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
