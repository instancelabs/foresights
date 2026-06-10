# Foresights — Design System

The brand + product design system for **Foresights**, a Claude Cowork / Claude Code plugin by **Instance Labs**.

Foresights spins up a live news dashboard customised to your stack — GitHub releases, PRs, RFCs and RSS for the orgs you care about, with per-product relevance flagging, a rotating spotlight, codebase-grounded briefs, and one-click Claude Code prompts (batched into a triaged upgrade digest).

This system gives Foresights its **own identity** while keeping it unmistakably a member of the Instance Labs family.

## Sources
- **Product repo:** `github.com/instancelabs/foresights` (README, `foresights/demo/static-aws-cdk-news.html`, dashboard template, SKILL.md set). The light product surface here mirrors that demo's token set.
- **Parent design system:** Instance Labs (`/projects/69cf7b96-bbf6-4c4c-ad71-17879dcd8c13/`) — neutral ramp, type system, and `.btn`/`.pill`/`.card` component vocabulary are inherited from it.

---

## The sub-brand decision

Instance Labs is dark-first, "lab notebook meets command line": near-black surfaces, **Signal Orange** (heritage) + **Electric Lime** (system). Each product (Last Command, Field Kit, Paper Trail…) gets a two-letter code and its own accent.

Foresights' move:
- **Iris `#7C6AFF` is promoted to primary** — it already lives in the parent's accent ramp, so Foresights reads as a sibling, not a stranger. Iris = foresight, intelligence, depth.
- **Cyan `#5EEAD4` becomes the live-signal accent** — the role lime plays for the parent (the "live"/telemetry pulse).
- Everything else (neutrals, type, spacing, shape, motion) is shared with the parent.
- **Logomark:** a converging sightline — three source nodes feed one focal node, which aims a sightline arrow forward. Sources detected (signal) + looking ahead (foresight) in one gesture. Sub-mark code: **FS**.

---

## CONTENT FUNDAMENTALS

Inherited from Instance Labs and sharpened for a dev-intelligence tool.

- **Voice:** plain-spoken, officer-to-officer. Short declarative sentences. "News that affects your stack — before it lands." Never breathless.
- **You, not we.** Copy addresses the engineer directly: "items that affect *your* stack", "grounded in *your* repo".
- **Plain numbers beat adjectives.** "drops CI typecheck ~38s → ~23s", "6 flagged · 7d window", "1,204 files indexed" — never "blazing-fast" or "powerful".
- **Specific over vague.** "nodejs/node · microsoft/TypeScript", not "your favourite sources".
- **Casing:** Title case for the wordmark and headings; mono UPPERCASE for eyebrows/labels (`// HOW IT WORKS`, `READY-TO-PASTE CLAUDE CODE PROMPT`); sentence case for body.
- **No emoji in chrome.** The only "emoji-adjacent" marks are the triage dots (🟢/🟡/🔴 rendered as coloured dots, never the glyphs) and the live pulse — and live is *earned*: the cyan dot only appears on actually-refreshing data.
- **Honest about boundaries:** "Foresights never writes to your code." Prompts are "ready-to-paste", explicitly editable.

---

## VISUAL FOUNDATIONS

**Two surfaces, documented together.**
- **Dark brand** (`:root`) — marketing, identity, brand chrome. Near-black `--bg #08080A` up through `--surface`/`--surface-2`, hairline borders, iris glows.
- **Light product** (`.fs-light` / the dashboard's own `:root`) — the generated dashboard. White/`#f7f8fa` surfaces, soft shadow `0 4px 14px rgba(20,25,35,.05)`, iris darkened to `#6450E6` for AA on white, soft tints (`--accent-soft #efeaff`).

**Color.** Iris primary, cyan live-signal, plus the accent ramp (amber/coral/plum/sky) for relevance badges and the semantic green/amber/red that doubles as the digest triage scale. Orange/lime appear *only* as parent endorsement.

**Type.** Tri-family, shared with parent: **SF Pro Display** (UI/display), **Instrument Serif** (KPI numerals, hero stats, the italic accent word in headlines, the triage counts — lab-notebook gravitas), **JetBrains Mono** (eyebrows, IDs, timestamps, code, log streams). `tabular-nums` on all data. Eyebrows: mono 11px, `.14em`, uppercase, iris or cyan.

**Shape & depth.** Radii 4/6/8/12/16/full. Cards = surface fill + 1px hairline, no rest shadow on dark; soft drop shadow on the light product. 4-level elevation + iris/cyan focus glows. Hit targets 28/36/44px.

**Backgrounds.** Dark surfaces carry a faint SVG grain (`mix-blend overlay`, ~4% opacity), an abstract 54px grid masked to a radial vignette, and iris/cyan radial glows. No photography, no stocky gradients-over-everything — the only gradient is the subtle iris logomark fill and brand-glow auras. The signature illustration is the **radar scope**: concentric rings, a rotating cyan sweep, labelled source nodes converging on a focal "your stack" node.

**Motion.** Subtle: 150ms ease hover/press, `scale(.98)` press, 200ms toggles. The live dot pulses (2s). The radar sweep rotates (7s linear). Everything non-essential collapses under `prefers-reduced-motion`.

**Hover/press.** Buttons: primary darkens iris + gains an iris glow; secondary fills `--hover`. Cards in feature grids lift `translateY(-2px)` + brighten border to `--iris-dim`.

---

## ICONOGRAPHY

- **Heroicons outline**, 1.5–1.8 stroke, monochromatic — coloured only where status demands (live dot, triage, destructive). Pull from CDN or hand-roll simple outline glyphs matching that weight.
- The **logo glyph** (converging sightline) is the one bespoke mark — provided as `assets/glyph.svg` (currentColor) and `assets/mark.svg` (full iris square). Reuse it; don't redraw it.
- **No emoji in UI chrome.** Triage uses coloured dots, not 🟢🟡🔴 glyphs. Arrows (→ ↻ ←) are used as functional affordances.
- Serif glyphs (◆ ↻ →) appear at large size in feature cards as decorative numerals/marks — sparingly.

---

## Index / manifest

**Foundations**
- `styles.css` — entry point (imports only)
- `tokens/colors.css` · `typography.css` · `spacing.css` · `components.css`
- `assets/mark.svg` (logomark) · `assets/glyph.svg` (currentColor glyph)

**Guidelines**
- `guidelines/logo-exploration.html` — the 6 logo directions + the chosen primary
- `guidelines/brand.html` — definitive marks, lockups, clear-space, sub-mark, color treatments, misuse

**Specimen cards** (`cards/`) — Colors (7), Type (3), Spacing (3), Components (4). Rendered in the Design System tab.

**UI kits**
- `ui_kits/dashboard/index.html` — the live dashboard (light product): hero, section nav, brief/digest bars, rotating spotlight, release cards with relevance flags, **click a flag → codebase-grounded brief panel**.
- `ui_kits/brief-digest/index.html` — the upgrade digest: serif triage counts, Go/Soon/Hold buckets, **expandable ready-to-paste Claude Code prompts** with copy buttons.

**Marketing**
- `marketing/index.html` — dark brand landing hero with the animated radar visual + how-it-works + install strip.

**Skill**
- `SKILL.md` — Agent-Skills-compatible entry point.

---

> **Sharing:** set the file type to **Design System** in the Share menu so others in your org can view and consume this system.
