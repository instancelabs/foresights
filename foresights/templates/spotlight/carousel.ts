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
import type { Cadence, Deps, Product, Spotlight } from '../types';
import { dayOfYear, todayLocalDate } from '../util/date';
import { escHtml, safeUrl } from '../util/escape';

export interface SpotlightConfig {
  readonly spotlights: readonly Spotlight[];
  readonly topicSlug: string;
  readonly products: readonly Product[];
  /** Spotlight rotation cadence. Absent → `'daily'` (the default). */
  readonly cadence?: Cadence;
}

interface PersistedSpotlight {
  readonly index: number;
  /** The rotation-period key in force when the index was persisted. */
  readonly date: string;
}

/** Storage key — namespaced per topic so multiple dashboards coexist. */
export const storageKey = (topicSlug: string): string => `${topicSlug}-news.spotlight`;

const isValidPersisted = (v: unknown): v is PersistedSpotlight => {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as { index?: unknown; date?: unknown };
  return Number.isInteger(obj.index) && typeof obj.date === 'string';
};

/** 0-based week-of-year, derived from the 1-indexed day-of-year. */
const weekOfYear = (d: Date): number => Math.floor((dayOfYear(d) - 1) / 7);

/**
 * The rotation-period key persisted alongside the spotlight index. A
 * persisted entry is honoured only while its key still matches the current
 * period, so the auto-rotation rolls over when the key changes:
 *   - `daily`     → the local calendar date (rolls at midnight)
 *   - `weekly`    → year + week-of-year (rolls at the week boundary)
 *   - `on-demand` → a constant (never rolls; the user's choice sticks)
 *
 * For `'daily'` this is exactly `todayLocalDate`, so a daily dashboard's
 * persistence behaviour is identical to pre-cadence builds.
 */
export const rotationPeriodKey = (cadence: Cadence, now: () => Date): string => {
  if (cadence === 'on-demand') return 'static';
  if (cadence === 'weekly') {
    const d = now();
    return `${d.getFullYear()}-W${weekOfYear(d)}`;
  }
  return todayLocalDate(now);
};

/**
 * The auto-rotation index for a cadence, used on first open before any user
 * navigation. `daily` rotates by day-of-year, `weekly` by week-of-year, and
 * `on-demand` always starts at the first spotlight.
 */
export const autoRotationIndex = (cadence: Cadence, now: () => Date, len: number): number => {
  if (len === 0) return 0;
  if (cadence === 'on-demand') return 0;
  if (cadence === 'weekly') return weekOfYear(now()) % len;
  return dayOfYear(now()) % len;
};

/**
 * Read the persisted spotlight index. Returns null if storage is empty,
 * the payload is malformed, or the persisted entry is from a previous
 * rotation period — daily rolls over at midnight, weekly at the week
 * boundary; `on-demand` never rolls over.
 */
export const hydrateSpotlightIndex = (
  deps: Pick<Deps, 'storage' | 'now'>,
  topicSlug: string,
  cadence: Cadence = 'daily',
): number | null => {
  try {
    const raw = deps.storage.getItem(storageKey(topicSlug));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isValidPersisted(parsed) && parsed.date === rotationPeriodKey(cadence, deps.now)) {
      return parsed.index;
    }
  } catch {
    // Malformed JSON or storage error — fall through to null.
  }
  return null;
};

/** Persist the current spotlight index keyed by the cadence's rotation period. */
export const persistSpotlightIndex = (
  deps: Pick<Deps, 'storage' | 'now'>,
  topicSlug: string,
  index: number,
  cadence: Cadence = 'daily',
): void => {
  try {
    const payload: PersistedSpotlight = { index, date: rotationPeriodKey(cadence, deps.now) };
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
    moreEl.href = safeUrl(spotlight.url);
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
    // When the spotlight declares a productId, force that product's flag
    // deterministically — a curated spotlight is deliberately about one
    // service, so regex auto-matching (which can miss or match several) is
    // unreliable. Absent productId → unchanged regex auto-match.
    const baseMeta = { section: 'spotlight', stableId, title: spotlight.title, url: spotlight.url };
    const targeted = spotlight.productId
      ? products.find((p) => p.id === spotlight.productId)
      : undefined;
    const flags = targeted
      ? [{ ...baseMeta, productId: targeted.id, reason: 'Spotlight targets this service' }]
      : flagsForText(matchText, baseMeta, products);
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
  const cadence: Cadence = config.cadence ?? 'daily';

  const initial =
    hydrateSpotlightIndex(deps, topicSlug, cadence) ??
    autoRotationIndex(cadence, deps.now, spotlights.length);
  const state = { index: wrapIndex(initial, spotlights.length) };

  const renderAndPersist = (nextIndex: number): void => {
    const wrapped = wrapIndex(nextIndex, spotlights.length);
    state.index = wrapped;
    const spotlight = spotlights[wrapped];
    if (!spotlight) return;
    renderSpotlight(deps, spotlight, wrapped, spotlights.length, products);
    persistSpotlightIndex(deps, topicSlug, wrapped, cadence);
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
