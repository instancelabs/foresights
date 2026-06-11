// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deps, Product, Spotlight } from '../types';
import { createInMemoryStorage } from '../util/storage';
import {
  autoRotationIndex,
  hydrateSpotlightIndex,
  initSpotlight,
  persistSpotlightIndex,
  renderSpotlight,
  rotationPeriodKey,
  storageKey,
  wrapIndex,
} from './carousel';

const sampleSpotlights: readonly Spotlight[] = [
  {
    tag: 'Tag A',
    title: 'First Spotlight',
    summary: 'Summary <code>A</code>.',
    trick: 'Trick A.',
    code: '<span class="k">const</span> x = 1;',
    why: 'Why A.',
    url: 'https://example.com/a',
  },
  {
    tag: 'Tag B',
    title: 'Second Spotlight',
    summary: 'Summary <code>B</code>.',
    trick: 'Trick B.',
    code: '<span class="k">const</span> y = 2;',
    why: 'Why B.',
    url: 'https://example.com/b',
  },
  {
    tag: 'Tag C',
    title: 'Third Spotlight',
    summary: 'Summary C.',
    trick: 'Trick C.',
    code: '<span class="k">const</span> z = 3;',
    why: 'Why C.',
    url: 'https://example.com/c',
  },
];

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
  document.body.innerHTML = `
    <div class="sl-card">
      <span id="sl-tag"></span>
      <h3 id="sl-title"></h3>
      <p id="sl-summary"></p>
      <p id="sl-trick"></p>
      <pre id="sl-code"></pre>
      <p id="sl-why"></p>
      <a id="sl-more"></a>
      <span id="sl-pager"></span>
      <div id="sl-flags"></div>
      <button id="sl-prev" type="button">Prev</button>
      <button id="sl-next" type="button">Next</button>
    </div>
  `;
};

describe('wrapIndex', () => {
  it('returns the input when in-range', () => {
    expect(wrapIndex(2, 5)).toBe(2);
  });

  it('wraps negative indexes from the end', () => {
    expect(wrapIndex(-1, 5)).toBe(4);
    expect(wrapIndex(-6, 5)).toBe(4);
  });

  it('wraps past-end indexes from the start', () => {
    expect(wrapIndex(7, 5)).toBe(2);
    expect(wrapIndex(10, 5)).toBe(0);
  });
});

describe('storageKey', () => {
  it('namespaces by topic slug', () => {
    expect(storageKey('aws-cdk')).toBe('aws-cdk-news.spotlight');
    expect(storageKey('rust-async')).toBe('rust-async-news.spotlight');
  });
});

describe('hydrateSpotlightIndex / persistSpotlightIndex', () => {
  let deps: Deps;

  beforeEach(() => {
    deps = buildDeps();
  });

  it('returns null when storage is empty', () => {
    expect(hydrateSpotlightIndex(deps, 'topic')).toBeNull();
  });

  it('round-trips an index persisted today', () => {
    persistSpotlightIndex(deps, 'topic', 3);
    expect(hydrateSpotlightIndex(deps, 'topic')).toBe(3);
  });

  it('returns null when the persisted entry is from a previous day', () => {
    deps.storage.setItem('topic-news.spotlight', JSON.stringify({ index: 5, date: '2026-01-01' }));
    expect(hydrateSpotlightIndex(deps, 'topic')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    deps.storage.setItem('topic-news.spotlight', 'not json');
    expect(hydrateSpotlightIndex(deps, 'topic')).toBeNull();
  });

  it('returns null for valid JSON of wrong shape', () => {
    deps.storage.setItem('topic-news.spotlight', JSON.stringify({ foo: 'bar' }));
    expect(hydrateSpotlightIndex(deps, 'topic')).toBeNull();
  });
});

describe('renderSpotlight', () => {
  let deps: Deps;

  beforeEach(() => {
    deps = buildDeps();
    setupDom();
  });

  it('populates the spotlight DOM elements', () => {
    const first = sampleSpotlights[0];
    if (!first) throw new Error('sampleSpotlights[0] missing');
    renderSpotlight(deps, first, 0, sampleSpotlights.length, []);

    expect(document.getElementById('sl-tag')?.textContent).toBe('Tag A');
    expect(document.getElementById('sl-title')?.innerHTML).toBe('First Spotlight');
    expect(document.getElementById('sl-summary')?.innerHTML).toBe('Summary <code>A</code>.');
    expect(document.getElementById('sl-code')?.innerHTML).toContain('class="k"');
    expect(document.getElementById('sl-pager')?.textContent).toBe('1 / 3');
  });

  it('escapes the title (prevents XSS)', () => {
    const base = sampleSpotlights[0];
    if (!base) throw new Error('sampleSpotlights[0] missing');
    const malicious: Spotlight = { ...base, title: '<script>alert(1)</script>' };
    renderSpotlight(deps, malicious, 0, 1, []);
    expect(document.getElementById('sl-title')?.innerHTML).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('sets the more-link href to the spotlight URL', () => {
    const first = sampleSpotlights[0];
    if (!first) throw new Error('sampleSpotlights[0] missing');
    renderSpotlight(deps, first, 0, sampleSpotlights.length, []);
    const link = document.getElementById('sl-more') as HTMLAnchorElement | null;
    expect(link?.href).toBe('https://example.com/a');
  });

  it('updates the pager for the second slide', () => {
    const second = sampleSpotlights[1];
    if (!second) throw new Error('sampleSpotlights[1] missing');
    renderSpotlight(deps, second, 1, sampleSpotlights.length, []);
    expect(document.getElementById('sl-pager')?.textContent).toBe('2 / 3');
  });
});

describe('renderSpotlight — productId targeting', () => {
  let deps: Deps;

  // STORM never matches via regex; ALLIANCE matches text containing "alliance".
  const STORM: Product = { id: 'storm', label: 'Storm', cssMod: 'storm', match: () => null };
  const ALLIANCE: Product = {
    id: 'alliance',
    label: 'Alliance',
    cssMod: 'alliance',
    match: (t) => (/alliance/i.test(t) ? 'mentions alliance' : null),
  };

  const badges = (): readonly Element[] =>
    Array.from(document.getElementById('sl-flags')?.children ?? []);

  beforeEach(() => {
    deps = buildDeps();
    setupDom();
  });

  it('forces exactly one badge for the mapped product even when its regex does not match', () => {
    const base = sampleSpotlights[0];
    if (!base) throw new Error('sampleSpotlights[0] missing');
    // Prose contains neither "storm" nor "alliance", so regex auto-match would
    // emit zero badges — but productId pins it to STORM.
    const sp: Spotlight = { ...base, productId: 'storm' };
    renderSpotlight(deps, sp, 0, 1, [STORM, ALLIANCE]);
    expect(badges()).toHaveLength(1);
    expect(badges()[0]?.textContent).toBe('Storm');
    expect(badges()[0]?.className).toContain('storm');
  });

  it('regex auto-matches when no productId is set (behaviour unchanged)', () => {
    const base = sampleSpotlights[0];
    if (!base) throw new Error('sampleSpotlights[0] missing');
    // No productId; prose mentions "alliance" so only ALLIANCE flags.
    const sp: Spotlight = { ...base, title: 'Cross-server alliance scrim' };
    renderSpotlight(deps, sp, 0, 1, [STORM, ALLIANCE]);
    expect(badges()).toHaveLength(1);
    expect(badges()[0]?.textContent).toBe('Alliance');
  });

  it('emits no badge when no productId is set and nothing matches', () => {
    const base = sampleSpotlights[0];
    if (!base) throw new Error('sampleSpotlights[0] missing');
    renderSpotlight(deps, base, 0, 1, [STORM, ALLIANCE]);
    expect(badges()).toHaveLength(0);
  });

  it('falls back to regex auto-match when productId names an unknown product', () => {
    const base = sampleSpotlights[0];
    if (!base) throw new Error('sampleSpotlights[0] missing');
    const sp: Spotlight = { ...base, title: 'Cross-server alliance scrim', productId: 'ghost' };
    renderSpotlight(deps, sp, 0, 1, [STORM, ALLIANCE]);
    expect(badges()).toHaveLength(1);
    expect(badges()[0]?.textContent).toBe('Alliance');
  });

  it('uses the product matcher reason on the forced flag when the regex hits', () => {
    const base = sampleSpotlights[0];
    if (!base) throw new Error('sampleSpotlights[0] missing');
    const sp: Spotlight = { ...base, title: 'Cross-server alliance scrim', productId: 'alliance' };
    renderSpotlight(deps, sp, 0, 1, [STORM, ALLIANCE]);
    expect(badges()[0]?.getAttribute('title')).toContain('mentions alliance');
  });

  it('uses a product-named fallback reason when the regex misses', () => {
    const base = sampleSpotlights[0];
    if (!base) throw new Error('sampleSpotlights[0] missing');
    const sp: Spotlight = { ...base, productId: 'storm' }; // STORM.match always returns null
    renderSpotlight(deps, sp, 0, 1, [STORM, ALLIANCE]);
    expect(badges()[0]?.getAttribute('title')).toContain('Curated spotlight for Storm');
  });
});

describe('initSpotlight', () => {
  let deps: Deps;

  beforeEach(() => {
    deps = buildDeps();
    setupDom();
  });

  it('returns early without crashing on empty spotlights', () => {
    expect(() =>
      initSpotlight(deps, { spotlights: [], topicSlug: 't', products: [] }),
    ).not.toThrow();
    expect(document.getElementById('sl-tag')?.textContent).toBe('');
  });

  it('renders the initial slide from day-of-year when no persisted index', () => {
    initSpotlight(deps, {
      spotlights: sampleSpotlights,
      topicSlug: 'topic',
      products: [],
    });
    // 2026-05-19 is day 139 of the year. 139 % 3 = 1 → second spotlight.
    expect(document.getElementById('sl-tag')?.textContent).toBe('Tag B');
  });

  it('respects a persisted index from today', () => {
    persistSpotlightIndex(deps, 'topic', 2);
    initSpotlight(deps, {
      spotlights: sampleSpotlights,
      topicSlug: 'topic',
      products: [],
    });
    expect(document.getElementById('sl-tag')?.textContent).toBe('Tag C');
  });

  it('advances to the next slide on sl-next click', () => {
    persistSpotlightIndex(deps, 'topic', 0);
    initSpotlight(deps, {
      spotlights: sampleSpotlights,
      topicSlug: 'topic',
      products: [],
    });
    expect(document.getElementById('sl-tag')?.textContent).toBe('Tag A');
    document.getElementById('sl-next')?.click();
    expect(document.getElementById('sl-tag')?.textContent).toBe('Tag B');
  });

  it('wraps from last to first on sl-next', () => {
    persistSpotlightIndex(deps, 'topic', 2);
    initSpotlight(deps, {
      spotlights: sampleSpotlights,
      topicSlug: 'topic',
      products: [],
    });
    expect(document.getElementById('sl-tag')?.textContent).toBe('Tag C');
    document.getElementById('sl-next')?.click();
    expect(document.getElementById('sl-tag')?.textContent).toBe('Tag A');
  });

  it('wraps from first to last on sl-prev', () => {
    persistSpotlightIndex(deps, 'topic', 0);
    initSpotlight(deps, {
      spotlights: sampleSpotlights,
      topicSlug: 'topic',
      products: [],
    });
    document.getElementById('sl-prev')?.click();
    expect(document.getElementById('sl-tag')?.textContent).toBe('Tag C');
  });

  it('persists the index after navigation', () => {
    persistSpotlightIndex(deps, 'topic', 0);
    initSpotlight(deps, {
      spotlights: sampleSpotlights,
      topicSlug: 'topic',
      products: [],
    });
    document.getElementById('sl-next')?.click();
    expect(hydrateSpotlightIndex(deps, 'topic')).toBe(1);
  });

  it('responds to ArrowRight key events', () => {
    persistSpotlightIndex(deps, 'topic', 0);
    initSpotlight(deps, {
      spotlights: sampleSpotlights,
      topicSlug: 'topic',
      products: [],
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(document.getElementById('sl-tag')?.textContent).toBe('Tag B');
  });

  it('ignores arrow keys when focus is on an input', () => {
    persistSpotlightIndex(deps, 'topic', 0);
    initSpotlight(deps, {
      spotlights: sampleSpotlights,
      topicSlug: 'topic',
      products: [],
    });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.getElementById('sl-tag')?.textContent).toBe('Tag A');
  });
});

describe('rotationPeriodKey', () => {
  it('daily key is the local calendar date', () => {
    expect(rotationPeriodKey('daily', FROZEN_NOW)).toBe('2026-05-19');
  });

  it('weekly key is year + week-of-year', () => {
    // 2026-05-19 is day 139 → week floor((139-1)/7) = 19.
    expect(rotationPeriodKey('weekly', FROZEN_NOW)).toBe('2026-W19');
  });

  it('on-demand key is a constant that never rolls over', () => {
    expect(rotationPeriodKey('on-demand', FROZEN_NOW)).toBe('static');
    expect(rotationPeriodKey('on-demand', () => new Date('2030-12-31T00:00:00'))).toBe('static');
  });
});

describe('autoRotationIndex', () => {
  it('daily rotates by day-of-year', () => {
    expect(autoRotationIndex('daily', FROZEN_NOW, 3)).toBe(139 % 3);
  });

  it('weekly rotates by week-of-year', () => {
    expect(autoRotationIndex('weekly', FROZEN_NOW, 3)).toBe(19 % 3);
  });

  it('on-demand always starts at the first spotlight', () => {
    expect(autoRotationIndex('on-demand', FROZEN_NOW, 3)).toBe(0);
  });

  it('returns 0 for a zero-length spotlight list', () => {
    expect(autoRotationIndex('daily', FROZEN_NOW, 0)).toBe(0);
  });
});

describe('cadence — hydrate / persist round-trip', () => {
  let deps: Deps;

  beforeEach(() => {
    deps = buildDeps();
  });

  it('weekly round-trips an index persisted in the same week', () => {
    persistSpotlightIndex(deps, 'topic', 2, 'weekly');
    expect(hydrateSpotlightIndex(deps, 'topic', 'weekly')).toBe(2);
  });

  it('weekly returns null for an entry persisted in a previous week', () => {
    deps.storage.setItem('topic-news.spotlight', JSON.stringify({ index: 5, date: '2026-W01' }));
    expect(hydrateSpotlightIndex(deps, 'topic', 'weekly')).toBeNull();
  });

  it('a daily-persisted entry is not honoured under weekly cadence', () => {
    persistSpotlightIndex(deps, 'topic', 4, 'daily'); // writes date '2026-05-19'
    expect(hydrateSpotlightIndex(deps, 'topic', 'weekly')).toBeNull();
  });

  it('on-demand round-trips and never expires by date', () => {
    persistSpotlightIndex(deps, 'topic', 1, 'on-demand'); // writes date 'static'
    expect(hydrateSpotlightIndex(deps, 'topic', 'on-demand')).toBe(1);
    // A deps fixed to a far-future date still honours the on-demand entry.
    const future: Deps = { ...deps, now: () => new Date('2030-01-01T00:00:00') };
    expect(hydrateSpotlightIndex(future, 'topic', 'on-demand')).toBe(1);
  });
});

describe('initSpotlight — cadence', () => {
  let deps: Deps;

  beforeEach(() => {
    deps = buildDeps();
    setupDom();
  });

  it('on-demand starts at the first spotlight when nothing is persisted', () => {
    initSpotlight(deps, {
      spotlights: sampleSpotlights,
      topicSlug: 'topic',
      products: [],
      cadence: 'on-demand',
    });
    expect(document.getElementById('sl-tag')?.textContent).toBe('Tag A');
  });

  it('on-demand keeps the user choice across re-init (no date rollover)', () => {
    initSpotlight(deps, {
      spotlights: sampleSpotlights,
      topicSlug: 'topic',
      products: [],
      cadence: 'on-demand',
    });
    document.getElementById('sl-next')?.click(); // → Tag B, persisted under 'static'
    expect(document.getElementById('sl-tag')?.textContent).toBe('Tag B');
    // A fresh mount re-reads the persisted index.
    setupDom();
    initSpotlight(deps, {
      spotlights: sampleSpotlights,
      topicSlug: 'topic',
      products: [],
      cadence: 'on-demand',
    });
    expect(document.getElementById('sl-tag')?.textContent).toBe('Tag B');
  });

  it('weekly rotates the initial slide by week-of-year', () => {
    initSpotlight(deps, {
      spotlights: sampleSpotlights,
      topicSlug: 'topic',
      products: [],
      cadence: 'weekly',
    });
    // 2026-05-19 → week 19. 19 % 3 = 1 → second spotlight.
    expect(document.getElementById('sl-tag')?.textContent).toBe('Tag B');
  });
});
