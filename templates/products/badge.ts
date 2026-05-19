/**
 * Build the HTML for an `.insights-tag.expandable` badge.
 *
 * This is the write half of the contract the renderers use. The read half
 * lives in `products/panel.ts`'s `readFlag` / `readItem`, which reads back
 * the data-* attributes set here. Keep the two in sync — any new field
 * added must be set here AND read in panel.ts.
 *
 * Why eight data-* attrs instead of a single JSON blob: HTML attribute
 * escaping for arbitrary JSON is fragile (quote handling), and the panel
 * click delegate reads them individually anyway. Eight attrs is a few
 * hundred bytes per badge and we expect <30 badges per page.
 */

import type { Flag } from '../types';
import { escHtml } from '../util/escape';

/** Per-item context that varies by source kind (release / rfc / pr / highlight). */
export interface BadgeMeta {
  /** Item kind tag: `release-features`, `release-fixes`, `release-breaking`, `release-alpha`, `rfc`, `pr`, `highlight`. */
  readonly kind: string;
  /** Match text — the rich item content sent to Haiku for brief generation. */
  readonly text: string;
  /** Optional release version. */
  readonly version?: string;
  /** Optional source identifier (`owner/repo`). */
  readonly source?: string;
}

const dataAttr = (name: string, value: string): string => `data-${name}="${escHtml(value)}"`;

/**
 * Build just the attribute string for an expandable insights-tag badge.
 * Useful when applying attrs to an existing span (see render/highlights.ts).
 */
export const flagBadgeAttrs = (flag: Flag, meta: BadgeMeta, cssMod = ''): string => {
  const classList = `insights-tag${cssMod ? ` ${cssMod}` : ''} expandable`;
  const attrs = [
    `class="${escHtml(classList)}"`,
    dataAttr('product-id', flag.productId),
    dataAttr('stable-id', flag.stableId),
    dataAttr('section', flag.section),
    dataAttr('title', flag.title ?? ''),
    dataAttr('url', flag.url ?? ''),
    dataAttr('reason', flag.reason),
    dataAttr('kind', meta.kind),
    dataAttr('text', meta.text),
  ];
  if (meta.version) attrs.push(dataAttr('version', meta.version));
  if (meta.source) attrs.push(dataAttr('source', meta.source));
  attrs.push(`title="${escHtml(`${flag.reason} · click for full brief`)}"`);
  return attrs.join(' ');
};

/** Build the full `<span>...</span>` HTML for a badge. */
export const flagBadgeHtml = (
  flag: Flag,
  meta: BadgeMeta,
  productLabel: string,
  cssMod = '',
): string => `<span ${flagBadgeAttrs(flag, meta, cssMod)}>${escHtml(productLabel)}</span>`;
