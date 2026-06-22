/**
 * Generic per-product matcher — flagsForText(text, baseMeta, products).
 * Status: Phase 6 ports the real impl.
 */

import type { Flag, FlagMeta, Product } from '../types';

/**
 * Upper bound on the body length any product matcher runs against. Matchers
 * only need to detect *presence* of a keyword, not scan an entire article —
 * and the rules are user / Haiku-authored regexes that the build-time stress
 * test (wizard/validate-regexes.ts) can only sample against a fixed corpus. A
 * rule that's fine on the corpus can still backtrack catastrophically on a
 * long, crafted RSS / PR / issue body and hang the render thread. Capping the
 * input keeps any per-rule match O(cap) rather than O(unbounded).
 */
export const MAX_MATCH_LEN = 20_000;

export const flagsForText = (
  text: string,
  baseMeta: FlagMeta,
  products: readonly Product[],
): readonly Flag[] => {
  const body = text.length > MAX_MATCH_LEN ? text.slice(0, MAX_MATCH_LEN) : text;
  return products.flatMap((p) => {
    const reason = p.match(body);
    return reason ? [{ ...baseMeta, productId: p.id, reason }] : [];
  });
};
