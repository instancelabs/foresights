/**
 * Spotlight carousel — hydration, rotation, navigation handlers.
 *
 * The proven aws-cdk-news dashboard's spotlight section rotates by
 * day-of-year on first visit and persists the user's manual choice to
 * localStorage for the rest of the day. This module ports that behaviour
 * to the typed/DI architecture, with internal helpers exported so each
 * concern (hydrate, persist, render, wrap-around) is independently
 * testable.
 */

import { flagBadgeHtml } from '../products/badge';
import { flagsForText } from '../products/matcher';
import type { Deps, Product, Spotlight } from '../types';
import { dayOfYear, todayLocalDate } from '../util/date';
import { escHtml } from '../util/escape';

export interface SpotlightConfig {
  readonly spotlights: readonly Spotlight[];
  readonly topicSlug: string;
  readonly products: readonly Product[];
}

interface PersistedSpotlight {
  readonly index: number;
  readonly date: string;
}

/** Storage key — namespaced per topic so multiple dashboards coexist. */
export const storageKey = (topicSlug: string): string => `${topicSlug}-news.spotlight`;

const isValidPersisted = (v: unknown): v is PersistedSpotlight => {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as { index?: unknown; date?: unknown };
  return Number.isInteger(obj.index) && typeof obj.date === 'string';
};

/**
 * Read the persisted spotlight index. Returns null if storage is empty,
 * the payload is malformed, or the persisted entry is from a previous
 * calendar day (so the spotlight rolls over at midnight).
 */
export const hydrateSpotlightIndex = (
  deps: Pick<Deps, 'storage' | 'now'>,
  topicSlug: string,
): number | null => {
  try {
    const raw = deps.storage.getItem(storageKey(topicSlug));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isValidPersisted(parsed) && parsed.date === todayLocalDate(deps.now)) {
      return parsed.index;
    }
  } catch {
    // Malformed JSON or storage error — fall through to null.
  }
  return null;
};

/** Persist the current spotlight index keyed by today's local date. */
export const persistSpotlightIndex = (
  deps: Pick<Deps, 'storage' | 'now'>,
  topicSlug: string,
  index: number,
): void => {
  try {
    const payload: PersistedSpotlight = { index, date: todayLocalDate(deps.now) };
    deps.storage.setItem(storageKey(topicSlug), JSON.stringify(payload));
  } catch {
    // Storage write error — non-fatal; user just loses persistence.
  }
};

/** Modulo that handles negative numerators (so -1 wraps to length-1). */
export const wrapIndex = (i: number, len: number): number => ((i % len) + len) % len;

/** Strip HTML tags from a string and normalise whitespace. */
const stripHtml = (h: string): string =>
  h
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Render a spotlight into the DOM. Pure DOM mutation; no side effects beyond it. */
export const renderSpotlight = (
  deps: Pick<Deps, 'document'>,
  spotlight: Spotlight,
  index: number,
  total: number,
  products: readonly Product[],
): void => {
  const doc = deps.document;

  const setText = (id: string, value: string): void => {
    const el = doc.getElementById(id);
    if (el) el.textContent = value;
  };
  const setHtml = (id: string, value: string): void => {
    const el = doc.getElementById(id);
    if (el) el.innerHTML = value;
  };

  setText('sl-tag', spotlight.tag);
  setHtml('sl-title', escHtml(spotlight.title));
  setHtml('sl-summary', spotlight.summary);
  setHtml('sl-trick', spotlight.trick);
  setHtml('sl-code', spotlight.code);
  setHtml('sl-why', spotlight.why);
  setText('sl-pager', `${index + 1} / ${total}`);

  const moreEl = doc.getElementById('sl-more');
  if (moreEl instanceof HTMLAnchorElement) {
    moreEl.href = spotlight.url;
  }

  // Clear any brief panel left over from the previous spotlight
  const card = doc.querySelector('.sl-card');
  if (card) {
    const oldPanel = card.querySelector(':scope > .insights-brief');
    if (oldPanel) oldPanel.remove();
  }

  // Recompute product flags for this spotlight's text. Emit through
  // flagBadgeHtml so the spotlight badges share the same data-* contract
  // as the renderers — meaning clicks open the brief panel beneath the
  // spotlight card just like they do on PR / release / RSS items. The
  // chip text is the PRODUCT LABEL (e.g. "CDK Insights"); the matcher
  // reason becomes the hover tooltip via flagBadgeAttrs.
  const flagsEl = doc.getElementById('sl-flags');
  if (flagsEl) {
    const matchText = `[${spotlight.tag}] ${spotlight.title} — ${stripHtml(spotlight.summary)} ${stripHtml(spotlight.trick)} ${stripHtml(spotlight.why)}`;
    const stableId = `spotlight:${spotlight.title
      .replace(/[^\w]+/g, '-')
      .toLowerCase()
      .slice(0, 60)}`;
    const flags = flagsForText(
      matchText,
      { section: 'spotlight', stableId, title: spotlight.title, url: spotlight.url },
      products,
    );
    flagsEl.innerHTML = flags
      .map((f) => {
        const product = products.find((p) => p.id === f.productId);
        const cssMod = product?.cssMod ?? '';
        const label = product?.label ?? f.productId;
        return flagBadgeHtml(f, { kind: 'spotlight', text: matchText }, label, cssMod);
      })
      .join('');
  }
};

/**
 * Wire up the spotlight carousel:
 *   1. hydrate the index from storage or compute today's day-of-year rotation
 *   2. render the initial slide
 *   3. attach prev/next click and ←/→ keyboard handlers
 *
 * Safe to call with an empty `spotlights` array — returns early.
 */
export const initSpotlight = (deps: Deps, config: SpotlightConfig): void => {
  const { spotlights, topicSlug, products } = config;
  if (spotlights.length === 0) return;

  const initial =
    hydrateSpotlightIndex(deps, topicSlug) ?? dayOfYear(deps.now()) % spotlights.length;
  const state = { index: wrapIndex(initial, spotlights.length) };

  const renderAndPersist = (nextIndex: number): void => {
    const wrapped = wrapIndex(nextIndex, spotlights.length);
    state.index = wrapped;
    const spotlight = spotlights[wrapped];
    if (!spotlight) return;
    renderSpotlight(deps, spotlight, wrapped, spotlights.length, products);
    persistSpotlightIndex(deps, topicSlug, wrapped);
  };

  renderAndPersist(state.index);

  const prev = deps.document.getElementById('sl-prev');
  const next = deps.document.getElementById('sl-next');
  prev?.addEventListener('click', () => renderAndPersist(state.index - 1));
  next?.addEventListener('click', () => renderAndPersist(state.index + 1));

  deps.document.addEventListener('keydown', (e: Event) => {
    const ke = e as KeyboardEvent;
    const target = ke.target as { tagName?: string } | null;
    if (target?.tagName && /input|textarea/i.test(target.tagName)) return;
    if (ke.key === 'ArrowLeft') renderAndPersist(state.index - 1);
    if (ke.key === 'ArrowRight') renderAndPersist(state.index + 1);
  });
};
