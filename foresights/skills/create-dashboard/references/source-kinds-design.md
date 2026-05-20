# Rich source kinds — design-of-record (Phase 10.2–10.4)

> Status: **design, not yet built.** This spec is the design-of-record for
> dedicated rich source kinds — `reddit`, `hackernews`, `youtube`. Implement
> it as its own focused session(s) — see "Effort + sequencing" at the end.
> Companion to `v0.2-architecture.md` and `action-types-design.md`.

## Goal

Add three first-class source kinds beyond `releases | issues | pull_requests
| rss`, each with a **rich card** tailored to its platform:

- **`hackernews`** — story cards showing points + comment count.
- **`reddit`** — post cards showing score + subreddit + comment count.
- **`youtube`** — video cards showing a thumbnail + channel.

Reddit, HN, and YouTube all also publish RSS/Atom feeds, so a topic *could*
already track them as plain `rss` sources today. A dedicated kind buys only
one thing: the rich card. That is the whole point of this phase — if a
generic RSS card were enough, this work would not exist.

## Governing constraint — everything bakes at build time

The F5 lesson is the governing constraint: the Cowork artifact sandbox blocks
all cross-origin `window.fetch` except a fixed CDN allowlist. RSS solved this
by **baking** — the wizard fetches + parses each feed at build time and
stores entries on `WizardSource.items`; `genLoadBody` emits them as a literal
`renderRssItems(...)` call. Every new kind here hits the same wall and takes
the same path: **the wizard fetches + parses at build time; the runtime only
renders baked data.** None of these kinds fetch at runtime. (GitHub kinds
remain the sole live-fetch path — they go through the MCP bridge, not
`window.fetch`.)

A consequence: a kind's content is as fresh as the last build, exactly like
RSS. `/refresh-dashboard` (full rebuild) re-bakes it.

## Hard constraint — strictly additive

Per the expansion principle, a dashboard configured only with the existing
kinds (`releases | issues | pull_requests | rss`) must be unaffected:

- `genLoadBody` gains `else if` branches per new kind. An existing config
  never enters them, so `genLoadBody`'s output is byte-identical.
- `genSourcesConst` dispatches on `kind`; existing kinds' output is unchanged.
- New `render/<kind>.ts` modules + `util/<kind>-parser.ts` are new files;
  `boot.ts` imports the new renderers into `_LOAD_BODY_IMPORTS_HOLD`, and
  esbuild tree-shakes any renderer a given dashboard doesn't use — so a
  GitHub-only dashboard's bundle does not grow.

This mirrors how `rss` landed in v0.3: new modules, new union members, zero
change to existing-kind behaviour. The regression test is the same shape —
see "Verification".

## Per-kind data sources (all keyless, all build-time)

| Kind | Build-time fetch | Rich fields gained |
|---|---|---|
| `hackernews` | Algolia HN API — `https://hn.algolia.com/api/v1/search?tags=story&query=<q>&hitsPerPage=10` (or `tags=front_page`) | `points`, `commentCount`, `author` |
| `reddit` | `https://www.reddit.com/r/<sub>/top.json?t=week&limit=10` (needs a descriptive `User-Agent`) | `score`, `commentCount`, `subreddit`, `author`, `thumbnail?` |
| `youtube` | Channel Atom feed — `https://www.youtube.com/feeds/videos.xml?channel_id=<id>` | `channel`, `thumbnail` (from `media:thumbnail`), `publishedAt` |

All three are keyless: HN's Algolia API and Reddit's `.json` endpoints are
public reads, and YouTube's channel feed is public XML. View counts / richer
YouTube stats would need the YouTube Data API (an API key) — **out of scope
for v1**; the channel feed's thumbnail is the main visual win and needs no
key.

## The abstraction

Each new kind is described by the same seven pieces `rss` already has:

1. **`SourceKind`** — add `'reddit' | 'hackernews' | 'youtube'` to the union
   in `types.ts`.
2. **`Source` variant** — a discriminated member per kind:
   `HnSource { kind:'hackernews'; query?: string }`,
   `RedditSource { kind:'reddit'; subreddit: string }`,
   `YouTubeSource { kind:'youtube'; channelId: string }`.
3. **Normalised item type** — `HnItem`, `RedditItem`, `YouTubeItem` in
   `types.ts`, alongside `Release` / `Issue` / `PullRequest` / `RssItem`.
4. **`WizardSource` baked-items field** — per-kind optional arrays
   (`hnItems?`, `redditItems?`, `youtubeItems?`), mirroring `items?` for rss.
   Kept as flat optional fields, not a discriminated union — the same choice
   `WizardSource` already documents for `owner`/`repo`/`url`/`items`.
5. **`render/<kind>.ts`** — `render<Kind>Items(deps, items, section, products)`,
   mirroring `render/rss.ts`: build cards, run `flagsForText` on the item
   text so per-product matchers fire, append via `render/section.ts`'s
   `appendToSection` (the F8 helper). The rich bits are kind-specific markup
   (HN points/comments line, Reddit score/subreddit line, YouTube thumbnail).
6. **`util/<kind>-parser.ts`** — a pure normaliser, tested. HN + Reddit are
   JSON (`parseHnJson` / `parseRedditJson`); YouTube is Atom — either a thin
   `parseYouTubeFeed` that also surfaces `media:thumbnail`, or a
   `mediaThumbnail` option added to the existing `util/rss-parser.ts`.
7. **`genLoadBody` dispatch + the wizard** — `genLoadBody` emits a baked
   `render<Kind>Items(deps, [...], section, productsArr)` call; SKILL.md
   step 3 tells the wizard to fetch + parse + bake each kind.

Product flagging needs **no** new work — `flagsForText` runs over the item's
text regardless of kind, exactly as it already does for RSS and PRs.

## Proposed file changes

1. **`types.ts`** — `SourceKind` += 3 members; `Source` union += 3 variants;
   `HnItem` / `RedditItem` / `YouTubeItem` interfaces.
2. **`util/hn-parser.ts`**, **`util/reddit-parser.ts`**,
   **`util/youtube-parser.ts`** *(new)* — pure normalisers + `.test.ts` each.
   Robust against malformed input (empty array on failure), matching
   `rss-parser.ts`'s contract.
3. **`render/hackernews.ts`**, **`render/reddit.ts`**, **`render/youtube.ts`**
   *(new)* — card renderers + `.test.ts` each, modelled on `render/rss.ts`.
4. **`boot.ts`** — import the three new renderers; add them to
   `_LOAD_BODY_IMPORTS_HOLD`.
5. **`wizard/build-config.ts`** — `WizardSource` += `hnItems?` /
   `redditItems?` / `youtubeItems?` and the kind-discriminator fields
   (`subreddit`, `channelId`, `query`); `genSourcesConst` + `genLoadBody`
   dispatch the new kinds; `genLoadBody` bakes the items as literals.
6. **`skills/create-dashboard/SKILL.md`** — step 3 documents the new kinds,
   their wizard-time fetch URLs, and the per-kind parse-to-item-shape contract.
7. **`templates/dashboard.html`** — minimal card CSS for the rich bits
   (thumbnail sizing, a points/score chip). See open question 1.
8. **Tests** — the new `util/*` + `render/*` suites; extend
   `build-config.test.ts` (genLoadBody/genSourcesConst per kind + the
   additive guard).

## How the additive guarantee is preserved

- `genLoadBody`'s new branches are `else if` arms on `s.kind`; a config with
  only existing kinds never reaches them → `LOAD_BODY` byte-identical.
- `genSourcesConst` already dispatches on `kind`; existing kinds untouched.
- New `util/*` + `render/*` files are new code; `boot.ts`'s new imports
  tree-shake out of any bundle that doesn't use the kind.
- A new test asserts `deriveSentinelMap` for a `releases`-only config is
  unchanged, wired so a future regression goes red.

## Verification

- `npm run preflight` green.
- Build a dashboard with one source of each new kind; confirm the rich card
  renders (HN points, Reddit score, YouTube thumbnail) and per-product
  badges still attach.
- **Regression:** the existing `build-config.test.ts` generator snapshots for
  GitHub / RSS configs must stay green unchanged → proves existing-kind
  generation is byte-identical.
- Build failure of one source kind (e.g. a 404 channel id) bakes an empty
  array → the section shows its empty-state placeholder, exactly like a dead
  RSS feed; one bad source never breaks the dashboard.

## Open design questions for the implementer

1. **Rich-card CSS.** New kinds want a little new CSS (thumbnail box, a
   points/score chip). Two routes: (a) reuse the generic `.card` shell and
   add only a couple of utility classes to `dashboard.html`'s `<style>` —
   simplest, but it grows the shell for every build; (b) wrap the new CSS in
   a sentinel that the wizard fills only when the kind is used. Recommendation
   for the first cut: route (a), reusing `.card` as far as possible — the
   shell legitimately grows with new kinds (the bundle already does), and the
   guarantee that matters is *behaviour + generated-sentinel* identity, not a
   frozen shell.
2. **Where parsers run.** Post-F5 the wizard does the fetching+parsing at
   build time. Put the pure normalisers in `util/*` (tested) regardless of
   whether the wizard agent calls them directly or reimplements the mapping —
   the test coverage is the point.
3. **Reddit access.** Reddit increasingly rate-limits anonymous `.json`
   reads. A descriptive `User-Agent` is mandatory; if a fetch fails the kind
   bakes empty (open question 4's path). An authenticated Reddit source is a
   later addition, not v1.
4. **Build-time fetch failures.** A kind whose build-time fetch fails should
   bake `[]` and render the section's empty-state — never abort the build.
   Mirror RSS's "one bad feed doesn't break the dashboard" contract.
5. **Generic `web` / URL-watch is deferred.** "Watch a page for changes"
   needs runtime fetching or diffing, which the sandbox forbids; the most a
   built dashboard could do is show a baked snapshot, which is not "watching".
   True URL-watch wants a scheduled task (which has file-write + fetch) — its
   own project, out of scope here.

## Effort + sequencing

Each kind is roughly the size of the v0.3 `rss` landing (parser + renderer +
wizard wiring + tests), so all three together are ~3× that. They are
independent — implement and ship one kind at a time, each its own additive
commit:

1. **`hackernews` first** — the cleanest: Algolia returns well-structured
   JSON with exactly the fields the rich card needs, no auth, no XML.
2. **`reddit`** — JSON like HN, but mind the `User-Agent` + rate-limit
   caveat (open question 3).
3. **`youtube`** — Atom feed; the only XML one, and the only one needing a
   `media:thumbnail` parse path.

Land each strictly additively, behind a new `SourceKind` member, with the
existing-kind generator snapshots staying green.
