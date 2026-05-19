/**
 * RSS / Atom feed fetcher.
 *
 * Uses native `fetch` from `deps.window` to retrieve the feed XML, then
 * delegates parsing to `util/rss-parser.ts`. Lives under `mcp/` for symmetry
 * with the other live-data fetchers even though it doesn't go through the
 * MCP bridge — the directory is "live-data dispatchers" by intent, not
 * "things that call window.cowork".
 *
 * **CORS caveat:** most modern RSS feeds (Substack, Medium, GitHub releases
 * feeds, podcast hosts) serve permissive CORS headers so direct fetch from
 * an artifact iframe works. Some legacy feeds or self-hosted WordPress sites
 * do not. When a fetch is blocked by CORS the browser surfaces a TypeError
 * — this fetcher catches it and returns an empty list rather than failing
 * the whole dashboard. The user sees an empty-state card; the rest of the
 * dashboard continues to render.
 *
 * Future enhancement: configurable fallback to an MCP-side fetch tool for
 * feeds that block cross-origin requests. Probably wired as a per-source
 * `fetchVia: 'window' | 'mcp'` discriminator on RssSource.
 */

import type { Deps, RssItem } from '../types';
import { parseRss } from '../util/rss-parser';

/**
 * Fetch and parse an RSS / Atom feed.
 *
 * @returns Items in document order. Empty array on any failure (network,
 *          CORS, parse). Never throws — failure modes degrade to "section
 *          renders the empty state".
 */
export const fetchRss = async (
  deps: Pick<Deps, 'window'>,
  url: string,
): Promise<readonly RssItem[]> => {
  let res: Response;
  try {
    res = await deps.window.fetch(url, {
      method: 'GET',
      // Hint the server we'd like XML; some servers return JSON if not asked.
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8',
      },
    });
  } catch {
    // Network / CORS / DNS failure.
    return [];
  }
  if (!res.ok) {
    return [];
  }
  let xml: string;
  try {
    xml = await res.text();
  } catch {
    return [];
  }
  // DOMParser isn't on the TS lib's Window interface (it's a global
  // constructor), but is exposed as window.DOMParser at runtime in both
  // browsers and JSDOM. Cast to read it off the injected window so tests
  // can swap implementations.
  const windowWithParser = deps.window as Window & { readonly DOMParser: typeof DOMParser };
  const parser = new windowWithParser.DOMParser();
  return parseRss(xml, parser);
};
