#!/usr/bin/env bash
set -euo pipefail

SOURCE_VECTOR="assets/icon-source.svg"
SOURCE_IMAGE="assets/icon-source.png"
ICONSET_DIR="assets/icon.iconset"
OUTPUT_ICNS="assets/icon.icns"

if [[ ! -f "scripts/generate-icon-source-svg.cjs" ]]; then
  echo "Missing source generator: scripts/generate-icon-source-svg.cjs" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to generate icon sources" >&2
  exit 1
fi

# Generate SVG source from React component (single source of truth).
node scripts/generate-icon-source-svg.cjs

if [[ ! -f "$SOURCE_VECTOR" ]]; then
  echo "Generated source vector not found: $SOURCE_VECTOR" >&2
  exit 1
fi

# Generate canonical PNG from SVG using Chromium renderer to match Electron/UI logo rendering.
node scripts/render-icon-source.mjs "$SOURCE_VECTOR" "$SOURCE_IMAGE" 1024

rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

# Create all required iconset sizes for macOS app icons.
sips -z 16 16 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null

iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_ICNS"

echo "Generated $OUTPUT_ICNS from $SOURCE_IMAGE"
