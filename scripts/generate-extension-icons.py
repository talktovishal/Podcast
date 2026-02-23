#!/usr/bin/env python3
"""Generate deterministic PNG icons for the ArticlePod extension.

Uses only Python stdlib so the script works on a fresh machine.
The icon is designed to stay legible at 16/32/48 while also serving as
the 128x128 Chrome Web Store icon.
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


def _in_rounded_rect(x: int, y: int, left: int, top: int, right: int, bottom: int, radius: int) -> bool:
    if left <= x <= right and top + radius <= y <= bottom - radius:
        return True
    if top <= y <= bottom and left + radius <= x <= right - radius:
        return True

    corners = (
        (left + radius, top + radius),
        (right - radius, top + radius),
        (left + radius, bottom - radius),
        (right - radius, bottom - radius),
    )
    for cx, cy in corners:
        dx = x - cx
        dy = y - cy
        if dx * dx + dy * dy <= radius * radius:
            return True
    return False


def _in_circle(x: int, y: int, cx: float, cy: float, radius: float) -> bool:
    dx = x - cx
    dy = y - cy
    return (dx * dx + dy * dy) <= radius * radius


def _in_triangle(
    x: int,
    y: int,
    ax: float,
    ay: float,
    bx: float,
    by: float,
    cx: float,
    cy: float,
) -> bool:
    # Barycentric sign method.
    def sign(px: float, py: float, qx: float, qy: float, rx: float, ry: float) -> float:
        return (px - rx) * (qy - ry) - (qx - rx) * (py - ry)

    b1 = sign(x, y, ax, ay, bx, by) < 0.0
    b2 = sign(x, y, bx, by, cx, cy) < 0.0
    b3 = sign(x, y, cx, cy, ax, ay) < 0.0
    return b1 == b2 and b2 == b3


def _blend(base: tuple[int, int, int], overlay: tuple[int, int, int], alpha: float) -> tuple[int, int, int]:
    return (
        int(base[0] * (1 - alpha) + overlay[0] * alpha),
        int(base[1] * (1 - alpha) + overlay[1] * alpha),
        int(base[2] * (1 - alpha) + overlay[2] * alpha),
    )


def _pixel_rgba(x: int, y: int, size: int) -> tuple[int, int, int, int]:
    # Icon-safe padding and geometry scales with size.
    pad = max(1, int(size * 0.08))
    left, top = pad, pad
    right, bottom = size - 1 - pad, size - 1 - pad
    corner_radius = max(2, int(size * 0.17))

    if not _in_rounded_rect(x, y, left, top, right, bottom, corner_radius):
        return (0, 0, 0, 0)

    # Blue gradient background (readable in store + extension chrome).
    t = y / max(size - 1, 1)
    bg_top = (37, 99, 235)
    bg_bottom = (30, 64, 175)
    r = int(bg_top[0] * (1 - t) + bg_bottom[0] * t)
    g = int(bg_top[1] * (1 - t) + bg_bottom[1] * t)
    b = int(bg_top[2] * (1 - t) + bg_bottom[2] * t)
    color = (r, g, b)

    # Soft radial highlight in upper-left.
    hx = size * 0.34
    hy = size * 0.30
    hdist = ((x - hx) ** 2 + (y - hy) ** 2) ** 0.5
    hstrength = max(0.0, 1.0 - hdist / (size * 0.60)) * 0.30
    color = _blend(color, (255, 255, 255), hstrength)

    # Central "document card" to imply readable artifact.
    card_w = int(size * 0.50)
    card_h = int(size * 0.58)
    card_left = int(size * 0.20)
    card_top = int(size * 0.19)
    card_right = card_left + card_w
    card_bottom = card_top + card_h
    card_radius = max(2, int(size * 0.06))
    if _in_rounded_rect(x, y, card_left, card_top, card_right, card_bottom, card_radius):
        color = (248, 250, 252)

        # Top guide lines on card.
        line_left = card_left + int(size * 0.06)
        line_right = card_right - int(size * 0.10)
        if line_left <= x <= line_right:
            line_y1 = card_top + int(size * 0.12)
            line_y2 = line_y1 + int(size * 0.07)
            line_y3 = line_y2 + int(size * 0.07)
            if abs(y - line_y1) <= max(1, int(size * 0.01)):
                color = (191, 219, 254)
            if abs(y - line_y2) <= max(1, int(size * 0.01)):
                color = (219, 234, 254)
            if abs(y - line_y3) <= max(1, int(size * 0.01)):
                color = (219, 234, 254)

    # Play button circle overlays the card.
    play_cx = size * 0.60
    play_cy = size * 0.62
    play_r = size * 0.19
    if _in_circle(x, y, play_cx, play_cy, play_r):
        color = (14, 116, 144)

        tri_pad = size * 0.05
        ax, ay = play_cx - tri_pad, play_cy - tri_pad
        bx, by = play_cx - tri_pad, play_cy + tri_pad
        cx_, cy_ = play_cx + tri_pad * 1.15, play_cy
        if _in_triangle(x, y, ax, ay, bx, by, cx_, cy_):
            color = (255, 255, 255)

    # Small "signal" dots imply ongoing summaries/updates.
    dot1_cx, dot1_cy = size * 0.82, size * 0.30
    dot2_cx, dot2_cy = size * 0.86, size * 0.38
    dot_r = max(1.2, size * 0.022)
    if _in_circle(x, y, dot1_cx, dot1_cy, dot_r) or _in_circle(x, y, dot2_cx, dot2_cy, dot_r):
        color = (147, 197, 253)

    return color[0], color[1], color[2], 255


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
