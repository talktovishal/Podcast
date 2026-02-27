#!/usr/bin/env python3
"""Generate deterministic brain-brand icon assets with Python stdlib only.

Outputs:
- Chrome extension icons (16/32/48/128 PNG)
- Web favicon.ico
- Web apple-icon.png
- Web brand marks (192/512 PNG)
- Podcast cover artwork (1400x1400 PNG)
"""

from __future__ import annotations

import struct
import zlib
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
EXT_ICON_DIR = ROOT / "apps" / "extension" / "icons"
WEB_APP_DIR = ROOT / "apps" / "web" / "src" / "app"
WEB_BRAND_DIR = ROOT / "apps" / "web" / "public" / "brand"

EXT_SIZES = (16, 32, 48, 128)
FAVICON_SIZES = (16, 32, 48)
WEB_MARK_SIZES = (192, 512)
APPLE_ICON_SIZE = 180
PODCAST_COVER_SIZE = 1400

Color = tuple[int, int, int]
Pixel = tuple[int, int, int, int]
CanvasMode = str


def _png_chunk(chunk_type: bytes, payload: bytes) -> bytes:
    crc = zlib.crc32(chunk_type + payload) & 0xFFFFFFFF
    return struct.pack(">I", len(payload)) + chunk_type + payload + struct.pack(">I", crc)


def _lerp(a: float, b: float, t: float) -> float:
    return a * (1.0 - t) + b * t


def _blend(base: Color, overlay: Color, alpha: float) -> Color:
    return (
        int(_lerp(base[0], overlay[0], alpha)),
        int(_lerp(base[1], overlay[1], alpha)),
        int(_lerp(base[2], overlay[2], alpha)),
    )


def _in_circle(nx: float, ny: float, cx: float, cy: float, radius: float) -> bool:
    dx = nx - cx
    dy = ny - cy
    return dx * dx + dy * dy <= radius * radius


def _in_ellipse(nx: float, ny: float, cx: float, cy: float, rx: float, ry: float) -> bool:
    if rx <= 0 or ry <= 0:
        return False
    dx = (nx - cx) / rx
    dy = (ny - cy) / ry
    return dx * dx + dy * dy <= 1.0


def _in_rounded_rect_norm(
    nx: float,
    ny: float,
    left: float,
    top: float,
    right: float,
    bottom: float,
    radius: float,
) -> bool:
    if left <= nx <= right and top + radius <= ny <= bottom - radius:
        return True
    if top <= ny <= bottom and left + radius <= nx <= right - radius:
        return True

    return (
        _in_circle(nx, ny, left + radius, top + radius, radius)
        or _in_circle(nx, ny, right - radius, top + radius, radius)
        or _in_circle(nx, ny, left + radius, bottom - radius, radius)
        or _in_circle(nx, ny, right - radius, bottom - radius, radius)
    )


def _brain_shape(nx: float, ny: float, scale: float) -> bool:
    circles = (
        (0.50, 0.40, 0.108),
        (0.40, 0.44, 0.118),
        (0.60, 0.44, 0.118),
        (0.35, 0.53, 0.106),
        (0.65, 0.53, 0.106),
        (0.43, 0.60, 0.104),
        (0.57, 0.60, 0.104),
    )

    for cx, cy, radius in circles:
        if _in_circle(nx, ny, cx, cy, radius * scale):
            return True

    return _in_ellipse(nx, ny, 0.50, 0.54, 0.30 * scale, 0.225 * scale)


def _brain_stem(nx: float, ny: float, scale: float) -> bool:
    width = 0.082 * scale
    top = 0.655
    bottom = 0.79
    radius = 0.032 * scale
    return _in_rounded_rect_norm(nx, ny, 0.5 - width, top, 0.5 + width, bottom, radius)


def _background_color(nx: float, ny: float) -> Color:
    top = (8, 47, 73)
    bottom = (7, 94, 84)
    t = max(0.0, min(1.0, ny))
    base = (
        int(_lerp(top[0], bottom[0], t)),
        int(_lerp(top[1], bottom[1], t)),
        int(_lerp(top[2], bottom[2], t)),
    )

    # Soft radial glow in upper-left.
    glow_dx = nx - 0.28
    glow_dy = ny - 0.22
    glow_dist = (glow_dx * glow_dx + glow_dy * glow_dy) ** 0.5
    glow_alpha = max(0.0, 1.0 - glow_dist / 0.72) * 0.34
    return _blend(base, (89, 208, 196), glow_alpha)


def _icon_pixel_rgba(x: int, y: int, size: int, mode: CanvasMode) -> Pixel:
    nx = (x + 0.5) / size
    ny = (y + 0.5) / size

    if mode == "icon":
        pad = 0.065
        radius = 0.215
        if not _in_rounded_rect_norm(nx, ny, pad, pad, 1.0 - pad, 1.0 - pad, radius):
            return (0, 0, 0, 0)

    color: Color = _background_color(nx, ny)
    alpha = 255

    outer_scale = 0.99
    inner_scale = 0.905
    stem_outer_scale = 0.96
    stem_inner_scale = 0.84

    in_outer = _brain_shape(nx, ny, outer_scale)
    in_inner = _brain_shape(nx, ny, inner_scale)

    if in_outer:
        color = (14, 71, 62)
    if in_inner:
        color = (232, 252, 250)

    in_stem_outer = _brain_stem(nx, ny, stem_outer_scale)
    in_stem_inner = _brain_stem(nx, ny, stem_inner_scale)
    if in_stem_outer:
        color = (14, 71, 62)
    if in_stem_inner:
        color = (202, 245, 240)

    # Brain grooves for medium/large icons. Keep them simple for small sizes.
    if in_inner and size >= 24:
        groove = (53, 123, 111)
        width = 0.008 if size >= 80 else 0.012

        if abs(nx - 0.50) <= width and 0.38 <= ny <= 0.67:
            color = groove

        if 0.42 <= ny <= 0.66:
            phase = (ny - 0.42) * 12.0
            left_curve = 0.435 + 0.024 * math.sin(phase)
            right_curve = 0.565 - 0.024 * math.sin(phase)
            if abs(nx - left_curve) <= width:
                color = groove
            if abs(nx - right_curve) <= width:
                color = groove

        if abs(ny - 0.50) <= width and 0.41 <= nx <= 0.59:
            color = groove

    return (color[0], color[1], color[2], alpha)


def _render_pixels(size: int, mode: CanvasMode) -> bytes:
    pixels = bytearray()
    for y in range(size):
        for x in range(size):
            pixels.extend(_icon_pixel_rgba(x, y, size, mode))
    return bytes(pixels)


def write_png(path: Path, size: int, mode: CanvasMode = "icon") -> None:
    pixel_bytes = _render_pixels(size, mode)
    raw = bytearray()

    stride = size * 4
    for y in range(size):
        raw.append(0)  # filter type 0 per row
        start = y * stride
        raw.extend(pixel_bytes[start : start + stride])

    compressed = zlib.compress(bytes(raw), level=9)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)

    png = bytearray()
    png.extend(b"\x89PNG\r\n\x1a\n")
    png.extend(_png_chunk(b"IHDR", ihdr))
    png.extend(_png_chunk(b"IDAT", compressed))
    png.extend(_png_chunk(b"IEND", b""))

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def _ico_bitmap(size: int) -> bytes:
    rgba = _render_pixels(size, "icon")

    # XOR bitmap: BGRA, bottom-up rows.
    xor = bytearray()
    stride = size * 4
    for y in range(size - 1, -1, -1):
        row = rgba[y * stride : y * stride + stride]
        for i in range(0, len(row), 4):
            r = row[i]
            g = row[i + 1]
            b = row[i + 2]
            a = row[i + 3]
            xor.extend((b, g, r, a))

    # AND mask: opaque (all zeros), row padded to 32-bit boundaries.
    mask_row = ((size + 31) // 32) * 4
    and_mask = b"\x00" * (mask_row * size)

    header = struct.pack(
        "<IIIHHIIIIII",
        40,  # BITMAPINFOHEADER size
        size,
        size * 2,  # includes XOR + AND heights
        1,  # planes
        32,  # bits/pixel
        0,  # BI_RGB
        len(xor) + len(and_mask),
        0,
        0,
        0,
        0,
    )
    return header + xor + and_mask


def write_ico(path: Path, sizes: tuple[int, ...]) -> None:
    bitmaps = [_ico_bitmap(size) for size in sizes]
    count = len(bitmaps)

    data = bytearray()
    data.extend(struct.pack("<HHH", 0, 1, count))

    offset = 6 + count * 16
    for size, bitmap in zip(sizes, bitmaps):
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
                len(bitmap),
                offset,
            )
        )
        offset += len(bitmap)

    for bitmap in bitmaps:
        data.extend(bitmap)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(data))


def main() -> None:
    EXT_ICON_DIR.mkdir(parents=True, exist_ok=True)
    WEB_APP_DIR.mkdir(parents=True, exist_ok=True)
    WEB_BRAND_DIR.mkdir(parents=True, exist_ok=True)

    for size in EXT_SIZES:
        write_png(EXT_ICON_DIR / f"icon{size}.png", size, "icon")

    write_ico(WEB_APP_DIR / "favicon.ico", FAVICON_SIZES)
    write_png(WEB_APP_DIR / "apple-icon.png", APPLE_ICON_SIZE, "icon")

    for size in WEB_MARK_SIZES:
        write_png(WEB_BRAND_DIR / f"brain-mark-{size}.png", size, "icon")
    write_png(WEB_BRAND_DIR / "podcast-cover-1400.png", PODCAST_COVER_SIZE, "cover")

    print(f"Generated extension icons in {EXT_ICON_DIR}")
    print(f"Generated web icons in {WEB_APP_DIR}")
    print(f"Generated brand assets in {WEB_BRAND_DIR}")


if __name__ == "__main__":
    main()
