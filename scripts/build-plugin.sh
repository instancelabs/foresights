#!/usr/bin/env bash
# Build a Cowork-installable .plugin from this repo.
#
# The repo's source layout keeps `foresights/templates/` at the root of the
# plugin directory for ergonomics — that's where you run `npm install` /
# `npm run preflight`. The Cowork plugin validator, however, needs templates/
# under skills/create-dashboard/templates/ to match the SKILL.md install path
# (`${CLAUDE_PLUGIN_ROOT}/skills/create-dashboard/templates/`). This script
# stages a clean copy with the templates/ relocation applied, drops every
# known cruft pattern, and zips the result.
#
# Usage:
#   bash scripts/build-plugin.sh           # uses version from plugin.json
#   bash scripts/build-plugin.sh 0.2.2     # override version suffix
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

echo "-> Staging plugin v$VERSION at $STAGE"

# Copy the four things that belong in the bundle: manifest, README, skills,
# and assets. Reference/ stays out (gitignored content not needed at runtime).
for d in .claude-plugin README.md skills assets; do
  if [[ -e "$SRC/$d" ]]; then
    cp -R "$SRC/$d" "$STAGE/"
  fi
done

# Move templates/ under skills/create-dashboard/ to match SKILL.md path.
if [[ -d "$SRC/templates" ]]; then
  cp -R "$SRC/templates" "$STAGE/skills/create-dashboard/templates"
fi

# Drop the known cruft patterns.
rm -rf "$STAGE/skills/setup-claude-code" 2>/dev/null || true
rm -rf "$STAGE/skills/create-dashboard/templates/node_modules" 2>/dev/null || true
rm -rf "$STAGE/skills/create-dashboard/templates/dist" 2>/dev/null || true
find "$STAGE" -name .DS_Store -delete
find "$STAGE" -name "vitest.config.ts.timestamp-*" -delete
find "$STAGE" -name "tmp-wizard-test" -type d -exec rm -rf {} + 2>/dev/null || true

OUT="$REPO_ROOT/foresights-$VERSION.plugin"
rm -f "$OUT"

( cd "$STAGE" && zip -rq "$OUT" . )

echo "-> Built $OUT ($(du -h "$OUT" | cut -f1))"
echo
echo "Sanity-check:"
unzip -l "$OUT" \
  | grep -E "(setup-claude-code|DS_Store|tmp-wizard-test|node_modules)" \
  && { echo "!! cruft leaked"; exit 1; } \
  || echo "   clean ✓"

echo "
Drag $OUT into Cowork to install."
