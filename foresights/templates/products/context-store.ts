/**
 * Per-product context store — backs runtime context refresh.
 *
 * Each product can opt into "refresh from repo" via its `contextRefresh`
 * config. When the user clicks the ↻ button, the fetcher pulls fresh data
 * (CLAUDE.md content, src directory listings, etc.), the result is hashed
 * into a `fingerprint`, and the whole bundle is persisted here.
 *
 * The brief panel reads the fingerprint via `effectiveFingerprint` — that's
 * what flows into `fetchBrief`'s cache key. Bumping the fingerprint
 * invalidates every cached brief for that product so the next click
 * re-runs Haiku with the up-to-date system context.
 *
 * Layout map shape is intentionally opaque (`unknown`) — different fetcher
 * kinds produce different shapes (CDK Insights ships service→subfolder map;
 * Last Command ships a flat repo list; future kinds can ship anything).
 * The consumer (cc-prompts builder) knows how to interpret its own product's
 * layoutMap.
 */

import type { Deps } from '../types';

export interface StoredContext {
  /** Per-product layout map — opaque JSON, structure depends on fetcher kind. */
  readonly layoutMap: unknown;
  /** Hash of the layoutMap — used as the brief cache fingerprint. */
  readonly fingerprint: string;
  /** ISO timestamp of when this context was fetched. */
  readonly fetchedAt: string;
  /** Optional count of items in the layout (used for status display). */
  readonly itemCount?: number;
}

/** Build the localStorage key for a (topic, product) pair. */
export const contextKey = (topicSlug: string, productId: string): string =>
  `foresights:context:${topicSlug}:${productId}`;

/** Read the stored context for a product. Returns null if absent or unparseable. */
export const getStoredContext = (
  deps: Pick<Deps, 'storage'>,
  topicSlug: string,
  productId: string,
): StoredContext | null => {
  try {
    const raw = deps.storage.getItem(contextKey(topicSlug, productId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Partial<StoredContext>;
    if (typeof obj.fingerprint !== 'string') return null;
    if (typeof obj.fetchedAt !== 'string') return null;
    return {
      layoutMap: obj.layoutMap,
      fingerprint: obj.fingerprint,
      fetchedAt: obj.fetchedAt,
      ...(typeof obj.itemCount === 'number' ? { itemCount: obj.itemCount } : {}),
    };
  } catch {
    return null;
  }
};

/** Persist the stored context. Silently no-ops on quota / write errors. */
export const setStoredContext = (
  deps: Pick<Deps, 'storage'>,
  topicSlug: string,
  productId: string,
  ctx: StoredContext,
): void => {
  try {
    deps.storage.setItem(contextKey(topicSlug, productId), JSON.stringify(ctx));
  } catch {
    // ignore quota / write errors
  }
};

/**
 * Effective fingerprint for a product. Returns the stored fingerprint if
 * the user has refreshed context, otherwise `'static'` so cached briefs key
 * stably against the wizard-baked context.
 */
export const effectiveFingerprint = (
  deps: Pick<Deps, 'storage'>,
  topicSlug: string,
  productId: string,
): string => getStoredContext(deps, topicSlug, productId)?.fingerprint ?? 'static';

/**
 * Effective layout map for a product. Returns the stored map if available,
 * otherwise null. Consumers (CC prompt builders) merge this with baked-in
 * defaults from their wizard-injected `repoMap` const.
 */
export const effectiveLayoutMap = (
  deps: Pick<Deps, 'storage'>,
  topicSlug: string,
  productId: string,
): unknown => getStoredContext(deps, topicSlug, productId)?.layoutMap ?? null;

/**
 * Compute a tiny non-cryptographic hash for fingerprint generation. djb2 —
 * same algorithm v0.1 used. Stable, fast, sufficient for "did this thing
 * change?" purposes (not for security).
 */
export const fingerprintOf = (input: string): string => {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  // Return as unsigned base36 — shorter than hex, stable across runs.
  return (h >>> 0).toString(36);
};
