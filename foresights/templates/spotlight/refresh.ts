/**
 * Spotlight refresh — Haiku-backed regeneration of the spotlight entries.
 *
 * The v0.1 aws-cdk-news dashboard hardcoded the data sources (aws/aws-cdk
 * releases + PRs + aws-cdk-rfcs issues). This port generalises over the
 * user's configured Source[] so a Rust async dashboard, a Kubernetes
 * operators dashboard, etc. all use the same refresh path.
 */

import { askClaude, parseJsonResponse } from '../mcp/ask-claude';
import { callTool } from '../mcp/call-tool';
import type { Deps, Source, Spotlight } from '../types';
import { validateTrustedHtml } from '../wizard/trusted-html';

export interface RefreshConfig {
  readonly topic: string;
  readonly sources: readonly Source[];
  readonly existing: readonly Spotlight[];
  readonly ghServer: string;
}

interface SampledSource {
  readonly id: string;
  readonly label: string;
  readonly kind: Source['kind'];
  readonly data: unknown;
}

/**
 * Fetch a small sample of recent activity from one source.
 *
 * Phase 10.1: GitHub kinds dispatch to the MCP tool. RSS sources return null —
 * spotlight refresh stays GitHub-only for now (Haiku tends to produce richer
 * "really cool pattern" cards from code activity than from blog post titles).
 * Future enhancement: feed RSS items in as additional context, or run a
 * second Haiku call to produce RSS-flavoured spotlights.
 */
const fetchSourceSample = async (
  deps: Pick<Deps, 'callTool'>,
  ghServer: string,
  source: Source,
): Promise<unknown> => {
  if (source.kind === 'rss') {
    return null;
  }
  const toolName = `${ghServer}__list_${source.kind}`;
  return callTool(deps, toolName, {
    owner: source.owner,
    repo: source.repo,
    ...source.args,
  });
};

/** Build the Haiku prompt for generating fresh spotlights. */
export const buildRefreshPrompt = (
  topic: string,
  existing: readonly Spotlight[],
  samples: readonly SampledSource[],
): string => {
  const sampleSummary = JSON.stringify(samples);
  const existingSummary = JSON.stringify(existing.slice(0, 3));
  return [
    `You generate "Spotlight" entries for a ${topic} news dashboard.`,
    'Each entry features one really cool pattern that experienced practitioners would find genuinely clever.',
    '',
    'Existing spotlight shape (for reference only — DO NOT reuse these; pick fresh patterns from the data):',
    existingSummary,
    '',
    'Recent activity from the configured data sources:',
    sampleSummary,
    '',
    'Generate 6 fresh spotlight entries as a JSON array. Each entry has fields: tag, title, summary, trick, code, why, url.',
    '',
    'Quality bar:',
    '- The "trick" must be a real insight ("ah, that\'s clever") — not a generic feature description.',
    '- "code" is a ~15-line plausible code sample with <span class="k">/<span class="s">/<span class="t"> highlights.',
    '- URLs must be real (use URLs from the data above or canonical project docs).',
    '- If a news item is mundane (dependency bump, typo fix), skip it.',
    '',
    'RESPOND WITH JSON ONLY — a single array of 6 objects, no prose, no markdown fences.',
  ].join('\n');
};

/**
 * Coerce one raw parsed entry into a typed `Spotlight`, dropping any field
 * that isn't a string. Crucially, the four fields the carousel renders via
 * `innerHTML` (`summary` / `trick` / `code` / `why`) are run through the same
 * build-time tag allowlist (`validateTrustedHtml`) used at wizard time — so
 * even if this live-refresh output is ever wired into the live carousel, a
 * prompt-injected Haiku response can't smuggle an `onerror=` payload into a
 * stored-XSS sink. Throws (field-named) on a disallowed tag.
 */
const toValidatedSpotlight = (raw: unknown, i: number): Spotlight => {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`refreshSpotlightsViaHaiku: entry[${i}] is not an object`);
  }
  const o = raw as Record<string, unknown>;
  const str = (k: string): string => (typeof o[k] === 'string' ? (o[k] as string) : '');
  const pid = str('productId');
  const sp: Spotlight = {
    tag: str('tag'),
    title: str('title'),
    summary: str('summary'),
    trick: str('trick'),
    code: str('code'),
    why: str('why'),
    url: str('url'),
    ...(pid ? { productId: pid } : {}),
  };
  validateTrustedHtml(`spotlight[${i}].summary`, sp.summary);
  validateTrustedHtml(`spotlight[${i}].trick`, sp.trick);
  validateTrustedHtml(`spotlight[${i}].code`, sp.code);
  validateTrustedHtml(`spotlight[${i}].why`, sp.why);
  return sp;
};

/**
 * Fetch fresh data from each source, send to Haiku with the existing
 * spotlights as reference, parse the response, return 6 fresh entries.
 *
 * Throws if any source fetch fails fatally, the Haiku response is malformed,
 * the parsed JSON doesn't decode to an array of Spotlight-shaped objects, or
 * any entry's trusted-HTML field carries a tag outside the allowlist.
 * Callers should handle errors and surface them in the UI.
 */
export const refreshSpotlightsViaHaiku = async (
  deps: Deps,
  config: RefreshConfig,
): Promise<readonly Spotlight[]> => {
  const sampleResults = await Promise.allSettled(
    config.sources.map((s) => fetchSourceSample(deps, config.ghServer, s)),
  );
  const samples: SampledSource[] = config.sources.map((s, i) => {
    const result = sampleResults[i];
    return {
      id: s.id,
      label: s.label,
      kind: s.kind,
      data: result?.status === 'fulfilled' ? result.value : null,
    };
  });

  const prompt = buildRefreshPrompt(config.topic, config.existing, samples);
  const response = await askClaude(deps, prompt, samples);
  const parsed = parseJsonResponse<unknown>(response);
  if (!Array.isArray(parsed)) {
    throw new Error('refreshSpotlightsViaHaiku: Haiku response was not a JSON array');
  }
  return parsed.map(toValidatedSpotlight);
};
