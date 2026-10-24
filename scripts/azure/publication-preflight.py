"""Read-only production capability inventory with no secret-bearing output."""

import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


REMOTE_CHECK = r'''
import json, os, urllib.request, urllib.error, subprocess

result = {
    "web_running": False,
    "runtime_env_readable": False,
    "azure_table_primary": False,
    "managed_identity_available": False,
    "arm_permissions_readable": False,
}
try:
    pid = subprocess.check_output(
        ["systemctl", "show", "articlepod-web.service", "--property=MainPID", "--value"],
        text=True, stderr=subprocess.DEVNULL,
    ).strip()
    if pid.isdigit() and int(pid) > 0:
        result["web_running"] = True
        with open("/proc/" + pid + "/environ", "rb") as source:
            entries = source.read().split(b"\0")
        env = dict(entry.split(b"=", 1) for entry in entries if b"=" in entry)
        result["runtime_env_readable"] = True
        result["azure_table_primary"] = env.get(b"METADATA_PRIMARY_BACKEND") == b"azure_table"

    # IMDS must not be sent through a configured proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    metadata = urllib.request.Request(
        "http://169.254.169.254/metadata/instance/compute?api-version=2021-02-01",
        headers={"Metadata": "true"},
    )
    with opener.open(metadata, timeout=10) as response:
        compute = json.load(response)
    token_request = urllib.request.Request(
        "http://169.254.169.254/metadata/identity/oauth2/token"
        "?api-version=2018-02-01&resource=https%3A%2F%2Fmanagement.azure.com%2F",
        headers={"Metadata": "true"},
    )
    with opener.open(token_request, timeout=10) as response:
        token = json.load(response)["access_token"]
    result["managed_identity_available"] = True
    from urllib.parse import quote
    scope = "/subscriptions/" + quote(compute["subscriptionId"], safe="")
    scope += "/resourceGroups/" + quote(compute["resourceGroupName"], safe="")
    permissions_request = urllib.request.Request(
        "https://management.azure.com" + scope
        + "/providers/Microsoft.Authorization/permissions?api-version=2022-04-01",
        headers={"Authorization": "Bearer " + token},
    )
    with opener.open(permissions_request, timeout=15) as response:
        permissions = json.load(response)
    result["arm_permissions_readable"] = True
    # Permission discovery is not itself authorization to provision anything.
except urllib.error.HTTPError as error:
    result["http_status"] = error.code
except (OSError, ValueError, KeyError, subprocess.SubprocessError):
    result["check_error"] = True

print(json.dumps(result))
'''

BOOLEAN_FIELDS = {
    "web_running", "runtime_env_readable", "azure_table_primary",
    "managed_identity_available", "arm_permissions_readable", "check_error",
}


def safe_result(output):
    result = json.loads(output)
    if not isinstance(result, dict) or set(result) - (BOOLEAN_FIELDS | {"http_status"}):
        raise ValueError("Unexpected inventory response")
    for name, value in result.items():
        if name in BOOLEAN_FIELDS and type(value) is not bool:
            raise ValueError("Inventory field must be boolean")
        if name == "http_status" and (type(value) is not int or not 100 <= value <= 599):
            raise ValueError("Invalid HTTP status")
    required = BOOLEAN_FIELDS - {"check_error"}
    if not required.issubset(result):
        raise ValueError("Incomplete inventory response")
    return result


def main():
    host = os.environ.get("TARGET_HOST", "")
    user = os.environ.get("TARGET_USER") or "azureuser"
    key = os.environ.get("AZURE_SSH_KEY", "")
    known_hosts = os.environ.get("AZURE_SSH_KNOWN_HOSTS", "")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.:-]*", host):
        raise ValueError("Invalid or missing TARGET_HOST")
    if not re.fullmatch(r"[a-z_][a-z0-9_-]*", user):
        raise ValueError("Invalid TARGET_USER")
    if not key.strip() or not known_hosts.strip():
        raise ValueError("SSH key and pinned known hosts are required")

    with tempfile.TemporaryDirectory(prefix="articlepod-preflight-") as directory:
        key_path = Path(directory) / "key"
        hosts_path = Path(directory) / "known_hosts"
        for path, value in [(key_path, key), (hosts_path, known_hosts)]:
            path.write_text(value.rstrip() + "\n", encoding="utf-8")
            path.chmod(0o600)
        result = subprocess.run(
            [
                "ssh", "-i", str(key_path), "-o", "BatchMode=yes",
                "-o", "StrictHostKeyChecking=yes",
                "-o", f"UserKnownHostsFile={hosts_path}",
                "-o", "ConnectTimeout=15", "-o", "LogLevel=ERROR",
                f"{user}@{host}", "sudo -n python3 -",
            ],
            input=REMOTE_CHECK, capture_output=True, text=True, timeout=90,
        )
        if result.returncode:
            raise RuntimeError("Read-only SSH check failed; no deployment was attempted")
        inventory = safe_result(result.stdout)
        print(json.dumps(inventory))
        if inventory.get("check_error") or "http_status" in inventory:
            return 1
        if not all(inventory[name] for name in BOOLEAN_FIELDS - {"check_error"}):
            return 1
        return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as error:
        # Never relay SSH stderr, exception payloads, or remote response text.
        print(json.dumps({"status": "blocked", "error_type": type(error).__name__}))
        sys.exit(1)
