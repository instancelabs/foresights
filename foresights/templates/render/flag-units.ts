/**
 * Shared flaggable-unit enumerator — the single source of truth for the
 * `stableId` / `matchText` / `title` / `url` of every flaggable item.
 *
 * Each renderer (render/{releases,prs,issues,rss}.ts) used to compute these
 * four fields inline. A baked brief (Phase 3b) is looked up by `flag.stableId`
 * — the only key a badge click carries — so the wizard must pre-bake briefs
 * under stableIds *identical* to the runtime renderers'. Routing both the
 * renderers AND the wizard's flag manifest through these enumerators makes a
 * stableId divergence structurally impossible.
 *
 * Pure — no `Deps`, no DOM. Imports types only. `render/releases.ts` imports
 * `parseReleaseBody` from here (one-directional — no import cycle).
 */

import type { Issue, PullRequest, Release, RssItem } from '../types';

/**
 * A flaggable unit. The first four fields are exactly what a `FlagMeta` needs
 * (`stableId` / `title` / `url`) plus the `matchText` the product matcher runs
 * against. `source` carries the original item so the renderers can map a unit
 * back to the data they paint from.
 */
export interface FlagUnit<T> {
  /** Stable identifier — byte-identical to the renderer's per-item stableId. */
  readonly stableId: string;
  /** Text the product matcher (`flagsForText`) runs against. */
  readonly matchText: string;
  /** Item title — surfaced in the digest + brief. */
  readonly title: string;
  /** Canonical URL — best effort; empty string acceptable. */
  readonly url: string;
  /** The source item this unit was enumerated from. */
  readonly source: T;
}

/**
 * Sanitise a string for use as a stableId fragment. `max` differs per kind —
 * release bullets cap at 60, RSS guids at 80 — preserved verbatim from the
 * pre-3b renderers (`render/releases.ts` `slug`, `render/rss.ts` `slugForId`).
 */
export const slug = (s: string, max: number): string =>
  s
    .replace(/[^\w]+/g, '-')
    .toLowerCase()
    .slice(0, max);

// ---------------------------------------------------------------------------
// Releases
// ---------------------------------------------------------------------------

/** Release-body bucket — one of the four release-please markdown sections. */
export type Bucket = 'breaking' | 'features' | 'fixes' | 'alpha';

/** A release body parsed into per-bucket bullet arrays. */
export interface ParsedBody {
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

/**
 * Per-bucket bullet cap — `renderReleases` renders (and therefore flags) at
 * most this many bullets per bucket. Lives here because the enumeration of
 * flaggable units must apply the same caps the renderer does.
 */
export const RELEASE_BUCKET_CAP: Record<Bucket, number> = {
  breaking: 5,
  features: 6,
  fixes: 5,
  alpha: 5,
};

/** Bucket enumeration order — matches `renderReleases`' section order. */
const RELEASE_BUCKETS: readonly Bucket[] = ['breaking', 'features', 'fixes', 'alpha'];

/** The per-bullet source a release `FlagUnit` carries. */
export interface ReleaseUnitSource {
  readonly release: Release;
  readonly bucket: Bucket;
  readonly bullet: string;
}

/**
 * Enumerate the flaggable bullet units for ONE release — buckets in render
 * order, each capped per `RELEASE_BUCKET_CAP`, bullets in body order.
 */
export const releaseUnitsFor = (release: Release): ReadonlyArray<FlagUnit<ReleaseUnitSource>> => {
  const groups = parseReleaseBody(release.body);
  const units: Array<FlagUnit<ReleaseUnitSource>> = [];
  for (const bucket of RELEASE_BUCKETS) {
    for (const bullet of groups[bucket].slice(0, RELEASE_BUCKET_CAP[bucket])) {
      units.push({
        stableId: `release:${release.tag_name || 'unknown'}:${bucket}:${slug(bullet, 60)}`,
        // Breaking changes match with a BREAKING prefix so prefix-anchored
        // matcher rules fire — verbatim from the pre-3b renderer.
        matchText: bucket === 'breaking' ? `BREAKING ${bullet}` : bullet,
        title: bullet,
        url: release.html_url ?? '',
        source: { release, bucket, bullet },
      });
    }
  }
  return units;
};

/**
 * Enumerate every flaggable bullet unit across the first 5 releases, in the
 * renderer's exact order (release-major, bucket order, body order).
 */
export const releaseUnits = (
  releases: readonly Release[],
): ReadonlyArray<FlagUnit<ReleaseUnitSource>> => releases.slice(0, 5).flatMap(releaseUnitsFor);

// ---------------------------------------------------------------------------
// Pull requests
// ---------------------------------------------------------------------------

/**
 * A PR is rendered (and flagged) when it is merged and is not merge-back /
 * Contributors-file noise — verbatim from the pre-3b `renderPrs` filter.
 */
const prIsRendered = (p: PullRequest): boolean =>
  p.merged_at !== null &&
  !/^chore\(merge-back\)/i.test(p.title) &&
  !/Contributors File/i.test(p.title);

/** Enumerate the flaggable PR units — merged, de-noised, capped at 10. */
export const prUnits = (prs: readonly PullRequest[]): ReadonlyArray<FlagUnit<PullRequest>> =>
  prs
    .filter(prIsRendered)
    .slice(0, 10)
    .map((p) => ({
      stableId: `pr:${p.number}`,
      matchText: p.title,
      title: p.title,
      url: p.html_url,
      source: p,
    }));

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

/** Enumerate the flaggable issue units — first 8, in input order. */
export const issueUnits = (issues: readonly Issue[]): ReadonlyArray<FlagUnit<Issue>> =>
  issues.slice(0, 8).map((it) => ({
    stableId: `rfc:${it.number}`,
    matchText: `${it.title} ${it.body ?? ''}`,
    title: it.title,
    url: it.html_url ?? '',
    source: it,
  }));

// ---------------------------------------------------------------------------
// RSS
// ---------------------------------------------------------------------------

/** Enumerate the flaggable RSS units — first 10, in input order. */
export const rssUnits = (items: readonly RssItem[]): ReadonlyArray<FlagUnit<RssItem>> =>
  items.slice(0, 10).map((item) => ({
    stableId: `rss:${slug(item.guid || item.link, 80)}`,
    matchText: `${item.title} ${item.description}`,
    title: item.title,
    url: item.link,
    source: item,
  }));
