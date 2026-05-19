# Foresights

Spin up a live news dashboard customised to your product — in about 15 minutes.

Foresights gives you a dashboard of just the news, releases, and patterns that affect *your* stack — GitHub releases, PRs and issues from the orgs and repos you care about, plus curated highlights, a rotating "spotlight" of one cool pattern in depth, and per-product relevance flagging so you immediately see what's worth looking at.

When something is worth acting on, click through to a Haiku-generated brief grounded in *your* codebase, then generate a self-contained Claude Code prompt to implement it — or batch everything into a triaged upgrade digest that drops into your repo's `.claude/upgrade-digests/` folder.

## What's different

- **Renovate / Dependabot** auto-PR dep bumps. Foresights doesn't touch deps — it surfaces news and patterns relevant to your product, with editorial curation.
- **daily.dev** is a firehose. Foresights is filtered by *your* product's surface area.
- **PageCrawl / Dependency-Track** monitor releases but don't recommend what to do. Foresights closes the loop from "X just shipped" → "here's the PR".

## Install

In Cowork, install the `.plugin` file from this repo's release artifact (or build it yourself with `zip -r foresights.plugin foresights/`).

## Skills

| Skill | What it does |
|---|---|
| `/create-dashboard` | Wizard that asks 5–6 questions (topic, sources, products to flag, seed patterns, cadence) then generates a fully-populated live dashboard artifact. |
| `/refresh-dashboard` | Re-curate the spotlight, highlights, patterns, and tips on an existing dashboard using the latest data. |
| `/setup-claude-code` | Generate `CLAUDE.md` additions, `.claude/upgrade-digests/` scaffold, and `/digest` + `/digest-save` slash commands for a target repo. |

## The 5-layer architecture

Every generated dashboard follows the proven pattern:

1. **Live data** — GitHub releases / PRs / issues via Cowork's MCP bridge, refreshed each time you open the dashboard.
2. **Curated content** — hand-picked highlights, a rotating-daily spotlight, community libs, tips, and resources. Each section has a `↻ Refresh content` button.
3. **Relevance flagging** — regex matchers per product flag items that affect *your* stack. Items can carry multiple product badges.
4. **Brief panel** — click any badge → Haiku-generated "why relevant" + "how it could integrate" with specific src paths, cached locally by content hash.
5. **Implementation** — every brief has a "Generate Claude Code prompt" button. Per-product "Upgrade digest" button batches all flagged items into 🟢/🟡/🔴 triage buckets with ready-to-paste prompts.

## Status

v1 — preview. Author: [Instance Labs Ltd](https://instancelabs.dev).
