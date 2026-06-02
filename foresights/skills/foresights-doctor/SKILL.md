---
name: foresights-doctor
description: Diagnostic skill that probes the Foresights install + the current execution environment for the failure modes that produce silent failures in `/create-dashboard`. Use when the user reports an empty or broken dashboard, asks whether Foresights is working, wants to test whether their environment can run Foresights, before launching a new dashboard in a possibly-restricted environment, or when running `/foresights-doctor`.
---

# Foresights Doctor

Probes the Foresights install + the current execution environment, then prints a structured PASS / WARN / FAIL report. The single most useful diagnostic is whether **Node's outbound `fetch` actually works** vs whether `WebFetch` is the only path through — that one bit routes `/create-dashboard` to the right RSS-hydration code path and prevents the "dashboard with all sections empty" failure mode that v0.8.4's dogfood report hit.

## When to invoke

Run when:

- The user reports a dashboard with empty `<section>` bodies ("no recent items in this feed" everywhere).
- The user asks "is Foresights working?" or similar.
- Before running `/create-dashboard` for the first time in a new environment (especially a sandboxed Cowork session).
- The user has hit `zero-items:` warnings in a build's stdout summary.

## What it checks

Seven checks, in order. Each emits one line: `✓` (pass), `⚠` (warn — proceed but with caveats), or `✗` (fail — blocks `/create-dashboard`). After the seven lines, the report includes one "Recommendations" section translating any warnings or failures into concrete next steps.

The checks are intentionally cheap: total runtime should be under 10 seconds.

### Check 1 — Node version

```bash
node --version
```

PASS if output starts with `v20.` or higher. FAIL otherwise (Foresights needs Node ≥ 20 for the esbuild-wasm runtime + the ESM bundle format). Fail message: `Node v20+ required, found <output>. Upgrade Node.`

### Check 2 — Templates dir + pre-bundled wizard JS

```bash
# Resolve the templates dir
TEMPLATES="${CLAUDE_PLUGIN_ROOT}/skills/create-dashboard/templates"
ls "$TEMPLATES/wizard/build.js" "$TEMPLATES/wizard/refresh.js"
```

PASS if both files exist. FAIL otherwise (the plugin install is incomplete or you're on a pre-v0.9.0 build). Fail message: `wizard/build.js or wizard/refresh.js missing. Reinstall the plugin (drag the latest .plugin into Cowork).`

### Check 3 — Vendored esbuild-wasm

```bash
ls "$TEMPLATES/node_modules/esbuild-wasm/esbuild.wasm"
```

PASS if present. FAIL otherwise (zero-install runtime won't work; user would need to `npm install esbuild-wasm@0.24.0` in the templates dir). Fail message: `node_modules/esbuild-wasm/esbuild.wasm missing. Either reinstall the plugin or run "npm install esbuild-wasm@0.24.0" in the templates dir.`

### Check 4 — Canned no-source build

Stage a writable copy of templates and run a build with an empty `sources` array. No network needed — exercises only the toolchain.

```bash
STAGE=$(mktemp -d)
cp -R "$TEMPLATES" "$STAGE/t"
chmod -R u+w "$STAGE/t"
cat > "$STAGE/config.json" <<'EOF'
{
  "topic": "Doctor probe",
  "topicSlug": "doctor-probe",
  "taglineSuffix": "diagnostic",
  "taglineSub": "no live data",
  "accent": "#1f4ed8",
  "accentSoft": "#e7eeff",
  "footerNote": "doctor probe",
  "artifactName": "doctor-probe",
  "artifactDescription": "diagnostic",
  "ghServer": "mcp__github",
  "headerSourcesLinks": "",
  "sources": [],
  "spotlights": [],
  "products": [],
  "highlights": [],
  "patterns": [],
  "tips": [],
  "resources": []
}
EOF
cd "$STAGE/t" && node wizard/build.js \
  --config "$STAGE/config.json" \
  --out "$STAGE/out.html" \
  --fast
```

PASS if the command exits 0 and the stdout JSON has `outBytes > 50000`. FAIL otherwise — surface the stderr verbatim. Fail message guides the user based on the error (esbuild-wasm load failure, biome/tsc not found if they accidentally dropped `--fast`, etc.).

### Check 5 — Node outbound fetch reachability

```bash
node -e "fetch('https://example.com', { signal: AbortSignal.timeout(8000) }).then(r => console.log('status:' + r.status)).catch(e => { console.error('error:' + (e && e.message)); process.exit(1); })"
```

PASS if output is `status:200`. WARN otherwise. The warn message is the critical one for /create-dashboard:

> Node outbound fetch is blocked or rate-limited — got `<error>`. The orchestrator's RSS hydration (`wizard/fetch-feeds.ts`) won't reach feed URLs from here. In `/create-dashboard`, **switch to the restricted-environment path**: have the wizard agent `WebFetch` each RSS URL and pre-populate `items` in the WizardConfig before invoking the build. See `create-dashboard/SKILL.md` step 1 → "RSS sources — restricted-environment path".

### Check 6 — WebFetch reachability

Use the agent's own `WebFetch` tool against the same URL (`https://example.com`).

PASS if WebFetch returns content. WARN if it fails. The combination with check 5 is what matters:

- Check 5 PASS, Check 6 PASS → both fetch paths work; default to the orchestrator's Node fetch.
- Check 5 FAIL, Check 6 PASS → restricted environment. Wizard must use WebFetch + pre-populate items.
- Check 5 PASS, Check 6 FAIL → unusual; agent has restricted outbound but Node doesn't. Use Node fetch path.
- Both FAIL → no live data is reachable from this environment. Dashboards must be limited to agent-synthesized content (curated highlights / tips / spotlights), or built elsewhere and copied in.

### Check 7 — GitHub MCP detection

Scan the agent's tool list for `*__list_releases`. The matching prefix is the `ghServer`.

PASS if found — emit the ghServer prefix (e.g. `ghServer: mcp__github`). WARN if not found:

> No GitHub MCP tool detected. `/create-dashboard` will fall back to atom feeds (`github.com/<owner>/<repo>/releases.atom`) or training-knowledge synthesis. See `create-dashboard/SKILL.md` step 0 → no-MCP branch.

## Output format

Print the report to the user. Use a leading title line, then one line per check, then a single Recommendations block. Format the report exactly so the user can paste it back if they need to ask for help.

```
Foresights doctor — 7 checks

✓ Node v22.13.0
✓ Templates dir + pre-bundled wizard JS present
✓ esbuild-wasm vendored (~12 MB)
✓ Canned build succeeded — 140 KB dashboard in 540 ms
⚠ Node outbound fetch blocked: got "TypeError: fetch failed" against https://example.com
✓ WebFetch reaches https://example.com (status 200)
⚠ No GitHub MCP — no *__list_releases tool in this session

Recommendations:

1. Node fetch is blocked but WebFetch works — your environment is sandboxed.
   When running /create-dashboard, take the restricted-environment path:
   pre-populate each RSS source's `items` via WebFetch before invoking
   `node wizard/build.js`. The orchestrator's `hydrateRssSources`
   short-circuits when items are already set.

2. No GitHub MCP detected. Two clean options:
   - Install one via `mcp__mcp-registry__suggest_connectors` for `github`.
   - Skip MCP and use atom-feed fallback for GitHub sources:
     `github.com/<owner>/<repo>/releases.atom`, `commits.atom`, etc.
     Treat each as `kind: 'rss'`. Public repos only.

Everything else looks good. /create-dashboard should work — use the
restricted-environment RSS path noted above.
```

If every check passes, the Recommendations block is a single line: `All checks green. /create-dashboard should work without special handling.`

## Implementation notes

- This skill **does not modify** any files in the user's project, the plugin tree, or the templates dir. Every staged file goes to a `mktemp -d` directory and is left there (or `rm -rf`'d at the end of check 4).
- Total runtime budget: ~10 seconds. The build (check 4) is the slowest piece (~0.5 s wasm). Checks 5 + 6 share an 8-second-each network timeout.
- Run checks **in order** and **don't skip** any. Even when an early check fails, run the rest — they're independent diagnostics and the user benefits from the full picture.
- Print check results **as they complete**, not as one batched dump. Slow checks (4, 5, 6) shouldn't make the report feel hung.
