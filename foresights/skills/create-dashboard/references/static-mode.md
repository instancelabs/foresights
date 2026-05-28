# Static-mode dashboards — end-to-end

A `static`-mode dashboard runs as a **standalone HTML file** with no Cowork artifact runtime — no `window.cowork`, no live `callTool` / `askClaude`. It bakes everything (GitHub data, RSS items, briefs, digest triage) into the HTML at build time and renders entirely from those baked literals. If a Cowork runtime *is* present (the file opened as an artifact), the GitHub sources also refresh live on open — progressive enhancement.

Use static mode when:

- The user's org / environment has Cowork live artifacts disabled (Lee's work org is the canonical case).
- The user wants a portable / downloadable / shareable dashboard.
- The user wants to demo Foresights somewhere without installing the plugin.

The default — and what to ship when the user doesn't say otherwise — is `outputMode: 'artifact'`. Static mode is opt-in.

## When the wizard runs in static mode

Wizard step **7** (Output mode) is where the user picks `'static'`. From there, the static path diverges from the artifact path in three places: data sampling, brief / triage pre-baking, and shipping.

### Step 1 augmentation — fetch full per-source GitHub data into `baked`

The artifact path samples a few items from each GitHub source to seed the curation pass. Static mode needs the **full** `list_<kind>` result per source so the dashboard can render those items offline — there's no `callTool` at runtime to fetch them.

For every GitHub source in the config:

```
const baked = await callTool(`${ghServer}__list_<kind>`, { owner, repo, ...source.args });
source.baked = baked;  // normalised array — Release[] / Issue[] / PullRequest[]
```

`build.ts` bakes whatever `source.baked` carries. RSS items stay handled by `wizard/fetch-feeds.ts` (Node-side parallel fetch); you don't pre-fetch RSS even in static mode.

**No GitHub MCP available?** Static mode needs it. If the user can't or won't install a GitHub MCP, fall back to `'artifact'` mode (with the no-MCP synthesis disclaimer in the footer) or cancel — see SKILL.md → step 0.

### Step 3 — two-pass brief + triage flow

Static dashboards can't generate briefs at runtime (no `window.cowork`), so the wizard pre-bakes one `Brief` per (product × flagged-item) pair plus one digest verdict per item. This is a two-pass build:

#### Pass 1 — emit the flag manifest

```bash
cd "$FORESIGHTS_TPL" && npx tsx wizard/build.ts \
  --config /tmp/foresights-config.json \
  --out    /tmp/foresights-flags.json \
  --emit-flags
```

This runs the shared flag-unit enumerators (`render/flag-units.ts`) + the product matcher over the baked GitHub data and RSS items, and writes a deterministic JSON array of `{productId, stableId, kind, text, title, url}` — one entry per flagged (product × item) pair. No dashboard is built on this pass.

#### Generate one brief per entry

You (the wizard agent) generate a `Brief` (`{why, integrations}`) for each manifest entry, drawing on:

- the product's `systemPrompt` as your domain context
- the entry's `text` / `kind` / `url` as the ITEM

Collect into `WizardConfig.briefs`, keyed `productId → stableId → Brief`. Keep individual briefs short (1–3 sentences `why`, 1–3 `integrations`) — they're baked into the HTML literal and shipped to every viewer.

#### Triage each product's flagged items

For each product, bucket every flagged item into 🟢 `green` / 🟡 `yellow` / 🔴 `red`. Be ruthless — the criteria in `templates/digest/triage.ts` `buildTriagePrompt` apply (most items are red). Use the entry's `text` plus the brief's `why` as context. Collect into `WizardConfig.triage`, keyed `productId → stableId → {stableId, bucket, reasoning}`.

#### Pass 2 — the real build

```bash
cd "$FORESIGHTS_TPL" && npx tsx wizard/build.ts \
  --config /tmp/foresights-config-with-briefs-and-triage.json \
  --out    /tmp/foresights-dashboard.html \
  --fast
```

`build.ts` embeds `WizardConfig.briefs` as the dashboard's `BAKED_BRIEFS` map (consumed by `fetchBrief`) and `WizardConfig.triage` as `BAKED_TRIAGE` (consumed by `triageItems`). Every flagged item now has a full brief offline, and the upgrade digest is fully 🟢 / 🟡 / 🔴 bucketed.

### Step 6 — write a file, not an artifact

Do **not** call `mcp__cowork__create_artifact` for static-mode output. Instead, write the built HTML into the user's working folder as a normal file and present it. It opens in any browser; `/refresh-dashboard` rebuilds it.

## The Refresh button (v0.8.3)

A static dashboard renders a **Refresh button** in its hero that copies `/refresh-dashboard for <topic>` to the clipboard. The user pastes it into Claude — `/refresh-dashboard` runs there and re-bakes the file. The button is fully build-time machinery (`templates/refresh-button.ts`); no skill-side wiring is needed. esbuild tree-shakes the module out of artifact builds, so artifact-mode HTML stays byte-identical.

## Architecture summary (Phase 1–3 design)

The static-mode story landed across four versions:

- **v0.8.0** (Phases 1–2 + 3a) — the static floor. `WizardConfig.outputMode`, `WizardSource.baked` for GitHub data, `dashboard.ts`'s `buildDeps` softened to return a static `Deps` with rejecting `callTool` / `askClaude` stubs, `genLoadBody` static branch emits a progressive `try-live-then-baked` block per source, and Phase 3a added the regex-reason brief floor so the brief panel degrades gracefully without `askClaude`.
- **v0.8.1** (Phase 3b) — pre-baked briefs. `BAKED_BRIEFS` in `products/brief.ts`, shared `render/flag-units.ts` enumerators, the `build.ts --emit-flags` two-pass flow.
- **v0.8.2** (Phase 3c) — pre-baked digest triage. `BAKED_TRIAGE` in `digest/triage.ts`; `triageItems` consults it before any Haiku call.
- **v0.8.3** (Phase 3d) — the refresh-handoff button. New `templates/refresh-button.ts` + shared `templates/util/clipboard.ts`.

Strictly additive throughout — every artifact-mode dashboard keeps building byte-for-byte identically.

## Embedded config block (refresh enablement, v0.5)

Every built dashboard (static or artifact) carries a `<script type="application/json" id="foresights-config">` block with the full `WizardConfig` it was built from. `/refresh-dashboard` reads this block to recover topic + sources + products + briefs + triage losslessly. For a static dashboard refresh, the recovered config is the input to the next two-pass rebuild.
