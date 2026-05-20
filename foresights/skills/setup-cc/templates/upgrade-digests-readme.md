# Upgrade digests

Triaged ecosystem-change digests from a [Foresights](https://instancelabs.dev)
dashboard.

- **One file per run** — `<YYYY-MM-DD>-<product-slug>-upgrade-digest.md`.
  The newest date is the "latest digest".
- **Buckets** — 🟢 Implement now · 🟡 Worth considering · 🔴 Skip.
- Each 🟢/🟡 item has an embedded Claude Code prompt in a `<details>` block.
- **`done.json`** — append-only log of implemented items
  (`{ stableId, title, implementedAt, pr }`). Items listed here are skipped
  by `/digest`.

## Workflow

1. In your Foresights dashboard, click a product's **"Upgrade digest"**
   button — it triages the flagged items and produces a markdown digest.
2. Copy the digest markdown and run **`/digest-save`** here to drop it into
   this folder.
3. Run **`/digest`** to inspect the 🟢 items, `/digest do <n>` to implement
   one, and `/digest done <n> <PR>` to log it.

Don't hand-edit digest files — regenerate them from the dashboard. This
folder is safe to commit; `done.json` is the only file you'll routinely
update.
