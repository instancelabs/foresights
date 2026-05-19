/**
 * Re-tag static .hl-card divs with runtime-detected product badges.
 *
 * Walks every `.hl-card` in the document, extracts its tag + title + body
 * text into a single fullText string, runs the generic product matcher,
 * and injects one `<span class="insights-tag <cssMod> expandable">` into
 * the card's title for every matching product.
 *
 * Generalises the v0.1 upgradeHighlightBadges (which had hardcoded CDK
 * Insights and Last Command matchers); the v0.2 version is fully driven
 * by the `products` array. The wizard's HIGHLIGHTS_MARKUP / PATTERNS_MARKUP
 * generators are required to emit cards with NO static `.insights-tag`
 * spans — product flagging is purely runtime via this function.
 */

import { flagBadgeHtml } from '../products/badge';
import { flagsForText } from '../products/matcher';
import type { Deps, Product } from '../types';

const slug = (s: string): string =>
  s
    .replace(/[^\w]+/g, '-')
    .toLowerCase()
    .slice(0, 60);

const collapseWs = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Pull the visible text of an element, stripping any nested .insights-tag children. */
const textWithoutBadges = (el: Element | null): string => {
  if (!el) return '';
  const clone = el.cloneNode(true) as Element;
  for (const badge of clone.querySelectorAll('.insights-tag')) {
    badge.remove();
  }
  return collapseWs(clone.textContent ?? '');
};

/**
 * Walk every `.hl-card` and inject a product flag badge per matching product.
 *
 * Idempotent: if the card already has a badge for a given productId, the
 * function skips that product (so re-running after a content refresh
 * doesn't duplicate badges).
 */
export const upgradeHighlightBadges = (deps: Deps, products: readonly Product[]): void => {
  if (products.length === 0) return;
  const doc = deps.document;
  for (const card of doc.querySelectorAll('.hl-card')) {
    const titleEl = card.querySelector('h3');
    if (!titleEl) continue;

    const tagText = textWithoutBadges(card.querySelector('.tag'));
    const titleText = textWithoutBadges(titleEl);
    const bodyText = textWithoutBadges(card.querySelector('p'));
    const fullText = `${tagText ? `[${tagText}] ` : ''}${titleText}${bodyText ? ` — ${bodyText}` : ''}`;

    const moreLink = card.querySelector('a.more');
    const url = moreLink instanceof HTMLAnchorElement ? moreLink.href : '';
    const stableId = `highlight:${slug(titleText || tagText)}`;

    const flags = flagsForText(
      fullText,
      { section: 'highlights', stableId, title: titleText, url },
      products,
    );

    for (const f of flags) {
      const existing = titleEl.querySelector(`.insights-tag[data-product-id="${f.productId}"]`);
      if (existing) continue;
      const product = products.find((p) => p.id === f.productId);
      const cssMod = product?.cssMod ?? '';
      const label = product?.label ?? f.productId;
      // insertAdjacentHTML only parses the new fragment, preserving any
      // existing text/nodes inside titleEl — no whitespace surprises.
      titleEl.insertAdjacentHTML(
        'beforeend',
        ` ${flagBadgeHtml(f, { kind: 'highlight', text: fullText }, label, cssMod)}`,
      );
    }
  }
};
