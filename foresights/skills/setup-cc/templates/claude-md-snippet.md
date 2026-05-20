## Upgrade digests

This repo receives **upgrade digests** from a [Foresights](https://instancelabs.dev)
dashboard — triaged lists of ecosystem changes (new releases, RFCs, patterns)
worth considering for this codebase.

**Where they live.** `.claude/upgrade-digests/` — one file per run, named
`<YYYY-MM-DD>-<product-slug>-upgrade-digest.md`. The "latest digest" is the
one with the newest `YYYY-MM-DD` prefix.

**Structure.** Each digest sorts items into three buckets:

- 🟢 **Implement now** — high-impact, low-risk, well-scoped. Full detail.
- 🟡 **Worth considering** — useful but needs judgment or has dependencies.
- 🔴 **Skip** — one-liners; not worth acting on now.

Every 🟢 and 🟡 item carries a ready-to-run Claude Code prompt inside a
`<details>` block ("Claude Code prompt (click to expand)"). To act on an
item, follow that prompt — default to plan mode first.

**Done log.** `.claude/upgrade-digests/done.json` is an append-only array.
After implementing an item, append
`{ "stableId": "...", "title": "...", "implementedAt": "<ISO date>", "pr": "<PR URL or branch>" }`.
Items already in `done.json` count as complete and are skipped by `/digest`.

**Slash commands** (installed by Foresights `/setup-cc`):

- `/digest` — inspect and act on the latest digest. See `.claude/commands/digest.md`.
- `/digest-save` — save a digest pasted from the dashboard.

**Trigger phrases.** When the user asks "what should I add", "any upgrade
ideas", "anything new I should integrate", or similar — consult the latest
digest in `.claude/upgrade-digests/` (excluding `done.json` items) and
surface the 🟢 bucket before answering.
