---
name: create-dashboard
description: Wizard that builds a live news dashboard customised to the user's product. Use when the user says "create a dashboard", "spin up a dashboard for X", "I want to stay on top of X", "build me a news dashboard", "track the X ecosystem", "set up Foresights for my product", "make a live dashboard", or describes wanting filtered ecosystem news for a stack or topic. Asks 5–6 questions (topic, GitHub sources, products to flag, seed patterns, cadence) and outputs a fully-populated Cowork dashboard artifact.
---

# Create Dashboard

> **Status:** stub. To be filled in.

This skill walks the user through the dashboard creation wizard:

1. **Topic** (free text) — e.g. "Rust async ecosystem", "Kubernetes operators".
2. **Data sources** — GitHub orgs / repos to track. Optional: web search queries.
3. **Products to flag** (0–N) — for each: name, repo (so the matcher + brief context can be bootstrapped from the codebase), or skip.
4. **Curated content seeds** — 2–3 example patterns the user thinks are cool today, used to seed the spotlight; Claude proposes more from the data.
5. **Cadence preference** — daily / weekly / on-demand spotlight rotation.

Outputs:

- A fully-populated Cowork artifact (named e.g. `rust-async-news`) by populating `templates/dashboard.html` and calling `mcp__cowork__create_artifact`.
- A short "what's next" message pointing the user at `/setup-claude-code`.

See the project brief and the proven `aws-cdk-news` / `aws-serverless-news` artifacts for the reference implementation of the 5-layer pattern.
