---
name: refresh-dashboard
description: Refreshes the curated content on an existing Foresights dashboard using the latest live data. Use when the user asks to refresh their dashboard, regenerate the spotlight, rotate the spotlight, refresh Foresights content, or re-curate a section of a dashboard built with /create-dashboard.
---

# Refresh Dashboard

Re-curates an existing Foresights dashboard against the latest live data.

A dashboard has two kinds of content. **Live data** (GitHub releases / issues /
PRs, RSS items) is re-fetched every time the dashboard opens — it's never
stale, and this skill doesn't touch it. **Curated content** (highlights,
spotlight, patterns, tips, resources) is hand-baked at build time and *does*
go stale. This skill refreshes that curated content.

## The two paths

Refresh runs one of two ways, depending on what needs to change:

- **Section splice (fast, default).** The four curated markup sections —
  highlights, patterns, tips, resources — are wrapped in HTML-comment
  sentinels (`<!-- FORESIGHTS_START:HIGHLIGHTS_MARKUP -->` …) that survive
  into the built artifact. `wizard/refresh.ts` re-curates them and swaps the
  bodies in place. No rebuild, no toolchain — the compiled bundle, the
  spotlight carousel, and the product machinery are left byte-for-byte
  identical.
- **Full rebuild (escalation).** The spotlight pool, the data sources, and the
  product flagging machinery are compiled into the JS bundle, behind no
  surviving sentinel — a splice can't reach them. Refreshing any of those means
  recovering the dashboard's config and re-running `wizard/build.ts`.

Default to the section splice. Escalate to a full rebuild only when the user
explicitly wants the **spotlight** re-curated, or wants to **change data
sources or products**.

> The dashboard also has its own in-artifact `↻ Refresh content` button on the
> Spotlight section, and rotates the spotlight by cadence on open. If the user
> just wants a fresh spotlight *view*, point them there — a full rebuild is
> only needed to re-curate and re-bake the spotlight pool itself.

### Static-mode dashboards

A dashboard built with `outputMode: 'static'` (its embedded `foresights-config`
block carries `"outputMode": "static"`) is **always a full rebuild** — never a
section splice. A static dashboard bakes *everything* into the file: GitHub
data, RSS items, **briefs, and digest triage**. Refreshing it means re-fetching
and re-baking all of it:

1. Re-fetch each GitHub source's `list_<kind>` result into `WizardSource.baked`
   (the agent does this — `build.ts` re-bakes RSS itself).
2. Re-bake the briefs **and digest triage** via the two-pass `--emit-flags`
   flow — see `create-dashboard/SKILL.md` → "Wizard outputs" step 3. The
   recovered config's stale `briefs` / `triage` are discarded; fresh ones are
   generated against the fresh `baked` data.
3. Re-run `wizard/build.ts` and **write the rebuilt HTML back to the
   dashboard's file** — a static dashboard is a plain file, not a Cowork
   artifact, so there is no `update_artifact` to call.

A static dashboard (v0.8.3+) renders a **Refresh button** in its hero that
copies `/refresh-dashboard for <topic>` to the clipboard — that handoff is the
intended way a user reaches this skill for a static dashboard. The button is
build-time machinery; this skill needs no special handling for it, but expect
the request to often arrive in exactly that `for <topic>` form.

## Step 1 — Identify the target dashboard

First detect the host: scan your tool list for `mcp__cowork__list_artifacts`.

**Cowork desktop app (`mcp__cowork__list_artifacts` present).** Call it — it
returns each artifact's `id`, `name`, and `path`. Match the dashboard the user
means by name / topic slug. If two or more could match, ask which. If none look
like a Foresights dashboard, tell the user to build one first with
`/create-dashboard`, and stop. `Read` the matched artifact's `path` to get its
current HTML.

**Claude Code / non-Cowork host (that tool absent).** The dashboard is a plain
HTML file on disk (a `static`-mode build). Locate it:

- If the user gave a path, use it.
- Otherwise look for `*-dashboard.html` / `*-news.html` files in the working
  directory (`ls` + grep the file for `id="foresights-config"` to confirm it's
  a Foresights dashboard). If exactly one matches, use it; if several, ask
  which; if none, tell the user to build one with `/create-dashboard` (or pass
  the path explicitly), and stop.

`Read` the file to get its current HTML. Remember its absolute path — Step 5
writes the refreshed HTML straight back to it (there is no `update_artifact`).

## Step 2 — Recover the build config

Find the embedded config block in the HTML:

```
<script type="application/json" id="foresights-config"> … </script>
```

Take the text between the tags and `JSON.parse` it — that's the exact
`WizardConfig` the dashboard was built from (topic, sources, products,
branding). This is the lossless path.

**If the block is absent**, the dashboard was built before the embedded-config
change. Fall back: read the topic from `<title>` / the hero heading, and the
data sources from the header source links and the Resources section. Products
can't be recovered this way — if the user wants a full rebuild, ask them to
re-confirm their products. Recommend they re-run `/create-dashboard` once so
future refreshes are lossless.

## Step 3 — Fetch the latest live data

For every source in the recovered config:

- **GitHub kinds** (`releases` / `issues` / `pull_requests`) — call
  `${ghServer}__list_<kind>` with the source's `owner`, `repo`, and `args`.
  `ghServer` is in the config.
- **RSS kind** — fetch the feed `url` and parse the items.

This is the same data the `/create-dashboard` wizard samples — it's what the
fresh curation is grounded in.

## Step 4a — Section splice (the default path)

1. **Re-curate the four sections.** From the fresh live data, regenerate the
   curated arrays — `highlights`, `patterns`, `tips`, `resources` — following
   the per-entry shapes and the inline-HTML rule (only `<code>` is allowed)
   documented in `create-dashboard/references/build-internals.md` → "Curated
   content shapes". You (the wizard agent) synthesize each array yourself
   from the recovered config + the fresh data — there's no separate Haiku
   call at refresh time. Aim for the same counts: 6 highlights, 6 patterns,
   8 tips, 4–8 resources. Prefer genuinely new items; don't just reword the
   previous ones (the recovered config still holds the old arrays — use them
   as a "don't repeat these" reference).
2. **Write an updated config JSON.** Take the recovered config and replace its
   `highlights` / `patterns` / `tips` / `resources` with the fresh arrays.
   Leave every other field untouched. Write it to a temp file.
3. **Splice.** Run the refresh orchestrator:

   ```bash
   # Stage a writable copy once (the plugin dir is read-only) — same as
   # create-dashboard's Build step.
   FORESIGHTS_TPL=/tmp/foresights-templates
   if [ ! -f "$FORESIGHTS_TPL/wizard/refresh.js" ]; then
     rm -rf "$FORESIGHTS_TPL"
     cp -R "${CLAUDE_PLUGIN_ROOT}/skills/create-dashboard/templates" "$FORESIGHTS_TPL"
     chmod -R u+w "$FORESIGHTS_TPL"
   fi
   # Zero-install — runs the pre-bundled wizard/refresh.js, no npm install and
   # no tsx, same as the build step.
   cd "$FORESIGHTS_TPL" && node wizard/refresh.js \
     --artifact /tmp/foresights-current.html \
     --config   /tmp/foresights-refresh-config.json \
     --out      /tmp/foresights-refreshed.html
   ```

   (`refresh.js` reuses the same markup generators as the build, so the
   spliced cards are shape-identical to a freshly-built dashboard. It also
   rewrites the embedded `foresights-config` block from the config you pass,
   so the artifact stays self-describing and the next refresh recovers
   accurate "previous content" — pass the whole updated config.)

## Step 4b — Full rebuild (when spotlights / sources / products change)

Re-curate whatever the user asked for — a fresh spotlight pool (shape in
`create-dashboard/SKILL.md` → SPOTLIGHTS_CONST), updated `sources`, or updated
`products`. Assemble a complete `WizardConfig` and run `wizard/build.ts`
exactly as `/create-dashboard` does — see that skill's "Build step". The
rebuild re-runs the full toolchain (biome → tsc → esbuild) and preflights
itself.

## Step 5 — Smoke-test, then update the artifact

Before shipping, verify the refreshed HTML:

- All four `FORESIGHTS_START/END` sentinel pairs are still present and intact.
- No `{{…}}` placeholders leaked.
- The fresh card content appears; the document is not truncated.
- For a **full rebuild**, also smoke-test the boot block in Node (stubbed
  `window` / `document` / `localStorage`) as `/create-dashboard` does — the
  bundle changed. A **section splice** leaves the bundle untouched, so a boot
  smoke-test isn't needed; the structural checks above are enough.

Then ship the refresh — by the same host split as Step 1:

- **Cowork.** Write the refreshed HTML to a file and call
  `mcp__cowork__update_artifact` with the artifact `id`, that `html_path`, and a
  one-line `update_summary` of what was refreshed. **Don't skip the
  `update_artifact` call** — editing a temp file changes nothing the user sees;
  the update is what ships the refresh.
- **Claude Code / non-Cowork host.** Write the refreshed HTML **back to the
  dashboard's own file path** (the one you `Read` in Step 1), overwriting it.
  There is no `update_artifact`. Then tell the user to reload the file in their
  browser to see the new content.

## Notes

- The section splice never runs biome / tsc / esbuild — it's a string
  substitution, so it's fast and low-risk.
- Live-data sections (releases, RFCs, PRs, RSS) are *not* refreshed here —
  they re-fetch on every open already. This skill is purely about the
  hand-curated content.
- Re-running a section splice is idempotent: the sentinels are preserved, so
  the dashboard can be refreshed again and again.
- After a refresh, the user reloads the dashboard to see the new content.
