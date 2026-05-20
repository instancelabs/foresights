/**
 * Per-product context-refresh config — the CONTEXT_REFRESH sentinel host.
 *
 * The wizard substitutes the body between the sentinel markers with a
 * `CONTEXT_REFRESHERS` Record mapping productId → ContextRefreshSpec.
 * Products without a contextRefresh config get no entry. The runtime
 * (products/context-refresh.ts) reads this map to decide which products
 * get a ↻ button wired.
 *
 * Default (no products with refresh) is an empty record so the
 * un-substituted template stays valid.
 */

import type { ContextRefreshSpec } from './context-refresh';

// FORESIGHTS_START:PRODUCTS_CONFIG:CONTEXT_REFRESH
export const CONTEXT_REFRESHERS: Readonly<Record<string, ContextRefreshSpec>> = {};
// FORESIGHTS_END:PRODUCTS_CONFIG:CONTEXT_REFRESH
