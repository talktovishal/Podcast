#!/usr/bin/env bash
set -euo pipefail

FEED_URL="${1:-}"

if [[ -z "${FEED_URL}" ]]; then
  echo "Usage: $0 \"<FEED_URL>\""
  exit 2
fi

tmp="$(mktemp)"
cleanup() { rm -f "$tmp"; }
trap cleanup EXIT

echo "== Checking FEED HEAD =="
feed_head_code="$(curl -s -o /dev/null -w "%{http_code}" -I "$FEED_URL")"
echo "FEED HEAD status: $feed_head_code"
if [[ "$feed_head_code" -lt 200 || "$feed_head_code" -ge 400 ]]; then
  echo "FAIL: Feed HEAD request failed"
  exit 1
fi

echo "== Fetching RSS =="
curl -fsS "$FEED_URL" -o "$tmp"

echo "== Validating RSS contract =="
if ! grep -q 'xmlns:itunes=' "$tmp"; then
  echo "FAIL: RSS is missing iTunes namespace declaration"
  exit 1
fi

parse_result="$(python3 - "$tmp" <<'PY'
import email.utils
import sys
import xml.etree.ElementTree as ET

path = sys.argv[1]

def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)

try:
    tree = ET.parse(path)
except Exception as exc:
    fail(f"RSS is not valid XML: {exc}")

root = tree.getroot()
if root.tag != "rss":
    fail("Root element must be <rss>")

channel = root.find("channel")
if channel is None:
    fail("RSS is missing <channel>")

items = channel.findall("item")
if not items:
    fail("RSS has no <item> entries")

seen_guids: set[str] = set()
seen_enclosures: set[str] = set()
first_enclosure = ""
previous_date = None
itunes_ns = "{http://www.itunes.com/dtds/podcast-1.0.dtd}"

for index, item in enumerate(items, start=1):
    guid = (item.findtext("guid") or "").strip()
    if not guid:
        fail(f"Item {index} is missing GUID")
    if guid in seen_guids:
        fail(f"Duplicate GUID detected: {guid}")
    seen_guids.add(guid)

    pub_date = (item.findtext("pubDate") or "").strip()
    if not pub_date:
        fail(f"Item {index} is missing pubDate")
    parsed = email.utils.parsedate_to_datetime(pub_date)
    if parsed is None:
        fail(f"Item {index} has invalid RFC2822 pubDate: {pub_date}")

    if previous_date is not None and parsed > previous_date:
        fail("Feed items are not ordered newest-first by pubDate")
    previous_date = parsed

    enclosure = item.find("enclosure")
    if enclosure is None:
        fail(f"Item {index} is missing enclosure")

    url = (enclosure.attrib.get("url") or "").strip()
    length = (enclosure.attrib.get("length") or "").strip()
    mime = (enclosure.attrib.get("type") or "").strip()

    if not url:
        fail(f"Item {index} enclosure missing url")
    if url in seen_enclosures:
        fail(f"Duplicate enclosure URL detected: {url}")
    seen_enclosures.add(url)

    if not length.isdigit() or int(length) <= 0:
        fail(f"Item {index} enclosure length is invalid: {length}")
    if mime not in {"audio/mpeg", "audio/mp4"}:
        fail(f"Item {index} enclosure MIME must be audio/mpeg or audio/mp4, got: {mime}")

    if not first_enclosure:
        first_enclosure = url

itunes_image = channel.find(f"{itunes_ns}image")
if itunes_image is None:
    fail("Channel is missing <itunes:image>")

itunes_href = (itunes_image.attrib.get("href") or "").strip()
if not itunes_href:
    fail("<itunes:image> missing href")

image = channel.find("image")
if image is None:
    fail("Channel is missing <image>")

image_url = (image.findtext("url") or "").strip()
image_title = (image.findtext("title") or "").strip()
image_link = (image.findtext("link") or "").strip()
if not image_url:
    fail("<image><url> is missing")
if not image_title:
    fail("<image><title> is missing")
if not image_link:
    fail("<image><link> is missing")

print(first_enclosure)
print(itunes_href)
PY
)"

MP3_URL="$(printf '%s\n' "$parse_result" | sed -n '1p')"
ARTWORK_URL="$(printf '%s\n' "$parse_result" | sed -n '2p')"

if [[ -z "$MP3_URL" ]]; then
  echo "FAIL: No enclosure URL found after RSS validation"
  exit 1
fi
if [[ -z "$ARTWORK_URL" ]]; then
  echo "FAIL: No artwork URL found after RSS validation"
  exit 1
fi

echo "MP3_URL: $MP3_URL"
echo "ARTWORK_URL: $ARTWORK_URL"

echo "== Checking MP3 HEAD =="
mp3_head_code="$(curl -s -o /dev/null -w "%{http_code}" -I "$MP3_URL")"
echo "MP3 HEAD status: $mp3_head_code"
if [[ "$mp3_head_code" -lt 200 || "$mp3_head_code" -ge 400 ]]; then
  echo "FAIL: MP3 HEAD request failed"
  exit 1
fi

echo "== Checking MP3 Range (expect 206) =="
range_code="$(curl -s -o /dev/null -w "%{http_code}" -H "Range: bytes=0-1" "$MP3_URL")"
echo "MP3 Range status: $range_code"
if [[ "$range_code" != "206" ]]; then
  echo "FAIL: Expected 206 for Range request, got $range_code"
  exit 1
fi

echo "== Checking artwork HEAD =="
artwork_head_code="$(curl -s -o /dev/null -w "%{http_code}" -I "$ARTWORK_URL")"
echo "Artwork HEAD status: $artwork_head_code"
if [[ "$artwork_head_code" -lt 200 || "$artwork_head_code" -ge 400 ]]; then
  echo "FAIL: Artwork HEAD request failed"
  exit 1
fi

echo "PASS: Feed + media look compatible (HEAD + Range OK)"
