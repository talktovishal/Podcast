"""Reject legacy deployment before it overwrites a vault-managed environment."""

import os
from pathlib import Path
import sys


def assert_legacy(environment_file):
    if os.environ.get("ARTICLEPOD_SECRET_SOURCE", "environment") != "environment":
        raise ValueError("LEGACY_DEPLOY_CANNOT_ACTIVATE_KEYVAULT")
    path = Path(environment_file)
    try:
        with path.open(encoding="utf-8-sig") as source:
            modes = [
                line.split("=", 1)[1].strip()
                for line in source
                if "=" in line and line.split("=", 1)[0].strip() == "ARTICLEPOD_SECRET_SOURCE"
            ]
    except FileNotFoundError:
        # Initial provisioning has no environment file to overwrite yet.
        return
    if modes and (len(modes) != 1 or modes[0] not in ("environment", "'environment'", '"environment"')):
        raise ValueError("LEGACY_DEPLOY_CANNOT_OVERWRITE_SECRET_SOURCE")


def main():
    if len(sys.argv) != 2:
        print("Deployment blocked: ENVIRONMENT_PATH_REQUIRED", file=sys.stderr)
        return 1
    try:
        assert_legacy(sys.argv[1])
    except ValueError:
        print("Deployment blocked: vault-aware build/operations cutover is not implemented; retain the active configuration", file=sys.stderr)
        return 1
    except OSError:
        print("Deployment blocked: ENVIRONMENT_FILE_UNREADABLE", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
