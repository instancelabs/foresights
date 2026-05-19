/**
 * Brief fetch + cache + render. Haiku-backed; cached in localStorage.
 * Status: Phase 6 ports the real impl.
 */

import type { Brief, Deps, FlagMeta } from '../types';

export const fetchBrief = async (
  deps: Deps,
  productId: string,
  meta: FlagMeta,
): Promise<Brief | null> => {
  void deps;
  void productId;
  void meta;
  return null;
};
