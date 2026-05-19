/**
 * Products config — the PRODUCTS_CONST sentinel.
 *
 * The wizard injects one entry per user-configured product between the
 * sentinels at build time. Empty array = no flagging machinery emitted.
 *
 * Status: Phase 6 ports the real impl.
 */

import type { Product } from '../types';

// FORESIGHTS_START:PRODUCTS_CONFIG:PRODUCTS_CONST
export const PRODUCTS: Readonly<Record<string, Product>> = {};
// FORESIGHTS_END:PRODUCTS_CONFIG:PRODUCTS_CONST
