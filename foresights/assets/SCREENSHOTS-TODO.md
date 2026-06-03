# Screenshots — capture checklist

The Cowork marketplace card and the repo READMEs need three (optionally four) screenshots before submission. Capture them in a **live Cowork session on your Mac** — the raw HTML files won't render the live data, brief panel, or digest panel (they need `window.cowork`).

Drop the final PNGs into `foresights/assets/`. Filenames are fixed — the READMEs reference them by name.

## Window dimensions

Resize the Cowork sidebar to give the artifact ~1600×900 pixels of canvas. macOS' built-in `Cmd + Shift + 4 → Space → click window` shortcut captures the artifact's exact bounds at retina density. The README scales images down with `width="32%"`, so retina-density source PNGs render crisply at any zoom.

## Source dashboard

The CDK Insights / Last Command flagging is the most visually compelling dashboard you have — it shows the product badges, brief panel, and digest bar populated with real data. Open whichever Cowork project hosts your current `aws-cdk-news` artifact and confirm:

- Live data has loaded (no skeleton placeholders visible).
- At least one item in the Releases or PRs section carries a CDK Insights or Last Command badge.
- The spotlight card has rotated to a card with a substantial code block (the `<pre class="sl-code">` highlights are what makes it pop).

If the cache is cold, hit the `↻ Refresh content` button on the spotlight first so the card fully renders before capture.

## What to capture

### 1. `screenshot-dashboard.png` — the hero

The full dashboard, scrolled to the top so the hero header is in frame.

- **Visible:** hero header with the topic line, the live Releases section with at least one product badge visible, and the rotating Spotlight card.
- **Not visible:** DevTools, browser chrome, sidebar drag handles. Use the artifact's full-screen view if necessary.
- **Tip:** make sure the badges are styled — if the CSS is still loading, the badges render as bare `<span>` text. Reload once and wait two seconds before capturing.

### 2. `screenshot-brief.png` — a brief panel open

A flagged item with its brief panel expanded directly underneath.

- **Visible:** an item card (a PR title, a release bullet, or an RSS row) with one product badge clicked; the brief panel below shows the "Why relevant to <product>" header, a 1–2-sentence body, an "How it could integrate" list of 2–3 bullets referencing specific src paths, and the footer with "Generate Claude Code prompt" + "Open source ↗".
- **Pre-warm:** click the badge once, wait for the brief to generate (Haiku takes ~2s), then take the screenshot. A "Generating brief…" placeholder isn't usable.
- **Tip:** if the brief is too long for the visible area, scroll the dashboard so the brief is fully in frame; the item card above can be partially cropped.

### 3. `screenshot-digest.png` — the upgrade digest

The digest panel open with bucketed items visible.

- **Visible:** the upgrade-digest panel with 🟢 / 🟡 / 🔴 sections, each carrying at least one item. At least one item should have its `<details>` "Embedded Claude Code prompt" block expanded so the structure is obvious.
- **Pre-warm:** click the per-product "<Product> digest" button in the digest bar, wait for triage to complete (~5s for ~10 items), expand one prompt before capture.
- **Tip:** if the digest is empty (no flagged items today), bait one by adding a temporary high-signal regex to the product's matcher in the wizard config, rebuild, and refresh. Don't ship the temp rule.

### 4. *(Optional)* `screenshot-3d-printing.png` — proof Foresights isn't just for devs

The `3d-printing-news` dashboard (the one in this repo's project history) is the cleanest demonstration that the wizard handles non-developer topics.

- **Visible:** the hero header with the "3D printing" topic, plus the curated highlights / spotlight section so a visitor immediately sees the same shape applied to a totally different domain.
- **No products needed** — the value here is the structural recognition.

## After capture

1. Drop the PNGs into `foresights/assets/`.
2. Uncomment the `<p align="center"><img src=…></p>` block at the top of both `README.md` and `foresights/README.md` (search for "screenshot capture checklist" comment markers).
3. Verify the images render in the GitHub repo preview before opening the marketplace submission PR.
