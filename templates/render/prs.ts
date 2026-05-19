/**
 * Render the recently-merged PRs section.
 *
 * Ports renderPrs from the v0.1 aws-cdk-news.html reference. Filters the
 * input list down to merged PRs, drops merge-back commits and
 * Contributors-file noise, and renders up to 10. Conventional-commit
 * prefixes ("feat(scope):", "fix(scope):") get extracted into a styled
 * .scope span.
 *
 * Signature deviation from the Phase 2 stub: replaces `baseMeta: FlagMeta`
 * with `section: string` + `products`. The per-item FlagMeta is built inline.
 */

import { flagsForText } from '../products/matcher';
import type { Deps, Product, PullRequest } from '../types';
import { relTime } from '../util/date';
import { escHtml } from '../util/escape';

interface TitleParts {
  readonly scope: string | null;
  readonly rest: string;
}

/** Split a conventional-commit-formatted title ("feat(core): X") into parts. */
export const splitConventionalTitle = (title: string): TitleParts => {
  const m = title.match(/^(\w+)\(([^)]+)\):\s*(.*)$/);
  if (!m || m[1] === undefined || m[2] === undefined || m[3] === undefined) {
    return { scope: null, rest: title };
  }
  return { scope: `${m[1]}(${m[2]})`, rest: m[3] };
};

/**
 * Render up to 10 recently-merged PRs into a target container.
 *
 * @param section section ID used both to derive the target DOM element
 *                (`${section}-body`) and as the FlagMeta.section value for
 *                per-item product flags.
 */
export const renderPrs = (
  deps: Deps,
  prs: readonly PullRequest[],
  section: string,
  products: readonly Product[],
): void => {
  const targetId = `${section}-body`;
  const root = deps.document.getElementById(targetId);
  if (!root) return;
  const merged = prs
    .filter(
      (p) =>
        p.merged_at !== null &&
        !/^chore\(merge-back\)/i.test(p.title) &&
        !/Contributors File/i.test(p.title),
    )
    .slice(0, 10);
  if (merged.length === 0) {
    root.innerHTML = '<div class="err">No interesting merged PRs in the last page.</div>';
    return;
  }
  root.innerHTML = merged
    .map((p) => {
      const { scope, rest } = splitConventionalTitle(p.title);
      const titleHtml = scope
        ? `<span class="scope">${escHtml(scope)}</span> ${escHtml(rest)}`
        : escHtml(p.title);
      const author = p.user?.login ? `@${p.user.login}` : '';
      const flags = flagsForText(
        p.title,
        {
          section,
          stableId: `pr:${p.number}`,
          title: p.title,
          url: p.html_url,
        },
        products,
      );
      const flagBadges = flags
        .map(
          (f) =>
            ` <span class="insights-tag" data-product-id="${escHtml(f.productId)}" title="${escHtml(f.reason)}">${escHtml(f.productId)}</span>`,
        )
        .join('');
      const mergedMeta = p.merged_at ? escHtml(relTime(p.merged_at, deps.now)) : '';
      return `<div class="pr-item">
        <div class="pr-row">
          <div class="pr-title"><a href="${escHtml(p.html_url)}" target="_blank" rel="noopener">${titleHtml}</a>${flagBadges}</div>
          <div class="pr-meta">#${p.number} · ${escHtml(author)} · merged ${mergedMeta}</div>
        </div>
      </div>`;
    })
    .join('');
};
