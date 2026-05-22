/**
 * Render the active-issues / RFCs section (label-derived status badges).
 *
 * Ports renderRfcs + rfcStatus from the v0.1 aws-cdk-news.html reference.
 * Each issue renders as a .card with a status badge derived from `status/*`
 * labels (RFC convention), an author line, and a relative-time meta column.
 *
 * Signature deviation from the Phase 2 stub: replaces `baseMeta: FlagMeta`
 * with `section: string` + `products`. The per-item FlagMeta fields
 * (stableId / matchText / title / url) come from `issueUnits`
 * (render/flag-units) so they stay byte-identical to the wizard's pre-baked-
 * brief manifest.
 */

import { flagBadgeHtml } from '../products/badge';
import { flagsForText } from '../products/matcher';
import type { Deps, Issue, Product } from '../types';
import { fmtDate, relTime } from '../util/date';
import { escHtml } from '../util/escape';
import { issueUnits } from './flag-units';
import { appendToSection } from './section';

interface RfcStatus {
  readonly name: string;
  readonly cls: string;
}

/**
 * Derive a status badge from an issue's labels. Looks for the first
 * label prefixed `status/`; falls back to a slate "unlabeled" pill.
 * Class assignment:
 *   done / approved / implementing → green
 *   final-comment / review / api-approved / planning → amber
 *   proposed → purple
 *   anything else → slate
 *
 * NOTE: the v0.1 reference used unanchored regexes (`/done|approved|.../`)
 * which silently misclassified `status/api-approved` as green (because
 * the `approved` substring inside it matched the green regex first).
 * v0.2 anchors with `^...$` so each pattern matches the whole status name.
 */
export const rfcStatus = (labels: Issue['labels']): RfcStatus => {
  const names = (labels ?? [])
    .map((l) => (typeof l === 'string' ? l : l?.name))
    .filter((n): n is string => Boolean(n));
  const status = names.find((l) => l.startsWith('status/'));
  if (!status) return { name: 'unlabeled', cls: 'badge-slate' };
  const short = status.replace('status/', '');
  const rules: ReadonlyArray<readonly [RegExp, string]> = [
    [/^(done|approved|implementing)$/, 'badge-green'],
    [/^(final-comment|review|api-approved|planning)$/, 'badge-amber'],
    [/^proposed$/, 'badge-purple'],
  ];
  for (const [re, cls] of rules) {
    if (re.test(short)) return { name: short, cls };
  }
  return { name: short, cls: 'badge-slate' };
};

/**
 * Render up to 8 issues into a target container.
 *
 * @param section section ID used both to derive the target DOM element
 *                (`${section}-body`) and as the FlagMeta.section value for
 *                per-item product flags.
 */
export const renderRfcs = (
  deps: Deps,
  issues: readonly Issue[],
  section: string,
  products: readonly Product[],
): void => {
  const html = issueUnits(issues)
    .map((u) => {
      const it = u.source;
      const status = rfcStatus(it.labels);
      const url = u.url;
      const flags = flagsForText(
        u.matchText,
        {
          section,
          stableId: u.stableId,
          title: u.title,
          url,
        },
        products,
      );
      const flagBadges = flags
        .map((f) => {
          const product = products.find((p) => p.id === f.productId);
          const cssMod = product?.cssMod ?? '';
          const label = product?.label ?? f.productId;
          return ` ${flagBadgeHtml(f, { kind: 'rfc', text: u.matchText }, label, cssMod)}`;
        })
        .join('');
      const created = it.updated_at; // Issue type doesn't expose created_at; updated_at is the available timestamp.
      return `<div class="card">
        <div class="card-row">
          <div class="card-title"><a href="${escHtml(url)}" target="_blank" rel="noopener">#${it.number} — ${escHtml(it.title)}</a> <span class="badge ${escHtml(status.cls)}">${escHtml(status.name)}</span>${flagBadges}</div>
          <div class="card-meta">${escHtml(relTime(it.updated_at, deps.now))}</div>
        </div>
        <div class="rfc-meta">updated ${escHtml(fmtDate(created))}</div>
      </div>`;
    })
    .join('');
  appendToSection(deps, section, html, 'No issues returned.');
};
