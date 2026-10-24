"""Launch public-only commands or services with version-pinned, in-memory secrets."""

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
import urllib.parse
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
HOST_ENV_NAMES = frozenset({
    "PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "TZ",
    "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "USERPROFILE",
    "APPDATA", "LOCALAPPDATA",
})
PUBLIC_ENV_NAMES = frozenset("""
RUNTIME_PROFILE APP_URL STORAGE_BACKEND AZURE_STORAGE_CONTAINER
AZURE_STORAGE_CREATE_CONTAINER AZURE_STORAGE_ACCOUNT_URL STORAGE_ROOT MEDIA_ROOT UPLOAD_ROOT
PYTHON_TTS_URL PYTHON_TTS_TIMEOUT_MS PYTHON_TTS_RECYCLE_RSS_MB PYTHON_TTS_RECYCLE_IDLE_SECONDS
PYTHON_TTS_SYSTEMD_MEMORY_HIGH PYTHON_TTS_SYSTEMD_MEMORY_MAX PYTHON_TTS_SYSTEMD_RESTART_SEC
PINNED_FETCH_IPV6_ENABLED TTS_WORKERS WORKER_TTS_CHUNK_MAX_CHARS WORKER_TTS_MAX_CHUNKS
WORKER_TTS_SEGMENT_MAX_ATTEMPTS WORKER_TTS_SEGMENT_RETRY_BASE_MS
METADATA_PRIMARY_BACKEND METADATA_MIRROR_BACKEND METADATA_MIRROR_DUAL_WRITE METADATA_CANARY_COMPARE
WORKER_QUEUE_PRESSURE_SOURCE AZURE_TABLE_ACCOUNT_URL AZURE_TABLE_PREFIX AZURE_TABLE_CREATE_TABLES
WORKER_ROLE WORKER_OVERFLOW_ENABLED WORKER_OVERFLOW_POLICY_EVAL_MS WORKER_OVERFLOW_ACTIVATE_QUEUE_DEPTH
WORKER_OVERFLOW_DEACTIVATE_QUEUE_DEPTH WORKER_OVERFLOW_ACTIVATE_OLDEST_MS
WORKER_OVERFLOW_DEACTIVATE_OLDEST_MS WORKER_OVERFLOW_MIN_ACTIVE_MS
OVERFLOW_PYTHON_TTS_URL OVERFLOW_PYTHON_TTS_TIMEOUT_MS WORKER_POLL_MS WORKER_STALE_PROCESSING_MS
WORKER_MAX_STALE_RETRIES WORKER_MAX_PROCESSING_MS WORKER_RETRY_POLL_MS
LOG_ROOT LOG_RETENTION_DAYS LOG_ERROR_RETENTION_DAYS LOG_MAX_BYTES LOG_MAX_FILES
ARTICLEPOD_CONSOLE_LOGS PODCAST_REQUEST_LOGGING ANALYTICS_STORAGE_MODE JOB_EVENT_STORAGE_MODE
DEMO_EXTRACTION_TRACE_ENABLED DEMO_EMAIL WEBSTORE_REVIEWER_EMAIL ADMIN_EMAIL
ARTICLEPOD_BOOTSTRAP_ADMIN_ON_STARTUP ARTICLEPOD_SERVER_KEEPALIVE GOOGLE_CLIENT_ID APPLE_CLIENT_ID
PRO_MONTHLY_DAILY_PODCAST_LIMIT PRO_MONTHLY_DAILY_SUMMARY_LIMIT PRO_MONTHLY_WEEKLY_SUMMARY_LIMIT
PRO_ANNUAL_DAILY_PODCAST_LIMIT PRO_ANNUAL_DAILY_SUMMARY_LIMIT PRO_ANNUAL_WEEKLY_SUMMARY_LIMIT
BILLING_SANDBOX_ALLOWLIST_EMAILS STRIPE_LIVE_PRICE_PRO_MONTHLY STRIPE_LIVE_PRICE_PRO_ANNUAL
STRIPE_LIVE_BILLING_PORTAL_CONFIGURATION_ID STRIPE_SANDBOX_PRICE_PRO_MONTHLY
STRIPE_SANDBOX_PRICE_PRO_ANNUAL STRIPE_SANDBOX_BILLING_PORTAL_CONFIGURATION_ID
STRIPE_PRICE_PRO_MONTHLY STRIPE_PRICE_PRO_ANNUAL STRIPE_BILLING_PORTAL_CONFIGURATION_ID
DIGEST_SUMMARY_PROVIDER DIGEST_SUMMARY_PROXY_URL DIGEST_SUMMARY_TIMEOUT_MS AZURE_OPENAI_BASE_URL
AZURE_OPENAI_SUMMARY_NANO_DEPLOYMENT AZURE_OPENAI_SUMMARY_MINI_DEPLOYMENT
VM_JOURNAL_MAX_USE VM_JOURNAL_KEEP_FREE VM_JOURNAL_RETENTION VM_CLEANUP_MIN_FREE_MB
ARTICLEPOD_SECRET_SOURCE ARTICLEPOD_KEYVAULT_MANIFEST
""".split())


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


def read_protected_text(path, kind):
    descriptor = os.open(
        path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0),
    )
    with os.fdopen(descriptor, "rb") as source:
        metadata = os.fstat(source.fileno())
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > 65_536:
            raise SecretLoadError(f"UNSAFE_{kind}_FILE")
        if os.name == "posix" and (metadata.st_uid != 0 or metadata.st_mode & 0o022):
            raise SecretLoadError(f"{kind}_MUST_BE_ROOT_OWNED_AND_WRITE_PROTECTED")
        content = source.read(65_537)
        if len(content) > 65_536:
            raise SecretLoadError(f"UNSAFE_{kind}_FILE")
        return content.decode("utf-8")


def read_manifest(path):
    return json.loads(read_protected_text(path, "MANIFEST"), object_pairs_hook=unique_object)


def parse_public_environment(content):
    content = content.removeprefix("\ufeff").replace("\r\n", "\n")
    if re.search(r"[\x00-\x09\x0b-\x1f\x7f-\x9f\u2028\u2029]", content):
        raise SecretLoadError("INVALID_PUBLIC_ENVIRONMENT_LINE")
    settings, seen = {}, set()
    for line in content.split("\n"):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        match = re.fullmatch(r"([A-Z][A-Z0-9_]*)=([^\x00-\x1f\x7f]*)", line)
        if not match:
            raise SecretLoadError("INVALID_PUBLIC_ENVIRONMENT_LINE")
        name, value = match.groups()
        if name in seen:
            raise SecretLoadError("DUPLICATE_PUBLIC_ENVIRONMENT_FIELD")
        seen.add(name)
        if name in SECRET_ENV_NAMES:
            if value:
                raise SecretLoadError("PLAINTEXT_SECRET_IN_PUBLIC_ENVIRONMENT")
            continue
        if name not in PUBLIC_ENV_NAMES:
            raise SecretLoadError("UNSUPPORTED_PUBLIC_ENVIRONMENT_FIELD")
        if value != value.strip() or value.startswith(("'", '"')) or "\\" in value:
            raise SecretLoadError("PUBLIC_ENVIRONMENT_REQUIRES_LITERAL_UNQUOTED_VALUES")
        if value and name.endswith("_URL"):
            try:
                endpoint = urllib.parse.urlsplit(value)
            except ValueError:
                raise SecretLoadError("INVALID_PUBLIC_ENDPOINT") from None
            if (
                endpoint.scheme not in {"http", "https"} or not endpoint.netloc
                or any(char.isspace() for char in endpoint.netloc)
            ):
                raise SecretLoadError("INVALID_PUBLIC_ENDPOINT")
            if endpoint.username is not None or endpoint.password is not None or endpoint.query or endpoint.fragment:
                raise SecretLoadError("PUBLIC_ENDPOINT_CANNOT_CONTAIN_AUTH_OR_QUERY")
        settings[name] = value
    if settings.get("ARTICLEPOD_SECRET_SOURCE") != "keyvault":
        raise SecretLoadError("PUBLIC_ENVIRONMENT_REQUIRES_KEYVAULT")
    if not re.fullmatch(r"/[a-zA-Z0-9_./-]+", settings.get("ARTICLEPOD_KEYVAULT_MANIFEST", "")):
        raise SecretLoadError("PUBLIC_ENVIRONMENT_REQUIRES_ABSOLUTE_MANIFEST")
    if (
        settings.get("RUNTIME_PROFILE") != "azure"
        or settings.get("METADATA_PRIMARY_BACKEND") not in {"azure_table", "prisma"}
        or settings.get("STORAGE_BACKEND") != "azure_blob"
        or not all(settings.get(name) for name in ("APP_URL", "AZURE_STORAGE_CONTAINER", "PYTHON_TTS_URL"))
    ):
        raise SecretLoadError("INCOMPLETE_PUBLIC_RUNTIME_CONFIGURATION")
    return settings


def load_public_environment(path, inherited):
    if not path.is_absolute():
        raise SecretLoadError("PUBLIC_ENVIRONMENT_PATH_MUST_BE_ABSOLUTE")
    settings = parse_public_environment(read_protected_text(path, "PUBLIC_ENVIRONMENT"))
    environment = {name: value for name, value in inherited.items() if name.upper() in HOST_ENV_NAMES}
    return {**environment, **settings}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list-secret-names", action="store_true")
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--service", choices=sorted(SERVICES))
    parser.add_argument("--env-file", type=Path, help="Protected, rendered vault-mode public configuration")
    parser.add_argument("--public-only", action="store_true", help="Execute without requesting any vault secrets")
    parser.add_argument("--check-public-env-stdin", action="store_true", help="Validate candidate public configuration without writing or executing")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if args.list_secret_names:
        if args.manifest or args.service or args.command or args.env_file or args.public_only or args.check_public_env_stdin:
            parser.error("--list-secret-names cannot be combined with launch arguments")
        print("\n".join(sorted(SECRET_ENV_NAMES)))
        return 0
    if args.env_file and args.manifest:
        parser.error("--env-file selects its own manifest; do not also pass --manifest")
    if args.check_public_env_stdin:
        if args.env_file or args.manifest or args.service or args.public_only or args.command:
            parser.error("--check-public-env-stdin cannot be combined with launch arguments")
    elif args.public_only:
        if not args.env_file or args.manifest or args.service:
            parser.error("--public-only requires --env-file and cannot select a service or manifest")
    elif args.service is None or not (args.manifest or args.env_file):
        parser.error("A service and either --manifest or --env-file are required")
    command = args.command
    if command and command[0] == "--":
        command = command[1:]
    if not command and not args.check_public_env_stdin:
        parser.error("A service command is required after --")
    try:
        if os.name == "posix":
            import resource
            resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        if args.check_public_env_stdin:
            content = sys.stdin.buffer.read(65_537)
            if len(content) > 65_536:
                raise SecretLoadError("PUBLIC_ENVIRONMENT_TOO_LARGE")
            parse_public_environment(content.decode("utf-8"))
            return 0
        inherited = load_public_environment(args.env_file, os.environ) if args.env_file else os.environ
        if args.public_only:
            environment = inherited
        else:
            manifest_path = Path(inherited["ARTICLEPOD_KEYVAULT_MANIFEST"]) if args.env_file else args.manifest
            environment = load_environment(read_manifest(manifest_path), args.service, inherited)
        os.execvpe(command[0], command, environment)
    except SecretLoadError as error:
        print(f"Key Vault startup blocked: {error}", file=sys.stderr)
        return 1
    except (OSError, ValueError):
        print("Key Vault startup blocked: CONFIGURATION_OR_EXECUTION_FAILED", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
