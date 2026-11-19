#!/bin/bash
# Rebuilds mac/app-icon.icns and the Windows shortcut's app-icon.ico from mac/app-icon-source.png, a screenshot of the 3D village:
# the square CROP below is cut from it and set in a rounded macOS tile. Needs Node with the
# dev dependencies (npm install; npx playwright install chromium), and macOS for iconutil.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd -P)"
CROP="38 20 140"    # left, top, side, in the screenshot's pixels
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
node --input-type=module - "$HERE/app-icon-source.png" "$WORK/icon-1024.png" $CROP <<'JS'
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const [source, out, left, top, side] = process.argv.slice(2);
const image = `data:image/png;base64,${readFileSync(source).toString("base64")}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<body style="margin:0;background:transparent"><canvas width="1024" height="1024"></canvas></body>`);
await page.evaluate(async ({ image, left, top, side }) => {
    const img = new Image();
    img.src = image;
    await img.decode();
    const ctx = document.querySelector("canvas").getContext("2d");
    // The macOS icon grid: an 824-pixel tile, 100 pixels in from each edge, corner radius 185.
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    ctx.beginPath();
    ctx.roundRect(100, 100, 824, 824, 185);
    ctx.fillStyle = "#e7d3ab";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.save();
    ctx.clip();
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, +left, +top, +side, +side, 100, 100, 824, 824);
    ctx.restore();
}, { image, left, top, side });
await page.locator("canvas").screenshot({ path: out, omitBackground: true });
await browser.close();
JS
mkdir "$WORK/app-icon.iconset"
for size in 16 32 128 256 512; do
    sips -z "$size" "$size" "$WORK/icon-1024.png" --out "$WORK/app-icon.iconset/icon_${size}x${size}.png" >/dev/null
    double=$((size * 2))
    sips -z "$double" "$double" "$WORK/icon-1024.png" --out "$WORK/app-icon.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$WORK/app-icon.iconset" -o "$HERE/app-icon.icns"
# Windows: an .ico of PNG images (Windows Vista and later read them), sizes 16 to 256.
for size in 16 24 32 48 64 256; do
    sips -z "$size" "$size" "$WORK/icon-1024.png" --out "$WORK/ico-$size.png" >/dev/null
done
python3 - "$WORK" "$HERE/../app-icon.ico" <<'PY'
import struct, sys
from pathlib import Path
work, out = Path(sys.argv[1]), Path(sys.argv[2])
images = [(size, (work / f"ico-{size}.png").read_bytes()) for size in (16, 24, 32, 48, 64, 256)]
header = struct.pack("<HHH", 0, 1, len(images))
offset = len(header) + 16 * len(images)
entries, data = b"", b""
for size, png in images:
    entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(png), offset + len(data))
    data += png
out.write_bytes(header + entries + data)
PY
cp "$WORK/icon-1024.png" "${CV_ICON_PREVIEW:-/dev/null}"
echo "Wrote $HERE/app-icon.icns and $(cd "$HERE/.." && pwd -P)/app-icon.ico"
