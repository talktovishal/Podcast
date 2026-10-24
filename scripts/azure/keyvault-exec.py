"""Launch an existing service with version-pinned secrets held only in memory."""

import argparse
import http.client
import json
import os
from pathlib import Path
import re
import stat
import sys
import time
import urllib.error
import urllib.request


SECRET_ENV_NAMES = frozenset({
    "DATABASE_URL", "ADMIN_PASSWORD", "DEMO_PASSWORD", "WEBSTORE_REVIEWER_PASSWORD",
    "AZURE_STORAGE_CONNECTION_STRING", "AZURE_STORAGE_SAS_TOKEN",
    "AZURE_TABLE_CONNECTION_STRING", "AZURE_TABLE_SAS_TOKEN",
    "AZURE_OPENAI_API_KEY", "OPENAI_API_KEY", "GOOGLE_CLIENT_SECRET",
    "FACEBOOK_APP_SECRET", "APPLE_CLIENT_SECRET", "GITHUB_FEEDBACK_TOKEN",
    "AZURE_MONITOR_CONNECTION_STRING", "PYTHON_TTS_SECRET",
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
    "STRIPE_LIVE_SECRET_KEY", "STRIPE_LIVE_WEBHOOK_SECRET",
    "STRIPE_SANDBOX_SECRET_KEY", "STRIPE_SANDBOX_WEBHOOK_SECRET",
    "DIGEST_SCHEDULER_SECRET", "MEDIA_SIGNING_KEY", "TTS_SIDECAR_SECRET",
    "OVERFLOW_PYTHON_TTS_SECRET",
})
SERVICES = frozenset({"web", "worker", "python-tts", "worker-overflow", "ops"})
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})


class SecretLoadError(RuntimeError):
    pass


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise SecretLoadError("DUPLICATE_JSON_FIELD")
        result[key] = value
    return result


def request_json(url, headers, stage, *, opener=None, sleep=time.sleep):
    if opener is None:
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirects(),
        )
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers=headers)
            with opener.open(request, timeout=10) as response:
                payload = response.read(1_048_577)
            if len(payload) > 1_048_576:
                raise SecretLoadError(f"{stage}_RESPONSE_TOO_LARGE")
            result = json.loads(payload, object_pairs_hook=unique_object)
            if not isinstance(result, dict):
                raise SecretLoadError(f"{stage}_INVALID_RESPONSE")
            return result
        except urllib.error.HTTPError as error:
            error.close()
            if error.code in RETRY_STATUSES and attempt < 2:
                sleep(2 ** attempt)
                continue
            raise SecretLoadError(f"{stage}_HTTP_{error.code}") from None
        except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException):
            if attempt < 2:
                sleep(2 ** attempt)
                continue
            raise SecretLoadError(f"{stage}_CONNECTION_FAILED") from None
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise SecretLoadError(f"{stage}_INVALID_JSON") from None
    raise SecretLoadError(f"{stage}_RETRIES_EXHAUSTED")


def validate_manifest(manifest, service):
    if not isinstance(manifest, dict) or set(manifest) != {"vault_url", "services"}:
        raise SecretLoadError("INVALID_MANIFEST_FIELDS")
    vault = manifest["vault_url"]
    if not isinstance(vault, str) or not re.fullmatch(
        r"https://[a-zA-Z][a-zA-Z0-9-]{1,22}[a-zA-Z0-9]\.vault\.azure\.net", vault,
    ):
        raise SecretLoadError("INVALID_VAULT_URL")
    services = manifest["services"]
    if not isinstance(services, dict) or not services or set(services) - SERVICES:
        raise SecretLoadError("INVALID_SERVICE_MAP")
    for mapping in services.values():
        if not isinstance(mapping, dict) or not mapping or set(mapping) - SECRET_ENV_NAMES:
            raise SecretLoadError("INVALID_SECRET_ENVIRONMENT_NAMES")
        for reference in mapping.values():
            if not isinstance(reference, str) or not re.fullmatch(
                r"[a-zA-Z0-9-]{1,127}/[a-fA-F0-9]{32}", reference,
            ):
                raise SecretLoadError("SECRET_VERSION_REQUIRED")
    if service not in services:
        raise SecretLoadError("SERVICE_NOT_CONFIGURED")
    return vault, services[service]


def load_environment(manifest, service, inherited, *, fetch=request_json):
    vault, references = validate_manifest(manifest, service)
    # Never leave an old service secret in the child environment as a fallback.
    environment = {key: value for key, value in inherited.items() if key not in SECRET_ENV_NAMES}
    token_url = (
        "http://169.254.169.254/metadata/identity/oauth2/token"
        "?api-version=2018-02-01&resource=https%3A%2F%2Fvault.azure.net"
    )
    token = fetch(token_url, {"Metadata": "true"}, "IDENTITY").get("access_token")
    if not isinstance(token, str) or not token.strip():
        raise SecretLoadError("IDENTITY_TOKEN_MISSING")
    resolved = {}
    for name, reference in references.items():
        if reference not in resolved:
            secret_url = f"{vault}/secrets/{reference}"
            response = fetch(
                f"{secret_url}?api-version=7.4",
                {"Authorization": f"Bearer {token}"}, "KEYVAULT",
            )
            if not isinstance(response.get("id"), str) or response["id"].lower() != secret_url.lower():
                raise SecretLoadError("KEYVAULT_SECRET_VERSION_MISMATCH")
            value = response.get("value")
            if not isinstance(value, str) or not value or "\0" in value:
                raise SecretLoadError("KEYVAULT_SECRET_INVALID")
            attributes = response.get("attributes")
            if not isinstance(attributes, dict) or attributes.get("enabled") is not True:
                raise SecretLoadError("KEYVAULT_SECRET_NOT_ENABLED")
            for field in ("exp", "nbf"):
                if field in attributes and (
                    type(attributes[field]) is not int
                    or (field == "exp" and attributes[field] <= time.time())
                    or (field == "nbf" and attributes[field] > time.time())
                ):
                    raise SecretLoadError("KEYVAULT_SECRET_NOT_CURRENTLY_VALID")
            resolved[reference] = value
        environment[name] = resolved[reference]
    return environment


def read_manifest(path):
    # The manifest controls credentials injected into a service, so protect it
    # even though it contains references rather than secret values.
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "r", encoding="utf-8") as source:
        metadata = os.fstat(source.fileno())
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > 65_536:
            raise SecretLoadError("UNSAFE_MANIFEST_FILE")
        if os.name == "posix" and (metadata.st_uid != 0 or metadata.st_mode & 0o022):
            raise SecretLoadError("MANIFEST_MUST_BE_ROOT_OWNED_AND_WRITE_PROTECTED")
        return json.load(source, object_pairs_hook=unique_object)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--service", choices=sorted(SERVICES), required=True)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        parser.error("A service command is required after --")
    try:
        if os.name == "posix":
            import resource
            resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        environment = load_environment(read_manifest(args.manifest), args.service, os.environ)
        os.execvpe(command[0], command, environment)
    except SecretLoadError as error:
        print(f"Key Vault startup blocked: {error}", file=sys.stderr)
        return 1
    except (OSError, ValueError):
        print("Key Vault startup blocked: CONFIGURATION_OR_EXECUTION_FAILED", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
