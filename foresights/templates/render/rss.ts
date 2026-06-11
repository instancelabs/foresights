/**
 * Render RSS / Atom items as cards.
 *
 * Mirrors the shape of render/prs.ts — one card per item with title link,
 * pubDate, author, snippet — but draws from the normalised `RssItem` shape
 * the parser produces rather than a GitHub MCP response.
 *
 * Product flagging runs against `${title} ${description}` so the existing
 * regex matchers (e.g. CDK Insights' `bedrock|cdk-nag|construct.tree`) fire
 * on RSS items the same way they fire on PRs and releases. Items can carry
 * multiple product badges, identical to the GitHub renderers.
 */

import { flagBadgeHtml } from '../products/badge';
import { flagsForText } from '../products/matcher';
import type { Deps, Product, RssItem } from '../types';
import { relTime } from '../util/date';
import { escHtml, safeHref } from '../util/escape';
import { rssUnits } from './flag-units';
import { appendToSection } from './section';

/** Decode the HTML entities feeds (esp. Reddit, which double-encodes) leave behind. */
const decodeEntities = (s: string): string =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number.parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

/**
 * Trim, de-noise, and collapse a feed description into a clean card snippet.
 *
 * Order matters: strip tags → decode entities → drop zero-width chars → strip
 * boilerplate → collapse → truncate. `escHtml()` still runs at the call site, so
 * output stays XSS-safe (a decoded `'` is re-encoded to a renderable `&#39;`).
 * Exported for unit testing.
 */
export const snippet = (description: string, maxLen = 220): string => {
  // Strip embedded tags — Substack/Reddit embed full HTML in the body.
  let s = description.replace(/<[^>]+>/g, ' ');
  // Decode entities (Reddit double-encodes: &#39; &#32; &#x200B; etc.).
  s = decodeEntities(s);
  // Drop zero-width / format characters Reddit sprinkles in.
  s = s.replace(/​|‌|‍|﻿/g, '');
  // Strip Reddit boilerplate: "submitted by /u/… [link] [comments]", bare
  // tokens, and preview-image URLs that otherwise dump into the snippet.
  s = s
    .replace(/\s*submitted by\s+\/u\/\S+.*$/i, '')
    .replace(/\[link\]|\[comments\]/gi, '')
    .replace(/https?:\/\/(?:preview|i|external-preview)\.redd\.it\/\S+/gi, '');
  const stripped = s.replace(/\s+/g, ' ').trim();
  if (stripped.length <= maxLen) return stripped;
  return `${stripped.slice(0, maxLen).trimEnd()}…`;
};

/**
 * Render up to 10 RSS / Atom items into a target container.
 *
 * @param section section ID — derives the target DOM element (`${section}-body`)
 *                and serves as the FlagMeta.section value for per-item flags.
 */
export const renderRssItems = (
  deps: Deps,
  items: readonly RssItem[],
  section: string,
  products: readonly Product[],
): void => {
  const html = rssUnits(items)
    .map((u) => {
      const item = u.source;
      const flags = flagsForText(
        u.matchText,
        {
          section,
          stableId: u.stableId,
          title: u.title,
          url: u.url,
        },
        products,
      );
      const flagBadges = flags
        .map((f) => {
          const product = products.find((p) => p.id === f.productId);
          const cssMod = product?.cssMod ?? '';
          const label = product?.label ?? f.productId;
          return ` ${flagBadgeHtml(f, { kind: 'rss', text: u.matchText }, label, cssMod)}`;
        })
        .join('');
      const date = item.pubDate ? escHtml(relTime(item.pubDate, deps.now)) : '';
      const author = item.author ? ` · ${escHtml(item.author)}` : '';
      const linkHref = item.link || '#';
      const desc = snippet(item.description);
      const descHtml = desc.length > 0 ? `<div class="rss-snippet">${escHtml(desc)}</div>` : '';
      return `<div class="pr-item">
        <div class="pr-row">
          <div class="pr-title"><a href="${safeHref(linkHref)}" target="_blank" rel="noopener">${escHtml(item.title || '(untitled)')}</a>${flagBadges}</div>
          <div class="pr-meta">${date}${author}</div>
        </div>
        ${descHtml}
      </div>`;
    })
    .join('');
  appendToSection(deps, section, html, 'No recent items in this feed.');
};
