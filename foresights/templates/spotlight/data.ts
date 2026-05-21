/**
 * Spotlight data — the SPOTLIGHTS_CONST sentinel.
 *
 * The wizard injects 6 generated Spotlight entries between the sentinels
 * at build time. The default empty array below keeps the module type-clean
 * when the un-substituted bundle is compiled.
 *
 * Status: Phase 4 ports the carousel + refresh that consume this.
 */

import type { Spotlight } from '../types';

// FORESIGHTS_START:SPOTLIGHTS_CONST
export const SPOTLIGHTS: readonly Spotlight[] = [];
// FORESIGHTS_END:SPOTLIGHTS_CONST
