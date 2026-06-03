# Foresights

Spin up a live news dashboard customised to your product — in about 15 minutes.

Foresights gives you a dashboard of just the news, releases, and patterns that affect *your* stack — GitHub releases, PRs and issues from the orgs and repos you care about, RSS feeds from the blogs and newsrooms you follow, plus curated highlights, a rotating "spotlight" of one cool pattern in depth, and per-product relevance flagging so you immediately see what's worth looking at.

When something is worth acting on, click through to a Haiku-generated brief grounded in *your* codebase, then generate a self-contained Claude Code prompt to implement it — or batch everything into a triaged upgrade digest that drops into your repo's `.claude/upgrade-digests/` folder.

<!--
  Screenshots come after the marketplace-prep PR lands and Lee captures
  them in a live Cowork session. See assets/SCREENSHOTS-TODO.md.

  <p align="center">
    <img src="assets/screenshot-dashboard.png" width="32%" alt="A live Foresights dashboard with product badges">
    <img src="assets/screenshot-brief.png"     width="32%" alt="A brief panel expanded under a flagged item">
    <img src="assets/screenshot-digest.png"    width="32%" alt="An upgrade digest with triaged items">
  </p>
-->

## What's different

- **Renovate / Dependabot** auto-PR dep bumps. Foresights doesn't touch deps — it surfaces news and patterns relevant to your product, with editorial curation.
- **daily.dev** is a firehose. Foresights is filtered by *your* product's surface area.
- **PageCrawl / Dependency-Track** monitor releases but don't recommend what to do. Foresights closes the loop from "X just shipped" → "here's the PR".

## Install

In Cowork, install the `.plugin` file from this repo's [releases page](https://github.com/instancelabs/foresights/releases) (or build it yourself with `scripts/build-plugin.sh`). Then run `/create-dashboard` and answer ~7 questions — the wizard builds a dashboard customised to your topic, sources, and products in about 15 minutes.

## What's installed

| Skill | What it does |
|---|---|
| `/create-dashboard` | Wizard that asks ~7 questions then generates a live dashboard artifact (or a standalone HTML file). |
| `/refresh-dashboard` | Re-curate the spotlight, highlights, patterns, and tips on an existing dashboard against the latest data. Hybrid: section-splice fast path vs full rebuild. |
| `/setup-cc` | Generate `CLAUDE.md` additions, `.claude/upgrade-digests/` scaffold, and `/digest` + `/digest-save` slash commands for a target repo — closes the loop from dashboard digest to Claude Code to PR. |
| `/foresights-doctor` | Diagnostic. Seven cheap checks confirm the install is healthy and route `/create-dashboard` to the right data-fetch path for the current environment. Run it before `/create-dashboard` in a new sandbox. |

## Try it without installing

Drop `foresights/demo/static-aws-cdk-news.html` into a browser — that's a self-contained, no-Cowork-runtime demo dashboard showing the curated-content layout (spotlights, highlights, patterns, tips, resources) for the AWS CDK ecosystem. It's a structural preview; the live data, brief panels, and digest workflow only fire when you generate a real dashboard via `/create-dashboard`.

## The 5-layer architecture

Every generated dashboard follows the proven pattern:

1. **Live data** — GitHub releases / PRs / issues via Cowork's MCP bridge, plus RSS / Atom feeds baked at build time. Refreshed each time you open the dashboard.
2. **Curated content** — hand-picked highlights, a rotating spotlight (daily / weekly / on-demand), community libs, tips, and resources. Each section has a `↻ Refresh content` button.
3. **Relevance flagging** — regex matchers per product flag items that affect *your* stack. Items can carry multiple product badges; matchers stress-tested at build time for catastrophic-backtracking patterns.
4. **Brief panel** — click any badge → Haiku-generated "why relevant" + "how it could integrate" with specific src paths from your repo, cached locally by content hash.
5. **Implementation** — every brief has a "Generate Claude Code prompt" button. Per-product "Upgrade digest" button batches all flagged items into 🟢/🟡/🔴 triage buckets with embedded ready-to-paste prompts. `/setup-cc` wires the receiving side into your repo.

## What's stored locally

Foresights stores a small amount of data in your browser's `localStorage` to keep the dashboard responsive between opens:

- **Brief cache** — each Haiku-generated brief (the "why relevant" + "how it could integrate" text for a flagged item) is cached by content hash, keyed by topic + product. Refreshing the dashboard's source data invalidates entries whose underlying item changed.
- **Repo-context cache** — when a product opts into context refresh, the dashboard stores the literal text of your repo's `CLAUDE.md` and `README.md` (capped at 16KB per file), so subsequent brief generations can ground integration suggestions in your conventions.
- **Spotlight rotation state** — which spotlight card was last shown and when, so the rotation period (daily / weekly / on-demand) rolls over correctly.

All local-only — nothing is exfiltrated, no telemetry, no analytics. Worth being aware of when sharing a dashboard with a teammate: opening DevTools → Application → localStorage reveals the cached briefs (which can reference your repo's internals). Clear the relevant `${topicSlug}-news.*` keys before handing the dashboard URL to a wider audience.

## Status

**v0.9.3** — security pass landed: `safeHref` at every `<a href>`, build-time XSS allowlist on trusted-HTML fields, regex-DoS smoke check, build-time SSRF guard, digest-save slug tightening, `vitest 4.1.8` clears all `npm audit`. See the [v0.9.3 release notes](https://github.com/instancelabs/foresights/releases/tag/v0.9.3) for the full writeup.

Author: [Instance Labs Ltd](https://instancelabs.dev). Licensed under [MIT](../LICENSE).
