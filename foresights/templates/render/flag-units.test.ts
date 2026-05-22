// @vitest-environment jsdom

/**
 * Tests for the shared flaggable-unit enumerators.
 *
 * The enumerators are the single source of truth for every flaggable item's
 * `stableId`. A baked brief (Phase 3b) is keyed by that stableId, so these
 * tests pin the exact stableId format — a change here breaks every existing
 * dashboard's brief cache. The final `describe` cross-checks that the badge a
 * renderer paints into the DOM carries the *same* stableId the enumerator
 * produced — the renderer ⟷ enumerator alignment that 3b-0 exists to enforce.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Deps, Issue, Product, PullRequest, Release, RssItem } from '../types';
import { createInMemoryStorage } from '../util/storage';
import { issueUnits, prUnits, releaseUnits, releaseUnitsFor, rssUnits, slug } from './flag-units';
import { renderRfcs } from './issues';
import { renderPrs } from './prs';
import { renderReleases } from './releases';
import { renderRssItems } from './rss';

describe('slug', () => {
  it('lowercases and replaces non-word runs with single dashes', () => {
    expect(slug('Hello, World!!', 60)).toBe('hello-world-');
  });

  it('caps at the requested length', () => {
    expect(slug('a'.repeat(200), 60)).toHaveLength(60);
    expect(slug('a'.repeat(200), 80)).toHaveLength(80);
  });
});

describe('prUnits', () => {
  const pr = (o: Partial<PullRequest> = {}): PullRequest => ({
    number: 10,
    title: 'feat(core): a thing',
    html_url: 'https://github.com/o/r/pull/10',
    merged_at: '2026-05-15T10:00:00Z',
    user: { login: 'dev' },
    ...o,
  });

  it('keeps only merged PRs and drops merge-back / Contributors-file noise', () => {
    const units = prUnits([
      pr({ number: 1, merged_at: null }),
      pr({ number: 2, title: 'chore(merge-back): from main' }),
      pr({ number: 3, title: 'Update Contributors File' }),
      pr({ number: 4, title: 'feat(core): real' }),
    ]);
    expect(units.map((u) => u.stableId)).toEqual(['pr:4']);
  });

  it('caps at 10', () => {
    const units = prUnits(Array.from({ length: 15 }, (_, i) => pr({ number: i + 1 })));
    expect(units).toHaveLength(10);
  });

  it('emits pr:<number> stableId and threads title / matchText / url', () => {
    const [u] = prUnits([pr({ number: 42, title: 'feat: x', html_url: 'https://x/42' })]);
    expect(u).toEqual({
      stableId: 'pr:42',
      matchText: 'feat: x',
      title: 'feat: x',
      url: 'https://x/42',
      source: expect.objectContaining({ number: 42 }),
    });
  });
});

describe('issueUnits', () => {
  const issue = (o: Partial<Issue> = {}): Issue => ({
    number: 5,
    title: 'RFC: thing',
    body: 'body text',
    html_url: 'https://github.com/o/r/issues/5',
    labels: [],
    updated_at: '2026-05-10T10:00:00Z',
    ...o,
  });

  it('caps at 8', () => {
    expect(issueUnits(Array.from({ length: 12 }, (_, i) => issue({ number: i })))).toHaveLength(8);
  });

  it('emits rfc:<number> and matchText of title + body', () => {
    const [u] = issueUnits([issue({ number: 7, title: 'T', body: 'B' })]);
    expect(u?.stableId).toBe('rfc:7');
    expect(u?.matchText).toBe('T B');
    expect(u?.title).toBe('T');
    expect(u?.url).toBe('https://github.com/o/r/issues/5');
  });

  it('tolerates a missing html_url with an empty-string url', () => {
    const { html_url: _omit, ...noUrl } = issue();
    void _omit;
    expect(issueUnits([noUrl as Issue])[0]?.url).toBe('');
  });
});

describe('rssUnits', () => {
  const item = (o: Partial<RssItem> = {}): RssItem => ({
    title: 'Post',
    link: 'https://example.com/post',
    description: 'desc',
    pubDate: '2026-05-18T09:00:00Z',
    author: 'A',
    guid: 'guid-1',
    ...o,
  });

  it('caps at 10', () => {
    expect(rssUnits(Array.from({ length: 14 }, (_, i) => item({ guid: `g${i}` })))).toHaveLength(
      10,
    );
  });

  it('slugs the guid into the stableId (80-char cap)', () => {
    const [u] = rssUnits([item({ guid: 'tag:example,2026:entry/1#x' })]);
    expect(u?.stableId).toBe('rss:tag-example-2026-entry-1-x');
  });

  it('falls back to the link when guid is empty', () => {
    const [u] = rssUnits([item({ guid: '', link: 'https://example.com/no-guid' })]);
    expect(u?.stableId).toBe('rss:https-example-com-no-guid');
  });
});

describe('releaseUnits', () => {
  const rel = (o: Partial<Release> = {}): Release => ({
    tag_name: 'v1.0.0',
    name: 'v1.0.0',
    body: '',
    html_url: 'https://github.com/o/r/releases/tag/v1.0.0',
    published_at: '2026-05-01T10:00:00Z',
    ...o,
  });

  it('caps at 5 releases', () => {
    const units = releaseUnits(
      Array.from({ length: 8 }, (_, i) =>
        rel({ tag_name: `v1.${i}.0`, body: '### Features\n* f' }),
      ),
    );
    expect(new Set(units.map((u) => u.source.release.tag_name)).size).toBe(5);
  });

  it('enumerates buckets in render order with per-bucket caps', () => {
    const body = [
      '### ⚠ BREAKING CHANGES',
      ...Array.from({ length: 9 }, (_, i) => `* breaking ${i}`),
      '### Features',
      ...Array.from({ length: 9 }, (_, i) => `* feature ${i}`),
      '### Bug Fixes',
      ...Array.from({ length: 9 }, (_, i) => `* fix ${i}`),
      '## Alpha modules',
      '### Features',
      ...Array.from({ length: 9 }, (_, i) => `* alpha ${i}`),
    ].join('\n');
    const buckets = releaseUnitsFor(rel({ body })).map((u) => u.source.bucket);
    // breaking 5, features 6, fixes 5, alpha 5 — in that order.
    expect(buckets).toEqual([
      ...Array(5).fill('breaking'),
      ...Array(6).fill('features'),
      ...Array(5).fill('fixes'),
      ...Array(5).fill('alpha'),
    ]);
  });

  it('emits release:<tag>:<bucket>:<slug> and prefixes breaking matchText', () => {
    const [u] = releaseUnitsFor(
      rel({ tag_name: 'v2.3.0', body: '### ⚠ BREAKING CHANGES\n* drop X' }),
    );
    expect(u?.stableId).toBe('release:v2.3.0:breaking:drop-x');
    expect(u?.matchText).toBe('BREAKING drop X');
    expect(u?.title).toBe('drop X');
  });

  it('does NOT prefix non-breaking matchText', () => {
    const [u] = releaseUnitsFor(rel({ body: '### Features\n* add Y' }));
    expect(u?.matchText).toBe('add Y');
  });

  it('falls back to "unknown" when a release has no tag', () => {
    const [u] = releaseUnitsFor(rel({ tag_name: '', body: '### Features\n* z' }));
    expect(u?.stableId).toBe('release:unknown:features:z');
  });
});

describe('renderer ⟷ enumerator stableId alignment', () => {
  const deps = (): Deps => ({
    callTool: vi.fn(),
    askClaude: vi.fn(),
    runScheduledTask: vi.fn(),
    storage: createInMemoryStorage(),
    now: () => new Date('2026-05-20T12:00:00Z'),
    document: window.document,
    window,
  });
  // A match-everything product so every flaggable unit gets a badge.
  const matchAll: Product = { id: 'p', label: 'P', cssMod: 'p', match: () => 'always' };

  const stableIdsInDom = (): string[] =>
    [...window.document.querySelectorAll('.insights-tag')]
      .map((el) => el.getAttribute('data-stable-id') ?? '')
      .sort();

  it('renderPrs badges carry exactly the prUnits stableIds', () => {
    window.document.body.innerHTML = '<div id="prs-body"></div>';
    const prs: PullRequest[] = Array.from({ length: 3 }, (_, i) => ({
      number: 100 + i,
      title: `feat: pr ${i}`,
      html_url: `https://x/${i}`,
      merged_at: '2026-05-15T10:00:00Z',
    }));
    renderPrs(deps(), prs, 'prs', [matchAll]);
    expect(stableIdsInDom()).toEqual([...prUnits(prs)].map((u) => u.stableId).sort());
  });

  it('renderRfcs badges carry exactly the issueUnits stableIds', () => {
    window.document.body.innerHTML = '<div id="rfcs-body"></div>';
    const issues: Issue[] = Array.from({ length: 3 }, (_, i) => ({
      number: 200 + i,
      title: `RFC ${i}`,
      body: 'b',
      html_url: `https://x/${i}`,
      labels: [],
      updated_at: '2026-05-10T10:00:00Z',
    }));
    renderRfcs(deps(), issues, 'rfcs', [matchAll]);
    expect(stableIdsInDom()).toEqual([...issueUnits(issues)].map((u) => u.stableId).sort());
  });

  it('renderRssItems badges carry exactly the rssUnits stableIds', () => {
    window.document.body.innerHTML = '<div id="updates-body"></div>';
    const items: RssItem[] = Array.from({ length: 3 }, (_, i) => ({
      title: `Post ${i}`,
      link: `https://example.com/${i}`,
      description: 'd',
      pubDate: '2026-05-18T09:00:00Z',
      author: 'A',
      guid: `g/${i}`,
    }));
    renderRssItems(deps(), items, 'updates', [matchAll]);
    expect(stableIdsInDom()).toEqual([...rssUnits(items)].map((u) => u.stableId).sort());
  });

  it('renderReleases badges carry exactly the releaseUnits stableIds', () => {
    window.document.body.innerHTML = '<div id="releases-body"></div>';
    const releases: Release[] = [
      {
        tag_name: 'v9.0.0',
        name: 'v9.0.0',
        html_url: 'https://x/9',
        published_at: '2026-05-01T10:00:00Z',
        body: '### ⚠ BREAKING CHANGES\n* drop A\n### Features\n* add B\n### Bug Fixes\n* fix C',
      },
    ];
    renderReleases(deps(), releases, 'releases', [matchAll]);
    expect(stableIdsInDom()).toEqual([...releaseUnits(releases)].map((u) => u.stableId).sort());
  });
});
