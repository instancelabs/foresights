// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deps, Product, PullRequest } from '../types';
import { createInMemoryStorage } from '../util/storage';
import { renderPrs, splitConventionalTitle } from './prs';

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
  document.body.innerHTML = '<div id="prs-body"></div>';
};

const samplePr = (overrides: Partial<PullRequest> = {}): PullRequest => ({
  number: 4242,
  title: 'feat(core): add a thing',
  html_url: 'https://github.com/aws/aws-cdk/pull/4242',
  merged_at: '2026-05-15T10:00:00Z',
  user: { login: 'someone' },
  ...overrides,
});

describe('splitConventionalTitle', () => {
  it('extracts the type+scope prefix and the remainder', () => {
    expect(splitConventionalTitle('feat(core): add stuff')).toEqual({
      scope: 'feat(core)',
      rest: 'add stuff',
    });
  });

  it('returns null scope for titles without conventional prefix', () => {
    expect(splitConventionalTitle('just a plain title')).toEqual({
      scope: null,
      rest: 'just a plain title',
    });
  });

  it('handles fix(scope) and chore(scope) too', () => {
    expect(splitConventionalTitle('fix(lambda): patch').scope).toBe('fix(lambda)');
    expect(splitConventionalTitle('chore(deps): bump').scope).toBe('chore(deps)');
  });

  it('does not match prefixes without parentheses', () => {
    expect(splitConventionalTitle('feat: no scope').scope).toBeNull();
  });
});

describe('renderPrs', () => {
  beforeEach(() => {
    setupDom();
  });

  it('renders an error card when no PRs are present', () => {
    renderPrs(buildDeps(), [], 'prs', []);
    expect(document.getElementById('prs-body')?.querySelector('.err')).not.toBeNull();
  });

  it('is a no-op when the target container is missing', () => {
    document.body.innerHTML = '';
    expect(() => renderPrs(buildDeps(), [samplePr({})], 'prs', [])).not.toThrow();
  });

  it('filters out PRs that have not been merged', () => {
    renderPrs(
      buildDeps(),
      [samplePr({ number: 1, merged_at: null }), samplePr({ number: 2 })],
      'prs',
      [],
    );
    const cards = document.querySelectorAll('.pr-row');
    expect(cards.length).toBe(1);
    expect(document.body.textContent).toContain('#2');
    expect(document.body.textContent).not.toContain('#1');
  });

  it('filters out chore(merge-back) and Contributors File PRs', () => {
    renderPrs(
      buildDeps(),
      [
        samplePr({ number: 1, title: 'chore(merge-back): from main' }),
        samplePr({ number: 2, title: 'feat(core): real change' }),
        samplePr({ number: 3, title: 'Update Contributors File' }),
      ],
      'prs',
      [],
    );
    const cards = document.querySelectorAll('.pr-row');
    expect(cards.length).toBe(1);
    expect(document.body.textContent).toContain('real change');
  });

  it('renders the scope chip for conventional-commit titles', () => {
    renderPrs(buildDeps(), [samplePr({ title: 'fix(lambda): handle the edge case' })], 'prs', []);
    const scope = document.querySelector('.pr-title .scope');
    expect(scope?.textContent).toBe('fix(lambda)');
    expect(document.body.textContent).toContain('handle the edge case');
  });

  it('renders plain titles without a scope chip', () => {
    renderPrs(buildDeps(), [samplePr({ title: 'just a plain title' })], 'prs', []);
    expect(document.querySelector('.pr-title .scope')).toBeNull();
    expect(document.body.textContent).toContain('just a plain title');
  });

  it('caps at 10 merged PRs', () => {
    const lots: PullRequest[] = Array.from({ length: 15 }, (_, i) =>
      samplePr({ number: i + 1, title: `feat(core): pr ${i}` }),
    );
    renderPrs(buildDeps(), lots, 'prs', []);
    expect(document.querySelectorAll('.pr-row').length).toBe(10);
  });

  it('renders flag badges for matching products', () => {
    const product: Product = {
      id: 'fakeprod',
      label: 'FakeProd',
      cssMod: 'fp',
      match: (text) => (text.includes('lambda') ? 'lambda touched' : null),
    };
    renderPrs(buildDeps(), [samplePr({ title: 'fix(lambda): patch a bug' })], 'prs', [product]);
    const badge = document.querySelector('.insights-tag');
    expect(badge?.getAttribute('data-product-id')).toBe('fakeprod');
    expect(badge?.getAttribute('title')).toBe('lambda touched');
  });

  it('uses the section param to choose the target container', () => {
    document.body.innerHTML = '<div id="prs-body"></div><div id="merged-body"></div>';
    renderPrs(buildDeps(), [samplePr({})], 'merged', []);
    expect(document.getElementById('prs-body')?.innerHTML).toBe('');
    expect(document.getElementById('merged-body')?.innerHTML).toContain('pr-row');
  });

  it('escapes the author login (defensive against unexpected values)', () => {
    renderPrs(buildDeps(), [samplePr({ user: { login: '<script>x</script>' } })], 'prs', []);
    const meta = document.querySelector('.pr-meta');
    expect(meta?.innerHTML).toContain('&lt;script&gt;');
    expect(meta?.querySelector('script')).toBeNull();
  });
});
