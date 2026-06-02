# Implementation status

Version history. The current `SKILL.md` only carries the headline status; the full per-version notes live here.

## v0.9.2 — environment-aware wizard + curated-only mode

Strictly additive — no code changes, SKILL.md tightenings only. Closes the loop on the v0.9.1 dogfood report: `/foresights-doctor` correctly diagnosed Lee's work Mac as maximally sandboxed (both Node fetch and WebFetch blocked, only `an internal corporate model endpoint` on the egress allowlist), but `/create-dashboard` didn't yet *consult* the doctor. The wizard still chose RSS sources by default and shipped a dashboard guaranteed to render empty sections. v0.9.2 makes the wizard environment-aware.

- **`create-dashboard/SKILL.md` Step 0 rewrite.** Step 0 now runs three quick probes before any data fetching — GH MCP detection (existing), Node outbound fetch reachability (new, ~1 line `node -e` probe), and WebFetch reachability (new, agent uses its own tool). The four-state routing table maps probe results to one of five strategies: use GH MCP, atom-feed fallback (Node-side hydration), restricted-environment path (WebFetch + pre-populated `items`), or the new "no live data" branch.
- **Curated-only branch.** When all three probes fail, ask the user explicitly via `AskUserQuestion` to (a) build curated-only now, (b) install a GitHub MCP first (MCP traffic bypasses the sandbox egress allowlist), or (c) cancel and ask the network admin. Picking (a) sets `sources: []` in the `WizardConfig`, appends an explanatory clause to `footerNote`, and skips Step 1 entirely. The dashboard ships with synthesized spotlights / highlights / patterns / tips / resources only — no Releases, RFCs, PRs, RSS feed sections. Renderers gracefully omit empty sections; the section nav, header source links, and per-source `<section>` blocks are not emitted.
- **`foresights-doctor/SKILL.md` accuracy fix.** Added an "implementation notes → phrasing the report accurately" section clarifying the build-time vs runtime distinction. RSS items are baked at build time (v0.5.3 design); GitHub items in artifact mode are fetched at runtime via the MCP bridge (which routes through the MCP server's network, not the sandbox's egress). The doctor's recommendations should describe the fix in terms of the right network policy.

635 tests (no code changes). Plugin version 0.9.1 → 0.9.2.

## v0.9.1 — restricted-environment robustness + `/foresights-doctor`

Strictly additive. The v0.9.0 install path worked on Lee's sandboxed work Mac — but a CDK dashboard built there had every section rendering "no recent items in this feed". Diagnosis: the sandbox blocks Node's outbound `fetch` (via Cowork's allowlist), so `wizard/fetch-feeds.ts` returned empty arrays for every RSS source and silently baked them into the dashboard. The agent's `WebFetch` tool would have reached the same feeds, but the SKILL.md actively told the agent **not** to use it. v0.9.1 closes that loop on three sides — SKILL.md guidance, orchestrator-side warnings, and a new doctor skill.

- **`create-dashboard/SKILL.md` tightenings.** Step 0's no-MCP branch now documents the atom-feed fallback (`github.com/<owner>/<repo>/releases.atom` etc.) as a first-class option, not an agent improvisation. Step 1 drops the "don't `web_fetch` feed URLs" line entirely and replaces it with explicit default vs restricted-environment paths — the wizard now knows to `WebFetch`-and-prepopulate items when Node fetch is blocked. Step 1 also gains a "verify your fetches returned data" gate. Step 5's smoke-test grows teeth: read the orchestrator's `warnings` field and scan the built HTML for empty sections before shipping.
- **`wizard/fetch-feeds.ts` surfaces zero-item fetches.** `hydrateRssSources` now returns `HydrationResult = {sources, warnings}` instead of a bare source array. Each warning is a single line prefixed `zero-items:` so both humans and machines (`/foresights-doctor`, the smoke-test step) can parse them. `BuildResult.warnings` plumbs the list through to the orchestrator's stdout summary; the `--emit-flags` path also warns when the manifest came back empty despite a non-zero product count. Four new vitest cases pin the warning behaviour.
- **New `/foresights-doctor` skill** (`skills/foresights-doctor/SKILL.md`). Seven cheap checks, < 10s total: Node version, templates dir + pre-bundled wizard JS, vendored `esbuild-wasm`, a canned no-source build (proves the toolchain), Node outbound fetch reachability, `WebFetch` reachability, and GitHub MCP detection. The Node+WebFetch combination is the killer diagnostic: it routes `/create-dashboard` to the right RSS-hydration path *before* the user spends 20 minutes building a broken dashboard. Triggers fire on "empty dashboard", "is Foresights working", and direct `/foresights-doctor` invocations.

635 tests (631 → +4 for the warning behaviour). The `BuildResult` shape gains a `warnings` field; tests asserting result identity were updated. `BuildOpts` also gains a `priorWarnings` knob so `main()` can pipe `hydrateRssSources` warnings through.

## v0.9.0 — precompiled wizard

Strictly additive — build *output* is unchanged for every existing dashboard. Removes the load-bearing `npm install` step that the v0.8.4 dogfood report flagged: `/create-dashboard` now runs with **zero install** in any Node ≥20 environment, even sandboxes where the npm registry is firewalled.

- **Pre-bundled `wizard/build.js` + `wizard/refresh.js`.** `wizard/build.ts` and `wizard/refresh.ts` are bundled by a new `npm run prebuild-wizard` script (ESM, `platform=node`, `target=node20`) into single self-contained JS files (`build.js` ~36KB, `refresh.js` ~6KB). The shipped plugin contains the `.js` outputs; the `.ts` sources stay for dev. Invoke the wizard with `node wizard/build.js`, not `tsx`. Both produce byte-equivalent output.
- **esbuild via `esbuild-wasm`.** The orchestrator's dashboard-bundling step is no longer a `runStep('npx', ['esbuild', ...])` subprocess — it now lazy-imports `esbuild-wasm` and calls the JS API. esbuild-wasm is vendored at `templates/node_modules/esbuild-wasm/` (the only runtime dep, ~12MB unpacked; ships compressed in the `.plugin`). Build time at `--fast` is ~0.5s wasm vs ~0.2s native — well under the wizard's UX budget.
- **`scripts/build-plugin.sh`.** Bootstraps by running `npm install` + `npm run prebuild-wizard` in the source tree when needed, then stages the templates with `node_modules/esbuild-wasm/` vendored back in (and nothing else from `node_modules`). New completeness checks verify `wizard/build.js`, `wizard/refresh.js`, and `node_modules/esbuild-wasm/esbuild.wasm` all land in the bundle.
- **Slow path unchanged.** `--with-tests` and the non-`--fast` toolchain (`biome`, `tsc`, `vitest`) still subprocess `npx` — they're dev-only, opt-in, and require the templates' devDeps. The `--fast` happy path is what the wizard recommends.
- **`.plugin` size.** ~255KB → ~3.5MB compressed (the cost of zero install). Almost entirely esbuild-wasm. 148 files in the bundle.
- **New zero-install test** (`wizard/zero-install.test.ts`). Subprocess-runs `node wizard/build.js` against a staged templates dir whose `node_modules/` contains **only** `esbuild-wasm` — no biome, tsc, vitest, tsx, or jsdom. Proves the dogfood-feedback scenario actually works end-to-end. Now part of `npm run preflight` (which also runs `prebuild-wizard` ahead of the test suite).

## v0.8.4 — install-friction pass

Strictly additive — build *output* is unchanged for every existing dashboard. Aimed squarely at the dogfood-friction surfaced by trying the plugin on a fresh sandbox.

- **Lazy-import `jsdom`** (`wizard/fetch-feeds.ts`). The `JSDOM` import is now inside `domParser()` as a dynamic `import('jsdom')`. `hydrateRssSources` short-circuits when no `kind: 'rss'` source is present and returns the input array reference unchanged, so a build with no RSS sources never reaches the import. Result: a CDK-only build (or any RSS-less build) runs in environments that don't even have `jsdom` installed.
- **SKILL.md restructure.** SKILL.md is slimmed to the wizard happy path (~165 lines, was 552). The depth that used to live inline is now in three new references: `static-mode.md` (the full static-mode story), `build-internals.md` (sentinels, placeholders, block generators, pipeline, `WizardConfig` shape, source examples), and `implementation-status.md` (this file).
- **Terminology fix.** Replaces "Haiku batch (chunk size ≤10 to stay under the askClaude payload ceiling)" with "the wizard agent synthesizes…". `askClaude` is a *runtime* concept inside `window.cowork` only; at wizard time the agent IS Claude, so curation comes from agent synthesis, not from a separate model call.
- **`ghServer` ask.** When no `*__list_releases` tool is detected, the wizard now asks the user explicitly via `AskUserQuestion` instead of defaulting to `mcp__github` and silently producing a data-less dashboard at runtime.
- **No-MCP branch.** Step 1 of Wizard outputs now has an explicit "no GitHub MCP connected" branch with three options (install, training-knowledge synthesis with disclaimer, or cancel). Static mode is gated on having an MCP — the agent has to populate `WizardSource.baked` from the live result.

## v0.8.3 — static-mode refresh button (Phase 3d)

Strictly additive. A `static` dashboard has no Cowork runtime, so it can't re-fetch or re-curate itself — refreshing it is the `/refresh-dashboard` skill, which runs inside Claude. v0.8.3 makes that one click: an `outputMode: 'static'` dashboard renders a **Refresh button** in the hero that copies `/refresh-dashboard for <topic>` to the clipboard for the user to paste into Claude.

- **`refresh-button.ts`** — `initRefreshButton(deps, { topic })` injects the button, wires the click → clipboard copy, idempotent. Clipboard writes go through a new shared `util/clipboard.ts` (`writeToClipboard` — `navigator.clipboard` with an `execCommand` fallback, mirroring the private copy in `products/panel.ts`).
- **Emission.** `genLoadBody` emits the `initRefreshButton(deps, { topic: TOPIC })` call **only** in its `static` branch; `boot.ts` imports the module. An `'artifact'` build never references it, so esbuild tree-shakes `refresh-button.ts` (and `util/clipboard.ts`) out of the bundle entirely — an artifact dashboard's HTML stays byte-identical.

## v0.8.2 — pre-baked digest triage (static mode, Phase 3c)

Strictly additive. In `outputMode: 'static'` the wizard now also pre-bakes the upgrade-digest triage at build time, so a static dashboard's digest is fully 🟢 / 🟡 / 🔴 bucketed offline — not defaulted to yellow.

- **`BAKED_TRIAGE`** (`digest/triage.ts`). A new `productId → stableId → TriagedItem` map, emitted by `genBakedTriage` into a sentinel. `triageItems` consults it first (mirrors `fetchBrief`'s `BAKED_BRIEFS` tier) — an item with a baked verdict skips the Haiku batch; the rest triage live. `TriageOpts` gains an optional `productId` to key the lookup; the digest bar passes it. Empty `{}` in an `'artifact'` build — an inert no-op there.
- **Wizard flow.** The two-pass static flow (`build.ts --emit-flags` → generate per entry) now also triages each product's flagged items into `WizardConfig.triage` alongside `WizardConfig.briefs`. The digest panel + downloadable markdown read the baked triage transitively (triage → `renderDigestMarkdown` → panel).

## v0.8.1 — pre-baked briefs (static mode, Phase 3b)

Strictly additive. In `outputMode: 'static'` the wizard now pre-bakes every brief at build time, so a static dashboard has full briefs offline — no `window.cowork`, no model access needed.

- **Shared flag-unit enumerators** (`render/flag-units.ts`). The per-item `stableId` / `matchText` / `title` / `url` of every flaggable item is now computed by four pure enumerators (`prUnits` / `issueUnits` / `rssUnits` / `releaseUnits`); the four renderers source these fields from them instead of computing them inline. Behaviour-preserving — rendered HTML and stableIds are byte-identical to pre-3b output. Makes the wizard's flag manifest and the renderers structurally unable to disagree on a stableId.
- **`BAKED_BRIEFS`** (`products/brief.ts`). A new `productId → stableId → Brief` map, emitted by `genBakedBriefs` into a sentinel. `fetchBrief` consults it as tier 1, above the localStorage cache → `askClaude` → the regex-reason floor. Empty `{}` in an `'artifact'` build — an inert no-op there.
- **Two-pass wizard flow.** `build.ts --emit-flags` writes a deterministic flag manifest (`{productId, stableId, kind, text, title, url}` per flagged unit); the wizard generates a `Brief` per entry and folds them into `WizardConfig.briefs` for the real build.

## v0.8.0 — static / offline output mode (Phases 1-2)

Strictly additive. A new optional `WizardConfig.outputMode` — `'artifact'` (the default; omit it) or `'static'`. A `'static'` dashboard runs as a standalone HTML file with no Cowork artifact runtime. `dashboard.ts`'s `buildDeps` no longer hard-throws on a missing `window.cowork` — it returns a static `Deps` with rejecting stubs. In `'static'` mode `genLoadBody` emits, per GitHub source, a **progressive** block: attempt a live `callTool`, and on any failure render the build-time baked snapshot (`WizardSource.baked`) instead. With no runtime the reject-stub makes the catch fall straight to baked; opened as an artifact, the live fetch wins. RSS is baked as before. An `'artifact'` build's `LOAD_BODY` is byte-identical to pre-v0.8.0 output. Phase 3a added the regex-reason brief floor; v0.8.1 (Phase 3b, above) completes offline briefs by pre-baking them.

## v0.7.2 — wizard build speed-ups

Strictly additive — build *output* is unchanged. Two changes to the build path:

- **RSS fetched by the orchestrator.** `wizard/build.ts`'s CLI entry hydrates every `kind: 'rss'` source before the build: `wizard/fetch-feeds.ts` fetches each feed with Node's `fetch` and parses it via the existing `util/rss-parser.ts` (jsdom-backed `DOMParser`), all feeds in parallel. The wizard agent no longer fetches feeds — the old flow burned failed `web_fetch` calls then fell back to web searches. A source that already carries `items` is left untouched, so `/refresh-dashboard` and test fixtures are unaffected. (v0.8.4 makes the `jsdom` load itself lazy.)
- **`--fast` build flag.** Skips biome + tsc, runs esbuild only (~2s vs ~3.5s). esbuild still parses every file, so malformed generated code still fails the build. The full biome + tsc + esbuild pipeline stays the default and is what dev / preflight runs.

## v0.7.1 — restored missing template modules

Packaging fix. The v0.7.0 release shipped — and the repo itself carried — an incomplete `templates/` tree: 14 source modules absent, 61 broken relative imports, so `wizard/build.ts` crashed on a missing-module import before building anything. v0.7.1 restores the 14 modules + their tests and adds an import-completeness guard to `scripts/build-plugin.sh` so an incomplete tree can never ship again. No behaviour change beyond "the build works".

## v0.7.0 — selectable spotlight cadence (Phase 10.6)

Strictly additive. `WizardConfig` gains an optional `cadence` — `'daily'` (the default), `'weekly'`, or `'on-demand'`. The spotlight carousel's auto-rotation branches on it: `daily` rotates by day-of-year (the proven behaviour), `weekly` by week-of-year, `on-demand` never auto-rotates and starts at the first spotlight. The persisted index is keyed by the cadence's rotation period, so a user's manual choice sticks until that period rolls over (`on-demand` never rolls over). `genLoadBody` emits the `cadence` option into the `initSpotlight(...)` call only for non-daily dashboards, so a daily build's `LOAD_BODY` is byte-identical to pre-cadence output.

## v0.6.0 — pluggable action types (Phase 10.5)

Strictly additive. A `WizardProduct` can declare an `actionType` — `'claude-code'` (the default), `'summary'`, or `'task'`. The brief panel and the upgrade digest produce the matching artifact: `claude-code` keeps the Plan/Implement Claude Code prompt verbatim; `summary` emits plain prose; `task` emits a tracker-ready checklist. Briefs themselves are unchanged — every action type consumes the same brief. A product with no `actionType` (every pre-Phase-10.5 dashboard) runs the existing claude-code code path unchanged. `summary` / `task` products carry no per-product builder — their action is built generically by the `ACTION_TYPES` registry in `templates/products/actions.ts`; only `claude-code` products need repo-nav extraction at wizard time. `/setup-cc` is Claude-Code-specific — suggest it only for dashboards with a `claude-code` product.

## v0.5.3 — RSS baked at build time (F5)

Dogfooding surfaced that the artifact sandbox blocks cross-origin `window.fetch`, so the v0.3 live-RSS path never actually reached a feed in a built dashboard. RSS is now **baked at build time**: each feed is fetched + parsed and its entries stored on `WizardSource.items`; `genLoadBody` emits them as a literal `renderRssItems(...)` call instead of a `fetchRss` call. (As of v0.7.2 the fetching is done by `wizard/build.ts`, not the wizard agent.) `render/rss.ts` is unchanged — it renders the baked items. `mcp/fetch-rss.ts` is retained and still tested but no longer wired into built dashboards. RSS content refreshes on a `/refresh-dashboard` rebuild rather than on every open; GitHub sources (via the MCP bridge) are unaffected.

## v0.5 — embedded config block (refresh enablement)

Strictly additive. The build now injects a `<script type="application/json" id="foresights-config">` block carrying the full `WizardConfig` (see `genForesightsConfigJson` in `wizard/build-config.ts`, placeholder `{{FORESIGHTS_CONFIG_JSON}}`). The block is inert — it doesn't execute or render — and dashboards built before this change are unaffected. It exists so the `/refresh-dashboard` skill can recover the exact build inputs (topic, sources, products, branding) losslessly instead of scraping rendered HTML. `<` characters are escaped inside the JSON so the payload can't break out of the surrounding `<script>` element.

## v0.3 — RSS source kind (Phase 10.1)

Strictly additive. Every existing GitHub-source + Claude-Code-actionType dashboard renders byte-for-byte identically. New: a fourth `kind: 'rss'` for RSS 2.0 / Atom 1.0 feeds. RSS sources fetch via `window.fetch`, parse with DOMParser, and render through a new `render/rss.ts` module that mirrors the GitHub-renderer contract. Product flagging works identically across all source kinds (regex matcher runs on `${title} ${description}`).

- **`util/rss-parser.ts`** — RSS 2.0 + Atom 1.0 parser, returns normalised `RssItem[]`. Robust against malformed XML; empty array on parse failure.
- **`mcp/fetch-rss.ts`** — native fetch + parser wrapper. Returns `[]` on network / CORS / parse failure so one bad feed doesn't break the dashboard.
- **`render/rss.ts`** — card renderer matching the GitHub-renderer shape. Strips embedded HTML in descriptions, truncates long bodies, integrates with `flagsForText` so per-product matchers fire on RSS items the same way they fire on PRs.
- **WizardSource** carries optional `url` (required for `kind: 'rss'`) alongside the existing optional `owner` / `repo` (required for GitHub kinds).
- 32 new tests across the three new modules. 442 total green under `npm run preflight`.

## v0.2 — TS architecture port (Phases 1–4)

The v0.1 → v0.2 boundary moved the dashboard source-of-truth from inline JS in `templates/dashboard.html` to a modular TypeScript codebase under `templates/*.ts`, compiled at wizard time by esbuild and injected into the HTML shell. Rationale, file tree, and full pipeline in `v0.2-architecture.md`.

- HTML markup sentinels wrapped for RESOURCES_MARKUP, TIPS_MARKUP, PATTERNS_MARKUP, HIGHLIGHTS_MARKUP, SECTION_NAV, SECTION_MARKUP:ABOVE_HIGHLIGHTS, SECTION_MARKUP:BELOW_HIGHLIGHTS.
- TS architecture: `templates/` holds 25+ modules organised under `util/`, `mcp/`, `spotlight/`, `render/`, `products/`, `digest/`, with shared `types.ts` defining `Deps`, `Source`, `Product`, `Spotlight`, `Brief`, `FlagMeta`, `Flag`, `TriagedItem`, `RssItem`. Every runtime-touching module takes `Deps` for dependency injection.
- Toolchain: biome 1.9.4 + tsc 5.6.3 (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`) + esbuild 0.24 + vitest 2.1 + jsdom 25. `npm run preflight` runs lint + type-check + tests.
- TS-side sentinels placed: SOURCES_CONST in `sources.ts`, SPOTLIGHTS_CONST in `spotlight/data.ts`, LOAD_BODY in `boot.ts`, and five `PRODUCTS_CONFIG:*` sub-sentinels.
- `config.ts` holds wizard-substituted runtime values (TOPIC, TOPIC_SLUG, GH_SERVER) so the build pipeline has a typed seam for those rather than `{{X}}` placeholders.
- Integration smoke test: `tests/integration.test.ts` compiles the bundle with esbuild and runs it inside JSDOM, asserting the IIFE bundle boots and the empty-SPOTLIGHTS case is graceful.

### v0.2.x — dashboard.html cutover (2026-05-19)

The HTML cutover landed ahead of Phase 5+. The 2300-line inline `<script>` block is gone; the wizard injects the compiled esbuild bundle at `<script>{{COMPILED_JS}}</script>`. HTML markup sentinels carry minimal placeholder content (skeleton cards) so the un-substituted shell still renders as a recognisable loading state.

- All 9 HTML-side sentinels wrapped: SECTION_NAV, SECTION_MARKUP:ABOVE_HIGHLIGHTS, SECTION_MARKUP:BELOW_HIGHLIGHTS, HIGHLIGHTS_MARKUP, PATTERNS_MARKUP, TIPS_MARKUP, RESOURCES_MARKUP, PRODUCT_CSS (in `<style>`, empty default), PRODUCT_UI_BARS (in body, empty default).
- PRODUCT_CSS lives inside `<style>` and uses CSS-comment sentinel form `/* FORESIGHTS_START:NAME */`. The wizard's matcher handles all three comment forms.
- Slim shell: 1199 lines / ~38 KB. Substitution smoke test verifies all 9 sentinels fill cleanly, all 12 `{{...}}` placeholders substitute, and the 11 spotlight DOM IDs survive end-to-end.

Phases 5–8 (renderers / products / digest / wizard) all landed inside v0.2.x — see git history or the per-phase commit messages.
