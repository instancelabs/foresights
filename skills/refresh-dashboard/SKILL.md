---
name: refresh-dashboard
description: Refreshes the curated content on an existing Foresights dashboard using the latest live data. Use when the user asks to refresh their dashboard, regenerate the spotlight, rotate the spotlight, refresh Foresights content, or re-curate a section of a dashboard built with /create-dashboard.
---

# Refresh Dashboard

> **Status:** stub. To be filled in.

This skill maintains an existing dashboard:

- Identify the target dashboard artifact (ask the user, or list them via `mcp__cowork__list_artifacts`).
- Pull the latest live data via the dashboard's configured MCP tools.
- Re-curate the configured sections (highlights, spotlight, patterns, tips) via Haiku — batched to stay under the askClaude payload ceiling (~8KB, ≤10 items per call).
- Update the artifact in place via `mcp__cowork__update_artifact`.
- Smoke-test the boot block before pushing.

See the project brief for the askClaude payload ceiling and TDZ pitfalls.
