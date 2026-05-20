# Action types — design-of-record (Phase 10.5)

> Status: **design, not yet built.** This spec is the design-of-record for
> pluggable per-product action types. Implement it as its own focused
> session — see "Effort + sequencing" at the end. Companion to
> `v0.2-architecture.md`.

## Goal

Make the per-product **action** pluggable. Today every flagged item's action
is "generate a Claude Code prompt". A product should be able to declare an
`actionType`, and the brief panel + digest then produce the matching
artifact. This is what turns Foresights from a developer tool into the
"stay current on anything" product its own positioning describes — a
marketing or research dashboard has no repo to open a PR against, but it can
still want a summary or a task.

## Hard constraint — strictly additive

Per the expansion principle: a dashboard built **without** an `actionType`
(or with `actionType: 'claude-code'`) must be **byte-for-byte identical** to
one built today. New types slot in alongside; they never alter the
claude-code path. The regression test for this is in "Verification" below
and is non-negotiable.

## Current architecture — what "the action" touches today

The Claude Code action is not a tidy seam; it is woven through the product
and digest layers:

- **`build-config.ts`** — `WizardProduct.ccPromptBody?` is the per-product CC
  prompt builder body. `genCcBuilders` emits `CC_PROMPT_BUILDERS:
  Record<productId, CcPromptBuilder>` into `products/cc-prompts.ts`.
- **`products/cc-prompts.ts`** — `CcPromptBuilder = (args: BuildCcPromptArgs)
  => string`; `BuildCcPromptArgs = { brief, meta, mode }` (`mode` is
  `'plan' | 'implement'`).
- **`products/panel.ts`** — `renderBriefHtml` emits the cc-block: a "Generate
  Claude Code prompt" button and a `.brief-cc-panel` containing a Plan /
  Plan+Implement `.cc-mode-toggle`, `Copy` + `Copy as task` buttons, and a
  `<pre>`. Click handlers `onCcBtnClick` / `onModeClick` / `onCopyClick` /
  `refreshPanelText` drive it. `appendRepoContext` / `formatRepoContext`
  splice in the per-product context-refresh block; `wrapAsTask` wraps the
  prompt as a markdown task file.
- **`digest/markdown.ts`** — `renderDigestMarkdown` embeds
  `ccBuilder({ brief, meta, mode: 'plan' })` output inside `<details>` blocks
  and frames the whole document as an "upgrade digest" destined for
  `.claude/upgrade-digests/`.
- **`boot.ts` / `genLoadBody`** — wires `initBriefPanel` and `initDigestBar`
  with `ccBuilders`.
- **`/create-dashboard` (SKILL.md)** — reads each product repo's CLAUDE.md /
  README to build the CC prompt's repo-navigation context.

Note: the **brief** itself (`brief.why` + `brief.integrations`,
Haiku-generated from the product's `systemPrompt`) is **action-agnostic** —
every action type consumes the same brief. Briefs do not change. Only the
*action built from the brief* varies.

## The abstraction

Introduce an **action type**. Each is described by an `ActionTypeSpec`:

| Field | Meaning |
|---|---|
| `id` | `'claude-code' \| 'summary' \| 'task'` (extensible) |
| `actionLabel` | brief-panel button text — e.g. "Generate Claude Code prompt", "Generate summary", "Create task" |
| `hasMode` | does it have the Plan / Plan+Implement toggle? (`claude-code` only) |
| `usesRepoContext` | does `appendRepoContext` apply? (`claude-code` only) |
| `copyFormats` | which copy buttons — `['prompt','task']` for claude-code, `['prompt']` for others |
| `build(args)` | `(BuildActionArgs) => string` — produces the artifact text |
| `digestEmbed(entry)` | how the action renders inside a digest detail block |

`BuildActionArgs = { brief, meta, mode? }` — generalises `BuildCcPromptArgs`
(`mode` becomes optional; only `claude-code` reads it).

`WizardProduct` and the runtime `Product` gain `actionType?: ActionTypeId`,
defaulted to `'claude-code'` at generation time.

### Per-product vs generic builders

- **`claude-code`** — builder is **per-product** (today's `ccPromptBody`,
  with repo-nav context). Stays exactly as-is, sourced from
  `CC_PROMPT_BUILDERS[productId]`.
- **`summary`** — builder is **generic**: format `brief.why` +
  `brief.integrations` as plain prose. No per-product code, no repo context,
  no mode.
- **`task`** — builder is **generic**: a tracker-ready item — one-line title,
  the "why", and a checklist drawn from `brief.integrations`. No per-product
  code.

So only `claude-code` needs per-product builder code. `summary` / `task` are
one shared implementation each. This keeps the wizard simpler for non-dev
products — they need a `systemPrompt` (for the brief) and matcher rules, but
no repo-nav extraction.

## Proposed file changes

1. **`types.ts`** — add `ActionTypeId`, `ActionTypeSpec`, `BuildActionArgs`;
   add `actionType: ActionTypeId` to `Product`.
2. **`products/actions.ts`** *(new)* — the `ACTION_TYPES:
   Record<ActionTypeId, ActionTypeSpec>` registry. `claude-code` delegates to
   `CC_PROMPT_BUILDERS`; `summary` and `task` carry generic builders (inline
   or in `products/builders/`).
3. **`products/panel.ts`** — `renderBriefHtml`'s action block becomes
   action-type-driven: button label from `actionLabel`, mode toggle rendered
   only if `hasMode`, copy buttons from `copyFormats`. The click handlers
   dispatch on the product's actionType — `onModeClick` is a no-op for
   non-mode types, `onCopyClick` selects the builder via the registry,
   `appendRepoContext` runs only for `usesRepoContext` types. `initBriefPanel`
   opts carry a `productId → actionType` map alongside `ccBuilders`.
4. **`digest/markdown.ts`** — `renderDetailed`'s per-item embed dispatches on
   actionType via `digestEmbed`. Keep the overall digest structure generic
   for now (see open question 1).
5. **`build-config.ts`** — `WizardProduct.actionType`; `genProductsConst`
   emits `actionType` on each `Product` (defaulting to `'claude-code'`);
   `genCcBuilders` emits per-product entries **only** for claude-code
   products. `genForesightsConfigJson` carries `actionType` for free.
6. **`skills/create-dashboard/SKILL.md`** — wizard step 4 (products) asks the
   per-product action type. For `claude-code` (default), the current flow
   (read repo CLAUDE.md / README for CC context). For `summary` / `task`,
   skip the repo-nav extraction. Document the field + per-type flow.
7. **Tests** — `products/actions.test.ts` *(new)*; update `panel.test.ts`,
   `digest/markdown.test.ts`, `build-config.test.ts`.

`genLoadBody` and the brief-fetch path need no change — briefs are
action-agnostic.

## How the additive guarantee is preserved

- A `WizardProduct` with no `actionType` → `genProductsConst` writes
  `actionType: 'claude-code'`.
- The panel and digest dispatch as `if (actionType === 'claude-code')` → the
  **existing code path, verbatim** → `else` → the new registry path. An
  all-claude-code dashboard therefore executes only today's code and emits
  identical output.
- `products/actions.ts` and the dispatch branches are new code that is inert
  for claude-code products.

## Verification

- `npm run preflight` green.
- Build a dashboard whose product uses `actionType: 'summary'`; confirm the
  brief panel shows "Generate summary" with no mode toggle, and the digest
  embeds prose.
- **Regression (the additive guarantee):** build a claude-code dashboard from
  a fixed `WizardConfig` *before* and *after* the change and `diff` the two
  output HTML files — they must be identical. Wire this as a test fixture so
  it can't silently regress.

## Open design questions for the implementer

1. **Digest framing.** The digest is CC-flavoured end to end — "upgrade
   digest", `.claude/upgrade-digests/<date>-<slug>-upgrade-digest.md`. For a
   `summary` product that framing is wrong. Recommendation for the first cut:
   keep the digest structure generic and vary only the per-item embed; defer
   per-actionType digest framing (heading, filename, intro) to a follow-up.
2. **Per-product config for non-CC types.** Recommendation: `summary` / `task`
   are fully generic — no per-product builder. The product still carries a
   `systemPrompt` (brief) and matcher rules. Confirm during implementation
   that nothing else assumed a CC builder always exists.
3. **A `prompt` type** — a generic, non-Claude-Code AI prompt — is a natural
   later addition; `summary` + `task` cover the main non-developer cases, so
   it is out of scope for the first cut.
4. **`/setup-cc`.** The `/digest` slash-command workflow is Claude-Code
   specific. Non-CC dashboards should simply not advertise `/setup-cc`. No
   code change — just don't suggest it for non-claude-code products.

## Effort + sequencing

Comparable to F5 and F8 **combined** — the intricate parts are `panel.ts`'s
brief block and click handlers, and the digest. The test surface is large
(`panel.test.ts` ~20 tests, the `digest/*` suites ~75). Implement as one
focused session: types + registry first, then panel, then digest, then the
wizard/SKILL.md, then tests and the regression diff. Land it strictly
additively and behind the `actionType === 'claude-code'` default.
