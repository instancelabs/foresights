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
import { escHtml } from '../util/escape';

/** Trim and collapse whitespace in a description for the card snippet. */
const snippet = (description: string, maxLen = 220): string => {
  // Strip embedded tags — Substack and similar embed full HTML in description.
  const stripped = description
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length <= maxLen) return stripped;
  return `${stripped.slice(0, maxLen).trimEnd()}…`;
};

/** Sanitise a string for use as a stableId fragment. */
const slugForId = (s: string): string =>
  s
    .replace(/[^\w]+/g, '-')
    .toLowerCase()
    .slice(0, 80);

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
  const targetId = `${section}-body`;
  const root = deps.document.getElementById(targetId);
  if (!root) return;
  if (items.length === 0) {
    root.innerHTML =
      '<div class="err">Feed unreachable or empty. The feed host may not allow cross-origin requests from this dashboard.</div>';
    return;
  }
  const trimmed = items.slice(0, 10);
  root.innerHTML = trimmed
    .map((item) => {
      const matchText = `${item.title} ${item.description}`;
      const flags = flagsForText(
        matchText,
        {
          section,
          stableId: `rss:${slugForId(item.guid || item.link)}`,
          title: item.title,
          url: item.link,
        },
        products,
      );
      const flagBadges = flags
        .map((f) => {
          const product = products.find((p) => p.id === f.productId);
          const cssMod = product?.cssMod ?? '';
          const label = product?.label ?? f.productId;
          return ` ${flagBadgeHtml(f, { kind: 'rss', text: matchText }, label, cssMod)}`;
        })
        .join('');
      const date = item.pubDate ? escHtml(relTime(item.pubDate, deps.now)) : '';
      const author = item.author ? ` · ${escHtml(item.author)}` : '';
      const linkHref = item.link || '#';
      const desc = snippet(item.description);
      const descHtml = desc.length > 0 ? `<div class="rss-snippet">${escHtml(desc)}</div>` : '';
      return `<div class="pr-item">
        <div class="pr-row">
          <div class="pr-title"><a href="${escHtml(linkHref)}" target="_blank" rel="noopener">${escHtml(item.title || '(untitled)')}</a>${flagBadges}</div>
          <div class="pr-meta">${date}${author}</div>
        </div>
        ${descHtml}
      </div>`;
    })
    .join('');
};
