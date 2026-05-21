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
 * a `DOMParser`; Node has none, so we back one with `jsdom` — already a
 * devDependency, and the same way the test suite drives `parseRss`.
 */

import { JSDOM } from 'jsdom';
import type { RssItem } from '../types';
import { parseRss } from '../util/rss-parser';
import type { WizardSource } from './build-config';

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

/** Lazily-created, reused jsdom-backed DOMParser (parseFromString is stateless). */
let cachedParser: DOMParser | undefined;
const domParser = (): DOMParser => {
  if (!cachedParser) {
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
    return parseRss(xml, domParser()).slice(0, MAX_ITEMS_PER_FEED);
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
 * @returns a new sources array — the input is not mutated.
 */
export const hydrateRssSources = async (
  sources: readonly WizardSource[],
  fetchFeedImpl: (url: string) => Promise<readonly RssItem[]> = fetchFeed,
): Promise<readonly WizardSource[]> =>
  Promise.all(
    sources.map(async (s): Promise<WizardSource> => {
      if (s.kind !== 'rss') return s;
      if (s.items && s.items.length > 0) return s;
      if (!s.url) return s;
      return { ...s, items: await fetchFeedImpl(s.url) };
    }),
  );
