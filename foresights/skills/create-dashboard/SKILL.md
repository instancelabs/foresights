---
name: create-dashboard
description: Wizard that builds a live news dashboard customised to the user's product. Use when the user asks to create a dashboard, build a news dashboard, track an ecosystem, stay on top of an ecosystem, set up Foresights, or wants filtered ecosystem news for their stack. Asks 5 questions then ships a Cowork dashboard artifact.
---

# Create Dashboard

> **Status:** v0.3 (Phase 10.1 landed) — RSS / Atom source kind ships alongside the three GitHub kinds. Every existing GitHub-source + Claude-Code-actionType dashboard keeps working byte-for-byte identically; RSS slots in additively. See `Implementation status` below.

## What this skill does

Walks the user through 5 questions, then generates a fully-populated Cowork dashboard artifact: live ecosystem news (GitHub releases / PRs / issues, plus RSS / Atom feeds) + curated highlights, spotlight, patterns, tips + per-product relevance flagging + Claude Code prompt + upgrade-digest builder.

The output follows the 5-layer architecture proven in `aws-cdk-news` and `aws-serverless-news`. See `reference/analysis.md` in this repo (gitignored) for the full structural breakdown.

## Wizard flow

Use `AskUserQuestion` for each step. Don't ask follow-ups if the user's free-text answer already covers the next question.

### 1. Topic + slug

Free text. Examples: "Rust async ecosystem", "Kubernetes operators", "JAX/ML research", "B2B SaaS marketing trends".

Derive `topic_slug` (kebab-case) from the topic. Used for HTML IDs, localStorage keys, and the artifact's display name (`<slug>-news`).

### 2. Accent theme

Pick from a preset palette so the dashboard has a coherent colour identity:

- Orange (`#ff6a14`, soft `#fff3eb`) — AWS / dev tools default
- Blue (`#1f4ed8`, soft `#e7eeff`) — generic engineering
- Purple (`#5c3bbb`, soft `#efeaff`) — Rust / systems
- Teal (`#0a6f7d`, soft `#e6f6f8`) — data / ML
- Green (`#1b8a3a`, soft `#e6f5ec`) — observability / SRE
- Pink (`#c43c8e`, soft `#fce7f3`) — frontend / design / marketing

User can override with a custom hex.

### 3. Data sources

Multi-input. Two source families today: **GitHub** (releases / issues / pull requests via the user's GitHub MCP) and **RSS / Atom feeds** (any blog, newsroom, Substack, podcast, or service with a feed URL — fetched directly from the artifact via `window.fetch`).

For each source:

- `kind` — `releases` | `issues` | `pull_requests` | `rss`
- **GitHub kinds** (`releases | issues | pull_requests`):
  - `owner` / `repo` (GitHub coordinates) — required
  - `args` — kind-specific:
    - releases: `perPage` (default 5)
    - issues: `perPage`, `state` (default OPEN), `orderBy` (default UPDATED_AT), `direction` (default DESC)
    - pull_requests: `perPage`, `state` (default closed), `sort` (default updated), `direction` (default desc)
- **RSS kind** (`rss`):
  - `url` — full feed URL (required). Both RSS 2.0 (`<rss><channel><item>`) and Atom 1.0 (`<feed><entry>`) are supported.
  - No `args` — RSS sources render up to 10 most-recent items per section.
- `section` — optional; explicit section ID this source feeds. If omitted, sources of the same `kind` get merged into a single auto-named section.

**Validate `releases` sources before committing them.** Some repos never publish GitHub releases — rolling-release projects (Klipper is the common example) ship from `master` with no release tags, so a `releases` source on one renders a permanently-empty section. When the user assigns a repo to a `releases` source, probe it once with `list_releases` (`perPage: 1`) while confirming the source list. If it comes back empty, tell the user and offer to switch that source to `pull_requests` — recently-merged PRs are the closest proxy for a rolling-release project's activity.

**CORS caveat for RSS sources:** the artifact fetches feeds directly with `window.fetch`. Most modern feed hosts (Substack, Medium, GitHub `/releases.atom`, podcast platforms) serve permissive CORS so this works. Some legacy WordPress or self-hosted feeds don't — the section renders an empty-state card and the rest of the dashboard continues to work. If the user reports a feed that doesn't load, suggest they use the GitHub `/releases.atom` mirror (if available) or a Substack equivalent.

Examples:

```js
// CDK-style mixed-kind, three sections:
[
  { owner: 'aws', repo: 'aws-cdk',      kind: 'releases',      section: 'releases' },
  { owner: 'aws', repo: 'aws-cdk-rfcs', kind: 'issues',        section: 'rfcs', args: { perPage: 10, state: 'OPEN' } },
  { owner: 'aws', repo: 'aws-cdk',      kind: 'pull_requests', section: 'prs',  args: { state: 'closed', perPage: 30 } },
]

// Serverless-style fan-out, one merged section:
[
  { owner: 'aws-powertools', repo: 'powertools-lambda-typescript', kind: 'releases' },
  { owner: 'aws',            repo: 'aws-sam-cli',                   kind: 'releases' },
  { owner: 'sst',            repo: 'sst',                           kind: 'releases' },
  { owner: 'middyjs',        repo: 'middy',                         kind: 'releases' },
  { owner: 'serverless',     repo: 'serverless',                    kind: 'releases' },
]

// Mixed: GitHub releases + RSS feeds, side by side:
[
  { owner: 'aws', repo: 'aws-cdk',  kind: 'releases', section: 'cdk-releases' },
  { url: 'https://aws.amazon.com/blogs/aws/feed/', kind: 'rss', label: 'AWS News Blog',  section: 'industry' },
  { url: 'https://stratechery.com/feed/',          kind: 'rss', label: 'Stratechery',    section: 'industry' },
  { url: 'https://newsletter.pragmaticengineer.com/feed', kind: 'rss', label: 'Pragmatic Engineer', section: 'industry' },
]

// Non-dev: marketing-focused, RSS only:
[
  { url: 'https://blog.hubspot.com/marketing/rss.xml', kind: 'rss', label: 'HubSpot Marketing', section: 'updates' },
  { url: 'https://www.marketingweek.com/feed/',        kind: 'rss', label: 'Marketing Week',    section: 'updates' },
  { url: 'https://thinkwithgoogle.com/feeds/articles', kind: 'rss', label: 'Think with Google', section: 'updates' },
]
```

### 4. Products to flag (0–N)

For each product:

- `label` — display name (e.g. "CDK Insights", "Last Command")
- `repo` — GitHub URL (so we can read CLAUDE.md / README to bootstrap context)
- `badgeColor` — defaults to a contrast colour vs. the dashboard accent

For each product's repo, **read CLAUDE.md and README.md via the GitHub MCP** (`mcp__<gh_server>__get_file_contents`). Use Haiku to extract:

- A `rules[]` array of `{re, reason}` regex matchers, ordered by signal strength
- A system prompt for brief generation (architecture summary + JSON output schema)
- A repo-navigation block for the Claude Code prompt (key src paths, peer deps, conventions, code-style rules)

Show the user a preview of all three; let them accept or edit.

If the user has zero products, skip the product-specific HTML and JS blocks entirely (brief-all bar, digest bar, context bars, PRODUCTS const, RULES arrays, PROMPTS, CC builders).

### 5. Spotlight seeds

Ask for 2–3 example patterns the user thinks are cool in this domain. Minimum shape: `{tag, title, why}`. The wizard expands these to 6 full entries (with `{trick, code, summary, url}`) by sending the seeds + the fetched live data to Haiku.

## Wizard outputs

After the questions, the wizard:

1. **Fetches a sample of live data** from each configured source. GitHub sources go via the GitHub MCP (`list_releases`, `list_issues`, or `list_pull_requests` per kind); RSS sources fetch the feed XML directly (`window.fetch`).
2. **Runs Haiku batches** (chunk size ≤10 to stay under the askClaude payload ceiling) to generate the curated content, then stashes each batch's output in the corresponding `WizardConfig` field before invoking the build orchestrator:
   - 6 `spotlights` from user seeds + live data → `WizardConfig.spotlights`
   - 6 `highlights` from live data → `WizardConfig.highlights`
   - 6 community-library / pattern cards from live data → `WizardConfig.patterns`
   - 8 advanced tips from live data → `WizardConfig.tips`
   - 4–8 `resources` (canonical sources + community hubs) → `WizardConfig.resources`
3. **Builds the populated HTML** by handing the fully-populated `WizardConfig` to `templates/wizard/build.ts` (see "Build step" below). The orchestrator's sentinel substitution turns each field into the matching HTML block.
4. **Smoke-tests the boot block** by running it in Node with stubbed `window`, `document`, `localStorage`. Catches TDZ errors and missing functions.
5. **Calls `mcp__cowork__create_artifact`** with the populated HTML.
6. **Reports** the dashboard URL and suggests `/setup-cc` as the next step.

### Haiku batch contract — what the wizard agent must produce

Each curated-content batch is a single Haiku call returning a JSON array. The agent parses, validates, and retries once if the count is wrong; on a second failure it falls back to an empty array (which produces a placeholder card via the generator's empty-array branch).

| Field | Count | Per-entry JSON shape |
|---|---|---|
| `spotlights` | 6 | `{tag, title, summary, trick, code, why, url}` — see SPOTLIGHTS_CONST below |
| `highlights` | 6 | `{tag, title, body, url, cta?}` — `cta` defaults to "GitHub" for github.com URLs |
| `patterns`   | 6 | `{tag, title, body, url, cta?}` — same shape as highlights |
| `tips`       | 8 | `{title, why?, body, code?}` — `code` is pre-rendered HTML with `<span class="k">/<span class="s">/<span class="t">` |
| `resources`  | 4–8 | `{name, desc, url}` — one per canonical source / community hub |

**Inline HTML in `title` / `body`:** the generators allow bare `<code>...</code>` through but escape everything else (including `<code class="x">`, `<strong>`, `<script>`, etc.). Tell Haiku: "Use `<code>` for inline code spans only — no other HTML, no markdown." The system prompt should also forbid `<span class="insights-tag">` in highlight/pattern markup; product flagging is purely runtime via `upgradeHighlightBadges()`.

**Tip `code` field:** when emitting a tip with a code sample, ask Haiku for ready-to-render HTML with `<span class="k">` (keyword), `<span class="s">` (string), `<span class="t">` (type). NOT plain `<pre>` — the generator wraps the value in `<pre class="code-block">` to dodge the dark-pre cascade trap.

## Template substitution

Placeholders in `templates/dashboard.html`:

| Placeholder | Source |
|---|---|
| `{{ARTIFACT_NAME}}` | Title-cased topic + " News" |
| `{{ARTIFACT_DESCRIPTION}}` | One-paragraph description of the dashboard |
| `{{TOPIC}}` | Display name |
| `{{TAGLINE_SUFFIX}}` | Default: "what's new & worth knowing" |
| `{{TAGLINE_SUB}}` | Hero subtitle one-liner |
| `{{TOPIC_SLUG}}` | Kebab-case slug |
| `{{ACCENT}}` | Hex |
| `{{ACCENT_SOFT}}` | Hex |
| `{{GH_SERVER}}` | `mcp__<uuid>` prefix; detect from the user's available tools by pattern-matching `__list_releases` |
| `{{HEADER_SOURCES_LINKS}}` | Comma-separated `<a>` tags pointing at the configured sources |
| `{{FOOTER_NOTE}}` | One-line footer description |
| `{{FORESIGHTS_CONFIG_JSON}}` | Auto-injected by the build — the full `WizardConfig` serialised into the `<script type="application/json" id="foresights-config">` block. Not a wizard input: `genForesightsConfigJson` derives it so `/refresh-dashboard` can recover topic + sources + products losslessly. |

The 12 complex content blocks (see `Block generators (v0.2 sentinels)` below) are wrapped with `<!-- FORESIGHTS_START:NAME --> ... <!-- FORESIGHTS_END:NAME -->` sentinels. The wizard string-replaces between each sentinel pair with the output of the matching generator.

## Block generators (v0.2 sentinels)

The 12 sentinel-wrapped blocks the wizard fills in. Each generator takes a slice of wizard data (and, where noted, the live data sample fetched in `Wizard outputs` step 1) and produces a string slotted between the matching sentinels. Generators that exceed ~80 lines of spec live in `references/<block>.md` and are referenced by name.

Sentinel naming: three comment forms, picked by the host language of the region the sentinel sits in.

- **HTML** (markup regions): `<!-- FORESIGHTS_START:NAME -->` ... `<!-- FORESIGHTS_END:NAME -->`
- **TS/JS** (inside `<script>` blocks or `.ts` modules): `// FORESIGHTS_START:NAME` ... `// FORESIGHTS_END:NAME`
- **CSS** (inside `<style>` blocks): `/* FORESIGHTS_START:NAME */` ... `/* FORESIGHTS_END:NAME */`

The wizard's replacer matches all three. Regex (per-sentinel-name, non-greedy across forms):

```
(<!--|//|/\*)\s*FORESIGHTS_START:NAME\s*(-->|\*/|\n)
  [\s\S]*?
(<!--|//|/\*)\s*FORESIGHTS_END:NAME\s*(-->|\*/|\n)
```

The PRODUCTS_CONFIG block uses sub-sentinels (`PRODUCTS_CONFIG:PROMPTS`, `PRODUCTS_CONFIG:RULES`, `PRODUCTS_CONFIG:CC_BUILDERS`, `PRODUCTS_CONFIG:PRODUCTS_CONST`, `PRODUCTS_CONFIG:CONTEXT_REFRESH`) because the underlying JS sits in non-contiguous regions of the template; from the wizard's point of view it's still one logical generator.

### RESOURCES_MARKUP

**Replaces:** the `<a class="res">` list inside `<div class="res-grid">` in `<section id="resources">`.

**Inputs:** `topic`, `data_sources[]`, `curated_links[]` (optional list of `{name, url, desc}` the user passed during the wizard — defaults to `[]`).

**Algorithm:**

1. Emit one `<a class="res">` per unique `owner/repo` in `data_sources[]`. Name = `owner/repo`, URL = `https://github.com/<owner>/<repo>` (or `/releases` if all sources for that repo are `kind: 'releases'`), desc = a short Haiku-generated one-liner from the live data sample (1 batch call covering all sources, ≤10 entries).
2. Append every entry in `curated_links[]` verbatim.
3. If the total is under 6 entries, ask Haiku for 4–6 canonical community resources for `topic` (e.g. official blog, conference playlist, community hub). Append.

**Output shape:** one `<a class="res" href="..." target="_blank" rel="noopener">` per entry, with `<div class="res-name">` and `<div class="res-desc">` children. Escape names + descriptions through `escHtml`.

### TIPS_MARKUP

**Replaces:** the 8 `<div class="tip">` cards inside `<section id="tips">`.

**Inputs:** `topic`, `data_sources[]`, live data sample.

**Algorithm:** one Haiku call (compact JSON, ≤10 items returned). Prompt frames the ask as "advanced tips an experienced practitioner of `topic` would share with a junior", grounded in `data_sources` so suggestions stay realistic for the user's stack. Ask for exactly 8 tips; reject and re-call if Haiku returns fewer.

**Output shape:** for each tip, one `<div class="tip">` containing `<h3>` (with optional `<code>` inline and a `<span class="why">` suffix) + one `<p>`. If the tip benefits from a code sample, append a `<pre class="code-block">` (NOT plain `<pre>` — that triggers the dark-pre cascade trap). Escape user-substituted content through `escHtml`; the code sample stays unescaped because Haiku is asked to return pre-rendered span markup (`<span class="k">`, `<span class="s">`, `<span class="t">`).

### PATTERNS_MARKUP

**Replaces:** the 6 `<div class="hl-card">` divs inside `<section id="community">`.

**Inputs:** `topic`, `data_sources[]`, live data sample.

**Algorithm:** one Haiku call. Prompt frames the ask as "6 community libraries / patterns / open-source projects worth knowing about in the `topic` ecosystem, biased toward things actually used in production by the data sources listed". Ask for `{tag, title, body, link}` per entry.

**Output shape:** for each pattern, `<div class="hl-card"><span class="tag">…</span><h3>…</h3><p>…</p><a class="more" href="…" target="_blank" rel="noopener">GitHub →</a></div>`. The trailing CTA text mirrors the proven shape ("GitHub →", "cdkpatterns.com →"); the generator picks the CTA suffix based on the link domain (github.com → "GitHub →", anything else → host name).

**Note:** these cards get processed by `upgradeHighlightBadges()` at boot — that function injects auto-detected product badges from each card's text. The static markup must NOT include any `<span class="insights-tag">` tags; product flagging is purely runtime via the matcher. (The v0.1 reference has hand-tagged badges; the generator drops them.)

### HIGHLIGHTS_MARKUP

**Replaces:** the 6 `<div class="hl-card">` divs inside `<section id="highlights">`.

**Inputs:** `topic`, `data_sources[]`, live data sample, current year (`new Date().getFullYear()`).

**Algorithm:** one Haiku call seeded with the live data sample, asking for "6 highlights from the last ~6 months in the `topic` ecosystem that matter for someone shipping production code". Each entry: `{tag, title, body, link}`. The tag should encode date or version (`'Mar 2026 · GA'`, `'v2.252 · Apr 2026'`).

**Output shape:** identical to PATTERNS_MARKUP. Same `upgradeHighlightBadges()` rule — no static `insights-tag` spans.

### SPOTLIGHTS_CONST

**Replaces:** the `SPOTLIGHTS` JS const inside `<script>` (one logical block — start/end sentinels surround the `const SPOTLIGHTS = [ ... ];` line and its 6 entries).

**Inputs:** `topic`, `spotlight_seeds[]` (user's 2–3 wizard answers, shape `{tag, title, why}`), live data sample.

**Algorithm:** Haiku call (one chunk —  6 entries fits well under the 8KB ceiling but use compact JSON anyway). System prompt explains the spotlight is the "one really cool pattern in depth" card, with `code` as pre-rendered HTML containing `<span class="k">`, `<span class="s">`, `<span class="t">` for syntax highlighting (the template's `.sl-code` styles these). Expand the user's 2–3 seeds into the first 2–3 entries verbatim (`tag`, `title`, `why` from the seed; `summary`, `trick`, `code`, `url` synthesized). Generate 3–4 more from the live data.

**Output shape:** `const SPOTLIGHTS = [ { tag, title, summary, trick, code, why, url }, … ];` where:
- `tag` — short prefix label (e.g. `'Generative AI · L3'`)
- `title` — one line, plain text (Haiku must NOT include HTML)
- `summary` — 1–2 sentence pitch, can include `<code>` inline
- `trick` — the "why it's clever" line, 1–3 sentences, may include `<code>` inline
- `code` — array of strings, joined with `'\n'`. Each line is HTML with `<span class="k">`/`<span class="s">`/`<span class="t">` for syntax tokens. Critical: this is the field that benefits most from the `.code-block` cascade fix in the CSS — the template ships with `.sl-code` styling so do not introduce a stray `<pre>` here.
- `why` — 1–2 sentences explaining why it matters (rendered in the spotlight footer)
- `url` — the canonical link

**Critical:** the `code` field uses backslash-escaped single quotes (`<span class="s">\'github.com/...\'</span>`) because each line is a JS string literal. The generator must escape `'` inside string-class spans before emitting.

## Implementation status

### v0.5 — embedded config block (refresh enablement)

Strictly additive. The build now injects a `<script type="application/json"
id="foresights-config">` block carrying the full `WizardConfig` (see
`genForesightsConfigJson` in `wizard/build-config.ts`, placeholder
`{{FORESIGHTS_CONFIG_JSON}}`). The block is inert — it doesn't execute or
render — and dashboards built before this change are unaffected. It exists
so the `/refresh-dashboard` skill can recover the exact build inputs
(topic, sources, products, branding) losslessly instead of scraping
rendered HTML. `<` characters are escaped inside the JSON so the payload
can't break out of the surrounding `<script>` element.

### v0.3 — RSS source kind (Phase 10.1)

Strictly additive. Every existing GitHub-source + Claude-Code-actionType dashboard renders byte-for-byte identically. New: a fourth `kind: 'rss'` for RSS 2.0 / Atom 1.0 feeds. RSS sources fetch via `window.fetch`, parse with DOMParser, and render through a new `render/rss.ts` module that mirrors the GitHub-renderer contract. Product flagging works identically across all source kinds (regex matcher runs on `${title} ${description}`).

What's in:

- **`util/rss-parser.ts`** — RSS 2.0 + Atom 1.0 parser, returns normalised `RssItem[]`. Robust against malformed XML; empty array on parse failure.
- **`mcp/fetch-rss.ts`** — native fetch + parser wrapper. Returns `[]` on network / CORS / parse failure so one bad feed doesn't break the dashboard.
- **`render/rss.ts`** — card renderer matching the GitHub-renderer shape. Strips embedded HTML in descriptions, truncates long bodies, integrates with `flagsForText` so per-product matchers fire on RSS items the same way they fire on PRs.
- **WizardSource** carries optional `url` (required for `kind: 'rss'`) alongside the existing optional `owner` / `repo` (required for GitHub kinds).
- 32 new tests across the three new modules. 442 total green under `npm run preflight`.

### v0.2 (this session — Phases 1–4 landed)

The v0.1 → v0.2 boundary turned into a major architectural shift: the dashboard source-of-truth moved from inline JS in `templates/dashboard.html` to a modular TypeScript codebase under `templates/*.ts`, compiled at wizard time by esbuild and injected into the HTML shell. Rationale, file tree, and full pipeline in `references/v0.2-architecture.md`.

What's in:

- **HTML markup sentinels wrapped** for RESOURCES_MARKUP, TIPS_MARKUP, PATTERNS_MARKUP, HIGHLIGHTS_MARKUP, SECTION_NAV, SECTION_MARKUP:ABOVE_HIGHLIGHTS, SECTION_MARKUP:BELOW_HIGHLIGHTS. Generator specs in this file for the first five; SECTION_* specs land in v0.3 alongside the others.
- **TS architecture in place**: `templates/` holds 25+ modules organised under `util/`, `mcp/`, `spotlight/`, `render/`, `products/`, `digest/`, with shared `types.ts` defining `Deps`, `Source`, `Product`, `Spotlight`, `Brief`, `FlagMeta`, `Flag`, `TriagedItem`, `RssItem`, etc. Every runtime-touching module takes `Deps` for dependency injection.
- **Toolchain**: biome 1.9.4 + tsc 5.6.3 (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes) + esbuild 0.24 + vitest 2.1 + jsdom 25. `npm run preflight` runs lint + type-check + tests; all green.
- **Leaf modules ported with tests**: `util/escape`, `util/date`, `util/storage`, `util/rss-parser`, `mcp/call-tool`, `mcp/ask-claude`, `mcp/fetch-rss`. 90+ unit tests.
- **Spotlight vertical slice ported with tests**: `spotlight/data` (SPOTLIGHTS_CONST sentinel), `spotlight/carousel` (initSpotlight, renderSpotlight, hydrate/persist), `spotlight/refresh` (Haiku-backed regeneration generalised over `Deps + sources`). 30 unit tests.
- **Integration smoke test**: `tests/integration.test.ts` compiles the bundle with esbuild and runs it inside JSDOM, asserting the IIFE bundle boots, the guard error fires when `window.cowork` is missing, and the empty-SPOTLIGHTS case is graceful. **3 tests; the milestone proof that the architecture is real.**
- **TS-side sentinels placed**: SOURCES_CONST in `sources.ts`, SPOTLIGHTS_CONST in `spotlight/data.ts`, LOAD_BODY in `boot.ts`, and the five `PRODUCTS_CONFIG:*` sub-sentinels in `products/{config,rules,prompts,cc-prompts,context-refresh}.ts`.
- **`config.ts`** holds wizard-substituted runtime values (TOPIC, TOPIC_SLUG, GH_SERVER) so the build pipeline has a typed seam for those rather than `{{X}}` placeholders.

### v0.2.x — dashboard.html cutover (2026-05-19)

The HTML cutover landed ahead of Phase 5+. The 2300-line inline `<script>` block is gone; the wizard injects the compiled esbuild bundle at `<script>{{COMPILED_JS}}</script>`. HTML markup sentinels carry minimal placeholder content (skeleton cards) so the un-substituted shell still renders as a recognisable loading state.

- All 9 HTML-side sentinels are now wrapped: SECTION_NAV, SECTION_MARKUP:ABOVE_HIGHLIGHTS, SECTION_MARKUP:BELOW_HIGHLIGHTS, HIGHLIGHTS_MARKUP, PATTERNS_MARKUP, TIPS_MARKUP, RESOURCES_MARKUP, **PRODUCT_CSS** (in `<style>`, empty default), **PRODUCT_UI_BARS** (in body, empty default).
- PRODUCT_CSS lives inside `<style>` and uses CSS-comment sentinel form `/* FORESIGHTS_START:NAME */`. The wizard's matcher (regex above) handles all three comment forms.
- Slim shell: 1199 lines / ~38 KB. Substitution smoke test verifies all 9 sentinels fill cleanly, all 12 `{{...}}` placeholders substitute, and the 11 spotlight DOM IDs survive end-to-end.

What's deferred to v0.2.x (separate sessions):

- ~~Phase 5: port `render/{releases,issues,prs,highlights,error}.ts` with tests.~~ **Done** — see `templates/render/`.
- ~~Phase 6: port `products/{config,rules,prompts,cc-prompts,context-refresh,matcher,brief}.ts` with tests.~~ **Done** — see `templates/products/`. Adds `panel.ts` (brief click-to-expand) and `badge.ts` (the data-attr contract between renderers and the brief panel).
- ~~Phase 7: port `digest/{triage,markdown,panel}.ts` with tests.~~ **Done** — see `templates/digest/`.
- ~~Phase 8: implement the wizard's full build pipeline.~~ **Done** — see `templates/wizard/` and "Build step" below.

## Build step (Phase 8 — the wizard's final move)

After collecting the wizard answers, the skill assembles a `WizardConfig` JSON object and shells out to the build orchestrator. The orchestrator handles every substitution + bundle injection step deterministically.

### WizardConfig shape

The full shape is in `templates/wizard/build-config.ts`. Top-level fields the wizard must fill:

- `topic`, `topicSlug`, `taglineSuffix`, `taglineSub` — branding strings (placeholders).
- `accent`, `accentSoft` — hex colours.
- `footerNote`, `artifactName`, `artifactDescription` — metadata.
- `ghServer` — the user's GitHub MCP server name (e.g. `mcp__github`).
- `headerSourcesLinks` — pre-rendered HTML for the source links in the hero.
- `sources: WizardSource[]` — mix of github coordinates (kind: releases | issues | pull_requests + owner/repo) and rss feeds (kind: rss + url). Optional section + args.
- `spotlights: WizardSpotlight[]` — 6 entries; the spotlight generator's output.
- `products: WizardProduct[]` — 0-N products (empty = no flagging machinery emitted).
- `highlights: WizardHighlightCard[]` — 6 entries; output of the highlights Haiku batch. Empty array → "get started" placeholder card. Shape: `{tag, title, body, url, cta?}`.
- `patterns: WizardPatternCard[]` — 6 entries; community / pattern cards. Same shape as `highlights`.
- `tips: WizardTipCard[]` — 8 entries; advanced-tip cards. Shape: `{title, why?, body, code?}`.
- `resources: WizardResourceLink[]` — 4–8 entries; "where to keep watching" links. Shape: `{name, desc, url}`.

### Invoking the orchestrator

The orchestrator lives at `${CLAUDE_PLUGIN_ROOT}/skills/create-dashboard/templates/wizard/build.ts` after install. On first use the templates directory needs `npm install` — Claude should run that once if `node_modules/` is missing, then re-use it on subsequent dashboards.

```bash
# One-time setup (skip if templates/node_modules already exists):
cd "${CLAUDE_PLUGIN_ROOT}/skills/create-dashboard/templates" && npm install

# Then for each dashboard:
echo "$WIZARD_CONFIG_JSON" > /tmp/foresights-config.json
cd "${CLAUDE_PLUGIN_ROOT}/skills/create-dashboard/templates" && npx tsx wizard/build.ts \
  --config /tmp/foresights-config.json \
  --out    /tmp/foresights-dashboard.html
```

Flags:

- `--config <path>` — path to the WizardConfig JSON. **Required.**
- `--out <path>`    — where to write the final dashboard HTML. **Required.**
- `--templates <dir>` — override the templates source directory (default: parent of `wizard/`).
- `--with-tests` — also run `npm run test` (vitest) on the substituted tree. Slower but thorough.

> Note: do NOT pass other flags. There's an internal `--skip-preflight` switch the test suite uses to bypass biome/tsc/esbuild, but passing it from the skill produces an HTML file with a stub bundle instead of a real one. Always run the full pipeline.

### Verifying the output

The build preserves sentinel markers (`<!-- FORESIGHTS_START:NAME -->` / `<!-- FORESIGHTS_END:NAME -->`, plus the TS `//` and CSS `/* */` forms) in the final HTML by design — they label where each block came from for debuggability and idempotent re-runs. **Substitution replaces only the body between them.** If you're sanity-checking the output, grep for `{{` (placeholders should be 0 — they all expanded) and confirm the bundle is in the `<script>` block — NOT for `FORESIGHTS_` (those markers stay on purpose).

The orchestrator writes a one-line JSON summary to stdout:

```json
{"workDir":"/tmp/foresights-build-xyz","outFile":"/tmp/foresights-dashboard.html","artifact":{"name":"AWS CDK news","description":"..."},"outBytes":54321}
```

Pipe stdout into `jq` (or parse with `JSON.parse`) to pick up the `artifact.name` / `artifact.description` for the next step.

### Creating the artifact

The build wrote the final HTML to the `--out` path. Call
`mcp__cowork__create_artifact` with:

- `id` — kebab-case slug for the artifact, conventionally `<topicSlug>-news`
  (e.g. `rust-async-news`).
- `html_path` — absolute path to the built HTML file (the `--out` path passed
  to `build.ts`). The tool reads the file itself; do not inline the HTML.
- `description` — the `artifact.description` field from the orchestrator's
  stdout summary.
- `mcp_tools` — only the MCP tools the dashboard actually calls at runtime.
  Derive this from the configured sources and products — do NOT hardcode it:
  - one `${ghServer}__list_<kind>` per distinct GitHub source `kind` in use —
    `list_releases`, `list_issues`, and/or `list_pull_requests`;
  - add `${ghServer}__get_file_contents` and `${ghServer}__search_repositories`
    only when the dashboard has products (the context-refresh button uses them);
  - RSS sources need no entry — they fetch the feed over the network, not
    through the MCP bridge.
  A GitHub-releases-only dashboard with no products needs just
  `["${ghServer}__list_releases"]`.

### Pipeline guarantees

The orchestrator runs these steps in order inside a temp working directory; failure in any step aborts with the failing command's stdout/stderr surfaced in the error:

1. **Stage** — `cp` `templates/` (minus `node_modules` + `dist`) into the temp dir.
2. **Substitute** — apply sentinel substitution (three-form matcher: HTML / TS / CSS) to every `.ts` file with sentinels + to `dashboard.html`. Apply placeholder substitution to `config.ts`'s `TOPIC` / `TOPIC_SLUG` / `GH_SERVER` constants.
3. **biome** — `npx biome check --write .` (auto-fixes formatter quirks introduced by generated TS).
4. **tsc** — `npx tsc --noEmit` (strict type-check).
5. **esbuild** — `npx esbuild dashboard.ts --bundle --format=iife --target=es2022 --sourcemap=inline --outfile=dist/dashboard.js`.
6. **vitest** *(optional, `--with-tests`)* — `npx vitest run`.
7. **Inject + final substitute** — read `dist/dashboard.js`, substitute it into `dashboard.html` at `{{COMPILED_JS}}`, expand remaining placeholders (`{{TOPIC}}`, `{{ACCENT}}`, etc.).
8. **Write** — emit the final HTML to `--out`.

The substitution layer (`wizard/substitute.ts` + `wizard/build-config.ts`) has 90+ unit tests; the orchestrator (`wizard/build.ts`) has a 9-case integration test that runs steps 1, 2, 7, 8 end-to-end against the real templates with `--skip-preflight` for speed. Full preflight covers the orchestrator's substitution + injection logic; the toolchain shell-outs are only exercised at wizard time.

What's deferred to v0.3+:

- Per-block generator specs for SECTION_NAV, SECTION_MARKUP, SOURCES_CONST, LOAD_BODY, PRODUCT_CSS, PRODUCT_UI_BARS, PRODUCTS_CONFIG (5 sub-sentinels).
- Per-product context-refresh as a wizard question (currently a Phase 6 module but not exposed in the wizard flow).
- Additional source kinds: Reddit, HackerNews, YouTube channels, generic URL watch (Phase 10.2–4).
- Pluggable per-product `actionType` for non-developer actions (Phase 10.5).

### Toolchain commands

From `templates/`:

```
npm install          # one-time
npm run lint         # biome check
npm run typecheck    # tsc --noEmit (strict)
npm run build        # esbuild emit to dist/dashboard.js
npm run test         # vitest run
npm run preflight    # lint + typecheck + test
```

## Reference

- `references/v0.2-architecture.md` — design-of-record for the TS port; READ THIS before opening any `.ts` file
- `reference/aws-cdk-news.html` — proven worked example, mixed-kind sources, two products
- `reference/aws-serverless-news.html` — proven worked example, fan-out releases, two products
- `reference/analysis.md` — structural breakdown, 5-layer notes, placeholder catalog
