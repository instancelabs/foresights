---
name: create-dashboard
description: Wizard that builds a live, product-customised news dashboard. Use when the user asks to create a dashboard, build a news dashboard, track an ecosystem, or set up Foresights — and also whenever they describe wanting to keep up with, stay on top of, stay current on, follow what's new in, or stop falling behind on a technology, library, framework, tool, or ecosystem. Asks 6 questions, then ships a Cowork dashboard artifact.
---

# Create Dashboard

> **Status:** v0.9.2 — environment-aware wizard. Step 0 now runs three quick probes (GH MCP, Node fetch, WebFetch) before any data fetching and routes the rest of the wizard accordingly. When all three fail — fully sandboxed environment, the case Lee's work Mac hit — Step 0 offers a **curated-only** mode that ships a dashboard with no live data sections, just the synthesized spotlights/highlights/patterns/tips/resources. v0.9.1 added `/foresights-doctor` and structured `zero-items:` warnings; v0.9.0 made the orchestrator zero-install via vendored `esbuild-wasm`; v0.8.4 made `jsdom` lazy and slimmed this SKILL.md. Every artifact-mode dashboard keeps building byte-for-byte identically. Full history in `references/implementation-status.md`.

## What this skill does

Walks the user through ~7 questions, then generates a fully-populated dashboard: live ecosystem news (GitHub releases / PRs / issues, plus RSS / Atom feeds) + curated highlights, spotlight, patterns, tips + per-product relevance flagging + Claude Code prompt + upgrade-digest builder. Ships as a Cowork live artifact by default, or as a standalone HTML file (`outputMode: 'static'`).

## Wizard flow

Use `AskUserQuestion` for each step. Don't ask follow-ups if the user's free-text answer already covers the next question.

### 1. Topic + slug

Free text. Examples: "Rust async ecosystem", "Kubernetes operators", "JAX/ML research", "B2B SaaS marketing trends". Derive `topicSlug` (kebab-case) from the topic — used for HTML IDs, localStorage keys, and the artifact display name (`<slug>-news`).

### 2. Accent theme

Preset palette (each is `{accent, accentSoft}` hex pair):

- Orange `#ff6a14` / `#fff3eb` — AWS / dev tools default
- Blue `#1f4ed8` / `#e7eeff` — generic engineering
- Purple `#5c3bbb` / `#efeaff` — Rust / systems
- Teal `#0a6f7d` / `#e6f6f8` — data / ML
- Green `#1b8a3a` / `#e6f5ec` — observability / SRE
- Pink `#c43c8e` / `#fce7f3` — frontend / design / marketing

Accept a custom hex pair if the user prefers.

### 3. Data sources

Two source families: **GitHub** (releases / issues / pull_requests via the user's GitHub MCP) and **RSS / Atom feeds** (any feed URL — fetched and parsed at build time by `wizard/build.ts` itself, then baked into the dashboard).

Per source — concise shape; full per-kind args in `references/build-internals.md`:

- `kind`: `releases` | `issues` | `pull_requests` | `rss`
- GitHub kinds: `owner` + `repo` + optional `args` (`perPage`, `state`, `orderBy`, `direction`, `sort`)
- RSS: `url` only — leave `items` unset, the build orchestrator fetches and parses the feed itself
- Optional `section`: explicit section ID, otherwise same-kind sources merge into one auto-named section

**Validate `releases` sources** before committing them: probe each with `list_releases` (`perPage: 1`). If empty (rolling-release projects like Klipper publish no GitHub releases), offer to switch the source to `pull_requests`.

**RSS is baked at build time, not fetched live.** The artifact sandbox blocks cross-origin `window.fetch`; `wizard/fetch-feeds.ts` runs in Node at build time and bakes up to 10 entries per feed. A build with **no RSS sources doesn't load `jsdom` at all** (v0.8.4 lazy-import) — relevant when your sandbox can't `npm install` everything.

Source examples in `references/build-internals.md` → "Source examples".

### 4. Products to flag (0–N)

For each product, first ask its **action type** — what a flagged item should produce:

- `claude-code` *(default)* — a ready-to-run Claude Code handoff prompt, with Plan / Plan+Implement toggle and the upgrade-digest workflow. For products backed by a code repo.
- `summary` — a plain-prose summary. For research / marketing / non-engineering products with no repo.
- `task` — a tracker-ready item: one-line title, the "why", and a checklist.

Then, per product: `label`, `badgeColor`, `rules[]` (`{re, reason}` regex matchers ordered by signal strength), `systemPrompt` (architecture / domain summary).

For `claude-code` products only, also collect `repo` and read CLAUDE.md + README.md via `mcp__<gh_server>__get_file_contents` to extract repo-navigation context (becomes `ccPromptBody`). Optionally collect a `contextRefresh` spec.

For `summary` / `task` products, skip the repo entirely. Derive `rules[]` + `systemPrompt` from a short user description. Their action is built generically by the `ACTION_TYPES` registry — no per-product builder code is emitted.

Show the user the rules + prompt and let them accept or edit.

If zero products, skip the product-specific HTML and JS blocks entirely (brief-all bar, digest bar, context bars, PRODUCTS const, RULES, PROMPTS, CC builders).

### 5. Spotlight seeds

Ask for 2–3 example patterns the user thinks are cool in this domain. Minimum shape: `{tag, title, why}`. You'll expand these to 6 full entries (with `{trick, code, summary, url}`) in the synthesis pass below.

### 6. Cadence

How the spotlight card should rotate:

- `daily` *(default)* — different spotlight each day, by day-of-year
- `weekly` — by week-of-year, steadier for slower-moving topics
- `on-demand` — never auto-rotates; user pages with the ‹ › controls

Omit `cadence` for `daily` so a daily dashboard's build output stays byte-identical to pre-cadence dashboards.

### 7. Output mode

Most dashboards are live Cowork artifacts — the default; don't ask about it. Choose `outputMode: 'static'` when the user says their environment has no live-artifacts feature, or asks for a portable / downloadable dashboard. Static dashboards run as standalone HTML files with no `window.cowork` — see `references/static-mode.md` for the full static path (fetching baked GitHub data, the two-pass brief + triage flow, file output).

## Wizard outputs

### 0. Detect the environment *(do this first)*

Three quick probes that jointly decide the data-fetch strategy for the rest of the wizard. Total runtime under 10 seconds. (For a full report instead of just routing, the user can invoke `/foresights-doctor` — same checks, formatted output.)

**0a. GitHub MCP detection.** Scan your tool list for a `*__list_releases` tool. The matching prefix (e.g. `mcp__github` or `mcp__<uuid>`) is the `ghServer`.

**0b. Node outbound fetch reachability.**

```bash
node -e "fetch('https://example.com', { signal: AbortSignal.timeout(8000) }).then(r => console.log('node-fetch:' + r.status)).catch(e => { console.error('error:' + (e && e.message)); process.exit(1); })"
```

PASS if it prints `node-fetch:200`.

**0c. WebFetch reachability.** Use your own `WebFetch` tool against `https://example.com`. PASS if it returns content; FAIL on any error or block message.

**Strategy by probe result:**

| GH MCP | Node fetch | WebFetch | Strategy |
|---|---|---|---|
| Present | — | — | Use the GH MCP for GitHub sources (preferred — bypasses sandbox egress entirely). RSS sources hydrate via whichever fetch path works. |
| Absent | Pass | — | **Atom-feed fallback** — for GitHub sources, swap to the repo's atom feed (`github.com/<owner>/<repo>/releases.atom`, `commits.atom`, `pulls.atom`) and treat as `kind: 'rss'`. Substantively equivalent for any public repo (private repos still need a GH MCP). Node-side hydration. |
| Absent | Fail | Pass | **Restricted-environment path** — atom-feed fallback as above, but you `WebFetch` each URL and pre-populate `items` yourself. See Step 1. |
| Absent | Fail | Fail | **No live data branch** — see below. |

**No live data branch.** When both fetch paths fail AND no GH MCP is present, no remote source is reachable. Ask the user explicitly via `AskUserQuestion`:

> "Both Node fetch and WebFetch are blocked at the network layer here (your environment's egress allowlist is locked down — common in sandboxed Cowork sessions). I can't reach any feed URLs from this environment. Options:
> (a) **Curated-only dashboard now** — I'll skip the live data sections entirely and ship a dashboard built from synthesized spotlights, highlights, patterns, tips, and resources. Best choice for getting something working today.
> (b) **Install a GitHub MCP first** — MCP traffic routes through the MCP server, bypassing the sandbox's egress allowlist. I can suggest connectors via `mcp__mcp-registry__suggest_connectors github`. Once installed, re-run /create-dashboard.
> (c) **Cancel and ask the network admin** to allowlist `github.com`, `raw.githubusercontent.com`, and the relevant blog feed hosts."

If they pick **(a) curated-only mode**:

- Set `sources: []` in the `WizardConfig`. The dashboard ships with no live data sections — no Releases, RFCs, PRs, RSS feeds. The renderers gracefully omit empty sections; the section nav, header source links, and per-source `<section>` blocks are not emitted.
- Append " — curated content only, live data unavailable in this environment" to `footerNote` so anyone opening the dashboard sees why the live sections are missing.
- **Skip Step 1 entirely** — no live data to fetch. Step 2 synthesizes the curated arrays from your training knowledge alone (no live data sample). Step 3 (static-mode pre-baking) is a no-op for `'artifact'` builds and almost always inapplicable here (no sources → no flag manifest entries). Continue to Step 4 (build).

If they pick **(b)** or **(c)** — cancel the current run and tell the user to re-run when ready.

**For `'static'` builds** the no-live-data branch is the same — `sources: []`, curated-only, footer note. Without any data, the `briefs` / `triage` flow is a no-op.

Don't hardcode `mcp__github` and silently proceed — without a working data path, the dashboard will build successfully and ship with empty sections that look like a bug.

### 1. Sample live data from each source

*Skip this step if you took the curated-only branch in Step 0.*

The fetch path depends on the Step 0 strategy:

**GH MCP present.** For each GitHub source, call `${ghServer}__list_<kind>` (`list_releases`, `list_issues`, `list_pull_requests`) for a sample that seeds the curation pass below. For RSS sources, leave `items` unset — the build orchestrator (`wizard/fetch-feeds.ts`) fetches each feed in Node before the build.

**Atom-feed fallback (no GH MCP, Node fetch works).** GitHub sources were swapped to `kind: 'rss'` in Step 0 using the repo's atom feeds. Leave `items` unset for all RSS sources and pass just the `url` — `wizard/fetch-feeds.ts` hydrates them all in Node.

**Restricted-environment path (no GH MCP, only WebFetch works).** GitHub sources were swapped to atom-feed RSS in Step 0. **Pre-populate `items` yourself**: `WebFetch` each URL, parse the atom/rss XML into `RssItem[]` (`{title, link, description, pubDate, author, guid}` — shape in `templates/types.ts`), and set `items` on the source before invoking the build. `hydrateRssSources` short-circuits when `items.length > 0`, so the blocked Node fetch is bypassed.

**Verify your fetches actually returned data.** Count items per source. If any source returned **zero** items, raise it explicitly before continuing — that section will render an empty "no recent items in this feed" card and the user gets a half-broken dashboard with no obvious cause. Either try the alternative fetch path or warn the user. The orchestrator surfaces zero-item warnings in its stdout summary (v0.9.1+), but catching it before the build is faster.

In `outputMode: 'static'`, also fetch each GitHub source's **full** `list_<kind>` result and store it on the source's `baked` field (see `references/static-mode.md`). The atom-feed fallback applies for static too: swap `kind: 'releases' | 'issues' | 'pull_requests'` to `kind: 'rss'` with the repo's atom URLs, then hydrate `items` instead of `baked`.

### 2. Synthesize the curated content

You — the wizard agent, the very Claude reading this file — write each curated array yourself, drawing on the live data sample + your training knowledge. There is no separate Haiku call at wizard time; `askClaude` only exists inside the *built dashboard's* `window.cowork` bridge. Stash each array in the matching `WizardConfig` field before invoking the build:

- 6 `spotlights` expanding the user's 2–3 seeds → `WizardConfig.spotlights`. When products are configured, set each spotlight's optional `productId` to the service it's "about" (you already know this from the synthesis pass). That forces a deterministic flag badge so the spotlight reliably opens a Claude Code brief for exactly that service, instead of relying on regex auto-matching the prose. Leave `productId` unset for product-less dashboards — the field is optional and omitted spotlights build byte-identically.
- 6 `highlights` from live data → `WizardConfig.highlights`
- 6 community-library / pattern cards → `WizardConfig.patterns`
- 8 advanced tips → `WizardConfig.tips`
- 4–8 `resources` (canonical sources + community hubs) → `WizardConfig.resources`

Per-array JSON shapes and the inline-HTML rule (`<code>` allowed, everything else escaped) live in `references/build-internals.md` → "Curated content shapes".

### 3. Static mode — pre-bake briefs + digest triage

Static-mode only. The same agent-synthesis approach: a two-pass `build.ts --emit-flags` flow generates per-(product × item) briefs and digest verdicts. Full step-by-step in `references/static-mode.md` → "Two-pass brief + triage flow". Skip this step for `'artifact'` builds — they generate briefs and triage live via the dashboard's `askClaude` bridge.

### 4. Build the dashboard

Hand the populated `WizardConfig` to `wizard/build.ts`. See the "Build step" below.

### 5. Smoke-test the boot block + verify data

Run the built bundle in Node with stubbed `window` / `document` / `localStorage`. Catches TDZ errors and missing functions before shipping.

**Also: check the orchestrator's stdout summary.** v0.9.1+ surfaces a `warnings` field on the stdout JSON. If it contains anything, *act on it*:

- **`zero-items: <source-id>`** — that source returned 0 items at build time. Almost always a blocked network or a stale URL. Don't ship a dashboard with empty sections; warn the user, suggest re-running with `WebFetch`-populated `items` (step 1's restricted-environment path), or recommend `/foresights-doctor` to confirm which fetch paths work in this environment.
- Other warnings are self-describing.

**Then scan the built HTML for empty sections.** Open the file, find each `<div class="section-body" id="<section>-body">`, and confirm it's not stuck in the "Loading…" skeleton placeholder. (For static-mode builds, also confirm the section's baked items aren't `[]` in the embedded `<script id="foresights-config">` block — that's the source of truth.) Ship-blocking if any are empty.

### 6. Ship

- **Artifact mode** — call `mcp__cowork__create_artifact` with the built HTML, the `mcp_tools` the dashboard actually uses (one `${ghServer}__list_<kind>` per distinct GitHub kind in use, plus `__get_file_contents` + `__search_repositories` when products are configured for context refresh; RSS sources need no entry), and the orchestrator's `artifact.description`.
- **Static mode** — write the built HTML into the user's working folder as a file. Do **not** call `create_artifact`. See `references/static-mode.md`.

### 7. Report

Report the dashboard URL / file path. Suggest `/setup-cc` **only when the dashboard has at least one `claude-code` product** — the `/digest` slash-command workflow it installs is Claude-Code-specific.

## Build step

The plugin ships a pre-bundled `wizard/build.js` plus a vendored `esbuild-wasm` next to it, so the wizard runs with **zero `npm install`** — Node ≥20 is the only requirement. The plugin directory is read-only, so stage a writable copy to `/tmp` once per session, then reuse it.

```bash
# One-time per session — copy the plugin templates to a writable dir. No
# npm install needed; the staged tree already contains the pre-bundled
# wizard/build.js and node_modules/esbuild-wasm.
FORESIGHTS_TPL=/tmp/foresights-templates
if [ ! -f "$FORESIGHTS_TPL/wizard/build.js" ]; then
  rm -rf "$FORESIGHTS_TPL"
  cp -R "${CLAUDE_PLUGIN_ROOT}/skills/create-dashboard/templates" "$FORESIGHTS_TPL"
  chmod -R u+w "$FORESIGHTS_TPL"
fi

# Per dashboard — sub-second on the esbuild-wasm --fast path:
echo "$WIZARD_CONFIG_JSON" > /tmp/foresights-config.json
cd "$FORESIGHTS_TPL" && node wizard/build.js \
  --config /tmp/foresights-config.json \
  --out    /tmp/foresights-dashboard.html \
  --fast
```

Key flags (`--config`, `--out`, `--fast`, `--templates`, `--with-tests`, `--emit-flags`) and the full 8-step pipeline are documented in `references/build-internals.md` → "Build invocation" and "Pipeline guarantees".

> **Static mode is a two-pass build** (`--emit-flags` first, then the real build). See `references/static-mode.md`.
>
> `--skip-preflight` is an internal test switch that emits a stub bundle — never pass it from the skill. `--fast` is the supported speed switch.
>
> **Slow path (non-`--fast`, or `--with-tests`)** still needs the dev toolchain (`biome`, `tsc`, `vitest`). Run `npm install` in the staged templates dir first if you need it. The recommended `--fast` path doesn't.

## Toolchain commands

From `templates/`:

```
npm install          # one-time
npm run lint         # biome check
npm run typecheck    # tsc --noEmit (strict)
npm run build        # esbuild → dist/dashboard.js
npm run test         # vitest run
npm run preflight    # lint + typecheck + test
```

## References

- `references/static-mode.md` — the `outputMode: 'static'` end-to-end story (Phase 1–3 design + build flow)
- `references/build-internals.md` — sentinels, placeholders, the WizardConfig shape, block generators, pipeline guarantees, source examples
- `references/implementation-status.md` — full version history (v0.2 → v0.8.4)
- `references/v0.2-architecture.md` — design-of-record for the TS port; read before editing any `.ts` template module
- `references/action-types-design.md` — design notes for Phase 10.5 action types
- `references/source-kinds-design.md` — design notes for extensible source kinds
