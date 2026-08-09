<p align="center">
  <img src="foresights/assets/mark.svg" width="64" height="64" alt="Foresights mark — three source nodes converging on one sightline">
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
  <img src="foresights/assets/screenshot-dashboard.png" width="32%" alt="A live Foresights dashboard with product badges">
  <img src="foresights/assets/screenshot-brief.png"     width="32%" alt="A brief panel expanded under a flagged item">
  <img src="foresights/assets/screenshot-digest.png"    width="32%" alt="An upgrade digest with triaged items">
</p>

## See it first

▶ **[Open the live demo in your browser](https://instancelabs.github.io/foresights/foresights/demo/static-aws-cdk-news.html)** — a self-contained AWS CDK news dashboard, nothing to install. (Or open `foresights/demo/static-aws-cdk-news.html` locally.)

It's a structural preview — the live data, brief panels, and digest workflow fire once you build your own with `/create-dashboard`.

## Requirements

- **ChatGPT Work/Codex, [Claude Code](https://claude.com/claude-code), or Cowork** — Foresights ships a standalone static dashboard in coding-agent hosts and a live artifact in Cowork.
- **Node ≥ 20** — the wizard compiles your dashboard locally. `/foresights-doctor` verifies this for you.
- A connected **GitHub MCP server** *if* you want live GitHub release / PR / issue data — optional; RSS-only and curated-only dashboards work without it.
- Brief generation uses the active host model; live Cowork dashboards use **Claude Haiku**, while static builds are synthesized by the coding agent.

## Install &amp; first run

### Claude app / Cowork

Download the latest `foresights-<version>.plugin` from the [releases page](https://github.com/instancelabs/foresights/releases). In Claude, open **Plugins**, choose the option to upload a custom plugin, and select the downloaded file. Start a new chat, then invoke `/create-dashboard` or ask Claude to use Foresights.

### ChatGPT Work / Codex app

Foresights is structured for the universal ChatGPT/Codex plugin directory. Until its public listing is approved, add the GitHub marketplace once from a terminal:

```bash
npx github:instancelabs/foresights install --codex
```

Restart the ChatGPT desktop app, open **Plugins → Instance Labs**, and install or enable Foresights. Plugins run in ChatGPT Work and Codex surfaces; start a new chat before asking Foresights to create a dashboard.

### Claude Code and Codex CLI

One installer handles either or both CLIs:

```bash
npx github:instancelabs/foresights install --claude
npx github:instancelabs/foresights install --codex
npx github:instancelabs/foresights install --all
```

It is safe to run again: it refreshes the marketplace and updates an existing installation. To inspect both hosts without changing them:

```bash
npx github:instancelabs/foresights status --all
```

The equivalent direct commands are:

```bash
claude plugin marketplace add instancelabs/foresights
claude plugin install foresights@instancelabs --scope user

codex plugin marketplace add instancelabs/foresights
codex plugin add foresights@instancelabs
```

Then run **`/create-dashboard`** in Claude Code, or ask Codex to use Foresights to create a dashboard. The wizard asks ~6 questions and produces a self-contained static HTML dashboard.

> **Two output modes, picked automatically.** Cowork → a live artifact that re-fetches on open. ChatGPT Work/Codex and Claude Code → a static HTML file baked once, portable and shareable. The wizard detects your host; you can force either.

On a locked-down or corporate machine? Run **`/foresights-doctor`** first — it probes your environment and routes the wizard to the data path that works there (down to a fully curated-only dashboard when no network path is available).

## What's installed

**Start with `/create-dashboard`** — the rest support it.

| Skill | What it does |
|---|---|
| **`/create-dashboard`** | *Start here.* Wizard (~6 questions) that generates your dashboard — live ecosystem news (GitHub releases / PRs / issues + RSS / Atom feeds), curated highlights, a rotating spotlight, per-product relevance flagging, briefs, and the upgrade-digest builder. |
| `/refresh-dashboard` | Re-curate the highlights, patterns, tips, and resources on an existing dashboard against the latest live data — a fast section-splice, escalating to a full rebuild when the spotlight, sources, or products change. |
| `/setup-cc` | Generate the `CLAUDE.md` additions, `.claude/upgrade-digests/` scaffold, and `/digest` + `/digest-save` commands in a target repo — closes the loop from dashboard → digest → Claude Code → PR. |
| `/foresights-doctor` | Diagnostic. Seven cheap checks (Node version, wizard entrypoints, network reachability, GitHub MCP detection, …) that confirm the install is healthy and route `/create-dashboard` to the right data path. Run it before your first build in a new environment. |
| `/foresights-design` | *(For builders.)* The Foresights brand + design system as an invokable skill — drop-in tokens, components, brand guidelines, and UI-kit references for on-brand dashboards or marketing material. |

Each flagged product carries one of three **action types** — `claude-code` (the default; ready-to-run handoff prompt + upgrade-digest workflow, for products backed by a code repo), `summary` (plain prose, for research / marketing products with no repo), or `task` (a tracker-ready checklist). Pick the type per product during the wizard.

## How it works — the 5-layer architecture

Every generated dashboard follows the same proven pattern:

1. **Live data** — GitHub releases / PRs / issues via the MCP bridge, plus RSS / Atom feeds baked at build time. Refreshed each time you open the dashboard (artifact mode) or pre-baked into the file (static mode).
2. **Curated content** — hand-picked highlights, a rotating spotlight (daily / weekly / on-demand), community libs, tips, and resources. Each section has a `↻ Refresh content` button driven by `/refresh-dashboard`.
3. **Relevance flagging** — regex matchers per product flag items that affect *your* stack. Items can carry multiple product badges; matchers are stress-tested at build time for catastrophic-backtracking patterns.
4. **Brief panel** — click any badge → a model-generated, evidence-aware "why relevant" + "how it could integrate," grounded in the available repo context and cached locally by content hash.
5. **Implementation** — every brief has a coding-agent prompt button (or a summary / task output, depending on the product's action type). A per-product "Upgrade digest" button batches all flagged items into 🟢/🟡/🔴 triage buckets with embedded ready-to-paste prompts. `/setup-cc` remains available for Claude Code-specific repository wiring.

**A note on privacy:** dashboards cache briefs and (optionally) your repo's `CLAUDE.md` / `README.md` text in the browser's `localStorage` — all local, no telemetry, no analytics. Clear the `${topicSlug}-news.*` keys before sharing a dashboard widely. Full detail in the [plugin README](./foresights/README.md#whats-stored-locally).

## Status

**v0.10.0 — current.** Adds shared Claude and OpenAI plugin packaging, a unified Claude Code/Codex installer, and more conservative evidence-aware briefs and upgrade digests. See the [changelog](./CHANGELOG.md) for the complete release notes.

## Building from source

The repo keeps `foresights/templates/` at the root of the plugin source for ergonomic local dev (`npm install` / `npm run preflight` run from there). The build script stages a clean copy with `templates/` relocated under `skills/create-dashboard/templates/` (where SKILL.md's `${CLAUDE_PLUGIN_ROOT}` path points), strips cruft, runs three completeness guards (precompiled wizard entrypoints present, every relative TS import resolves, only `esbuild-wasm` in `node_modules/`), and zips it.

```bash
npm run preflight
bash scripts/build-plugin.sh
```

Produces `foresights-<version>.plugin` for Claude and `foresights-<version>-openai.zip` for the OpenAI submission portal. Version comes from `foresights/.claude-plugin/plugin.json`; override with a positional argument.

See [DISTRIBUTION.md](./DISTRIBUTION.md) for app-directory publishing, marketplace structure, and maintainer validation.

---

Author: [Instance Labs Ltd](https://instancelabs.dev). Licensed under [MIT](./LICENSE).
