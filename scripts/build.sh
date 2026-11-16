#!/bin/sh
# Validates and packages ./src into ./dist/auto-login-extension.zip
set -eu
cd "$(dirname "$0")/.."
for f in src/*.json; do node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$f"; done
# Every file referenced by the manifest must exist, and the version must be store-compatible.
node -e '
  const fs = require("fs"), m = JSON.parse(fs.readFileSync("src/manifest.json", "utf8"));
  if (m.manifest_version !== 3) throw new Error("manifest_version must be 3");
  if (!/^\d+(\.\d+){0,3}$/.test(m.version)) throw new Error("bad version: " + m.version);
  const files = [...m.content_scripts.flatMap((c) => c.js), m.action.default_popup, m.options_ui.page,
    ...Object.values(m.icons), ...Object.values(m.action.default_icon)];
  for (const f of files) if (!fs.existsSync("src/" + f)) throw new Error("missing file: " + f);
'
for f in src/*.js; do node --check "$f"; done
mkdir -p dist
rm -f dist/auto-login-extension.zip
(cd src && zip -r -X ../dist/auto-login-extension.zip . -x '.*')
rm -rf dist/unpacked && mkdir -p dist/unpacked && cp -r src/. dist/unpacked/
echo "Built dist/auto-login-extension.zip and dist/unpacked/"
