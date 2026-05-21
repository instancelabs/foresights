/**
 * Generic per-product matcher — flagsForText(text, baseMeta, products).
 * Status: Phase 6 ports the real impl.
 */

import type { Flag, FlagMeta, Product } from '../types';

export const flagsForText = (
  text: string,
  baseMeta: FlagMeta,
  products: readonly Product[],
): readonly Flag[] => {
  return products.flatMap((p) => {
    const reason = p.match(text);
    return reason ? [{ ...baseMeta, productId: p.id, reason }] : [];
  });
};
