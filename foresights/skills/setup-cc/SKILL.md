---
name: setup-cc
description: Wires the Foresights upgrade-digest workflow into a target repo. Use when the user asks to install the digest slash command, wire Foresights into their codebase, or set up the upgrade-digest workflow in their repo. Generates CLAUDE.md additions, the .claude/upgrade-digests/ scaffold, and the /digest plus /digest-save slash commands.
---

# Setup CC

> **Status:** stub. To be filled in.

This skill scaffolds the upgrade-digest workflow in a target repo so Foresights digests close the loop:

1. Ask for the target repo path (or auto-detect from the current Cowork-mounted folder).
2. Append the "Upgrade digests" section to `.claude/CLAUDE.md` (or create it). Source: `templates/claude-md-snippet.md`.
3. Create `.claude/upgrade-digests/` with a `README.md` explaining the bucketing convention (green/yellow/red), the collapsible-details-wrapped prompts, and the `done.json` append-only log.
4. Create `.claude/commands/digest.md` from `templates/digest-slash-command.md`.
5. Create `.claude/commands/digest-save.md` from `templates/digest-save-slash-command.md`.
6. Report what was created and the trigger phrases that now work.

See the project brief for the full `/digest` argument-parsing spec (`green`, `yellow`, `all`, `do ITEM`, `done ITEM URL`, `fresh`, `recommend`) and the `/digest-save` heading-parsing rules.
