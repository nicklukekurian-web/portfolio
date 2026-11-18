#!/usr/bin/env bash
# Copy only the public site into dist/ for deployment. Nothing else is published.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist
cp index.html proof.html contact.html 404.html favicon.svg favicon.ico favicon-192.png favicon-512.png apple-touch-icon.png site.webmanifest robots.txt sitemap.xml dist/
cp -R css js data assets dist/
rm -f dist/assets/fonts/*.txt.bak 2>/dev/null || true
rm -rf dist/assets/source-images                # design references only; the pages rebuild them as exhibits
rm -f dist/assets/banner.png dist/assets/divider.png dist/assets/star.gif   # README art, not part of the site
find dist/assets/icons -name '*.png' -delete
python3 scripts/site_data.py dist/*.html          # fill {{ncl.*}} from data/ncl.json
sed -i.bak 's/export const DEV = true;/export const DEV = false;/' dist/js/core/env.js && rm dist/js/core/env.js.bak   # debug HUD and ?exp= inert in production
grep -q 'DEV = false' dist/js/core/env.js || { echo 'build: DEV flag not cleared' >&2; exit 1; }
rm -f dist/assets/video/checkpoint-demo.mp4   # the 1080p source stays in the repo; the page serves the 720p files
echo "dist/ ready: $(find dist -type f | wc -l | tr -d ' ') files"
