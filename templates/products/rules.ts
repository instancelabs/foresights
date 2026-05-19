/**
 * Per-product matcher rules — the RULES sentinel.
 *
 * The wizard emits one `<productId>_INSIGHTS_RULES: Rule[]` per product
 * between the sentinels at build time.
 *
 * Status: Phase 6 ports the real impl.
 */

import type { Rule } from '../types';

// FORESIGHTS_START:PRODUCTS_CONFIG:RULES
export const RULES: Readonly<Record<string, readonly Rule[]>> = {};
// FORESIGHTS_END:PRODUCTS_CONFIG:RULES
