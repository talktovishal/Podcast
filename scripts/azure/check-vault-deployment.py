#!/usr/bin/env python3
"""Read-only deployment path checks, invoked inside the public-only launcher."""

import os
from pathlib import Path
import sys


def check_deployment(app, staging, public_file, environment):
    for root in (app, staging):
        if not root.is_absolute() or root.resolve() != root or len(root.parts) < 3:
            raise ValueError("vault deployment requires canonical, non-root runtime and staging paths")
    if not app.is_dir() or app == staging or app in staging.parents or staging in app.parents:
        raise ValueError("vault deployment requires an existing runtime and a separate staging tree")
    for root in (app, staging):
        for directory in (root, root / "apps/web", root / "apps/worker", root / "services/python-tts"):
            for name in (".env", ".env.local", ".env.production", ".env.production.local", ".env.azure"):
                if os.path.lexists(directory / name):
                    raise ValueError("retire local environment files separately before vault deployment")
    manifest = environment.get("ARTICLEPOD_KEYVAULT_MANIFEST")
    if not manifest:
        raise ValueError("a protected vault manifest is required")
    configuration_paths = [config.resolve() for config in (public_file, Path(manifest))]
    for resolved in configuration_paths:
        if any(resolved == root or root in resolved.parents for root in (app, staging)):
            raise ValueError("protected configuration must be outside both deployment trees")
    for name in ("STORAGE_ROOT", "MEDIA_ROOT", "UPLOAD_ROOT", "LOG_ROOT"):
        value = environment.get(name)
        if not value:
            raise ValueError("explicit storage and log paths are required for vault deployment")
        path = Path(value)
        resolved = path.resolve()
        if not path.is_absolute() or len(resolved.parts) < 3:
            raise ValueError("unsafe runtime data path")
        if str(resolved) in {"/var/lib", "/var/log", "/var/cache"} or (
            len(resolved.parts) == 3 and resolved.parts[1] == "home"
        ):
            raise ValueError("unsafe runtime data path")
        for system_root in ("/etc", "/usr", "/bin", "/sbin", "/lib", "/lib64",
                            "/boot", "/proc", "/sys", "/dev", "/run", "/root"):
            forbidden = Path(system_root)
            if resolved == forbidden or forbidden in resolved.parents:
                raise ValueError("runtime data cannot target system configuration trees")
        if any(config == resolved or resolved in config.parents for config in configuration_paths):
            raise ValueError("runtime data cannot contain protected configuration")
        if resolved == staging or staging in resolved.parents or resolved in staging.parents:
            raise ValueError("runtime data cannot overlap staging")
        if resolved == app or resolved in app.parents:
            raise ValueError("runtime data cannot contain the application tree")
        if app in resolved.parents and not (resolved == app / ".runtime" or app / ".runtime" in resolved.parents):
            raise ValueError("runtime data inside the application must be under excluded .runtime")


def main():
    if len(sys.argv) != 4:
        print("[vault-deployment] runtime, staging, and public environment paths are required", file=sys.stderr)
        return 2
    try:
        check_deployment(*(Path(value) for value in sys.argv[1:]), os.environ)
    except ValueError as error:
        print(f"[vault-deployment] {error}", file=sys.stderr)
        return 1
    except OSError:
        print("[vault-deployment] deployment filesystem is not accessible", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
