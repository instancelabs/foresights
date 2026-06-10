---
name: foresights-design
description: Use this skill to generate well-branded interfaces and assets for Foresights — the Instance Labs news-dashboard plugin for Claude Cowork & Claude Code — for production or throwaway prototypes/mocks. Contains the brand colors, type, fonts, logo, components, and UI kits (dashboard, brief panel, upgrade digest).
user-invocable: true
---

Read `readme.md` first, then explore the other files.

Foresights is a **sub-brand of Instance Labs**: shared near-black neutrals, tri-family type (SF Pro Display / Instrument Serif / JetBrains Mono), and `.btn`/`.pill`/`.card` vocabulary — but its own identity: **iris `#7C6AFF` primary**, **cyan `#5EEAD4` live-signal**, and the **converging-sightline logomark** (`assets/mark.svg`, `assets/glyph.svg`).

Two surfaces, both documented:
- **Dark brand** (`:root`) for marketing/identity/chrome.
- **Light product** (`.fs-light`, and the dashboard's own `:root`) for the generated dashboard output.

Key files:
- `styles.css` → links the four `tokens/*.css` files.
- `guidelines/brand.html` → logo usage, lockups, clear-space, misuse.
- `ui_kits/dashboard/` and `ui_kits/brief-digest/` → copy/fork these for any dashboard, brief, or digest work.

If creating visual artifacts (slides, mocks, throwaway prototypes), copy assets out and produce static HTML for the user to view. For production code, copy assets and follow the rules here. If invoked with no other guidance, ask the user what they want to build, ask a few focused questions, and act as an expert Foresights designer who outputs HTML artifacts or production code as needed.

Voice: plain-spoken, "you" not "we", plain numbers over adjectives, no emoji in chrome, live is earned.
