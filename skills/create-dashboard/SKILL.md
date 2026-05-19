---
name: create-dashboard
description: Wizard that builds a live news dashboard customised to the user's product. Use when the user says "create a dashboard", "spin up a dashboard for X", "I want to stay on top of X", "build me a news dashboard", "track the X ecosystem", "set up Foresights for my product", "make a live dashboard", or describes wanting filtered ecosystem news for a stack or topic. Asks 5–6 questions (topic, GitHub sources, products to flag, seed patterns, cadence) and outputs a fully-populated Cowork dashboard artifact.
---

# Create Dashboard

> **Status:** v0.1 — wizard spec is captured; template substitution is partial. See `Implementation status` below before invoking.

## What this skill does

Walks the user through 5–6 questions, then generates a fully-populated Cowork dashboard artifact: live ecosystem news (GitHub releases / PRs / issues) + curated highlights, spotlight, patterns, tips + per-product relevance flagging + Claude Code prompt + upgrade-digest builder.

The output follows the 5-layer architecture proven in `aws-cdk-news` and `aws-serverless-news`. See `reference/analysis.md` in this repo (gitignored) for the full structural breakdown.

## Wizard flow

Use `AskUserQuestion` for each step. Don't ask follow-ups if the user's free-text answer already covers the next question.

### 1. Topic + slug

Free text. Examples: "Rust async ecosystem", "Kubernetes operators", "JAX/ML research".

Derive `topic_slug` (kebab-case) from the topic. Used for HTML IDs, localStorage keys, and the artifact's display name (`<slug>-news`).

### 2. Accent theme

Pick from a preset palette so the dashboard has a coherent colour identity:

- Orange (`#ff6a14`, soft `#fff3eb`) — AWS / dev tools default
- Blue (`#1f4ed8`, soft `#e7eeff`) — generic engineering
- Purple (`#5c3bbb`, soft `#efeaff`) — Rust / systems
- Teal (`#0a6f7d`, soft `#e6f6f8`) — data / ML
- Green (`#1b8a3a`, soft `#e6f5ec`) — observability / SRE
- Pink (`#c43c8e`, soft `#fce7f3`) — frontend / design

User can override with a custom hex.

### 3. Data sources

Multi-input. For each source:

- `owner` / `repo` (GitHub coordinates)
- `kind` — `releases` | `issues` | `pull_requests`
- `args` — kind-specific:
  - releases: `perPage` (default 5)
  - issues: `perPage`, `state` (default OPEN), `orderBy` (default UPDATED_AT), `direction` (default DESC)
  - pull_requests: `perPage`, `state` (default closed), `sort` (default updated), `direction` (default desc)
- `section` — optional; explicit section ID this source feeds. If omitted, sources of the same `kind` get merged into a single auto-named section.

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

### 6. Cadence

`daily` (rotate by day-of-year) | `weekly` (rotate by week-number) | `on-demand` (no rotation; user uses ← → keys or refresh button).

## Wizard outputs

After the questions, the wizard:

1. **Fetches a sample of live data** from each configured source via the GitHub MCP (`list_releases`, `list_issues`, or `list_pull_requests` per kind).
2. **Runs Haiku batches** (chunk size ≤10 to stay under the askClaude payload ceiling) to generate:
   - 6 spotlight entries from user seeds + live data
   - 6 highlight cards from live data
   - 6 community-library / pattern cards from live data
   - 8 advanced tips from live data
3. **Builds the populated HTML** by substituting placeholders in `templates/dashboard.html` (see below).
4. **Smoke-tests the boot block** by running it in Node with stubbed `window`, `document`, `localStorage`. Catches TDZ errors and missing functions.
5. **Calls `mcp__cowork__create_artifact`** with the populated HTML.
6. **Reports** the dashboard URL and suggests `/setup-claude-code` as the next step.

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

The 12 complex content blocks (sources const, products config, RULES, PROMPTS, CC builders, SPOTLIGHTS, highlights markup, patterns markup, tips, resources, section nav, product CSS, `load()` body) are not yet templated as placeholders — see `Implementation status` below.

## Implementation status

**v0.1 (current):** simple `{{...}}` placeholders in the template are populated by the wizard. The 12 complex content blocks still carry CDK-specific reference content. **The wizard cannot yet produce a working non-CDK dashboard** — it would emit a dashboard with the user's topic title but CDK rules, prompts, and curated content.

**v0.2 (next):** wrap the 12 complex blocks with `<!-- FORESIGHTS_START:NAME --> ... <!-- FORESIGHTS_END:NAME -->` sentinels. Wizard generates each block from wizard data + Haiku output and string-replaces between sentinels. Adds the smoke-test step. Adds conditional skipping when the products list is empty.

**v0.3:** per-product context refresh (live re-fetch of rule layout / repo list) as an optional wizard question.

## Reference

- `reference/aws-cdk-news.html` — proven worked example, mixed-kind sources, two products
- `reference/aws-serverless-news.html` — proven worked example, fan-out releases, two products
- `reference/analysis.md` — structural breakdown, 5-layer notes, placeholder catalog
