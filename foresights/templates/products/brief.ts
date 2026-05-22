/**
 * Brief fetcher — Haiku-backed, localStorage-cached.
 *
 * Ports fetchInsightsBrief from the v0.1 aws-cdk-news.html reference. Given a
 * Flag (product-resolved) plus the underlying item payload (kind, text, url,
 * version, source), returns the {why, integrations} brief shape.
 *
 * Cache key: `<topicSlug>-news.brief.<productId>.<fingerprint>.<hashKey(stableId)>`
 *
 * The fingerprint comes from the caller — typically a per-product hash of
 * the product's context (architecture summary, CLAUDE.md, list of repos).
 * Changing the context implicitly invalidates every cached brief for that
 * product without needing an explicit cache flush.
 *
 * The askClaude response is normalised across the four shapes the IPC bridge
 * might return (raw string / {text} / {content:[{text}]} / generic object).
 * Haiku is asked for JSON-only but sometimes wraps with prose, so the parser
 * pulls the first `{...}` block before JSON.parse and validates the shape.
 *
 * v0.1-bug-look-out: the reference's parser threw on missing `why` but
 * silently accepted any-shape integrations. v0.2 normalises integrations
 * into BriefIntegration{title,detail} with string fallbacks so a malformed
 * entry doesn't crash the panel renderer downstream.
 */

import type { Brief, BriefIntegration, Deps, Flag } from '../types';

/**
 * Stable string hash for cache keys. DJB2 variant — same impl as v0.1, so
 * caches transfer cleanly when the topic-slug + fingerprint align.
 */
export const hashKey = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) + h + s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
};

/**
 * Build the localStorage key for a brief.
 *
 * Folding `fingerprint` into the key means: when a product's context changes
 * (e.g. the user refreshes their repo layout), the new fingerprint produces a
 * new key, so the next read misses cache and regenerates against the new
 * context. Stale entries linger in localStorage until natural eviction; this
 * is intentional — they're cheap to keep and useful if the context reverts.
 */
export const briefCacheKey = (
  topicSlug: string,
  productId: string,
  fingerprint: string,
  stableId: string,
): string => `${topicSlug}-news.brief.${productId}.${fingerprint}.${hashKey(stableId)}`;

/** Payload sent to Haiku as the ITEM. */
export interface BriefItem {
  /** Item kind (e.g. 'release-features', 'rfc', 'pr', 'highlight'). */
  readonly kind: string;
  /** Item text — bullet body, issue title+body, PR title, or highlight fullText. */
  readonly text: string;
  /** Canonical URL — best effort; empty string acceptable. */
  readonly url: string;
  /** The matcher's reason — given to Haiku as `initial_relevance_reason`. */
  readonly reason: string;
  /** Optional version (release tag) — included if set. */
  readonly version?: string;
  /** Optional source (owner/repo) — included if set. */
  readonly source?: string;
}

export interface FetchBriefArgs {
  /** Resolved flag — productId + stableId + section + title + url + reason. */
  readonly flag: Flag;
  /** Per-product Haiku system prompt (the wizard emits one per product). */
  readonly prompt: string;
  /** Per-product cache fingerprint (default 'static' if no context refresh). */
  readonly fingerprint: string;
  /** Topic slug — namespaces the cache key so multi-dashboard users don't collide. */
  readonly topicSlug: string;
  /** Item payload sent to Haiku. */
  readonly item: BriefItem;
}

/**
 * Shapes the askClaude IPC bridge has been observed to return. Typed as a
 * named interface (not Record<string,unknown>) so accessing `.text` / etc.
 * doesn't trip TS's noPropertyAccessFromIndexSignature.
 */
interface MaybeMessage {
  readonly text?: unknown;
  readonly content?: unknown;
  readonly response?: unknown;
  readonly message?: unknown;
}

/** Normalize the askClaude return value into a plain string. */
const normalizeAskClaudeResult = (raw: unknown): string => {
  if (typeof raw === 'string') return raw;
  if (raw == null) return '';
  if (typeof raw !== 'object') return String(raw);

  const obj = raw as MaybeMessage;
  if (typeof obj.text === 'string') return obj.text;
  if (Array.isArray(obj.content)) {
    return obj.content
      .map((c) => {
        if (c != null && typeof c === 'object') {
          const t = (c as MaybeMessage).text;
          if (typeof t === 'string') return t;
        }
        return '';
      })
      .join('');
  }
  if (typeof obj.response === 'string') return obj.response;
  if (typeof obj.message === 'string') return obj.message;
  return JSON.stringify(obj);
};

/**
 * Parse Haiku's response — extract the first JSON object, validate shape.
 *
 * Throws on: no `{...}` block, JSON parse failure, non-object root, or
 * missing/empty `why` string. Normalises invalid integrations to [].
 */
const parseBriefJson = (text: string): Brief => {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON found in the model response.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(m[0]);
  } catch {
    throw new Error('Model returned malformed JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Model response is not an object.');
  }

  const p = parsed as { why?: unknown; integrations?: unknown };
  if (typeof p.why !== 'string' || p.why.length === 0) {
    throw new Error('Model response missing "why" field.');
  }

  const integrations: BriefIntegration[] = [];
  if (Array.isArray(p.integrations)) {
    for (const i of p.integrations) {
      if (i != null && typeof i === 'object') {
        const ent = i as { title?: unknown; detail?: unknown };
        integrations.push({
          title: typeof ent.title === 'string' ? ent.title : '',
          detail: typeof ent.detail === 'string' ? ent.detail : '',
        });
      }
    }
  }

  return { why: p.why, integrations };
};

/** Read a cached brief — null if the entry is missing or corrupt. */
const readCachedBrief = (storage: Storage, cacheKey: string): Brief | null => {
  let cached: string | null;
  try {
    cached = storage.getItem(cacheKey);
  } catch {
    return null;
  }
  if (!cached) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(cached);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as { why?: unknown; integrations?: unknown };
  if (typeof p.why !== 'string' || p.why.length === 0) return null;

  const integrations: BriefIntegration[] = Array.isArray(p.integrations)
    ? (p.integrations as unknown[])
        .filter(
          (i): i is { title?: unknown; detail?: unknown } => i != null && typeof i === 'object',
        )
        .map((i) => ({
          title: typeof i.title === 'string' ? i.title : '',
          detail: typeof i.detail === 'string' ? i.detail : '',
        }))
    : [];

  return { why: p.why, integrations };
};

/**
 * The non-model floor for a brief — a minimal `Brief` synthesised from the
 * matcher's regex `reason`. Used by `fetchBrief` when `askClaude` is
 * unavailable (a static dashboard with no `window.cowork`, or an org with no
 * model access) or returns an unusable response. `flagsForText` computes
 * `reason` with no model, so a flagged item always has *something* to show —
 * why the rule matched — even with zero model access.
 */
export const briefFromReason = (flag: Flag, item: BriefItem): Brief => ({
  why: flag.reason || item.reason || 'Flagged as relevant by a product rule.',
  integrations: [],
});

/**
 * Fetch a brief for one flagged item.
 *
 * Tiered: a cached brief → a fresh `askClaude` (Haiku) brief → and, if
 * `askClaude` is unavailable (no `window.cowork` / no model access) or returns
 * an unusable response, the non-model floor (`briefFromReason`). It does not
 * throw for those cases — it always resolves to a `Brief`.
 */
export const fetchBrief = async (
  deps: Pick<Deps, 'storage' | 'askClaude'>,
  args: FetchBriefArgs,
): Promise<Brief> => {
  const { flag, prompt, fingerprint, topicSlug, item } = args;
  const cacheKey = briefCacheKey(topicSlug, flag.productId, fingerprint, flag.stableId);

  const cached = readCachedBrief(deps.storage, cacheKey);
  if (cached) return cached;

  interface ItemPayload {
    readonly type: string;
    readonly source: string;
    readonly text: string;
    readonly url: string;
    readonly initial_relevance_reason: string;
    readonly version?: string;
  }
  const itemPayload: ItemPayload = {
    type: item.kind,
    source: item.source ?? '',
    text: item.text,
    url: item.url,
    initial_relevance_reason: item.reason,
    ...(item.version ? { version: item.version } : {}),
  };

  let brief: Brief;
  try {
    const raw = await deps.askClaude(
      `${prompt}\n\nITEM:\n${JSON.stringify(itemPayload, null, 2)}`,
      [itemPayload],
    );
    brief = parseBriefJson(normalizeAskClaudeResult(raw));
  } catch {
    // askClaude rejected (no window.cowork / no model access for this org) or
    // returned an unusable response. Fall back to the non-model floor — a
    // minimal brief from the matcher's regex reason. NOT cached: a later run
    // with a working model regenerates a real brief.
    return briefFromReason(flag, item);
  }

  try {
    deps.storage.setItem(cacheKey, JSON.stringify(brief));
  } catch {
    // Quota / SecurityError — ignore; brief is still returned.
  }

  return brief;
};
