/**
 * Per-product Haiku system prompts — the PROMPTS sentinel.
 *
 * The wizard emits one `<productId>_INSIGHTS_PROMPT: string` per product
 * between the sentinels at build time.
 *
 * Status: Phase 6 ports the real impl.
 */

// FORESIGHTS_START:PRODUCTS_CONFIG:PROMPTS
export const PROMPTS: Readonly<Record<string, string>> = {};
// FORESIGHTS_END:PRODUCTS_CONFIG:PROMPTS
