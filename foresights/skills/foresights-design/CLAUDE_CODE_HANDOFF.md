# Build with Foresights — Claude Code handoff

This folder **is** the Foresights design system. It contains everything Claude Code needs to build a full, on-brand website: design tokens (CSS variables), component styles, logo assets, brand guidelines, and faithful UI-kit references. This file tells you (and Claude Code) how to use it.

---

## ⚠️ Read this first: what these files are

- `tokens/*.css`, `styles.css`, and `assets/*.svg` are **drop-in production source** — copy them into your app and use them directly.
- The `.html` files in `guidelines/`, `ui_kits/`, and `marketing/` are **design references** — prototypes that show the intended look, spacing, and behavior. **Do not ship the HTML as-is.** Recreate those screens in your target framework (React, Vue, Svelte, Astro, plain HTML — your choice) using the tokens and the patterns shown.
- Fidelity: **high.** Colors, type, spacing, and interactions are final. Match them precisely.

If your repo has no framework yet, a good default for a marketing/site build is **Astro** or **Next.js (App Router)** with plain CSS variables (no Tailwind required — the tokens are already CSS custom properties). Pick what fits the project.

---

## Three ways to hand this to Claude Code

**1. As a Claude Code Skill (recommended — most native).**
Drop this whole folder into your repo at:
```
.claude/skills/foresights-design/
```
`SKILL.md` already has the right frontmatter, so Claude Code auto-discovers it. Then just ask: *"Build the marketing site using the foresights-design skill."* Claude Code will read `SKILL.md` → `readme.md` → the tokens and references, and stay on-brand without further prompting.

**2. As plain reference files.**
Put the folder anywhere in your repo (e.g. `design-system/`) and tell Claude Code: *"Read design-system/readme.md and design-system/CLAUDE_CODE_HANDOFF.md, then build the site to match."*

**3. Via GitHub.**
Push this folder to a repo (or a `design/` subfolder of your site repo). Point Claude Code at it. Same as #2, just version-controlled.

---

## Bootstrapping a site — recommended steps for Claude Code

1. **Wire the tokens.** Copy `tokens/` and `styles.css` into the app (e.g. `src/styles/`). Import `styles.css` once at the root. Every value below is now available as a CSS variable — never hardcode hexes.
2. **Set the surface.** The brand/marketing site is **dark-first** — apply the `:root` (dark) tokens globally. Only wrap a container in `.fs-light` if you're embedding the light "product dashboard" look.
3. **Load fonts.** `tokens/typography.css` imports Instrument Serif + JetBrains Mono from Google Fonts; SF Pro Display falls back to the system stack. Keep that, or self-host if you have licenses.
4. **Use the components.** `tokens/components.css` ships `.btn` (`.btn-primary`/`.btn-signal`/`.btn-secondary`/`.btn-ghost`), `.pill-*`, `.card`, `.input`, `.kbd`, `.live`, `.relevance`, `.triage-*`. Recreate these as framework components but keep the class contracts/visuals identical.
5. **Drop in the logo.** Use `assets/mark.svg` (full iris square) and `assets/glyph.svg` (currentColor glyph) directly. The two-letter **FS** sub-mark is for favicons/tiles where the full mark won't fit.
6. **Recreate screens from the references:**
   - `marketing/index.html` → the landing hero (dark, radar-scope illustration, how-it-works, install strip).
   - `ui_kits/dashboard/index.html` → the live product dashboard (light surface).
   - `ui_kits/brief-digest/index.html` → the triaged upgrade digest with copy-paste prompts.
   - `guidelines/brand.html` → logo lockups, clear-space, color treatments, misuse.
7. **Respect motion & a11y.** 150ms ease on hover/press, `scale(.98)` press, 2s pulse on the live dot, 7s radar sweep. All non-essential motion must collapse under `prefers-reduced-motion`. Maintain WCAG AA contrast (the light surface already darkens iris to `#6450E6` for this reason).

---

## Design tokens (authoritative quick-reference)

> Names below are the exact CSS variables in `tokens/`. Prefer reading the files; this is the at-a-glance copy.

**Neutrals (dark brand)** — `--bg #08080A` · `--bg-2 #0D0D11` · `--surface #121217` · `--surface-2 #16161C` · `--hover #1D1D25` · `--active #262630` · `--line #1C1C23` · `--line-bright #2A2A34`

**Text** — `--text #F4F4F5` · `--text-2 #A3A3AC` · `--text-3 #6E6E78` · `--text-4 #4A4A53`

**Brand · Iris (primary)** — `--iris #7C6AFF` · `--iris-2 #6450E6` (hover/AA-on-white) · `--iris-dim #4A3CB0` · `--iris-soft #A89AFF` (text on dark) · tint `rgba(124,106,255,.12)`

**Brand · Cyan (live signal)** — `--signal #5EEAD4` · `--signal-2 #2DD4BF` · `--signal-dim #1C8F80`

**Accent ramp** — `--amber #FFB547` · `--coral #FF6B8E` · `--plum #C084FC` · `--sky #60A5FA`. (`--lime #D4FF3A` / `--orange #F45A24` are **parent-endorsement only** — never a Foresights primary.)

**Semantic / triage** — success/go `#4ADE80` · warning/soon `#FBBF24` · error/hold `#FB7185` · info `#60A5FA`

**Light product surface (`.fs-light`)** — `--surface #fff` · `--surface-2 #f7f8fa` · `--surface-3 #eef0f4` · `--line #e3e6ec` · `--text #1a1f2b` · `--accent #6450E6` · `--accent-soft #efeaff` · shadow `0 4px 14px rgba(20,25,35,.05)`

**Type** — UI/display: SF Pro Display (system stack). Numerals/stats/accent headline word: **Instrument Serif** (italic for the accent word). Eyebrows/IDs/code/timestamps: **JetBrains Mono**. Eyebrow = mono 11px, `.14em`, uppercase, iris or cyan. Use `tabular-nums` on all data. Scale: 72 / 44 / 30 / 22 / 16 / 14.

**Spacing (4pt)** — 2 · 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 (`--s-0`…`--s-9`).

**Radius** — 4 chip · 6 sm · 8 input/md · 12 card · 16 panel · 999 full.

**Elevation** — `--e-1` inline · `--e-2` dropdown · `--e-3` modal · `--e-glow-iris` / `--e-glow-signal` focus auras.

---

## Voice & content rules

- Plain-spoken, officer-to-officer. Address the reader as **"you," never "we."**
- **Plain numbers over adjectives** — "drops CI typecheck ~38s → ~23s," not "blazing-fast."
- **Specific over vague** — name real sources/tools.
- **No emoji in chrome.** Triage uses coloured dots, not 🟢🟡🔴 glyphs.
- **"Live" is earned** — the cyan pulse dot only appears on actually-refreshing data.
- Title case for the wordmark/headings; mono UPPERCASE for eyebrows/labels; sentence case for body.

---

## File map

```
SKILL.md                     ← Claude Code skill entry (frontmatter + rules)
readme.md                    ← full system guide (foundations, voice, manifest)
CLAUDE_CODE_HANDOFF.md       ← this file
styles.css                   ← entry point; @imports the four token files
tokens/colors.css            ← dark brand + .fs-light product palettes
tokens/typography.css        ← font stacks, scale, eyebrow
tokens/spacing.css           ← 4pt scale, radii, elevation, widths
tokens/components.css        ← .btn .pill .card .input .kbd .live .relevance .triage
assets/mark.svg              ← logomark (iris square, white sightline)
assets/glyph.svg             ← logo glyph (currentColor)
guidelines/brand.html        ← logo lockups, clear-space, color use, misuse  [reference]
guidelines/logo-*.html       ← the logo exploration trail                    [reference]
ui_kits/dashboard/index.html ← live dashboard, light surface                 [reference]
ui_kits/brief-digest/index.html ← upgrade digest + Claude Code prompts        [reference]
marketing/index.html         ← dark landing hero                            [reference]
cards/*.html                 ← token/component specimen cards                [reference]
```

Start with `SKILL.md` and `readme.md`. Everything else is detail.
