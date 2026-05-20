---
description: Inspect and act on the latest Foresights upgrade digest.
argument-hint: "[green | yellow | all | YYYY-MM-DD | do <id> | done <id> [PR] | fresh | recommend]"
allowed-tools: Read, Glob, Grep, Bash, Edit, Write
---

# /digest

Foresights upgrade digests live in `.claude/upgrade-digests/`, named
`<YYYY-MM-DD>-<product-slug>-upgrade-digest.md`. Each sorts items into
🟢 Implement now / 🟡 Worth considering / 🔴 Skip, and every 🟢/🟡 item
carries a ready-to-run Claude Code prompt inside a `<details>` block.
`.claude/upgrade-digests/done.json` is an append-only log of implemented
items (`{ stableId, title, implementedAt, pr }`).

**Argument:** `$ARGUMENTS`

Resolve the **latest digest** = the `*-upgrade-digest.md` file with the
newest `YYYY-MM-DD` prefix, unless the argument names an explicit date.
If `.claude/upgrade-digests/` is missing or has no digest files, tell the
user to run `/digest-save` with a digest from their Foresights dashboard
first, and stop.

Dispatch on the argument:

- **empty, or `green`** — Read the latest digest. List the 🟢 Implement-now
  items, excluding any whose `stableId` appears in `done.json`. For each:
  a 1-based number, the title, and the one-line "why it matters". Close by
  noting the user can run `/digest do <number>` to act on one.

- **`yellow` or `all`** — As `green`, but also include the 🟡 Worth-
  considering bucket (🟢 first, then 🟡), still excluding `done.json` items.

- **`YYYY-MM-DD`** — Use the digest for that exact date instead of the
  latest, then behave as the `green` case for that file.

- **`do <number-or-stableId>`** — In the latest digest, find that item by
  its 1-based number (within its bucket) or by `stableId`. Extract the
  Claude Code prompt from the item's `<details>` block and follow it now.
  Default to **plan mode**: produce a plan and wait for approval before
  editing files. If the item is already in `done.json`, say so and ask
  whether to proceed anyway.

- **`done <number-or-stableId> [PR-URL]`** — Append an entry to
  `.claude/upgrade-digests/done.json` (create the file as `[]` if absent):
  `{ "stableId": "<id>", "title": "<item title>", "implementedAt": "<today, ISO 8601>", "pr": "<PR-URL, or the current git branch if no URL given>" }`.
  Confirm what was logged.

- **`fresh`** — Read nothing. Print a reminder: digests are generated from
  the Foresights dashboard — open it, click a product's "Upgrade digest"
  button, then `/digest-save` the result into this repo.

- **`recommend`** — Read the latest digest, then **re-rank** its 🟢/🟡
  items against THIS repo's actual state: recent `git log`, what's already
  built, current open work. Override the digest's triage where the repo
  evidence disagrees — demote an item whose feature already exists, promote
  one that unblocks recent work. Present a ranked recommendation with
  one-line, repo-grounded reasoning per item.

Anything else: treat unknown text as if it might be a `stableId` for `do`,
or ask the user to clarify against the argument list above.
