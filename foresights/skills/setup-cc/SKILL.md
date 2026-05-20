---
name: setup-cc
description: Wires the Foresights upgrade-digest workflow into a target repo. Use when the user asks to install the digest slash command, wire Foresights into their codebase, set up the upgrade-digest workflow, close the Foresights loop, or run /setup-cc. Generates the CLAUDE.md "Upgrade digests" section, the .claude/upgrade-digests/ scaffold, and the /digest plus /digest-save slash commands.
---

# Setup CC

Scaffolds the Foresights upgrade-digest workflow into a target repo, closing
the loop: a Foresights dashboard produces a triaged digest → it lands in the
repo → `/digest` inspects and acts on it with Claude Code.

## What it installs

Into the target repo:

| Path | Purpose |
|---|---|
| `.claude/CLAUDE.md` | Appends an "Upgrade digests" section — teaches Claude Code where digests live, the 🟢/🟡/🔴 convention, the `done.json` log, and the trigger phrases. |
| `.claude/upgrade-digests/README.md` | Explains the digest folder. |
| `.claude/upgrade-digests/done.json` | Append-only log of implemented items — created as `[]`. |
| `.claude/commands/digest.md` | The `/digest` slash command. |
| `.claude/commands/digest-save.md` | The `/digest-save` slash command. |

The four source files live at
`${CLAUDE_PLUGIN_ROOT}/skills/setup-cc/templates/` —
`claude-md-snippet.md`, `upgrade-digests-readme.md`, `digest.md`,
`digest-save.md`.

## Steps

### 1. Locate the target repo

Ask the user which repo to wire up. Auto-detect a sensible default: if a
folder is mounted in this Cowork session that looks like a code repo (has
`.git/`, `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, or
similar), offer it and confirm before writing anything.

If no repo folder is accessible, explain that `/setup-cc` writes files
directly into the repo's working tree, ask the user to mount their repo
folder in Cowork, and stop.

### 2. Append the CLAUDE.md section

Read `${CLAUDE_PLUGIN_ROOT}/skills/setup-cc/templates/claude-md-snippet.md`.

- If `<repo>/.claude/CLAUDE.md` exists and already contains an
  `## Upgrade digests` heading — skip it, report "already present". Never
  duplicate the section.
- If it exists without that section — append the snippet, preceded by one
  blank line.
- If it doesn't exist — create `<repo>/.claude/CLAUDE.md` with the snippet.

(If the repo keeps its memory file at the root as `CLAUDE.md` rather than
`.claude/CLAUDE.md`, append to that one instead — match the repo's existing
convention.)

### 3. Create the digest folder

- Create `<repo>/.claude/upgrade-digests/` if absent.
- Copy `templates/upgrade-digests-readme.md` →
  `<repo>/.claude/upgrade-digests/README.md`.
- Create `<repo>/.claude/upgrade-digests/done.json` containing `[]` if it
  doesn't exist. **Never overwrite an existing `done.json`** — it's the
  user's implementation log.

### 4. Install the slash commands

- Copy `templates/digest.md` → `<repo>/.claude/commands/digest.md`.
- Copy `templates/digest-save.md` → `<repo>/.claude/commands/digest-save.md`.
- Create `<repo>/.claude/commands/` if absent.
- If a command file already exists, show what differs and ask before
  overwriting.

### 5. Report

Summarise what was created vs skipped, then state the new capabilities:

- `/digest` — inspect and act on the latest upgrade digest.
- `/digest-save` — save a digest pasted from the Foresights dashboard.
- Trigger phrases — "what should I add", "any upgrade ideas", "anything new
  I should integrate" now make Claude Code consult the latest digest.

Point the user at the next step: open their Foresights dashboard, click a
product's "Upgrade digest" button, copy the markdown, and `/digest-save` it
into this repo.

## Notes

- This skill writes into the *target repo's* working tree. It does **not**
  commit — the user reviews and commits the new `.claude/` files themselves.
- Idempotent: re-running skips the CLAUDE.md section when already present,
  never clobbers `done.json`, and asks before overwriting command files.
- The `${CLAUDE_PLUGIN_ROOT}` variable resolves to the installed plugin
  directory. If a template can't be found there, the templates also sit
  alongside this SKILL.md under `templates/`.
