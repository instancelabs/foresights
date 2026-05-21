/**
 * Per-product Claude Code prompt builders — the CC_BUILDERS sentinel.
 *
 * The wizard emits one `buildXxxCcPrompt` arrow fn per product between
 * the sentinels at build time.
 *
 * Status: Phase 6 ports the real impl.
 */

import type { BuildCcPromptArgs } from '../types';

export type CcPromptBuilder = (args: BuildCcPromptArgs) => string;

// FORESIGHTS_START:PRODUCTS_CONFIG:CC_BUILDERS
export const CC_PROMPT_BUILDERS: Readonly<Record<string, CcPromptBuilder>> = {};
// FORESIGHTS_END:PRODUCTS_CONFIG:CC_BUILDERS
