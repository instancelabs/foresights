/**
 * Build-time RSS / Atom feed fetcher.
 *
 * Runs in Node at wizard time (called from `wizard/build.ts`'s CLI entry),
 * NOT in the built artifact. The artifact sandbox blocks cross-origin fetch,
 * so RSS items are fetched + parsed here and baked into the dashboard.
 *
 * This replaces the pre-0.7.2 flow where the `/create-dashboard` wizard agent
 * fetched feeds itself. The agent's web-fetch tool only resolves URLs already
 * seen in the conversation, so every RSS build burned a handful of failed
 * web_fetch calls and then fell back to web searches — slow, and the search
 * snippets aren't feed XML. Node's global `fetch` reaches feed hosts directly;
 * `build.ts` now hydrates every rss source in parallel with zero agent
 * round-trips.
 *
 * Parsing reuses `util/rss-parser.ts` (RSS 2.0 + Atom 1.0). That parser needs
 * a `DOMParser`; Node has none, so we back one with `jsdom`. Crucially, the
 * `jsdom` import is **lazy** — see `domParser()` below. A build with no RSS
 * sources never reaches that import, so `jsdom` never loads (and never has to
 * be installed, in any environment where the toolchain is otherwise present).
 * The `hydrateRssSources` short-circuit makes the no-RSS path a single
 * `Array.some` check.
 *
 * v0.9.1: zero-item fetches now surface as `warnings` on the returned
 * `HydrationResult` rather than silently baking an empty section. That's the
 * killer diagnostic — a sandboxed Cowork environment where Node's outbound
 * fetch is blocked previously produced a dashboard with all sections empty
 * and no on-screen failure indication.
 */

import type { RssItem } from '../types';
import { parseRss } from '../util/rss-parser';
import type { WizardSource } from './build-config';
import { classifyFetchUrl } from './url-guard';

/** Most recent entries to bake per feed — matches the SKILL.md contract. */
export const MAX_ITEMS_PER_FEED = 10;

/** Per-feed network budget. A slow feed must not stall the whole build. */
const FETCH_TIMEOUT_MS = 12_000;

/**
 * The slice of `fetch` this module needs. Declaring it explicitly (rather
 * than `typeof fetch`) keeps test doubles trivial to construct — a stub only
 * has to return `{ ok, text }`.
 */
export type FetchLike = (
  url: string,
  init?: { readonly signal?: AbortSignal; readonly headers?: Record<string, string> },
) => Promise<{ readonly ok: boolean; readonly text: () => Promise<string> }>;

/**
 * Result of an RSS-hydration pass. `sources` is the (possibly mutated) source
 * array; `warnings` is a machine-readable list of build-time issues — one
 * entry per RSS source whose fetch returned zero items. Callers can surface
 * this to the user (the wizard's smoke-test step, the orchestrator's stdout
 * summary, `/foresights-doctor`).
 *
 * Each warning starts with a `zero-items:` discriminator so machine readers
 * can filter without parsing prose.
 */
export interface HydrationResult {
  readonly sources: readonly WizardSource[];
  /** Structured warning lines — see file header for the format. */
  readonly warnings: readonly string[];
}

/**
 * Lazily-created, reused jsdom-backed DOMParser.
 *
 * `jsdom` is heavy (transitive deps include tough-cookie, whatwg-url, etc.)
 * and isn't available in every sandbox where this code runs. By moving the
 * import inside this function, a build with no RSS sources never triggers
 * the import — `parseRss` is only called from `fetchFeed`, which is only
 * called from `hydrateRssSources`'s per-source loop, which is short-circuited
 * to a no-op when the config has no `kind: 'rss'` sources. So a CDK-only
 * (or any RSS-less) build can run in an environment that doesn't even have
 * `jsdom` installed.
 */
let cachedParser: DOMParser | undefined;
const domParser = async (): Promise<DOMParser> => {
  if (!cachedParser) {
    const { JSDOM } = await import('jsdom');
    cachedParser = new new JSDOM().window.DOMParser();
  }
  return cachedParser;
};

/**
 * Fetch and parse one RSS / Atom feed into normalised `RssItem`s.
 *
 * Never throws — any failure (network, non-2xx, timeout, parse error) yields
 * an empty array, so one dead feed bakes an empty section rather than
 * aborting the build. Returns at most `MAX_ITEMS_PER_FEED` entries.
 */
export const fetchFeed = async (
  url: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<readonly RssItem[]> => {
  // SSRF guard (v0.9.3 / finding M3) — reject non-http(s) schemes and
  // loopback / link-local / RFC1918 hosts BEFORE the fetch reaches Node's
  // network stack. Returns [] on rejection so hydrateRssSources surfaces
  // the failure via its existing zero-items warning path. The reason is
  // intentionally not logged from here (this module never throws and
  // never writes to stderr); the warning string in hydrateRssSources is
  // sufficient to point the user at the issue.
  if (!classifyFetchUrl(url).safe) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8',
      },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRss(xml, await domParser()).slice(0, MAX_ITEMS_PER_FEED);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Populate `items` for every `kind: 'rss'` source that doesn't already carry
 * them. All feeds are fetched in parallel. Sources that are not rss, that
 * already have items (e.g. pre-baked by a caller or a test fixture), or that
 * lack a `url` are returned untouched. Never throws.
 *
 * Short-circuits when no rss source is present — returns the input unchanged
 * with zero work and without ever reaching `fetchFeed` / `domParser` /
 * `jsdom`. Combined with the lazy `import('jsdom')` inside `domParser`, a
 * config with no `kind: 'rss'` source never imports `jsdom` at all.
 *
 * v0.9.1: returns `HydrationResult` — a `{sources, warnings}` tuple — so
 * zero-item fetches surface to callers instead of silently producing empty
 * sections. Each warning is a single line beginning with a `zero-items:`
 * discriminator.
 *
 * @returns the input sources unchanged on the short-circuit path (or when no
 *   source needed hydrating), or a new sources array when at least one was
 *   hydrated. Warnings list is empty on success.
 */
export const hydrateRssSources = async (
  sources: readonly WizardSource[],
  fetchFeedImpl: (url: string) => Promise<readonly RssItem[]> = fetchFeed,
): Promise<HydrationResult> => {
  if (!sources.some((s) => s.kind === 'rss')) return { sources, warnings: [] };
  const hydrated = await Promise.all(
    sources.map(async (s): Promise<WizardSource> => {
      if (s.kind !== 'rss') return s;
      if (s.items && s.items.length > 0) return s;
      if (!s.url) return s;
      return { ...s, items: await fetchFeedImpl(s.url) };
    }),
  );
  // Walk the hydrated result and flag any rss source whose post-hydration
  // items list is empty. Pre-populated sources (the restricted-environment
  // path) won't trigger a warning because they bypass the fetch entirely;
  // unhydrated `url`-less sources don't trigger a warning because they were
  // already broken before we got here. The warning is specifically about
  // *fetched* rss sources that came back empty.
  const warnings: string[] = [];
  for (let i = 0; i < hydrated.length; i++) {
    const s = hydrated[i];
    if (s?.kind !== 'rss') continue;
    if (!s.url) continue;
    // Pre-populated by a caller? (Then s and sources[i] are reference-equal
    // because the map fast-paths `items.length > 0`.) Skip.
    if (s === sources[i]) continue;
    if ((s.items ?? []).length === 0) {
      warnings.push(
        `zero-items: rss source "${s.id}" (${s.url}) returned 0 items — likely a blocked Node fetch, a stale URL, or a URL rejected by the build-time SSRF guard (non-http(s) scheme or loopback / link-local / RFC1918 host). Try the WebFetch fallback (see create-dashboard SKILL.md step 1) or run /foresights-doctor to confirm which fetch paths work.`,
      );
    }
  }
  return { sources: hydrated, warnings };
};
