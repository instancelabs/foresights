/**
 * Render the live releases section.
 *
 * Ports renderReleases + parseReleaseBody + renderReleaseItem from the v0.1
 * aws-cdk-news.html reference. Markdown release bodies (the format
 * release-please generates) get split into Breaking / Features / Bug fixes /
 * Alpha buckets; each bucket renders as a .release-section list inside a
 * .card with the version chip in the header.
 *
 * Signature deviation from the Phase 2 stub: replaces the overloaded
 * `baseMeta: FlagMeta` with a `section: string` parameter, plus an explicit
 * `products` array. The per-item FlagMeta is built inline (each item has
 * its own stableId/title/url; only the section is shared per-call).
 */

import { flagBadgeHtml } from '../products/badge';
import { flagsForText } from '../products/matcher';
import type { Deps, Product, Release } from '../types';
import { fmtDate } from '../util/date';
import { escHtml } from '../util/escape';

type Bucket = 'breaking' | 'features' | 'fixes' | 'alpha';

interface ParsedBody {
  readonly breaking: readonly string[];
  readonly features: readonly string[];
  readonly fixes: readonly string[];
  readonly alpha: readonly string[];
}

/** Parse a release-please-shaped markdown body into per-bucket bullet arrays. */
export const parseReleaseBody = (body: string | null | undefined): ParsedBody => {
  const text = String(body ?? '');
  const groups: Record<Bucket, string[]> = {
    breaking: [],
    features: [],
    fixes: [],
    alpha: [],
  };
  let bucket: Bucket | null = null;
  let inAlpha = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^---/.test(line)) continue;
    if (/^##\s*Alpha modules/i.test(line)) {
      inAlpha = true;
      bucket = 'alpha';
      continue;
    }
    if (/^###\s*⚠?\s*BREAKING/i.test(line)) {
      bucket = 'breaking';
      continue;
    }
    if (/^###\s*Features/i.test(line)) {
      bucket = inAlpha ? 'alpha' : 'features';
      continue;
    }
    if (/^###\s*Bug Fixes/i.test(line)) {
      bucket = inAlpha ? 'alpha' : 'fixes';
      continue;
    }
    if (/^###/.test(line)) {
      bucket = null;
      continue;
    }
    if (!bucket) continue;
    const m = line.match(/^\*\s+(.*)/);
    if (!m || m[1] === undefined) continue;
    groups[bucket].push(m[1]);
  }
  return {
    breaking: groups.breaking,
    features: groups.features,
    fixes: groups.fixes,
    alpha: groups.alpha,
  };
};

/** Sanitise a string for use as a stableId fragment. */
const slug = (s: string): string =>
  s
    .replace(/[^\w]+/g, '-')
    .toLowerCase()
    .slice(0, 60);

/**
 * Render one bullet line from a release body. Returns the HTML for the bullet
 * with markdown links converted, bold "scope:" prefixes converted into
 * styled spans, and per-product flag badges appended.
 */
const renderReleaseItem = (
  item: string,
  sectionKind: Bucket,
  release: Release,
  flagSection: string,
  products: readonly Product[],
): string => {
  // Normalize bold scope: "**core:**" → <span class="scope">core</span>:
  let html = escHtml(item).replace(/\*\*([^*]+):\*\*/g, '<span class="scope">$1</span>:');
  // Convert markdown links [text](url) → <a>
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, t: string, u: string) =>
      `<a href="${escHtml(u)}" target="_blank" rel="noopener">${escHtml(t)}</a>`,
  );
  // Match against the raw item text (with a BREAKING prefix for breaking
  // changes so the matcher fires on prefix-anchored rules).
  const matchText = sectionKind === 'breaking' ? `BREAKING ${item}` : item;
  const flags = flagsForText(
    matchText,
    {
      section: flagSection,
      stableId: `release:${release.tag_name || 'unknown'}:${sectionKind}:${slug(item)}`,
      title: item,
      url: release.html_url ?? '',
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
        kind: `release-${sectionKind}`,
        text: matchText,
        ...(release.tag_name ? { version: release.tag_name } : {}),
      },
      label,
      cssMod,
    )}`;
  }
  return html;
};

const bucketCap: Record<Bucket, number> = {
  breaking: 5,
  features: 6,
  fixes: 5,
  alpha: 5,
};

const bucketHeading: Record<Bucket, string> = {
  breaking: '⚠ Breaking changes',
  features: 'Features',
  fixes: 'Bug fixes',
  alpha: 'Alpha modules',
};

const renderSection = (
  items: readonly string[],
  bucket: Bucket,
  release: Release,
  flagSection: string,
  products: readonly Product[],
): string => {
  if (items.length === 0) return '';
  const cap = bucketCap[bucket];
  const lis = items
    .slice(0, cap)
    .map((i) => `<li>${renderReleaseItem(i, bucket, release, flagSection, products)}</li>`)
    .join('');
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
  const targetId = `${section}-body`;
  const root = deps.document.getElementById(targetId);
  if (!root) return;
  if (releases.length === 0) {
    root.innerHTML = '<div class="err">No releases returned.</div>';
    return;
  }
  root.innerHTML = releases
    .slice(0, 5)
    .map((rel) => {
      const groups = parseReleaseBody(rel.body);
      const sections = [
        renderSection(groups.breaking, 'breaking', rel, section, products),
        renderSection(groups.features, 'features', rel, section, products),
        renderSection(groups.fixes, 'fixes', rel, section, products),
        renderSection(groups.alpha, 'alpha', rel, section, products),
      ].join('');
      const breakingBadge =
        groups.breaking.length > 0 ? '<span class="badge badge-red">breaking</span>' : '';
      return `<div class="card">
        <div class="card-row">
          <div class="release-version">
            <span class="ver">${escHtml(rel.tag_name || rel.name)}</span>
            ${breakingBadge}
          </div>
          <div class="card-meta">${escHtml(fmtDate(rel.published_at))} · <a href="${escHtml(rel.html_url)}" target="_blank" rel="noopener">notes ↗</a></div>
        </div>
        ${sections}
      </div>`;
    })
    .join('');
};
