/**
 * Boot — load() body and init wiring.
 *
 * Houses the LOAD_BODY sentinel. The wizard injects per-source fetch tasks
 * between the sentinels at build time.
 *
 * Imports below cover every symbol the wizard's LOAD_BODY generator might
 * reference (callTool, renderReleases/Rfcs/Prs/Error, and their type names).
 * In the un-substituted template, several of these are unused — esbuild
 * tree-shakes them out of the final bundle. In a substituted dashboard, the
 * LOAD_BODY generator emits one try/catch per source using exactly these
 * symbols, so all imports are needed.
 *
 * Note: tsx/biome don't flag unused imports here because the LOAD_BODY
 * sentinel contains `// @ts-expect` markers and biome's noUnusedImports
 * isn't strict against template files. If the wizard does NOT configure any
 * sources, the un-used imports still tree-shake to nothing at bundle time.
 */

import { TOPIC_SLUG } from './config';
import { initDigestPanel } from './digest/panel';
import { initDigestBar } from './digest/wire-bar';
import { callTool } from './mcp/call-tool';
import { fetchRss } from './mcp/fetch-rss';
import { initBriefAllBar } from './products/brief-all';
import { CC_PROMPT_BUILDERS } from './products/cc-prompts';
import { PRODUCTS } from './products/config';
import { initContextRefreshBar } from './products/context-refresh';
import { CONTEXT_REFRESHERS } from './products/context-refresh-config';
import { effectiveFingerprint } from './products/context-store';
import { initBriefPanel } from './products/panel';
import { PROMPTS } from './products/prompts';
import { renderError } from './render/error';
import { renderRfcs } from './render/issues';
import { renderPrs } from './render/prs';
import { renderReleases } from './render/releases';
import { renderRssItems } from './render/rss';
import { initSpotlight } from './spotlight/carousel';
import { SPOTLIGHTS } from './spotlight/data';
import type { Deps, Issue, PullRequest, Release } from './types';

// Reference the imports so the un-substituted bundle's tsc pass doesn't
// flag them as unused. The wizard's LOAD_BODY substitution overwrites this
// const with real per-source fetch + render calls. The const value never
// runs at runtime — it's just a type-level handshake with the bundler.
const _LOAD_BODY_IMPORTS_HOLD: ReadonlyArray<unknown> = [
  callTool,
  fetchRss,
  renderError,
  renderRfcs,
  renderPrs,
  renderReleases,
  renderRssItems,
  initBriefPanel,
  initBriefAllBar,
  initContextRefreshBar,
  CONTEXT_REFRESHERS,
  effectiveFingerprint,
  initDigestBar,
  initDigestPanel,
  PRODUCTS,
  PROMPTS,
  CC_PROMPT_BUILDERS,
  null as unknown as Issue,
  null as unknown as PullRequest,
  null as unknown as Release,
];
void _LOAD_BODY_IMPORTS_HOLD;

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
