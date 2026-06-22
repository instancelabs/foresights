/**
 * Render the live releases section.
 *
 * Ports renderReleases + renderReleaseItem from the v0.1 aws-cdk-news.html
 * reference. Markdown release bodies (the format release-please generates) get
 * split into Breaking / Features / Bug fixes / Alpha buckets; each bucket
 * renders as a .release-section list inside a .card with the version chip in
 * the header.
 *
 * The body parse (`parseReleaseBody`) and the per-bullet enumeration
 * (`releaseUnitsFor`) live in render/flag-units.ts — so the bullets the
 * renderer paints, and their stableIds, are byte-identical to the units the
 * wizard's pre-baked-brief manifest enumerates. `parseReleaseBody` is
 * re-exported here so existing importers (and releases.test.ts) are unchanged.
 *
 * Signature deviation from the Phase 2 stub: replaces the overloaded
 * `baseMeta: FlagMeta` with a `section: string` parameter, plus an explicit
 * `products` array. The per-bullet FlagMeta is sourced from the unit.
 */

import { flagBadgeHtml } from '../products/badge';
import { flagsForText } from '../products/matcher';
import type { Deps, Product, Release } from '../types';
import { fmtDate } from '../util/date';
import { escHtml, safeHref } from '../util/escape';
import {
  type Bucket,
  type FlagUnit,
  type ReleaseUnitSource,
  parseReleaseBody,
  releaseUnitsFor,
} from './flag-units';
import { appendToSection } from './section';

// flag-units.ts owns parseReleaseBody now; re-export it so existing importers
// (and releases.test.ts's `import { parseReleaseBody } from './releases'`)
// keep working unchanged.
export { parseReleaseBody };

/**
 * Render one bullet line from a release body. Returns the HTML for the bullet
 * with markdown links converted, bold "scope:" prefixes converted into
 * styled spans, and per-product flag badges appended.
 *
 * `unit` carries the bullet text, the release, the bucket, and the
 * stableId / matchText / title / url — all enumerated by `releaseUnitsFor`.
 */
const renderReleaseItem = (
  unit: FlagUnit<ReleaseUnitSource>,
  flagSection: string,
  products: readonly Product[],
): string => {
  const { release, bucket, bullet } = unit.source;
  // Normalize bold scope: "**core:**" → <span class="scope">core</span>:
  let html = escHtml(bullet).replace(/\*\*([^*]+):\*\*/g, '<span class="scope">$1</span>:');
  // Convert markdown links [text](url) → <a>
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, t: string, u: string) =>
      `<a href="${safeHref(u)}" target="_blank" rel="noopener">${escHtml(t)}</a>`,
  );
  // matchText carries the BREAKING prefix for breaking changes (so prefix-
  // anchored matcher rules fire) — computed by releaseUnitsFor.
  const flags = flagsForText(
    unit.matchText,
    {
      section: flagSection,
      stableId: unit.stableId,
      title: unit.title,
      url: unit.url,
    },
    products,
  );
  for (const f of flags) {
    const product = products.find((p) => p.id === f.productId);
    const cssMod = product?.cssMod ?? '';
    const label = product?.label ?? f.productId;
    html += ` ${flagBadgeHtml(
      f,
      {
        kind: `release-${bucket}`,
        text: unit.matchText,
        ...(release.tag_name ? { version: release.tag_name } : {}),
      },
      label,
      cssMod,
    )}`;
  }
  return html;
};

const bucketHeading: Record<Bucket, string> = {
  breaking: '⚠ Breaking changes',
  features: 'Features',
  fixes: 'Bug fixes',
  alpha: 'Alpha modules',
};

/**
 * Render one bucket's `.release-section`. `units` are already capped + ordered
 * by `releaseUnitsFor`, so no re-slicing happens here.
 */
const renderBucket = (
  units: ReadonlyArray<FlagUnit<ReleaseUnitSource>>,
  bucket: Bucket,
  flagSection: string,
  products: readonly Product[],
): string => {
  if (units.length === 0) return '';
  const lis = units.map((u) => `<li>${renderReleaseItem(u, flagSection, products)}</li>`).join('');
  const cls = bucket === 'breaking' ? 'release-section breaking' : 'release-section';
  return `<div class="${cls}"><h4>${escHtml(bucketHeading[bucket])}</h4><ul>${lis}</ul></div>`;
};

/**
 * Render up to 5 releases into a target container.
 *
 * @param section section ID used both to derive the target DOM element
 *                (`${section}-body`) and as the FlagMeta.section value for
 *                per-item product flags.
 */
export const renderReleases = (
  deps: Deps,
  releases: readonly Release[],
  section: string,
  products: readonly Product[],
): void => {
  const html = releases
    .slice(0, 5)
    .map((rel) => {
      const units = releaseUnitsFor(rel);
      const breaking = units.filter((u) => u.source.bucket === 'breaking');
      const features = units.filter((u) => u.source.bucket === 'features');
      const fixes = units.filter((u) => u.source.bucket === 'fixes');
      const alpha = units.filter((u) => u.source.bucket === 'alpha');
      const sections = [
        renderBucket(breaking, 'breaking', section, products),
        renderBucket(features, 'features', section, products),
        renderBucket(fixes, 'fixes', section, products),
        renderBucket(alpha, 'alpha', section, products),
      ].join('');
      const breakingBadge =
        breaking.length > 0 ? '<span class="badge badge-red">breaking</span>' : '';
      return `<div class="card">
        <div class="card-row">
          <div class="release-version">
            <span class="ver">${escHtml(rel.tag_name || rel.name || 'untagged')}</span>
            ${breakingBadge}
          </div>
          <div class="card-meta">${escHtml(fmtDate(rel.published_at))} · <a href="${safeHref(rel.html_url)}" target="_blank" rel="noopener">notes ↗</a></div>
        </div>
        ${sections}
      </div>`;
    })
    .join('');
  appendToSection(deps, section, html, 'No releases returned.');
};
