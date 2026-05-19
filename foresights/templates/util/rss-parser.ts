/**
 * RSS / Atom feed parser.
 *
 * Uses DOMParser (native in browsers, available via jsdom in tests) to walk
 * the XML tree without pulling in a heavyweight dependency. Handles both
 * common feed shapes:
 *
 *   RSS 2.0:  <rss><channel><item>...</item></channel></rss>
 *   Atom:     <feed><entry>...</entry></feed>
 *
 * Per-item fields are normalised into the shared `RssItem` shape (see
 * types.ts). Missing fields default to empty strings — the renderer is
 * expected to handle empties gracefully rather than the parser fabricating
 * data.
 *
 * Phase 10.1: this is the minimum-viable parser. It does NOT handle:
 *   - RDF Site Summary (RSS 1.0)
 *   - JSON Feed
 *   - <media:*> / <itunes:*> / other namespaced extensions
 *   - HTML inside <description> beyond what DOMParser already does
 * Future enhancement: namespace-aware extraction for podcast feeds, etc.
 */

import type { RssItem } from '../types';

/** Read the first child element matching `tagName` (case-insensitive). */
const firstChildByTag = (parent: Element, tagName: string): Element | null => {
  const target = tagName.toLowerCase();
  for (const child of Array.from(parent.children)) {
    if (child.tagName.toLowerCase() === target) return child;
  }
  return null;
};

/** Text content of the first child by tag, trimmed. Empty string if absent. */
const childText = (parent: Element, tagName: string): string => {
  const el = firstChildByTag(parent, tagName);
  return el?.textContent?.trim() ?? '';
};

/**
 * Extract a usable link from an Atom `<entry>`. Atom links live in
 * `<link href="..." rel="alternate" />` attributes (potentially multiple
 * links per entry with different `rel` values). Prefer rel="alternate", fall
 * back to the first link with no rel attribute, fall back to the first link
 * present.
 */
const atomLinkHref = (entry: Element): string => {
  const links = Array.from(entry.children).filter((c) => c.tagName.toLowerCase() === 'link');
  if (links.length === 0) return '';
  const alternate = links.find((l) => l.getAttribute('rel') === 'alternate');
  if (alternate?.getAttribute('href')) return alternate.getAttribute('href') ?? '';
  const noRel = links.find((l) => !l.hasAttribute('rel'));
  if (noRel?.getAttribute('href')) return noRel.getAttribute('href') ?? '';
  return links[0]?.getAttribute('href') ?? '';
};

/** Best-effort author extraction for Atom `<author><name>...</name></author>`. */
const atomAuthor = (entry: Element): string => {
  const author = firstChildByTag(entry, 'author');
  if (!author) return '';
  const name = firstChildByTag(author, 'name');
  return name?.textContent?.trim() ?? author.textContent?.trim() ?? '';
};

/** Try to parse a date string to ISO; return the original if parse fails. */
const normaliseDate = (s: string): string => {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString();
};

const parseRssItem = (item: Element): RssItem => {
  const title = childText(item, 'title');
  const link = childText(item, 'link');
  const description = childText(item, 'description');
  const pubDate = normaliseDate(childText(item, 'pubDate'));
  const author = childText(item, 'author') || childText(item, 'dc:creator');
  const guid = childText(item, 'guid') || link;
  return { title, link, description, pubDate, author, guid };
};

const parseAtomEntry = (entry: Element): RssItem => {
  const title = childText(entry, 'title');
  const link = atomLinkHref(entry);
  // Atom prefers <summary>, falls back to <content>.
  const description = childText(entry, 'summary') || childText(entry, 'content');
  const pubDate = normaliseDate(childText(entry, 'published') || childText(entry, 'updated'));
  const author = atomAuthor(entry);
  const guid = childText(entry, 'id') || link;
  return { title, link, description, pubDate, author, guid };
};

/**
 * Parse an RSS 2.0 or Atom XML string into a normalised RssItem[].
 *
 * @param xml  Raw feed XML.
 * @param parser DOMParser instance (real in prod, jsdom-backed in tests).
 * @returns Items in document order. Empty array on parse failure.
 */
export const parseRss = (xml: string, parser: DOMParser): readonly RssItem[] => {
  let doc: Document;
  try {
    doc = parser.parseFromString(xml, 'application/xml');
  } catch {
    return [];
  }
  // DOMParser surfaces XML errors as a <parsererror> root. Don't try to
  // recover — return an empty list and let the caller render an empty state.
  if (doc.getElementsByTagName('parsererror').length > 0) {
    return [];
  }
  const root = doc.documentElement;
  if (!root) return [];
  const rootName = root.tagName.toLowerCase();
  if (rootName === 'rss' || rootName === 'rdf:rdf') {
    const channel = firstChildByTag(root, 'channel');
    if (!channel) return [];
    return Array.from(channel.children)
      .filter((c) => c.tagName.toLowerCase() === 'item')
      .map(parseRssItem);
  }
  if (rootName === 'feed') {
    return Array.from(root.children)
      .filter((c) => c.tagName.toLowerCase() === 'entry')
      .map(parseAtomEntry);
  }
  return [];
};
