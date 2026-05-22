---
name: create-dashboard
description: Wizard that builds a live, product-customised news dashboard. Use when the user asks to create a dashboard, build a news dashboard, track an ecosystem, or set up Foresights — and also whenever they describe wanting to keep up with, stay on top of, stay current on, follow what's new in, or stop falling behind on a technology, library, framework, tool, or ecosystem. Asks 6 questions, then ships a Cowork dashboard artifact.
---

# Create Dashboard

> **Status:** v0.8.3 (Phase 3d) — a new `outputMode: 'static'` builds a dashboard that runs as a standalone HTML file with **no Cowork artifact runtime**: GitHub data is baked in at build time (and refreshed live when a Cowork runtime *is* present), the `window.cowork` guard is softened, and every brief (v0.8.1) and upgrade-digest triage (v0.8.2) is pre-baked at build time so a static dashboard keeps full briefs + a fully-bucketed digest offline. v0.8.3 adds a static-mode Refresh button that copies a `/refresh-dashboard for <topic>` instruction to the clipboard — the user pastes it to Claude to re-bake the file. `'artifact'` (the default — omit it) is unchanged, and every artifact-mode dashboard keeps building byte-for-byte identically. v0.7.2 moved RSS fetching into `build.ts` + added `--fast`; v0.7.1 restored the template modules missing from the v0.7.0 package. Selectable cadence, pluggable action types, RSS / Atom + three GitHub source kinds — all unchanged. See `Implementation status` below.

## What this skill does

Walks the user through 6 questions, then generates a fully-populated Cowork dashboard artifact: live ecosystem news (GitHub releases / PRs / issues, plus RSS / Atom feeds) + curated highlights, spotlight, patterns, tips + per-product relevance flagging + Claude Code prompt + upgrade-digest builder.

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

Multi-input. Two source families today: **GitHub** (releases / issues / pull requests via the user's GitHub MCP) and **RSS / Atom feeds** (any blog, newsroom, Substack, podcast, or service with a feed URL — fetched and parsed at build time, then baked into the dashboard).

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
  - `items` — you don't set this, and neither does the wizard agent. The build orchestrator (`wizard/build.ts`) fetches each feed in Node and parses up to 10 recent entries into it, then bakes them into the dashboard. Just give the `url`.
  - No `args` — RSS items are baked at build time, not fetched at runtime.
- `section` — optional; explicit section ID this source feeds. If omitted, sources of the same `kind` get merged into a single auto-named section.

**Validate `releases` sources before committing them.** Some repos never publish GitHub releases — rolling-release projects (Klipper is the common example) ship from `master` with no release tags, so a `releases` source on one renders a permanently-empty section. When the user assigns a repo to a `releases` source, probe it once with `list_releases` (`perPage: 1`) while confirming the source list. If it comes back empty, tell the user and offer to switch that source to `pull_requests` — recently-merged PRs are the closest proxy for a rolling-release project's activity.

**RSS is baked at build time, not fetched live.** The artifact sandbox blocks all cross-origin network except a fixed CDN allowlist, so a built dashboard cannot `window.fetch` arbitrary feeds. Instead, the build orchestrator (`wizard/build.ts`, via `wizard/fetch-feeds.ts`) fetches and parses each feed **in Node at build time** and bakes up to 10 recent entries into the dashboard (see `WizardSource.items` and `genLoadBody`). The wizard agent does **not** fetch feeds itself — `build.ts` does, all feeds in parallel, with zero agent tool calls. RSS content is therefore as fresh as the last build — re-run `/refresh-dashboard` (which rebuilds) to pull newer entries. GitHub sources are unaffected: they fetch live through the MCP bridge on every open.

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

For each product, first ask its **action type** — what a flagged item should produce:

- `claude-code` *(default)* — a ready-to-run Claude Code handoff prompt, with the Plan / Plan+Implement toggle and the upgrade-digest workflow. For a product backed by a code repo.
- `summary` — a plain-prose summary of why the item matters and how it could fit. For a research / marketing / non-engineering product with no repo.
- `task` — a tracker-ready item: a one-line title, the "why", and a checklist. For when the user works items through a task tracker rather than Claude Code.

Then, for every product, collect:

- `label` — display name (e.g. "CDK Insights", "Last Command")
- `badgeColor` — defaults to a contrast colour vs. the dashboard accent
- `rules[]` — `{re, reason}` regex matchers, ordered by signal strength
- `systemPrompt` — for brief generation (architecture / domain summary + JSON output schema)

`rules[]` + `systemPrompt` power the brief panel for **every** action type — briefs are action-agnostic, so this part of the flow does not change per type.

**For `claude-code` products only**, also collect `repo` (a GitHub URL) and **read CLAUDE.md and README.md via the GitHub MCP** (`mcp__<gh_server>__get_file_contents`). Use Haiku to extract the `rules[]` + `systemPrompt` above, plus a repo-navigation block for the Claude Code prompt (key src paths, peer deps, conventions, code-style rules) — this becomes the product's `ccPromptBody`. Optionally collect a `contextRefresh` spec (the ↻ button).

**For `summary` / `task` products**, skip the repo entirely — no `repo`, no `ccPromptBody`, no `contextRefresh`. Derive `rules[]` + `systemPrompt` from a short description the user gives of the product and what's relevant to it. Their action is built generically at runtime by the `ACTION_TYPES` registry (`templates/products/actions.ts`); no per-product builder code is emitted.

Set `actionType` on the `WizardProduct`; omit it (or set `'claude-code'`) for the default. Show the user a preview of the rules + prompt; let them accept or edit.

If the user has zero products, skip the product-specific HTML and JS blocks entirely (brief-all bar, digest bar, context bars, PRODUCTS const, RULES arrays, PROMPTS, CC builders).

### 5. Spotlight seeds

Ask for 2–3 example patterns the user thinks are cool in this domain. Minimum shape: `{tag, title, why}`. The wizard expands these to 6 full entries (with `{trick, code, summary, url}`) by sending the seeds + the fetched live data to Haiku.

### 6. Cadence

Ask how the spotlight card should rotate:

- `daily` *(default)* — a different spotlight each day, by day-of-year. The proven behaviour.
- `weekly` — one spotlight per week, by week-of-year; steadier for a slower-moving topic.
- `on-demand` — never auto-rotates; the spotlight stays where the user last left it via the ‹ › controls.

Set `cadence` on the `WizardConfig` only when the user picks `weekly` or `on-demand` — omit it for `daily` so a daily dashboard's build output stays byte-identical to pre-cadence dashboards. In all three cases the user can still page through every spotlight manually with the ‹ › buttons and ←/→ keys; cadence only changes the *automatic* rotation.

### 7. Output mode

Most dashboards are live Cowork artifacts — the default; don't ask about it. Choose `outputMode: 'static'` instead when the user says their environment has no live-artifacts feature, or asks for a portable / downloadable dashboard. A `'static'` dashboard is a standalone HTML file — GitHub data baked at build time, runs with no `window.cowork`. A `'static'` build also requires fetching each GitHub source's full data into `WizardSource.baked` (see "Wizard outputs"). Omit `outputMode` for the default `'artifact'`.

## Wizard outputs

After the questions, the wizard:

1. **Fetches a sample of live data** from each GitHub source via the GitHub MCP (`list_releases`, `list_issues`, or `list_pull_requests` per kind) — this sample seeds the Haiku curation batches below. **RSS sources need no wizard fetching**: leave each rss source's `items` unset and just pass its `url`. The build orchestrator (`wizard/build.ts`) fetches + parses every feed itself, in Node, in parallel. Do not call `web_fetch` on feed URLs — that tool only resolves URLs already in the conversation, so it fails on feeds and wastes round-trips; `build.ts` owns RSS end-to-end. **In `outputMode: 'static'`** also fetch each GitHub source's full `list_<kind>` result via the MCP and store the array on that source's `baked` field — `build.ts` bakes it in so the static dashboard renders with no live fetch.
2. **Runs Haiku batches** (chunk size ≤10 to stay under the askClaude payload ceiling) to generate the curated content, then stashes each batch's output in the corresponding `WizardConfig` field before invoking the build orchestrator:
   - 6 `spotlights` from user seeds + live data → `WizardConfig.spotlights`
   - 6 `highlights` from live data → `WizardConfig.highlights`
   - 6 community-library / pattern cards from live data → `WizardConfig.patterns`
   - 8 advanced tips from live data → `WizardConfig.tips`
   - 4–8 `resources` (canonical sources + community hubs) → `WizardConfig.resources`
3. **Pre-bakes briefs + digest triage — `outputMode: 'static'` only.** A static dashboard has no `window.cowork`, so neither a brief (badge click) nor the digest triage can be generated at runtime — both are baked at build time. This is a **two-pass** flow:
   - **Pass 1 — emit the flag manifest.** Run `build.ts --emit-flags --config <config.json> --out <manifest.json>`. It runs the shared flag-unit enumerators + the product matcher over the `baked` GitHub data and RSS `items`, and writes a deterministic JSON array of `{productId, stableId, kind, text, title, url}` — one entry per flagged (product × item) pair. No dashboard is built on this pass.
   - **Generate a brief per entry.** For each manifest entry, generate a `Brief` (`{why, integrations}`) — a Haiku batch (chunk ≤10, exactly like the curated batches), using that entry's product `systemPrompt` as the system prompt and its `text` / `kind` / `url` as the ITEM. Collect the results into `WizardConfig.briefs`, keyed `productId → stableId → Brief`.
   - **Triage each product's flagged items.** Per product, take that product's manifest entries and bucket each into 🟢 `green` / 🟡 `yellow` / 🔴 `red` — a Haiku batch following the criteria in `digest/triage.ts` `buildTriagePrompt` (be ruthless; most items are red). Use the entry's `text` plus the brief's `why` for context. Collect into `WizardConfig.triage`, keyed `productId → stableId → {stableId, bucket, reasoning}`.
   - **Pass 2 is the real build** (step 4) — `build.ts` embeds `WizardConfig.briefs` as the dashboard's `BAKED_BRIEFS` map and `WizardConfig.triage` as its `BAKED_TRIAGE` map; `fetchBrief` and `triageItems` consult them first, so every flagged item has a full brief offline and the upgrade digest is fully bucketed offline.

   Skip this step entirely for `'artifact'` dashboards — they generate briefs + triage live via `askClaude` and leave `WizardConfig.briefs` / `WizardConfig.triage` unset.
4. **Builds the populated HTML** by handing the fully-populated `WizardConfig` to `templates/wizard/build.ts` (see "Build step" below). The orchestrator's sentinel substitution turns each field into the matching HTML block.
5. **Smoke-tests the boot block** by running it in Node with stubbed `window`, `document`, `localStorage`. Catches TDZ errors and missing functions.
6. **Ships the dashboard** — in `'artifact'` mode, calls `mcp__cowork__create_artifact` with the populated HTML; in `'static'` mode, writes the HTML into the user's folder as a file and presents it (no `create_artifact` — see "Creating the artifact").
7. **Reports** the dashboard URL. Suggest `/setup-cc` as the next step **only when the dashboard has at least one `claude-code` product** — the `/digest` slash-command workflow it installs is Claude-Code-specific. For a dashboard with only `summary` / `task` products (or no products), skip that suggestion.

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

### v0.8.3 — static-mode refresh button (Phase 3d)

Strictly additive. A `static` dashboard has no Cowork runtime, so it can't re-fetch or re-curate itself — refreshing it is the `/refresh-dashboard` skill, which runs inside Claude. v0.8.3 makes that one click: an `outputMode: 'static'` dashboard renders a **Refresh button** in the hero that copies `/refresh-dashboard for <topic>` to the clipboard for the user to paste into Claude.

- **`refresh-button.ts`** — a new module exporting `initRefreshButton(deps, { topic })`. It injects the button, wires the click → clipboard copy, and is idempotent. Clipboard writes go through a new shared `util/clipboard.ts` (`writeToClipboard` — `navigator.clipboard` with an `execCommand` fallback, mirroring the private copy in `products/panel.ts`).
- **Emission.** `genLoadBody` emits the `initRefreshButton(deps, { topic: TOPIC })` call **only** in its `static` branch; `boot.ts` imports the module. An `'artifact'` build never references it, so esbuild tree-shakes `refresh-button.ts` (and `util/clipboard.ts`) out of the bundle entirely — an artifact dashboard's HTML stays byte-identical. The wizard does nothing extra: the button is fully build-time machinery.

### v0.8.2 — pre-baked digest triage (static mode, Phase 3c)

Strictly additive. In `outputMode: 'static'` the wizard now also pre-bakes the upgrade-digest triage at build time, so a static dashboard's digest is fully 🟢 / 🟡 / 🔴 bucketed offline — not defaulted to yellow.

- **`BAKED_TRIAGE`** (`digest/triage.ts`). A new `productId → stableId → TriagedItem` map, emitted by `genBakedTriage` into a sentinel. `triageItems` consults it first (mirrors `fetchBrief`'s `BAKED_BRIEFS` tier) — an item with a baked verdict skips the Haiku batch; the rest triage live. `TriageOpts` gains an optional `productId` to key the lookup; the digest bar passes it. Empty `{}` in an `'artifact'` build — an inert no-op there, every item triaged live as before.
- **Wizard flow.** The two-pass static flow (`build.ts --emit-flags` → generate per entry) now also triages each product's flagged items into `WizardConfig.triage` alongside `WizardConfig.briefs`. See "Wizard outputs" step 3. The digest panel + downloadable markdown read the baked triage transitively (triage → `renderDigestMarkdown` → panel).

### v0.8.1 — pre-baked briefs (static mode, Phase 3b)

Strictly additive. In `outputMode: 'static'` the wizard now pre-bakes every brief at build time, so a static dashboard has full briefs offline — no `window.cowork`, no model access needed.

- **Shared flag-unit enumerators** (`render/flag-units.ts`). The per-item `stableId` / `matchText` / `title` / `url` of every flaggable item is now computed by four pure enumerators (`prUnits` / `issueUnits` / `rssUnits` / `releaseUnits`); the four renderers source these fields from them instead of computing them inline. Behaviour-preserving — rendered HTML and stableIds are byte-identical to pre-3b output. This makes the wizard's flag manifest and the renderers structurally unable to disagree on a stableId.
- **`BAKED_BRIEFS`** (`products/brief.ts`). A new `productId → stableId → Brief` map, emitted by `genBakedBriefs` into a sentinel. `fetchBrief` consults it as tier 1, above the localStorage cache → `askClaude` → the regex-reason floor. Empty `{}` in an `'artifact'` build — an inert no-op there.
- **Two-pass wizard flow.** `build.ts --emit-flags` writes a deterministic flag manifest (`{productId, stableId, kind, text, title, url}` per flagged unit); the wizard generates a `Brief` per entry and folds them into `WizardConfig.briefs` for the real build. See "Wizard outputs" step 3.

### v0.8.0 — static / offline output mode (Phases 1-2)

Strictly additive. A new optional `WizardConfig.outputMode` — `'artifact'` (the default; omit it) or `'static'`. A `'static'` dashboard runs as a standalone HTML file with no Cowork artifact runtime. `dashboard.ts`'s `buildDeps` no longer hard-throws on a missing `window.cowork` — it returns a static `Deps` with rejecting stubs. In `'static'` mode `genLoadBody` emits, per GitHub source, a **progressive** block: attempt a live `callTool`, and on any failure render the build-time baked snapshot (`WizardSource.baked`, fetched by the wizard agent) instead. With no runtime the reject-stub makes the catch fall straight to baked; opened as an artifact, the live fetch wins. RSS is baked as before. An `'artifact'` build's `LOAD_BODY` is byte-identical to pre-v0.8.0 output. Phases 1-2 ship the static floor plus the live progressive-enhancement layer; product badges + flagging work offline. Phase 3a added the regex-reason brief floor; v0.8.1 (Phase 3b, above) completes offline briefs by pre-baking them.

### v0.7.2 — wizard build speed-ups

Strictly additive — build *output* is unchanged for every existing dashboard. Two changes to the build path:

- **RSS fetched by the orchestrator.** `wizard/build.ts`'s CLI entry hydrates every `kind: 'rss'` source before the build: a new `wizard/fetch-feeds.ts` fetches each feed with Node's `fetch` and parses it via the existing `util/rss-parser.ts` (jsdom-backed `DOMParser`), all feeds in parallel. The wizard agent no longer fetches feeds — the old flow burned failed `web_fetch` calls (that tool only resolves in-conversation URLs) then fell back to web searches. A source that already carries `items` is left untouched, so `/refresh-dashboard` and test fixtures are unaffected.
- **`--fast` build flag.** Skips biome + tsc, runs esbuild only (~2s vs ~3.5s). esbuild still parses every file, so malformed generated code still fails the build. The full biome + tsc + esbuild pipeline stays the default and is what dev / preflight runs.

### v0.7.1 — restored missing template modules

Packaging fix. The v0.7.0 release shipped — and the repo itself carried — an incomplete `templates/` tree: 14 source modules absent, 61 broken relative imports, so `wizard/build.ts` crashed on a missing-module import before building anything. v0.7.1 restores the 14 modules + their tests and adds an import-completeness guard to `scripts/build-plugin.sh` so an incomplete tree can never ship again. No behaviour change beyond "the build works".

### v0.7.0 — selectable spotlight cadence (Phase 10.6)

Strictly additive. `WizardConfig` gains an optional `cadence` — `'daily'` (the default), `'weekly'`, or `'on-demand'`. The spotlight carousel's auto-rotation branches on it: `daily` rotates by day-of-year (the proven behaviour), `weekly` by week-of-year, `on-demand` never auto-rotates and starts at the first spotlight. The persisted index is keyed by the cadence's rotation period, so a user's manual choice sticks until that period rolls over (`on-demand` never rolls over). `genLoadBody` emits the `cadence` option into the `initSpotlight(...)` call only for non-daily dashboards, so a daily build's `LOAD_BODY` is byte-identical to pre-cadence output. Re-adds the wizard's cadence question (F2 removed it because nothing read the answer; now `WizardConfig.cadence` does).

### v0.6.0 — pluggable action types (Phase 10.5)

Strictly additive. A `WizardProduct` can declare an `actionType` — `'claude-code'` (the default), `'summary'`, or `'task'`. The brief panel and the upgrade digest produce the matching artifact: `claude-code` keeps the Plan/Implement Claude Code prompt verbatim; `summary` emits plain prose; `task` emits a tracker-ready checklist. Briefs themselves are unchanged — every action type consumes the same Haiku-generated brief. A product with no `actionType` (every pre-Phase-10.5 dashboard) runs the existing claude-code code path unchanged. `summary` / `task` products carry no per-product builder — their action is built generically by the `ACTION_TYPES` registry in `templates/products/actions.ts`; only `claude-code` products need repo-nav extraction at wizard time. `/setup-cc` is Claude-Code-specific — suggest it only for dashboards with a `claude-code` product.

### v0.5.3 — RSS baked at build time (F5)

Dogfooding surfaced that the artifact sandbox blocks cross-origin `window.fetch`, so the v0.3 live-RSS path never actually reached a feed in a built dashboard. RSS is now **baked at build time**: each feed is fetched + parsed and its entries stored on `WizardSource.items`; `genLoadBody` emits them as a literal `renderRssItems(...)` call instead of a `fetchRss` call. (As of v0.7.2 the fetching is done by `wizard/build.ts`, not the wizard agent — see below.) `render/rss.ts` is unchanged — it renders the baked items. `mcp/fetch-rss.ts` is retained and still tested but no longer wired into built dashboards. RSS content refreshes on a `/refresh-dashboard` rebuild rather than on every open; GitHub sources (via the MCP bridge) are unaffected.

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
- `sources: WizardSource[]` — mix of github coordinates (kind: releases | issues | pull_requests + owner/repo) and rss feeds (kind: rss + url). Optional section + args. For rss sources the wizard also fills `items` — the feed's parsed entries, baked at build time. In `outputMode: 'static'` the wizard also fills each GitHub source's `baked` — the agent-fetched `list_<kind>` array — so the dashboard renders with no live fetch.
- `spotlights: WizardSpotlight[]` — 6 entries; the spotlight generator's output.
- `cadence?: Cadence` — optional spotlight rotation cadence (`'daily'` default, `'weekly'`, `'on-demand'`). Omit for `'daily'`.
- `outputMode?: 'artifact' | 'static'` — `'artifact'` (the default — omit it) builds the live Cowork-artifact dashboard. `'static'` builds a standalone HTML file: it runs with no `window.cowork`, rendering each GitHub source from that source's baked snapshot — and *if* a Cowork runtime is present (the file opened as an artifact) it refreshes that data live. The skill writes the file instead of calling `create_artifact`.
- `briefs?: Record<productId, Record<stableId, Brief>>` — pre-baked briefs for `outputMode: 'static'`. The wizard fills this via the two-pass `--emit-flags` flow (see "Wizard outputs" step 3); `build.ts` embeds it as the dashboard's `BAKED_BRIEFS` map. Omit for `'artifact'` builds.
- `triage?: Record<productId, Record<stableId, TriagedItem>>` — pre-baked digest triage for `outputMode: 'static'` (`TriagedItem` = `{stableId, bucket, reasoning}`). Filled in the same two-pass flow as `briefs`; `build.ts` embeds it as the dashboard's `BAKED_TRIAGE` map. Omit for `'artifact'` builds.
- `products: WizardProduct[]` — 0-N products (empty = no flagging machinery emitted). Each `WizardProduct` carries an optional `actionType` (`'claude-code'` default, `'summary'`, or `'task'`); omit it for `'claude-code'`. `ccPromptBody` + `contextRefresh` apply to `'claude-code'` products only.
- `highlights: WizardHighlightCard[]` — 6 entries; output of the highlights Haiku batch. Empty array → "get started" placeholder card. Shape: `{tag, title, body, url, cta?}`.
- `patterns: WizardPatternCard[]` — 6 entries; community / pattern cards. Same shape as `highlights`.
- `tips: WizardTipCard[]` — 8 entries; advanced-tip cards. Shape: `{title, why?, body, code?}`.
- `resources: WizardResourceLink[]` — 4–8 entries; "where to keep watching" links. Shape: `{name, desc, url}`.

### Invoking the orchestrator

The orchestrator lives at `${CLAUDE_PLUGIN_ROOT}/skills/create-dashboard/templates/wizard/build.ts`. The plugin directory is **read-only**, so `npm install` cannot run in place — stage a writable copy to `/tmp` once per session, then reuse it for every dashboard.

```bash
# One-time per session: stage the templates to a writable dir, then install.
# The plugin dir is READ-ONLY — npm install cannot run in place. Copy it to
# /tmp, make it writable, and install SYNCHRONOUSLY: each shell call is its
# own process, so a backgrounded `npm install &` does NOT survive the call.
FORESIGHTS_TPL=/tmp/foresights-templates
if [ ! -d "$FORESIGHTS_TPL/node_modules" ]; then
  rm -rf "$FORESIGHTS_TPL"
  cp -R "${CLAUDE_PLUGIN_ROOT}/skills/create-dashboard/templates" "$FORESIGHTS_TPL"
  chmod -R u+w "$FORESIGHTS_TPL"
  ( cd "$FORESIGHTS_TPL" && npm install --prefer-offline --no-audit --no-fund )
fi

# Then for each dashboard — ~2s on the esbuild-only --fast path:
echo "$WIZARD_CONFIG_JSON" > /tmp/foresights-config.json
cd "$FORESIGHTS_TPL" && npx tsx wizard/build.ts \
  --config /tmp/foresights-config.json \
  --out    /tmp/foresights-dashboard.html \
  --fast
```

Flags:

- `--config <path>` — path to the WizardConfig JSON. **Required.**
- `--out <path>`    — where to write the final dashboard HTML. **Required.**
- `--fast` — skip biome + tsc, run esbuild only (~2s vs ~3.5s). esbuild still parses the substituted TS, so a syntax error in generated code still fails the build. **Recommended for wizard runs** — the templates ship preflight-green and the wizard only splices data into them. Drop `--fast` to run the full biome + tsc gate if a build misbehaves.
- `--templates <dir>` — override the templates source directory (default: parent of `wizard/`).
- `--with-tests` — also run `npm run test` (vitest) on the substituted tree. Slow; debugging only.
- `--emit-flags` — **pass 1 of the static-mode two-pass flow.** Instead of building a dashboard, write a flag manifest JSON to `--out`: a deterministic array of `{productId, stableId, kind, text, title, url}`, one entry per flagged (product × item) pair across the config's `baked` GitHub data + RSS `items`. Used only in `outputMode: 'static'` to drive brief pre-baking — see "Wizard outputs" step 3.

> RSS: `build.ts` fetches and bakes every `kind: 'rss'` source's feed itself, in Node, before the build runs. Don't pre-fetch feeds or set `items` in the WizardConfig — just pass each rss source's `url`.
>
> Do NOT pass `--skip-preflight`: it's an internal test switch that bypasses biome/tsc/esbuild entirely and emits a *stub* bundle, not a real one. `--fast` is the supported speed switch; `--skip-preflight` is not.

**Static mode is a two-pass build.** For `outputMode: 'static'`, run the manifest pass, generate one brief per entry + per-product triage, fold both into the config, then run the real build:

```bash
# Pass 1 — emit the flag manifest (no dashboard is built).
cd "$FORESIGHTS_TPL" && npx tsx wizard/build.ts \
  --config /tmp/foresights-config.json \
  --out    /tmp/foresights-flags.json \
  --emit-flags
# → generate a Brief per manifest entry (Haiku batch, ≤10/chunk), collect
#   into WizardConfig.briefs keyed productId → stableId → {why, integrations};
# → triage each product's entries 🟢/🟡/🔴, collect into WizardConfig.triage
#   keyed productId → stableId → {stableId, bucket, reasoning}.

# Pass 2 — the real build, with briefs + triage folded into the config.
cd "$FORESIGHTS_TPL" && npx tsx wizard/build.ts \
  --config /tmp/foresights-config-with-briefs-and-triage.json \
  --out    /tmp/foresights-dashboard.html \
  --fast
```

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
  - RSS sources need no entry — their items are baked in at build time, not
    fetched at runtime.
  A GitHub-releases-only dashboard with no products needs just
  `["${ghServer}__list_releases"]`.

**Static mode.** When `outputMode` is `'static'`, do *not* call
`create_artifact` — the dashboard is a standalone file. Instead, write the
built HTML (the `--out` file) into the user's working folder and present it.
It opens in any browser; `/refresh-dashboard` rebuilds it. This is the path
for environments with no Cowork artifacts feature.

### Pipeline guarantees

The orchestrator runs these steps in order inside a temp working directory; failure in any step aborts with the failing command's stdout/stderr surfaced in the error:

1. **Stage** — `cp` `templates/` (minus `node_modules` + `dist`) into the temp dir.
2. **Substitute** — apply sentinel substitution (three-form matcher: HTML / TS / CSS) to every `.ts` file with sentinels + to `dashboard.html`. Apply placeholder substitution to `config.ts`'s `TOPIC` / `TOPIC_SLUG` / `GH_SERVER` constants.
3. **biome** — `npx biome check --write .` (auto-fixes formatter quirks introduced by generated TS). *Skipped under `--fast`.*
4. **tsc** — `npx tsc --noEmit` (strict type-check). *Skipped under `--fast`.*
5. **esbuild** — `npx esbuild dashboard.ts --bundle --format=iife --target=es2022 --sourcemap=inline --outfile=dist/dashboard.js`.
6. **vitest** *(optional, `--with-tests`)* — `npx vitest run`.
7. **Inject + final substitute** — read `dist/dashboard.js`, substitute it into `dashboard.html` at `{{COMPILED_JS}}`, expand remaining placeholders (`{{TOPIC}}`, `{{ACCENT}}`, etc.).
8. **Write** — emit the final HTML to `--out`.

The substitution layer (`wizard/substitute.ts` + `wizard/build-config.ts`) has 90+ unit tests; the orchestrator (`wizard/build.ts`) has a 9-case integration test that runs steps 1, 2, 7, 8 end-to-end against the real templates with `--skip-preflight` for speed. Full preflight covers the orchestrator's substitution + injection logic; the toolchain shell-outs are only exercised at wizard time.

What's deferred to v0.3+:

- Per-block generator specs for SECTION_NAV, SECTION_MARKUP, SOURCES_CONST, LOAD_BODY, PRODUCT_CSS, PRODUCT_UI_BARS, PRODUCTS_CONFIG (5 sub-sentinels).
- Per-product context-refresh as a wizard question (currently a Phase 6 module but not exposed in the wizard flow).
- Additional source kinds: Reddit, HackerNews, YouTube channels, generic URL watch (Phase 10.2–4).

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
