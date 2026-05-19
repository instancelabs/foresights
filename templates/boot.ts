/**
 * Boot — load() body and init wiring.
 *
 * Houses the LOAD_BODY sentinel. The wizard injects per-source fetch tasks
 * between the sentinels at build time. Phase 4 wires up the spotlight slice
 * so the un-substituted bundle has demonstrable behaviour.
 */

import { TOPIC_SLUG } from './config';
import { initSpotlight } from './spotlight/carousel';
import { SPOTLIGHTS } from './spotlight/data';
import type { Deps } from './types';

export const boot = async (deps: Deps): Promise<void> => {
  // FORESIGHTS_START:LOAD_BODY
  // Spotlight carousel — pure DOM wiring; safe to call before live data fetches.
  initSpotlight(deps, {
    spotlights: SPOTLIGHTS,
    topicSlug: TOPIC_SLUG,
    products: [],
  });

  // Live data fetch tasks per source go here. The wizard injects per-source
  // code into this block when sources are configured. When products.length > 0
  // the wizard also appends updateBriefAllButton() at the end.
  await Promise.resolve();
  // FORESIGHTS_END:LOAD_BODY
};
