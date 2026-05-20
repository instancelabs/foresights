// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deps, Product } from '../types';
import { createInMemoryStorage } from '../util/storage';
import { upgradeHighlightBadges } from './highlights';

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

const matchAlways = (id: string, label: string, cssMod: string, reason: string): Product => ({
  id,
  label,
  cssMod,
  match: () => reason,
});

const matchKeyword = (
  id: string,
  label: string,
  cssMod: string,
  keyword: string,
  reason: string,
): Product => ({
  id,
  label,
  cssMod,
  match: (text) => (text.toLowerCase().includes(keyword.toLowerCase()) ? reason : null),
});

const cardHtml = (
  tag: string,
  title: string,
  body: string,
  moreHref = 'https://example.com',
): string => `
  <div class="hl-card">
    <span class="tag">${tag}</span>
    <h3>${title}</h3>
    <p>${body}</p>
    <a class="more" href="${moreHref}" target="_blank" rel="noopener">More →</a>
  </div>`;

describe('upgradeHighlightBadges', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('is a no-op with no products', () => {
    document.body.innerHTML = cardHtml('GA', 'A title', 'A body');
    upgradeHighlightBadges(buildDeps(), []);
    expect(document.querySelectorAll('.insights-tag').length).toBe(0);
  });

  it('is a no-op when there are no .hl-card elements', () => {
    document.body.innerHTML = '<div>no cards here</div>';
    expect(() =>
      upgradeHighlightBadges(buildDeps(), [matchAlways('p1', 'P1', 'p1', 'r1')]),
    ).not.toThrow();
  });

  it('appends an .insights-tag span to a card title when a product matches', () => {
    document.body.innerHTML = cardHtml('GA', 'A title', 'A body');
    upgradeHighlightBadges(buildDeps(), [matchAlways('p1', 'Product One', 'p1', 'matched')]);
    const span = document.querySelector('h3 .insights-tag');
    expect(span?.textContent).toBe('Product One');
    expect(span?.getAttribute('data-product-id')).toBe('p1');
    expect(span?.getAttribute('title')).toBe('matched · click for full brief');
    expect(span?.classList.contains('expandable')).toBe(true);
    expect(span?.classList.contains('p1')).toBe(true);
  });

  it('does NOT append a badge to cards whose product does not match', () => {
    document.body.innerHTML = cardHtml('GA', 'unrelated', 'unrelated');
    upgradeHighlightBadges(buildDeps(), [matchKeyword('p1', 'P1', 'p1', 'webhook', 'r')]);
    expect(document.querySelectorAll('.insights-tag').length).toBe(0);
  });

  it('appends one badge per matching product (multi-product)', () => {
    document.body.innerHTML = cardHtml('GA', 'webhook + lambda', 'something about lambdas');
    upgradeHighlightBadges(buildDeps(), [
      matchKeyword('p1', 'P1', 'p1', 'webhook', 'mentions webhook'),
      matchKeyword('p2', 'P2', 'p2', 'lambda', 'mentions lambda'),
    ]);
    const badges = document.querySelectorAll('h3 .insights-tag');
    expect(badges.length).toBe(2);
    const ids = Array.from(badges).map((b) => b.getAttribute('data-product-id'));
    expect(ids).toEqual(expect.arrayContaining(['p1', 'p2']));
  });

  it('is idempotent — re-running does not duplicate badges', () => {
    document.body.innerHTML = cardHtml('GA', 'title', 'body');
    const deps = buildDeps();
    const product = matchAlways('p1', 'Product One', 'p1', 'matched');
    upgradeHighlightBadges(deps, [product]);
    upgradeHighlightBadges(deps, [product]);
    expect(document.querySelectorAll('.insights-tag').length).toBe(1);
  });

  it('matches against tag + title + body combined', () => {
    document.body.innerHTML = cardHtml('Important Tag', 'plain title', 'plain body');
    const seen: string[] = [];
    upgradeHighlightBadges(buildDeps(), [
      {
        id: 'p1',
        label: 'P1',
        cssMod: 'p1',
        match: (text) => {
          seen.push(text);
          return null;
        },
      },
    ]);
    // Tag is wrapped in brackets, body separated by em-dash
    expect(seen[0]).toContain('[Important Tag]');
    expect(seen[0]).toContain('plain title');
    expect(seen[0]).toContain('— plain body');
  });

  it('skips a card without an <h3> title', () => {
    document.body.innerHTML = '<div class="hl-card"><p>body only</p></div>';
    upgradeHighlightBadges(buildDeps(), [matchAlways('p1', 'P1', 'p1', 'r')]);
    expect(document.querySelectorAll('.insights-tag').length).toBe(0);
  });

  it('omits the cssMod class when product.cssMod is empty', () => {
    document.body.innerHTML = cardHtml('GA', 'title', 'body');
    upgradeHighlightBadges(buildDeps(), [matchAlways('p1', 'P1', '', 'r')]);
    const span = document.querySelector('h3 .insights-tag');
    expect(span?.className).toBe('insights-tag expandable');
  });

  it('does not match against an already-injected badge text (text-without-badges)', () => {
    document.body.innerHTML = cardHtml('GA', 'unrelated', 'unrelated');
    document
      .querySelector('h3')
      ?.insertAdjacentHTML(
        'beforeend',
        ' <span class="insights-tag" data-product-id="pre">PreExisting</span>',
      );
    let seenText = '';
    upgradeHighlightBadges(buildDeps(), [
      {
        id: 'p1',
        label: 'P1',
        cssMod: 'p1',
        match: (text) => {
          seenText = text;
          return null;
        },
      },
    ]);
    // The pre-existing badge label "PreExisting" should NOT contaminate the match text.
    expect(seenText).not.toContain('PreExisting');
  });
});
