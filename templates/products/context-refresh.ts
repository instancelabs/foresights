/**
 * Per-product optional context-refresh fetchers — the CONTEXT_REFRESH sentinel.
 *
 * The wizard emits one fetch/render/invalidate triple per product that
 * opted into context refresh during the wizard flow. Empty if no products
 * configured refresh.
 *
 * Status: Phase 6 ports the real impl.
 */

import type { Deps } from '../types';

export interface ContextRefresher {
  readonly fetch: (deps: Deps) => Promise<string>;
  readonly invalidate: (deps: Deps) => void;
}

// FORESIGHTS_START:PRODUCTS_CONFIG:CONTEXT_REFRESH
export const CONTEXT_REFRESHERS: Readonly<Record<string, ContextRefresher>> = {};
// FORESIGHTS_END:PRODUCTS_CONFIG:CONTEXT_REFRESH
