/**
 * Haiku-batched 🟢/🟡/🔴 triage with strict ≤10-item chunking.
 * Status: Phase 7 ports the real impl.
 */

import type { Deps, TriagedItem } from '../types';

export interface TriageInput {
  readonly stableId: string;
  readonly text: string;
}

export const triageBatch = async (
  deps: Deps,
  items: readonly TriageInput[],
): Promise<readonly TriagedItem[]> => {
  void deps;
  void items;
  return [];
};
