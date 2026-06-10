<p align="center">
  <img src="assets/mark.svg" width="64" height="64" alt="Foresights mark — three source nodes converging on one sightline">
</p>

<h1 align="center">Foresights</h1>

<p align="center">
  News that affects your stack — before it lands.<br/>
  A Cowork & Claude Code plugin by <a href="https://instancelabs.dev">Instance Labs</a>.
</p>

---

Foresights spins up a live news dashboard customised to your product in about 15 minutes. It shows just the GitHub releases, PRs, RFCs, and RSS items that touch *your* stack — plus curated highlights, a rotating spotlight, and per-product relevance flagging so you see what matters immediately.

When something is worth acting on, click through to a Haiku-generated brief grounded in *your* codebase, then generate a self-contained Claude Code prompt to implement it — or batch everything into a triaged upgrade digest that drops into your repo's `.claude/upgrade-digests/` folder.


<p align="center">
  <img src="assets/screenshot-dashboard.png" width="32%" alt="A live Foresights dashboard with product badges">
  <img src="assets/screenshot-brief.png"     width="32%" alt="A brief panel expanded under a flagged item">
  <img src="assets/screenshot-digest.png"    width="32%" alt="An upgrade digest with triaged items">
</p>

## What's different

- **Renovate / Dependabot** auto-PR dep bumps. Foresights doesn't touch deps — it surfaces news and patterns relevant to your product, with editorial curation.
- **daily.dev** is a firehose. Foresights is filtered by *your* product's surface area.
- **PageCrawl / Dependency-Track** monitor releases but don't recommend what to do. Foresights closes the loop from "X just shipped" → "here's the PR".

## Install

### In Claude Code

Install from the Instance Labs marketplace:

```
/plugin marketplace add instancelabs/foresights
/plugin install foresights@instancelabs
```

### In Cowork

Install the latest `.plugin` file from this repo's [releases page](https://github.com/instancelabs/foresights/releases) (or build it yourself with `scripts/build-plugin.sh`).

Then run `/create-dashboard` and answer ~7 questions — the wizard builds a dashboard customised to your topic, sources, and products in about 15 minutes.

## What's installed

| Skill | What it does |
|---|---|
| `/create-dashboard` | Wizard that asks ~7 questions (topic, accent, sources, products to flag, spotlight seeds, cadence, output mode) then generates a fully-populated dashboard. Ships as a Cowork live artifact by default, or as a standalone static HTML file. |
| `/refresh-dashboard` | Re-curate the highlights, patterns, tips, and resources on an existing dashboard against the latest live data via a fast section-splice path. Escalates to a full rebuild when the spotlight, data sources, or products need to change. |
| `/setup-cc` | Generate `CLAUDE.md` additions, `.claude/upgrade-digests/` scaffold, and `/digest` + `/digest-save` slash commands for a target repo — closes the loop from dashboard digest to Claude Code to PR. |
| `/foresights-doctor` | Diagnostic. Seven cheap checks (Node version, wizard entrypoints, vendored esbuild-wasm, canned no-source build, Node fetch reachability, WebFetch reachability, GitHub MCP detection) confirm the install is healthy and route `/create-dashboard` to the right data-fetch path for the current environment. Run it before `/create-dashboard` in a new sandbox. |
| `/foresights-design` | The Foresights brand + product design system as an invokable skill — drop-in tokens, components, brand guidelines, and UI-kit references for building on-brand dashboards or marketing material. |

Each product can carry one of three **action types**: `claude-code` (default — ready-to-run handoff prompt + upgrade-digest workflow, for products with a code repo), `summary` (plain-prose summary, for research or marketing products with no repo), or `task` (tracker-ready item with a checklist). Pick the type per product during the wizard.

## Try it without installing

Drop `foresights/demo/static-aws-cdk-news.html` into a browser — that's a self-contained, no-Cowork-runtime demo dashboard showing the curated-content layout (spotlights, highlights, patterns, tips, resources) for the AWS CDK ecosystem. It's a structural preview; the live data, brief panels, and digest workflow only fire when you generate a real dashboard via `/create-dashboard`.

## The 5-layer architecture

Every generated dashboard follows the proven pattern:

1. **Live data** — GitHub releases / PRs / issues via Cowork's MCP bridge, plus RSS / Atom feeds baked at build time. Refreshed each time you open the dashboard (artifact mode) or pre-baked into the file (static mode).
2. **Curated content** — hand-picked highlights, a rotating spotlight (daily / weekly / on-demand), community libs, tips, and resources. Each section has a `↻ Refresh content` button.
3. **Relevance flagging** — regex matchers per product flag items that affect *your* stack. Items can carry multiple product badges; matchers stress-tested at build time for catastrophic-backtracking patterns.
4. **Brief panel** — click any badge → Haiku-generated "why relevant" + "how it could integrate" with specific src paths from your repo, cached locally by content hash.
5. **Implementation** — every brief has a Claude Code prompt button (or a summary / task output, depending on the product's action type). Per-product "Upgrade digest" button batches all flagged items into 🟢/🟡/🔴 triage buckets with embedded ready-to-paste prompts. `/setup-cc` wires the receiving side into your repo.

Output as a Cowork **artifact** (live, re-fetches on open) or a **static HTML file** (briefs and digest triage pre-baked at build time, no Cowork runtime needed — useful for sharing or for environments without live-artifact support).

## What's stored locally

Foresights stores a small amount of data in your browser's `localStorage` to keep the dashboard responsive between opens:

- **Brief cache** — each Haiku-generated brief (the "why relevant" + "how it could integrate" text for a flagged item) is cached by content hash, keyed by topic + product. Refreshing the dashboard's source data invalidates entries whose underlying item changed.
- **Repo-context cache** — when a product opts into context refresh, the dashboard stores the literal text of your repo's `CLAUDE.md` and `README.md` (capped at 16KB per file), so subsequent brief generations can ground integration suggestions in your conventions.
- **Spotlight rotation state** — which spotlight card was last shown and when, so the rotation period (daily / weekly / on-demand) rolls over correctly.

All local-only — nothing is exfiltrated, no telemetry, no analytics. Worth being aware of when sharing a dashboard with a teammate: opening DevTools → Application → localStorage reveals the cached briefs (which can reference your repo's internals). Clear the relevant `${topicSlug}-news.*` keys before handing the dashboard URL to a wider audience.

## Status

**v0.9.5** — brand rollout (v0.9.4 design-system tokens across templates and READMEs; v0.9.5 locked the hero mark to the iris-gradient brand mark so identity reads consistently across topic accents). Sits on top of the v0.9.3 security pass: `safeHref` at every `<a href>`, build-time XSS allowlist on trusted-HTML fields, regex-DoS smoke check, build-time SSRF guard, digest-save slug tightening, `vitest 4.1.8` clears all `npm audit`. See the [releases page](https://github.com/instancelabs/foresights/releases) for the full per-version writeups.

Author: [Instance Labs Ltd](https://instancelabs.dev). Licensed under [MIT](../LICENSE).
