#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_DIR="$ROOT_DIR/apps/extension"
DIST_DIR="$ROOT_DIR/dist/extension"
PACKAGE_DIR="$DIST_DIR/package"
METADATA_DIR="$DIST_DIR/webstore"

required_files=(
  "$EXT_DIR/manifest.json"
  "$EXT_DIR/popup.html"
  "$EXT_DIR/runtime-config.js"
  "$EXT_DIR/popup.js"
  "$EXT_DIR/capture-page.mjs"
  "$EXT_DIR/target-tab.mjs"
  "$EXT_DIR/popup.css"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file"
    exit 1
  fi
done

if command -v python3 >/dev/null 2>&1; then
  python3 "$ROOT_DIR/scripts/generate-extension-icons.py" >/dev/null
else
  echo "python3 is required to generate extension icons."
  exit 1
fi

for icon in icon16.png icon32.png icon48.png icon128.png; do
  if [[ ! -f "$EXT_DIR/icons/$icon" ]]; then
    echo "Missing icon after generation: $EXT_DIR/icons/$icon"
    exit 1
  fi
done

manifest_version="$(node -e 'const fs=require("fs"); const m=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(m.version);' "$EXT_DIR/manifest.json")"
if [[ -z "$manifest_version" ]]; then
  echo "Could not read extension version from manifest.json"
  exit 1
fi

mkdir -p "$DIST_DIR"
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR/icons"

cp "$EXT_DIR/manifest.json" "$PACKAGE_DIR/"
cp "$EXT_DIR/popup.html" "$PACKAGE_DIR/"
cp "$EXT_DIR/runtime-config.js" "$PACKAGE_DIR/"
cp "$EXT_DIR/popup.js" "$PACKAGE_DIR/"
cp "$EXT_DIR/capture-page.mjs" "$PACKAGE_DIR/"
cp "$EXT_DIR/target-tab.mjs" "$PACKAGE_DIR/"
cp "$EXT_DIR/popup.css" "$PACKAGE_DIR/"
cp "$EXT_DIR/icons/"*.png "$PACKAGE_DIR/icons/"

zip_path="$DIST_DIR/articlepod-capture-v${manifest_version}.zip"
rm -f "$zip_path"
(
  cd "$PACKAGE_DIR"
  zip -qr "$zip_path" .
)

rm -rf "$METADATA_DIR"
mkdir -p "$METADATA_DIR"
cp "$EXT_DIR/webstore/"* "$METADATA_DIR/"

checksum_file="$DIST_DIR/articlepod-capture-v${manifest_version}.sha256"
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$zip_path" >"$checksum_file"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$zip_path" >"$checksum_file"
else
  echo "No checksum tool found (shasum/sha256sum). Skipping checksum file."
fi

cat >"$DIST_DIR/README.txt" <<SUMMARY
ArticlePod Chrome extension package created.

Version: $manifest_version
ZIP: $zip_path
Metadata templates: $METADATA_DIR

Install locally:
1) Open chrome://extensions
2) Enable Developer mode
3) Load unpacked -> $EXT_DIR

Private Web Store flow checklist:
- See docs/chrome-webstore-private-publish.md
SUMMARY

echo "Extension package ready: $zip_path"
echo "Metadata copied to: $METADATA_DIR"
