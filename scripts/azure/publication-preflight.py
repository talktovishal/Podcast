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
HOST_KEY_TYPES = {"ssh-ed25519", "ssh-rsa", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521"}


class PreflightError(RuntimeError):
    def __init__(self, code, diagnostics=None):
        super().__init__(code)
        self.code = code
        self.diagnostics = diagnostics or {}


def ssh_failure_code(stderr):
    text = stderr.lower()
    if "remote host identification has changed" in text:
        return "SSH_HOST_KEY_CHANGED"
    if "host key is known for" in text and "strict checking" in text:
        return "SSH_HOST_KEY_NOT_PINNED"
    if "host key verification failed" in text:
        return "SSH_HOST_KEY_NOT_TRUSTED"
    if "invalid format" in text or "error in libcrypto" in text:
        return "SSH_KEY_FORMAT_INVALID"
    if "permission denied" in text:
        return "SSH_AUTHENTICATION_DENIED"
    if "a password is required" in text or "not allowed to execute" in text:
        return "SUDO_AUTHORIZATION_REQUIRED"
    if "timed out" in text or "no route to host" in text or "connection refused" in text:
        return "SSH_HOST_UNREACHABLE"
    if "could not resolve hostname" in text:
        return "SSH_HOSTNAME_UNRESOLVED"
    return "SSH_REMOTE_CHECK_FAILED"


def pin_diagnostics(host, hosts_path, stored):
    try:
        keys = subprocess.run(
            ["ssh-keygen", "-l", "-f", str(hosts_path)],
            capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=10,
        )
        matching = subprocess.run(
            ["ssh-keygen", "-F", host, "-f", str(hosts_path)],
            capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return {"pin_diagnostics_available": False}
    lines = [line.strip() for line in stored.splitlines() if line.strip() and not line.lstrip().startswith("#")]
    raw_public_key = len(lines) == 1 and lines[0].split()[0] in HOST_KEY_TYPES
    return {
        "pin_diagnostics_available": True,
        "pin_file_has_valid_keys": keys.returncode == 0,
        "pin_file_matches_target": matching.returncode == 0 and bool(matching.stdout.strip()),
        "pin_payload_is_single_public_key": raw_public_key,
    }


def saved_host_keys(stored):
    pins, revoked, hosts = set(), set(), set()
    for line in stored.splitlines():
        fields = line.split()
        if not fields or fields[0].startswith("#"):
            continue
        if fields[0] == "@revoked" and len(fields) >= 4:
            revoked.add((fields[2], fields[3]))
        elif not fields[0].startswith("@") and len(fields) >= 3 and fields[1] in HOST_KEY_TYPES:
            hosts.add(fields[0])
            pins.add((fields[1], fields[2]))
    return pins - revoked, hosts


def compare_target_to_saved_pins(host, stored):
    pins, hosts = saved_host_keys(stored)
    if not pins:
        return {"pin_comparison_available": False}
    try:
        result = subprocess.run(
            ["ssh-keyscan", "-T", "5", "-t", "ed25519,ecdsa,rsa", host],
            capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=20,
        )
    except (OSError, subprocess.SubprocessError):
        return {"pin_comparison_available": False}
    if result.returncode or len(result.stdout) > 65_536:
        return {"pin_comparison_available": False}
    presented, _ = saved_host_keys(result.stdout)
    # Comparison is diagnostic only. These advertised keys are never accepted,
    # saved, or substituted into the strict SSH attempt.
    return {
        "pin_comparison_available": bool(presented),
        "pin_has_one_host_group": len(hosts) == 1,
        "target_key_matches_saved_pin": bool(presented & pins),
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
            code = ssh_failure_code(result.stderr)
            diagnostics = {}
            if code in {"SSH_HOST_KEY_CHANGED", "SSH_HOST_KEY_NOT_PINNED", "SSH_HOST_KEY_NOT_TRUSTED"}:
                diagnostics = pin_diagnostics(host, hosts_path, known_hosts)
            if code == "SSH_HOST_KEY_NOT_PINNED" and diagnostics.get("pin_file_has_valid_keys") and not diagnostics.get("pin_file_matches_target"):
                diagnostics.update(compare_target_to_saved_pins(host, known_hosts))
            raise PreflightError(code, diagnostics)
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
    except PreflightError as error:
        print(json.dumps({"status": "blocked", "reason": error.code, **error.diagnostics}))
        sys.exit(1)
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as error:
        # Never relay SSH stderr, exception payloads, or remote response text.
        print(json.dumps({"status": "blocked", "error_type": type(error).__name__}))
        sys.exit(1)
