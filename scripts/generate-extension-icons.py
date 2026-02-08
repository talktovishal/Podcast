#!/usr/bin/env python3
"""Generate deterministic PNG icons for the ListenLater extension.

Uses only Python stdlib so the script works on a fresh machine.
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "apps" / "extension" / "icons"
SIZES = (16, 32, 48, 128)


def _png_chunk(chunk_type: bytes, payload: bytes) -> bytes:
    crc = zlib.crc32(chunk_type + payload) & 0xFFFFFFFF
    return struct.pack(">I", len(payload)) + chunk_type + payload + struct.pack(">I", crc)


def _pixel_rgba(x: int, y: int, size: int) -> tuple[int, int, int, int]:
    # Soft vertical gradient in brand-ish green tones.
    t = y / max(size - 1, 1)
    r = int(20 + 40 * t)
    g = int(50 + 130 * t)
    b = int(45 + 95 * t)

    # Subtle center glow.
    cx = (size - 1) / 2
    cy = (size - 1) / 2
    dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
    glow = max(0.0, 1.0 - (dist / (size * 0.8)))
    r = min(255, int(r + 36 * glow))
    g = min(255, int(g + 30 * glow))
    b = min(255, int(b + 24 * glow))
    return r, g, b, 255


def write_png(path: Path, size: int) -> None:
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0 per row
        for x in range(size):
            raw.extend(_pixel_rgba(x, y, size))

    compressed = zlib.compress(bytes(raw), level=9)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)

    png = bytearray()
    png.extend(b"\x89PNG\r\n\x1a\n")
    png.extend(_png_chunk(b"IHDR", ihdr))
    png.extend(_png_chunk(b"IDAT", compressed))
    png.extend(_png_chunk(b"IEND", b""))

    path.write_bytes(png)


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        write_png(ICON_DIR / f"icon{size}.png", size)
    print(f"Generated icons in {ICON_DIR}")


if __name__ == "__main__":
    main()
