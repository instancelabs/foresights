# Build internals

Everything `SKILL.md` punts on for the happy-path flow: the `WizardConfig` shape, the per-array curated-content contracts, sentinels and placeholders, the block generators, build flags, the 8-step pipeline, and concrete source examples.

## WizardConfig shape

The full shape is in `templates/wizard/build-config.ts`. Top-level fields the wizard must fill:

- `topic`, `topicSlug`, `taglineSuffix`, `taglineSub` — branding strings (placeholders).
- `accent`, `accentSoft` — hex colours.
- `footerNote`, `artifactName`, `artifactDescription` — metadata.
- `ghServer` — the user's GitHub MCP server name (e.g. `mcp__github` or `mcp__<uuid>`).
- `headerSourcesLinks` — pre-rendered HTML for the source links in the hero.
- `sources: WizardSource[]` — mix of github coordinates (`releases` | `issues` | `pull_requests` + `owner`/`repo`) and rss feeds (`rss` + `url`). Optional `section` + `args`. For rss sources the wizard leaves `items` unset — `build.ts`'s `wizard/fetch-feeds.ts` populates them. In `outputMode: 'static'` the wizard also fills each GitHub source's `baked` — the agent-fetched `list_<kind>` array.
- `spotlights: WizardSpotlight[]` — 6 entries; the spotlight generator's output.
- `cadence?: Cadence` — optional spotlight rotation cadence (`'daily'` default, `'weekly'`, `'on-demand'`). Omit for `'daily'` to keep build output byte-identical to pre-cadence dashboards.
- `outputMode?: 'artifact' | 'static'` — omit for the default `'artifact'`. See `static-mode.md`.
- `briefs?: Record<productId, Record<stableId, Brief>>` — pre-baked briefs for static mode; embedded as the dashboard's `BAKED_BRIEFS` map.
- `triage?: Record<productId, Record<stableId, TriagedItem>>` — pre-baked digest triage for static mode (`TriagedItem` = `{stableId, bucket, reasoning}`); embedded as `BAKED_TRIAGE`.
- `products: WizardProduct[]` — 0–N products. Each carries an optional `actionType` (`'claude-code'` default, `'summary'`, or `'task'`). `ccPromptBody` + `contextRefresh` apply to `'claude-code'` products only.
- `highlights: WizardHighlightCard[]` — 6 entries; `{tag, title, body, url, cta?}`. Empty array → "get started" placeholder card.
- `patterns: WizardPatternCard[]` — 6 entries; same shape as highlights.
- `tips: WizardTipCard[]` — 8 entries; `{title, why?, body, code?}`.
- `resources: WizardResourceLink[]` — 4–8 entries; `{name, desc, url}`.

## Curated content shapes

The wizard agent (you) synthesizes each of these arrays before invoking `build.ts`. Validate counts; if your first synthesis returns fewer than the target, retry once. Second-failure fallback is an empty array — which produces a placeholder card via the generator's empty-array branch.

| Field | Count | Per-entry JSON shape |
|---|---|---|
| `spotlights` | 6 | `{tag, title, summary, trick, code, why, url}` — see "SPOTLIGHTS_CONST" below |
| `highlights` | 6 | `{tag, title, body, url, cta?}` — `cta` defaults to "GitHub" for github.com URLs |
| `patterns`   | 6 | `{tag, title, body, url, cta?}` — same shape as highlights |
| `tips`       | 8 | `{title, why?, body, code?}` — `code` is pre-rendered HTML with `<span class="k">` / `<span class="s">` / `<span class="t">` |
| `resources`  | 4–8 | `{name, desc, url}` — one per canonical source / community hub |

**Inline HTML rule:** the generators allow bare `<code>...</code>` through but escape everything else (including `<code class="x">`, `<strong>`, `<script>`). When synthesizing card titles / bodies, only use `<code>` inline — no other HTML, no markdown. Highlight/pattern markup must **not** include `<span class="insights-tag">`; product flagging is runtime via `upgradeHighlightBadges()`.

**Tip `code` field:** emit ready-to-render HTML with `<span class="k">` (keyword), `<span class="s">` (string), `<span class="t">` (type). Don't wrap in `<pre>` — the generator wraps the value in `<pre class="code-block">` to dodge the dark-pre cascade trap.

## Source examples

CDK-style mixed-kind, three sections:

```js
[
  { owner: 'aws', repo: 'aws-cdk',      kind: 'releases',      section: 'releases' },
  { owner: 'aws', repo: 'aws-cdk-rfcs', kind: 'issues',        section: 'rfcs', args: { perPage: 10, state: 'OPEN' } },
  { owner: 'aws', repo: 'aws-cdk',      kind: 'pull_requests', section: 'prs',  args: { state: 'closed', perPage: 30 } },
]
```

Serverless-style fan-out, one merged section:

```js
[
  { owner: 'aws-powertools', repo: 'powertools-lambda-typescript', kind: 'releases' },
  { owner: 'aws',            repo: 'aws-sam-cli',                   kind: 'releases' },
  { owner: 'sst',            repo: 'sst',                           kind: 'releases' },
  { owner: 'middyjs',        repo: 'middy',                         kind: 'releases' },
  { owner: 'serverless',     repo: 'serverless',                    kind: 'releases' },
]
```

Mixed: GitHub releases + RSS feeds, side by side:

```js
[
  { owner: 'aws', repo: 'aws-cdk',  kind: 'releases', section: 'cdk-releases' },
  { url: 'https://aws.amazon.com/blogs/aws/feed/',          kind: 'rss', label: 'AWS News Blog',       section: 'industry' },
  { url: 'https://stratechery.com/feed/',                    kind: 'rss', label: 'Stratechery',         section: 'industry' },
  { url: 'https://newsletter.pragmaticengineer.com/feed',   kind: 'rss', label: 'Pragmatic Engineer',  section: 'industry' },
]
```

Non-dev: marketing-focused, RSS only:

```js
[
  { url: 'https://blog.hubspot.com/marketing/rss.xml', kind: 'rss', label: 'HubSpot Marketing', section: 'updates' },
  { url: 'https://www.marketingweek.com/feed/',        kind: 'rss', label: 'Marketing Week',    section: 'updates' },
  { url: 'https://thinkwithgoogle.com/feeds/articles', kind: 'rss', label: 'Think with Google', section: 'updates' },
]
```

**Validate `releases` sources** before committing — rolling-release projects like Klipper publish no GitHub releases, so a `releases` source on one renders a permanently-empty section. Probe each with `list_releases` (`perPage: 1`); offer `pull_requests` as a fallback if the probe returns empty.

## Template substitution

Placeholders in `templates/dashboard.html`:

| Placeholder | Source |
|---|---|
| `{{ARTIFACT_NAME}}` | Title-cased topic + " News" |
| `{{ARTIFACT_DESCRIPTION}}` | One-paragraph description |
| `{{TOPIC}}` | Display name |
| `{{TAGLINE_SUFFIX}}` | Default: "what's new & worth knowing" |
| `{{TAGLINE_SUB}}` | Hero subtitle one-liner |
| `{{TOPIC_SLUG}}` | Kebab-case slug |
| `{{ACCENT}}` | Hex |
| `{{ACCENT_SOFT}}` | Hex |
| `{{GH_SERVER}}` | `mcp__<uuid>` prefix; detect from the user's available tools by pattern-matching `__list_releases` |
| `{{HEADER_SOURCES_LINKS}}` | Comma-separated `<a>` tags pointing at the configured sources |
| `{{FOOTER_NOTE}}` | One-line footer description |
| `{{FORESIGHTS_CONFIG_JSON}}` | Auto-injected by the build — full `WizardConfig` serialised into the `<script type="application/json" id="foresights-config">` block. `/refresh-dashboard` reads it. |

## Sentinels

The 12 sentinel-wrapped blocks the wizard fills in. Three comment forms, picked by host-language:

- **HTML** (markup regions): `<!-- FORESIGHTS_START:NAME -->` ... `<!-- FORESIGHTS_END:NAME -->`
- **TS/JS** (inside `<script>` blocks or `.ts` modules): `// FORESIGHTS_START:NAME` ... `// FORESIGHTS_END:NAME`
- **CSS** (inside `<style>` blocks): `/* FORESIGHTS_START:NAME */` ... `/* FORESIGHTS_END:NAME */`

The wizard's replacer matches all three. Regex (per-sentinel-name, non-greedy across forms):

```
(<!--|//|/\*)\s*FORESIGHTS_START:NAME\s*(-->|\*/|\n)
  [\s\S]*?
(<!--|//|/\*)\s*FORESIGHTS_END:NAME\s*(-->|\*/|\n)
```

The `PRODUCTS_CONFIG` block uses sub-sentinels (`PRODUCTS_CONFIG:PROMPTS`, `PRODUCTS_CONFIG:RULES`, `PRODUCTS_CONFIG:CC_BUILDERS`, `PRODUCTS_CONFIG:PRODUCTS_CONST`, `PRODUCTS_CONFIG:CONTEXT_REFRESH`) because the underlying JS sits in non-contiguous regions of the template.

## Block generators

Each generator (in `templates/wizard/build-config.ts`) takes a slice of `WizardConfig` and emits a string slotted between matching sentinels.

### `RESOURCES_MARKUP`

One `<a class="res">` per entry in `config.resources`. Each anchor carries `<div class="res-name">` + `<div class="res-desc">`; both run through `escHtml`.

### `TIPS_MARKUP`

One `<div class="tip">` per entry in `config.tips`. The title gets `<h3>` (optional `<code>` inline + optional `<span class="why">— ${why}</span>` suffix), body gets `<p>`, and if `code` is set, append `<pre class="code-block">${code}</pre>` (NOT plain `<pre>` — that triggers the dark-pre cascade trap).

### `PATTERNS_MARKUP`

One `<div class="hl-card">` per entry in `config.patterns`. Each card: `<span class="tag">` + `<h3>` + `<p>` + `<a class="more">` with CTA suffix picked by URL host (`github.com` → "GitHub →", else `hostname →`). Cards are processed by `upgradeHighlightBadges()` at boot — do **not** include static `insights-tag` spans.

### `HIGHLIGHTS_MARKUP`

Same shape as `PATTERNS_MARKUP`, fed from `config.highlights`.

### `SPOTLIGHTS_CONST`

A typed `SPOTLIGHTS` JS const inside `<script>`. Each entry:

- `tag` — short prefix label (e.g. `'Generative AI · L3'`)
- `title` — one line, plain text
- `summary` — 1–2 sentence pitch, may include `<code>` inline
- `trick` — the "why it's clever" line, 1–3 sentences, may include `<code>` inline
- `code` — array of strings joined with `'\n'`. Each line is HTML with `<span class="k">` / `<span class="s">` / `<span class="t">` for syntax tokens. The template ships with `.sl-code` styling; do not introduce a stray `<pre>`.
- `why` — 1–2 sentences explaining why it matters (spotlight footer)
- `url` — the canonical link

**Critical escaping:** the `code` field uses backslash-escaped single quotes (`<span class="s">\'github.com/...\'</span>`) because each line is a JS string literal. Escape `'` inside string-class spans before emitting.

## Build invocation

The plugin ships a pre-bundled `templates/wizard/build.js` (v0.9.0+) — run that with `node`, no `tsx` or `npm install` needed. The `.ts` source is left in the tree for dev (`npx tsx wizard/build.ts` works identically if you have `tsx` installed); both produce byte-equivalent output. The bundled JS uses `esbuild-wasm` (vendored at `templates/node_modules/esbuild-wasm/`) instead of the native `esbuild` CLI. Flags:

- `--config <path>` — path to the WizardConfig JSON. **Required.**
- `--out <path>`    — where to write the final dashboard HTML. **Required.**
- `--fast` — skip biome + tsc, run esbuild only (~0.5s wasm, ~0.2s native). esbuild still parses the substituted TS, so syntax errors in generated code still fail the build. Recommended for wizard runs.
- `--templates <dir>` — override the templates source directory (default: parent of `wizard/`).
- `--with-tests` — also run `npm run test` (vitest) on the substituted tree. Slow; debugging only. **Requires `npm install` in the staged dir** (vitest is a devDep).
- `--emit-flags` — **pass 1 of the static-mode two-pass flow.** Write a flag manifest JSON to `--out` instead of building. Used only in `outputMode: 'static'`.

> RSS: `build.ts` fetches and bakes every `kind: 'rss'` source's feed itself, in Node, before the build runs. Don't pre-fetch feeds or set `items` in the WizardConfig — just pass each rss source's `url`.
>
> Do NOT pass `--skip-preflight`: it's an internal test switch that bypasses biome / tsc / esbuild and emits a *stub* bundle, not a real one. `--fast` is the supported speed switch.

## Pipeline guarantees

The orchestrator runs these 8 steps in a temp working directory; failure in any step aborts with the failing command's stdout / stderr surfaced in the error:

1. **Stage** — `cp` `templates/` (minus `node_modules` + `dist`) into the temp dir.
2. **Substitute** — apply sentinel substitution (three-form matcher: HTML / TS / CSS) to every `.ts` file with sentinels + to `dashboard.html`. Apply placeholder substitution to `config.ts`'s `TOPIC` / `TOPIC_SLUG` / `GH_SERVER` constants.
3. **biome** — `npx biome check --write .` (auto-fixes formatter quirks introduced by generated TS). *Skipped under `--fast`.*
4. **tsc** — `npx tsc --noEmit` (strict type-check). *Skipped under `--fast`.*
5. **esbuild** — `npx esbuild dashboard.ts --bundle --format=iife --target=es2022 --sourcemap=inline --outfile=dist/dashboard.js`.
6. **vitest** *(optional, `--with-tests`)* — `npx vitest run`.
7. **Inject + final substitute** — read `dist/dashboard.js`, substitute it into `dashboard.html` at `{{COMPILED_JS}}`, expand remaining placeholders (`{{TOPIC}}`, `{{ACCENT}}`, etc.).
8. **Write** — emit the final HTML to `--out`.

The substitution layer (`wizard/substitute.ts` + `wizard/build-config.ts`) has 90+ unit tests; the orchestrator (`wizard/build.ts`) has an integration test that runs steps 1, 2, 7, 8 end-to-end. The toolchain shell-outs are only exercised at wizard time.

## Stdout summary

The orchestrator writes a one-line JSON summary to stdout:

```json
{"workDir":"/tmp/foresights-build-xyz","outFile":"/tmp/foresights-dashboard.html","artifact":{"name":"AWS CDK news","description":"..."},"outBytes":54321}
```

Pipe through `jq` (or `JSON.parse`) to pick up `artifact.name` / `artifact.description` for the `create_artifact` call.

## Verifying the output

Sentinel markers (`<!-- FORESIGHTS_START:NAME -->` / END, plus the TS `//` and CSS `/* */` forms) are preserved in the final HTML by design — they label where each block came from for debuggability and idempotent re-runs. **Substitution replaces only the body between them.** Sanity check: grep for `{{` (placeholders should be 0 — they all expanded) and confirm the bundle is in the `<script>` block. Do NOT grep for `FORESIGHTS_` — those markers stay on purpose.

## `create_artifact` payload

After the build, call `mcp__cowork__create_artifact` with:

- `id` — kebab-case slug for the artifact, conventionally `<topicSlug>-news` (e.g. `rust-async-news`).
- `html_path` — absolute path to the built HTML file (the `--out` path).
- `description` — the `artifact.description` field from the orchestrator's stdout summary.
- `mcp_tools` — only the MCP tools the dashboard actually calls at runtime:
  - one `${ghServer}__list_<kind>` per distinct GitHub source `kind` in use (`list_releases`, `list_issues`, `list_pull_requests`);
  - add `${ghServer}__get_file_contents` and `${ghServer}__search_repositories` only when the dashboard has products (the context-refresh button uses them);
  - RSS sources need no entry — items are baked at build time.

A GitHub-releases-only dashboard with no products needs just `["${ghServer}__list_releases"]`.

For static mode: **do not call `create_artifact`** — see `static-mode.md` → step 6.

## Toolchain commands

From `templates/`:

```
npm install          # one-time per session
npm run lint         # biome check
npm run typecheck    # tsc --noEmit (strict)
npm run build        # esbuild → dist/dashboard.js
npm run test         # vitest run
npm run preflight    # lint + typecheck + test
```
