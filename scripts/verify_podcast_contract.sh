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

echo "== Extracting first enclosure URL =="
# This is a simple extractor; it assumes enclosure uses double quotes.
ENCLOSURE_LINE="$(grep -m 1 -oE '<enclosure[^>]*url="[^"]+"' "$tmp" || true)"
if [[ -z "$ENCLOSURE_LINE" ]]; then
  echo "FAIL: Could not find an <enclosure ... url=\"...\"> in RSS"
  exit 1
fi

MP3_URL="$(echo "$ENCLOSURE_LINE" | sed -E 's/.*url="([^"]+)".*/\1/')"
echo "MP3_URL: $MP3_URL"

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

echo "PASS: Feed + media look compatible (HEAD + Range OK)"
