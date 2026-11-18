#!/bin/bash
# Rebuilds mac/app-icon.icns from mac/app-icon.svg. Needs Node with the dev dependencies
# (npm install; npx playwright install chromium) to draw the SVG, and macOS for iconutil.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd -P)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
node --input-type=module - "$HERE/app-icon.svg" "$WORK/icon-1024.png" <<'JS'
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const [svg, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<body style="margin:0;background:transparent">${readFileSync(svg, "utf8")}</body>`);
await page.locator("svg").screenshot({ path: out, omitBackground: true });
await browser.close();
JS
mkdir "$WORK/app-icon.iconset"
for size in 16 32 128 256 512; do
    sips -z "$size" "$size" "$WORK/icon-1024.png" --out "$WORK/app-icon.iconset/icon_${size}x${size}.png" >/dev/null
    double=$((size * 2))
    sips -z "$double" "$double" "$WORK/icon-1024.png" --out "$WORK/app-icon.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$WORK/app-icon.iconset" -o "$HERE/app-icon.icns"
echo "Wrote $HERE/app-icon.icns"
