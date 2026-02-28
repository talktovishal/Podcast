#!/usr/bin/env python3
"""Generate icon assets from a single source PNG.

Source:
- apps/extension/icons/my-1024-1024-icon.png

Outputs:
- Chrome extension icons (16/32/48/128 PNG)
- Web favicon.ico
- Web apple-icon.png
- Web brand marks (192/512 PNG)
- Podcast cover artwork (1400x1400 PNG)
"""

from __future__ import annotations

import struct
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE_ICON = ROOT / "apps" / "extension" / "icons" / "my-1024-1024-icon.png"

EXT_ICON_DIR = ROOT / "apps" / "extension" / "icons"
WEB_APP_DIR = ROOT / "apps" / "web" / "src" / "app"
WEB_BRAND_DIR = ROOT / "apps" / "web" / "public" / "brand"

EXT_SIZES = (16, 32, 48, 128)
FAVICON_SIZES = (16, 32, 48)
WEB_MARK_SIZES = (192, 512)
APPLE_ICON_SIZE = 180
PODCAST_COVER_SIZE = 1400


def _run_sips_resize(source: Path, size: int, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "sips",
            "-z",
            str(size),
            str(size),
            str(source),
            "--out",
            str(out_path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _write_ico_from_pngs(png_paths: list[Path], ico_path: Path) -> None:
    entries: list[tuple[int, bytes]] = []
    for path in png_paths:
        size = int(path.stem)
        entries.append((size, path.read_bytes()))

    entries.sort(key=lambda item: item[0])
    count = len(entries)

    data = bytearray()
    data.extend(struct.pack("<HHH", 0, 1, count))

    offset = 6 + count * 16
    for size, png_bytes in entries:
        width = 0 if size >= 256 else size
        height = 0 if size >= 256 else size
        data.extend(
            struct.pack(
                "<BBBBHHII",
                width,
                height,
                0,  # color count
                0,  # reserved
                1,  # planes
                32,  # bits/pixel
                len(png_bytes),
                offset,
            )
        )
        offset += len(png_bytes)

    for _, png_bytes in entries:
        data.extend(png_bytes)

    ico_path.parent.mkdir(parents=True, exist_ok=True)
    ico_path.write_bytes(data)


def main() -> None:
    if not SOURCE_ICON.exists():
        raise SystemExit(f"Source icon not found: {SOURCE_ICON}")

    EXT_ICON_DIR.mkdir(parents=True, exist_ok=True)
    WEB_APP_DIR.mkdir(parents=True, exist_ok=True)
    WEB_BRAND_DIR.mkdir(parents=True, exist_ok=True)

    for size in EXT_SIZES:
        _run_sips_resize(SOURCE_ICON, size, EXT_ICON_DIR / f"icon{size}.png")

    _run_sips_resize(SOURCE_ICON, APPLE_ICON_SIZE, WEB_APP_DIR / "apple-icon.png")

    for size in WEB_MARK_SIZES:
        _run_sips_resize(SOURCE_ICON, size, WEB_BRAND_DIR / f"brain-mark-{size}.png")

    _run_sips_resize(SOURCE_ICON, PODCAST_COVER_SIZE, WEB_BRAND_DIR / "podcast-cover-1400.png")

    with tempfile.TemporaryDirectory(prefix="articlepod-favicon-") as tmp_dir:
        tmp_root = Path(tmp_dir)
        png_paths: list[Path] = []
        for size in FAVICON_SIZES:
            tmp_png = tmp_root / f"{size}.png"
            _run_sips_resize(SOURCE_ICON, size, tmp_png)
            png_paths.append(tmp_png)
        _write_ico_from_pngs(png_paths, WEB_APP_DIR / "favicon.ico")

    print(f"Source icon: {SOURCE_ICON}")
    print(f"Generated extension icons in {EXT_ICON_DIR}")
    print(f"Generated web icons in {WEB_APP_DIR}")
    print(f"Generated brand assets in {WEB_BRAND_DIR}")


if __name__ == "__main__":
    main()
