#!/usr/bin/env bash
# Build a Cowork-installable .plugin from this repo.
#
# The repo's source layout keeps `foresights/templates/` at the root of the
# plugin directory for ergonomics — that's where you run `npm install` /
# `npm run preflight`. The Cowork plugin validator, however, needs templates/
# under skills/create-dashboard/templates/ to match the SKILL.md install path
# (`${CLAUDE_PLUGIN_ROOT}/skills/create-dashboard/templates/`). This script
# stages a clean copy with the templates/ relocation applied, drops every
# known cruft pattern, verifies the tree is import-complete, and zips it.
#
# Usage:
#   bash scripts/build-plugin.sh           # uses version from plugin.json
#   bash scripts/build-plugin.sh 0.6.0     # override version suffix
#
# Output:
#   foresights-<version>.plugin            # at the repo root

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_ROOT/foresights"

if [[ ! -d "$SRC" ]]; then
  echo "error: $SRC not found — run from repo root" >&2
  exit 1
fi

# Resolve version: arg override > plugin.json > fallback
VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  if command -v jq >/dev/null 2>&1; then
    VERSION="$(jq -r .version "$SRC/.claude-plugin/plugin.json")"
  else
    # Tiny fallback parser — looks for `"version": "X.Y.Z"` on its own line
    VERSION="$(grep -E '"version"' "$SRC/.claude-plugin/plugin.json" \
      | head -1 \
      | sed -E 's/.*"version":\s*"([^"]+)".*/\1/')"
  fi
fi

if [[ -z "$VERSION" ]]; then
  echo "error: could not resolve plugin version" >&2
  exit 1
fi

STAGE="$(mktemp -d -t foresights-stage.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT

# v0.9.0+: ensure the pre-bundled wizard entrypoints (`wizard/build.js`,
# `wizard/refresh.js`) and the vendored `esbuild-wasm` package are present in
# the source tree before we stage. The plugin ships them so the user runs
# `node wizard/build.js` directly — no `tsx`, no `npm install` at install
# time, no native esbuild binary required.
#
# `wizard/build.js` / `refresh.js` are gitignored, bundled from the `.ts`
# sources by `prebuild-wizard`. They must be REBUILT on every package, not just
# when absent: a stale `build.js` left in a dev checkout would otherwise ship a
# bundle that predates the current `.ts` sources, silently dropping source
# fixes (incl. the security preflight) from the release. prebuild-wizard is
# ~200ms, so always run it.
if [[ ! -d "$SRC/templates/node_modules/esbuild-wasm" ]]; then
  echo "-> npm install in $SRC/templates (vendoring esbuild-wasm)"
  ( cd "$SRC/templates" \
    && npm install --prefer-offline --no-audit --no-fund >/dev/null )
fi
echo "-> Rebuild wizard entrypoints from source (prebuild-wizard)"
( cd "$SRC/templates" && npm run prebuild-wizard >/dev/null )

echo "-> Staging plugin v$VERSION at $STAGE"

# Copy the four things that belong in the bundle: manifest, README, skills,
# and assets. Reference/ stays out (gitignored content not needed at runtime).
for d in .claude-plugin README.md skills assets; do
  if [[ -e "$SRC/$d" ]]; then
    cp -R "$SRC/$d" "$STAGE/"
  fi
done

# LICENSE lives at the REPO ROOT (one source of truth) — copy it into the
# plugin staging so the marketplace card can render the license badge and
# users can read the terms from inside the installed plugin folder.
if [[ -e "$REPO_ROOT/LICENSE" ]]; then
  cp "$REPO_ROOT/LICENSE" "$STAGE/LICENSE"
fi

# Move templates/ under skills/create-dashboard/ to match SKILL.md path.
if [[ -d "$SRC/templates" ]]; then
  cp -R "$SRC/templates" "$STAGE/skills/create-dashboard/templates"
fi

# Drop the known cruft patterns. These only appear when building from a
# working tree where `npm install` / `npm test` / a smoke run have happened;
# a clean clone has none of them. Everything dropped here is gitignored — see
# foresights/templates/.gitignore — so it must never reach the bundle. The
# exception is `node_modules/esbuild-wasm/` (the one runtime dep), which we
# vendor back in below.
TPL="$STAGE/skills/create-dashboard/templates"
rm -rf "$STAGE/skills/setup-claude-code" 2>/dev/null || true
rm -rf "$TPL/node_modules" "$TPL/dist" "$TPL/coverage" 2>/dev/null || true
rm -f "$TPL/_smoke.mjs" 2>/dev/null || true
find "$STAGE" -name .DS_Store -delete
find "$STAGE" -name '*.tsbuildinfo' -delete
find "$STAGE" -name 'vitest.config.ts.timestamp-*' -delete
find "$STAGE" -name 'tmp-wizard-test' -type d -exec rm -rf {} + 2>/dev/null || true
find "$STAGE" -name 'tmp-wizard-refresh-test' -type d -exec rm -rf {} + 2>/dev/null || true
find "$STAGE" -name 'tmp-zero-install-test' -type d -exec rm -rf {} + 2>/dev/null || true

# Vendor `esbuild-wasm` (the only runtime dep) — copy it from the source's
# fresh install. The plugin user gets `node wizard/build.js` working with
# zero npm install. ~12MB; the only meaningful weight in the .plugin file.
mkdir -p "$TPL/node_modules"
cp -R "$SRC/templates/node_modules/esbuild-wasm" "$TPL/node_modules/esbuild-wasm"

# --- Completeness guard ----------------------------------------------------
# v0.7.0 shipped with 14 source modules missing from templates/: the staged
# tree imported them, but they were never in the bundle, so every wizard build
# died with ERR_MODULE_NOT_FOUND before biome/tsc/esbuild ever ran. A dropped
# module is invisible until a user hits it. Scan every staged templates/*.ts
# for relative imports and confirm each resolves to a file that is actually in
# the bundle; abort the build if any does not.
# v0.9.0+: also verify the precompiled wizard entrypoints and the vendored
# esbuild-wasm package landed. If any are missing the plugin will appear to
# install but break at the first /create-dashboard run.
echo "-> Verifying precompiled wizard entrypoints are present"
for required in \
  "wizard/build.js" \
  "wizard/refresh.js" \
  "node_modules/esbuild-wasm/lib/main.js" \
  "node_modules/esbuild-wasm/esbuild.wasm"; do
  if [[ ! -f "$TPL/$required" ]]; then
    echo "   !! $required missing — `npm run prebuild-wizard` or the esbuild-wasm vendor copy failed" >&2
    exit 1
  fi
done
echo "   precompiled wizard ✓"

echo "-> Verifying templates/ tree is import-complete"
import_misses=0
while IFS= read -r tsfile; do
  tsdir="$(dirname "$tsfile")"
  while IFS= read -r spec; do
    [[ -z "$spec" ]] && continue
    b="$tsdir/$spec"
    if [[ -f "$b.ts" || -f "$b.tsx" || -f "$b/index.ts" || -f "$b" || -f "${b%.js}.ts" ]]; then
      continue
    fi
    echo "   !! ${tsfile#"$STAGE"/}  ->  '$spec'  unresolved" >&2
    import_misses=$((import_misses + 1))
  done < <(grep -vE '^[[:space:]]*//' "$tsfile" \
             | grep -oE "(from|import)[[:space:]]+['\"]\.[^'\"]+['\"]" \
             | grep -oE "\.[^'\"]+" || true)
done < <(find "$TPL" -name '*.ts' -not -path '*/node_modules/*')
if [[ "$import_misses" -gt 0 ]]; then
  echo "!! $import_misses unresolved relative import(s) — the bundle is missing" >&2
  echo "   source modules. Aborting before a broken .plugin can ship." >&2
  exit 1
fi
echo "   import-complete ✓"
echo

OUT="$REPO_ROOT/foresights-$VERSION.plugin"
rm -f "$OUT"

( cd "$STAGE" && zip -rq "$OUT" . )

echo "-> Built $OUT ($(du -h "$OUT" | cut -f1))"
echo
echo "Sanity-check:"
# `node_modules` is intentionally present in v0.9.0+ to vendor esbuild-wasm —
# the rest of the cruft patterns stay banned. The follow-up check below
# confirms `node_modules/` carries only `esbuild-wasm/`.
unzip -l "$OUT" \
  | grep -E '(setup-claude-code|DS_Store|tmp-wizard-test|tmp-wizard-refresh-test|tmp-zero-install-test|_smoke|coverage/|tsbuildinfo|timestamp-)' \
  && { echo "!! cruft leaked"; exit 1; } \
  || echo "   clean ✓"

# Confirm node_modules contains only esbuild-wasm — any other package would
# inflate the .plugin without being needed at run time.
nm_others="$(unzip -l "$OUT" \
  | awk '/node_modules\// { sub(/.*node_modules\//, ""); sub(/\/.*/, ""); print }' \
  | sort -u \
  | grep -vE '^(esbuild-wasm)?$' || true)"
if [[ -n "$nm_others" ]]; then
  echo "!! unexpected node_modules packages: $nm_others" >&2
  exit 1
fi
echo "   only esbuild-wasm in node_modules ✓"

echo "
Drag $OUT into Cowork to install."
