# Foresights

Spin up a live news dashboard customised to your product — in about 15 minutes.

Foresights gives you a dashboard of just the news, releases, and patterns that affect *your* stack — GitHub releases, PRs and issues from the orgs and repos you care about, plus RSS feeds, curated highlights, a rotating "spotlight" of one cool pattern in depth, and per-product relevance flagging so you immediately see what's worth looking at.

When something is worth acting on, click through to a Haiku-generated brief grounded in *your* codebase, then generate a self-contained Claude Code prompt to implement it — or batch everything into a triaged upgrade digest that drops into your repo's `.claude/upgrade-digests/` folder.

<!--
  Screenshots come in after the marketplace-prep PR lands and Lee captures
  them in a live Cowork session. See assets/SCREENSHOTS-TODO.md for the
  capture checklist. Once `foresights/assets/screenshot-*.png` exist, swap
  the comment for the row below.

  <p align="center">
    <img src="foresights/assets/screenshot-dashboard.png" width="32%" alt="A live Foresights dashboard with product badges">
    <img src="foresights/assets/screenshot-brief.png"     width="32%" alt="A brief panel expanded under a flagged item">
    <img src="foresights/assets/screenshot-digest.png"    width="32%" alt="An upgrade digest with triaged items">
  </p>
-->

## What's different

- **Renovate / Dependabot** auto-PR dep bumps. Foresights doesn't touch deps — it surfaces news and patterns relevant to your product, with editorial curation.
- **daily.dev** is a firehose. Foresights is filtered by *your* product's surface area.
- **PageCrawl / Dependency-Track** monitor releases but don't recommend what to do. Foresights closes the loop from "X just shipped" → "here's the PR".

## Install

In Cowork, drag-install the latest `foresights-<version>.plugin` from this repo's [releases page](https://github.com/instancelabs/foresights/releases). Or build it yourself — see below.

## What's installed

| Skill | What it does |
|---|---|
| `/create-dashboard` | Wizard that asks ~7 questions (topic, sources, products to flag, seed patterns, cadence, output mode) then generates a fully-populated live dashboard artifact (or a standalone HTML file). |
| `/refresh-dashboard` | Re-curate the spotlight, highlights, patterns, and tips on an existing dashboard using the latest data. Hybrid: section-splice fast path vs full rebuild. |
| `/setup-cc` | Generate `CLAUDE.md` additions, `.claude/upgrade-digests/` scaffold, and `/digest` + `/digest-save` slash commands for a target repo. Closes the loop from dashboard → digest → Claude Code → PR. |
| `/foresights-doctor` | Diagnostic. Seven cheap checks (Node version, wizard entrypoints, network reachability, GitHub MCP detection) that confirm the install is healthy and route `/create-dashboard` to the right data-fetch path for the current environment. |

## Try a demo

`foresights/demo/static-aws-cdk-news.html` is a standalone, no-install demo dashboard (curated AWS CDK content, static mode, no Cowork runtime required). Open it in any browser. Use it as a structural preview — the live data sections, briefs, and digest workflow only fire when you generate your own dashboard via `/create-dashboard`.

## Building the plugin

The repo keeps `foresights/templates/` at the root of the plugin source for ergonomic local dev (`npm install` / `npm run preflight` run from there). The build script stages a clean copy with `templates/` relocated under `skills/create-dashboard/templates/` (where SKILL.md's `${CLAUDE_PLUGIN_ROOT}` path points), strips cruft, runs three completeness guards (precompiled wizard entrypoints present, every relative TS import resolves, only `esbuild-wasm` in `node_modules/`), and zips it.

```bash
bash scripts/build-plugin.sh
```

Produces `foresights-<version>.plugin` at the repo root. Version comes from `foresights/.claude-plugin/plugin.json`; override with a positional arg (`bash scripts/build-plugin.sh 0.9.4-pre`).

## The 5-layer architecture

Every generated dashboard follows the proven pattern:

1. **Live data** — GitHub releases / PRs / issues via Cowork's MCP bridge, plus RSS / Atom feeds baked at build time. Refreshed each time you open the dashboard.
2. **Curated content** — hand-picked highlights, a rotating spotlight (daily / weekly / on-demand), community libs, tips, and resources. Each section has a `↻ Refresh content` button driven by `/refresh-dashboard`.
3. **Relevance flagging** — regex matchers per product flag items that affect *your* stack. Items can carry multiple product badges; matchers stress-tested at build time for catastrophic-backtracking patterns.
4. **Brief panel** — click any badge → Haiku-generated "why relevant" + "how it could integrate" with specific src paths from your repo, cached locally by content hash.
5. **Implementation** — every brief has a "Generate Claude Code prompt" button. Per-product "Upgrade digest" button batches all flagged items into 🟢/🟡/🔴 triage buckets with embedded ready-to-paste prompts. `/setup-cc` wires the receiving side into your repo.

## Status

**v0.9.3** — security pass landed (`safeHref` at every `<a href>`, build-time XSS allowlist on trusted-HTML fields, regex-DoS smoke check, build-time SSRF guard, digest-save slug tightening; `vitest 4.1.8` clears all `npm audit`). See the [v0.9.3 release notes](https://github.com/instancelabs/foresights/releases/tag/v0.9.3) for the full security writeup.

Author: [Instance Labs Ltd](https://instancelabs.dev). Licensed under [MIT](./LICENSE).
