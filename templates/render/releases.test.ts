// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deps, Product, Release } from '../types';
import { createInMemoryStorage } from '../util/storage';
import { parseReleaseBody, renderReleases } from './releases';

const FROZEN_NOW = (): Date => new Date('2026-05-19T12:00:00');

const buildDeps = (): Deps => ({
  callTool: vi.fn(),
  askClaude: vi.fn(),
  runScheduledTask: vi.fn(),
  storage: createInMemoryStorage(),
  now: FROZEN_NOW,
  document: window.document,
  window,
});

const setupDom = (): void => {
  document.body.innerHTML = '<div id="releases-body"></div>';
};

const sampleRelease = (overrides: Partial<Release> = {}): Release => ({
  tag_name: 'v2.252.0',
  name: 'v2.252.0',
  body: '',
  html_url: 'https://github.com/aws/aws-cdk/releases/tag/v2.252.0',
  published_at: '2026-04-15T10:00:00Z',
  ...overrides,
});

describe('parseReleaseBody', () => {
  it('returns empty buckets for empty input', () => {
    expect(parseReleaseBody('')).toEqual({ breaking: [], features: [], fixes: [], alpha: [] });
    expect(parseReleaseBody(null)).toEqual({ breaking: [], features: [], fixes: [], alpha: [] });
    expect(parseReleaseBody(undefined)).toEqual({
      breaking: [],
      features: [],
      fixes: [],
      alpha: [],
    });
  });

  it('partitions Features and Bug Fixes sections', () => {
    const body = [
      '### Features',
      '',
      '* **core:** new thing',
      '* another thing',
      '',
      '### Bug Fixes',
      '',
      '* **lambda:** patched',
    ].join('\n');
    const out = parseReleaseBody(body);
    expect(out.features).toEqual(['**core:** new thing', 'another thing']);
    expect(out.fixes).toEqual(['**lambda:** patched']);
    expect(out.breaking).toEqual([]);
    expect(out.alpha).toEqual([]);
  });

  it('captures BREAKING sections with or without warning emoji', () => {
    const out = parseReleaseBody(['### ⚠ BREAKING CHANGES', '* breaking one', ''].join('\n'));
    expect(out.breaking).toEqual(['breaking one']);
    const out2 = parseReleaseBody(['### BREAKING CHANGES', '* breaking two'].join('\n'));
    expect(out2.breaking).toEqual(['breaking two']);
  });

  it('routes Features/Bug Fixes under "## Alpha modules" into the alpha bucket', () => {
    const body = [
      '### Features',
      '* main feature',
      '## Alpha modules',
      '### Features',
      '* alpha feature',
      '### Bug Fixes',
      '* alpha fix',
    ].join('\n');
    const out = parseReleaseBody(body);
    expect(out.features).toEqual(['main feature']);
    expect(out.alpha).toEqual(['alpha feature', 'alpha fix']);
  });

  it('ignores horizontal-rule lines and unknown sections', () => {
    const body = [
      '---',
      '### Features',
      '* feat one',
      '---',
      '### Some Other Section',
      '* should be skipped',
      '### Bug Fixes',
      '* fix one',
    ].join('\n');
    const out = parseReleaseBody(body);
    expect(out.features).toEqual(['feat one']);
    expect(out.fixes).toEqual(['fix one']);
  });

  it('ignores non-bullet lines inside a known bucket', () => {
    const body = ['### Features', 'This is descriptive prose, not a bullet.', '* the bullet'].join(
      '\n',
    );
    expect(parseReleaseBody(body).features).toEqual(['the bullet']);
  });
});

describe('renderReleases', () => {
  beforeEach(() => {
    setupDom();
  });

  it('renders an error card when the list is empty', () => {
    renderReleases(buildDeps(), [], 'releases', []);
    const root = document.getElementById('releases-body');
    expect(root?.innerHTML).toContain('No releases returned.');
    expect(root?.querySelector('.err')).not.toBeNull();
  });

  it('is a no-op when the target container is missing', () => {
    document.body.innerHTML = '';
    expect(() =>
      renderReleases(buildDeps(), [sampleRelease({ body: '### Features\n* x' })], 'releases', []),
    ).not.toThrow();
  });

  it('renders a card with version chip and notes link', () => {
    renderReleases(
      buildDeps(),
      [sampleRelease({ body: '### Features\n* feat one' })],
      'releases',
      [],
    );
    const root = document.getElementById('releases-body');
    expect(root?.querySelector('.ver')?.textContent).toBe('v2.252.0');
    const noteLink = root?.querySelector('.card-meta a');
    expect(noteLink?.getAttribute('href')).toBe(
      'https://github.com/aws/aws-cdk/releases/tag/v2.252.0',
    );
  });

  it('adds the .breaking modifier and a red badge when breaking changes are present', () => {
    renderReleases(
      buildDeps(),
      [sampleRelease({ body: '### BREAKING CHANGES\n* breaking change' })],
      'releases',
      [],
    );
    const root = document.getElementById('releases-body');
    expect(root?.querySelector('.release-section.breaking')).not.toBeNull();
    expect(root?.querySelector('.badge.badge-red')?.textContent).toBe('breaking');
  });

  it('caps each bucket at its limit', () => {
    const features = Array.from({ length: 10 }, (_, i) => `* feat ${i}`).join('\n');
    renderReleases(
      buildDeps(),
      [sampleRelease({ body: `### Features\n${features}` })],
      'releases',
      [],
    );
    const lis = document.querySelectorAll('.release-section ul li');
    // bucketCap.features === 6
    expect(lis.length).toBe(6);
  });

  it('converts "**scope:**" prefixes into a .scope span', () => {
    renderReleases(
      buildDeps(),
      [sampleRelease({ body: '### Features\n* **core:** new thing' })],
      'releases',
      [],
    );
    const span = document.querySelector('.release-section li .scope');
    expect(span?.textContent).toBe('core');
  });

  it('converts markdown links into target=_blank anchors', () => {
    renderReleases(
      buildDeps(),
      [sampleRelease({ body: '### Features\n* see [docs](https://example.com)' })],
      'releases',
      [],
    );
    const a = document.querySelector('.release-section li a');
    expect(a?.getAttribute('href')).toBe('https://example.com');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.textContent).toBe('docs');
  });

  it('renders only the first 5 releases', () => {
    const lots: Release[] = Array.from({ length: 8 }, (_, i) =>
      sampleRelease({ tag_name: `v2.${100 + i}.0`, name: `v2.${100 + i}.0`, body: '' }),
    );
    renderReleases(buildDeps(), lots, 'releases', []);
    const cards = document.querySelectorAll('#releases-body > .card');
    expect(cards.length).toBe(5);
  });

  it('appends per-product flag badges for matching items', () => {
    const product: Product = {
      id: 'fakeprod',
      label: 'FakeProd',
      cssMod: 'fp',
      match: (text) => (/^feat/.test(text) ? 'matched feat-prefix' : null),
    };
    renderReleases(
      buildDeps(),
      [sampleRelease({ body: '### Features\n* feat one\n* something else' })],
      'releases',
      [product],
    );
    const badges = document.querySelectorAll('.insights-tag');
    expect(badges.length).toBe(1);
    expect(badges[0]?.getAttribute('data-product-id')).toBe('fakeprod');
    expect(badges[0]?.getAttribute('title')).toBe('matched feat-prefix');
  });

  it('prefixes breaking items with "BREAKING " for matcher purposes', () => {
    const seen: string[] = [];
    const product: Product = {
      id: 'breakingwatcher',
      label: 'BreakingWatcher',
      cssMod: 'bw',
      match: (text) => {
        seen.push(text);
        return text.startsWith('BREAKING ') ? 'is breaking' : null;
      },
    };
    renderReleases(
      buildDeps(),
      [sampleRelease({ body: '### BREAKING CHANGES\n* removed XYZ API' })],
      'releases',
      [product],
    );
    expect(seen).toContain('BREAKING removed XYZ API');
    expect(document.querySelector('.insights-tag')).not.toBeNull();
  });

  it('uses the section param to choose the target container', () => {
    document.body.innerHTML = '<div id="releases-body"></div><div id="custom-section-body"></div>';
    renderReleases(
      buildDeps(),
      [sampleRelease({ body: '### Features\n* x' })],
      'custom-section',
      [],
    );
    expect(document.getElementById('releases-body')?.innerHTML).toBe('');
    expect(document.getElementById('custom-section-body')?.innerHTML).toContain('release-section');
  });
});
