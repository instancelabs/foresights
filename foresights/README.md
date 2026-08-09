<p align="center">
  <img src="assets/mark.svg" width="64" height="64" alt="Foresights mark — three source nodes converging on one sightline">
</p>

<h1 align="center">Foresights</h1>

<p align="center">
  News that affects your stack — before it lands.<br/>
  A ChatGPT Work, Codex, Claude Code &amp; Cowork plugin by <a href="https://instancelabs.dev">Instance Labs</a>.
</p>

---

Foresights spins up a news dashboard customised to your product in about 15 minutes. It shows just the GitHub releases, PRs, RFCs, and RSS items that touch *your* stack — plus curated highlights, a rotating spotlight, and per-product relevance flagging so you see what matters immediately.

When something is worth acting on, click through to an evidence-aware brief grounded in *your* codebase, then generate a self-contained coding-agent prompt — or batch everything into a conservative upgrade digest for review in ChatGPT Work/Codex or Claude Code.

<p align="center">
  <img src="assets/screenshot-dashboard.png" width="32%" alt="A live Foresights dashboard with product badges">
  <img src="assets/screenshot-brief.png"     width="32%" alt="A brief panel expanded under a flagged item">
  <img src="assets/screenshot-digest.png"    width="32%" alt="An upgrade digest with triaged items">
</p>

## See it first

▶ **[Open the live demo in your browser](https://instancelabs.github.io/foresights/foresights/demo/static-aws-cdk-news.html)** — a self-contained AWS CDK news dashboard, nothing to install. It's a structural preview; the live data, brief panels, and digest workflow fire once you build your own with `/create-dashboard`.

## Requirements

- **ChatGPT Work/Codex, [Claude Code](https://claude.com/claude-code), or Cowork** — Foresights ships a standalone static dashboard in coding-agent hosts and a live artifact in Cowork.
- **Node ≥ 20** — the wizard compiles your dashboard locally. `/foresights-doctor` verifies this for you.
- A connected **GitHub MCP server** *if* you want live GitHub release / PR / issue data — optional; RSS-only and curated-only dashboards work without it.
- Brief generation uses the active host model; live Cowork dashboards use **Claude Haiku**, while static builds are synthesized by the coding agent.

## Install &amp; first run

### Claude app / Cowork

Download the latest `foresights-<version>.plugin` from the [releases page](https://github.com/instancelabs/foresights/releases). In Claude, open **Plugins**, upload the custom plugin file, and start a new chat. Invoke `/create-dashboard` or ask Claude to use Foresights.

### ChatGPT Work / Codex app

Until the public universal-directory listing is approved, add the GitHub marketplace once:

```bash
npx github:instancelabs/foresights install --codex
```

Restart the ChatGPT desktop app, open **Plugins → Instance Labs**, and install or enable Foresights. Start a new Work/Codex chat before using it.

### Claude Code and Codex CLI

Use the same installer for either host:

```bash
npx github:instancelabs/foresights install --claude
npx github:instancelabs/foresights install --codex
npx github:instancelabs/foresights install --all
```

Run it again to refresh an existing installation, or use `npx github:instancelabs/foresights status --all` for a read-only check. Then run `/create-dashboard` in Claude Code, or ask Codex to use Foresights to create a dashboard.

> **Two output modes, picked automatically.** Cowork → a live artifact that re-fetches on open. ChatGPT Work/Codex and Claude Code → a static HTML file baked once, portable and shareable. The wizard detects your host; you can force either.

On a locked-down or corporate machine? Run **`/foresights-doctor`** first — it probes your environment and routes the wizard to the data path that works there.

## What's installed

**Start with `/create-dashboard`** — the rest support it.

| Skill | What it does |
|---|---|
| **`/create-dashboard`** | *Start here.* Wizard (~6 questions) that generates your dashboard — live ecosystem news, curated highlights, a rotating spotlight, per-product relevance flagging, briefs, and the upgrade-digest builder. |
| `/refresh-dashboard` | Re-curate the highlights, patterns, tips, and resources on an existing dashboard against the latest live data via a fast section-splice path. Escalates to a full rebuild when the spotlight, data sources, or products need to change. |
| `/setup-cc` | Generate `CLAUDE.md` additions, `.claude/upgrade-digests/` scaffold, and `/digest` + `/digest-save` slash commands for a target repo — closes the loop from dashboard digest to Claude Code to PR. |
| `/foresights-doctor` | Diagnostic. Seven cheap checks (Node version, wizard entrypoints, vendored esbuild-wasm, canned no-source build, network reachability, GitHub MCP detection) confirm the install is healthy and route `/create-dashboard` to the right data-fetch path. Run it before `/create-dashboard` in a new sandbox. |
| `/foresights-design` | *(For builders.)* The Foresights brand + product design system as an invokable skill — drop-in tokens, components, brand guidelines, and UI-kit references for building on-brand dashboards or marketing material. |

Each product can carry one of three **action types**: `claude-code` (default — ready-to-run handoff prompt + upgrade-digest workflow, for products with a code repo), `summary` (plain-prose summary, for research or marketing products with no repo), or `task` (tracker-ready item with a checklist). Pick the type per product during the wizard.

## How it works — the 5-layer architecture

Every generated dashboard follows the same proven pattern:

1. **Live data** — GitHub releases / PRs / issues via the MCP bridge, plus RSS / Atom feeds baked at build time. Refreshed each time you open the dashboard (artifact mode) or pre-baked into the file (static mode).
2. **Curated content** — hand-picked highlights, a rotating spotlight (daily / weekly / on-demand), community libs, tips, and resources. Each section has a `↻ Refresh content` button.
3. **Relevance flagging** — regex matchers per product flag items that affect *your* stack. Items can carry multiple product badges; matchers stress-tested at build time for catastrophic-backtracking patterns.
4. **Brief panel** — click any badge → a model-generated, evidence-aware "why relevant" + "how it could integrate," grounded in the available repo context and cached locally by content hash.
5. **Implementation** — every brief has a coding-agent prompt button (or a summary / task output, depending on the product's action type). Per-product "Upgrade digest" button batches all flagged items into 🟢/🟡/🔴 triage buckets with embedded ready-to-paste prompts. `/setup-cc` remains available for Claude Code-specific repository wiring.

Output as a Cowork **artifact** (live, re-fetches on open) or a **static HTML file** (briefs and digest triage pre-baked at build time, no Cowork runtime needed — useful for sharing or for environments without live-artifact support).

## What's stored locally

Foresights stores a small amount of data in your browser's `localStorage` to keep the dashboard responsive between opens:

- **Brief cache** — each generated brief (the "why relevant" + "how it could integrate" text for a flagged item) is cached by content hash, keyed by topic + product. Refreshing the dashboard's source data invalidates entries whose underlying item changed.
- **Repo-context cache** — when a product opts into context refresh, the dashboard stores the literal text of your repo's `CLAUDE.md` and `README.md` (capped at 16KB per file), so subsequent brief generations can ground integration suggestions in your conventions.
- **Spotlight rotation state** — which spotlight card was last shown and when, so the rotation period (daily / weekly / on-demand) rolls over correctly.

All local-only — nothing is exfiltrated, no telemetry, no analytics. Worth being aware of when sharing a dashboard with a teammate: opening DevTools → Application → localStorage reveals the cached briefs (which can reference your repo's internals). Clear the relevant `${topicSlug}-news.*` keys before handing the dashboard URL to a wider audience.

## Status

**v0.10.0 — release candidate.** Adds shared Claude and OpenAI plugin packaging, a unified Claude Code/Codex installer, and more conservative evidence-aware briefs and upgrade digests. See the [releases page](https://github.com/instancelabs/foresights/releases) for published releases.

Author: [Instance Labs Ltd](https://instancelabs.dev). Licensed under [MIT](../LICENSE).
