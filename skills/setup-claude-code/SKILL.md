---
name: setup-claude-code
description: Sets up Claude Code integration in a target repo so upgrade digests from a Foresights dashboard drop in cleanly. Use when the user says "set up Claude Code for my repo", "set up upgrade digests", "install the digest slash command", "wire up Foresights to my repo", "add the upgrade workflow to my codebase", or after running /create-dashboard and they want to complete the closed loop. Generates CLAUDE.md additions, the .claude/upgrade-digests/ scaffold, and the /digest and /digest-save slash commands.
---

# Setup Claude Code

> **Status:** stub. To be filled in.

This skill scaffolds Claude Code integration in a target repo so Foresights upgrade digests close the loop:

1. Ask for the target repo path (or auto-detect from the current Cowork-mounted folder).
2. Append the "Upgrade digests" section to `.claude/CLAUDE.md` (or create it). Source: `templates/claude-md-snippet.md`.
3. Create `.claude/upgrade-digests/` with a `README.md` explaining the bucketing convention (🟢/🟡/🔴), the `<details>`-wrapped prompts, and the `done.json` append-only log.
4. Create `.claude/commands/digest.md` from `templates/digest-slash-command.md`.
5. Create `.claude/commands/digest-save.md` from `templates/digest-save-slash-command.md`.
6. Report what was created and the trigger phrases that now work in Claude Code.

See the project brief for the full `/digest` argument-parsing spec (`green`, `yellow`, `all`, `do <id>`, `done <id> [PR-URL]`, `fresh`, `recommend`) and the `/digest-save` heading-parsing rules.
