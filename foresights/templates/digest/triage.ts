/**
 * Haiku-batched 🟢 / 🟡 / 🔴 triage for digest generation.
 *
 * Ports the triage loop from v0.1's generateDigest into a pure, batched
 * function with per-batch error containment: a failed batch defaults its
 * items to "yellow" + an apology reason rather than dropping them or
 * rolling the whole call back.
 *
 * Compact JSON payload — short field names (`id`/`txt`/`why`/`ints`) and
 * truncation keep each batch under the ~8KB IPC ceiling, then results are
 * mapped back to stableId. Batch size defaults to 10 (ASK_CLAUDE_BATCH_SIZE).
 *
 * v0.1-bug-look-out: the reference defaulted unknown buckets to "yellow"
 * silently. v0.2 narrows via a Set<TriageBucket> and emits a small set of
 * known buckets only — out-of-set strings fall through to "yellow" with
 * explicit coercion, so the type system never receives an invalid bucket.
 */

import { ASK_CLAUDE_BATCH_SIZE, askClaude } from '../mcp/ask-claude';
import type { Deps, TriageBucket, TriageEvidenceBasis, TriagedItem } from '../types';

/**
 * Pre-baked digest triage — the `BAKED_TRIAGE` sentinel.
 *
 * Empty `{}` in an `outputMode: 'artifact'` build (so artifact dashboards run
 * live Haiku triage exactly as before). In `outputMode: 'static'` the wizard
 * pre-computes the 🟢 / 🟡 / 🔴 verdict for every (product × flagged-item)
 * pair at build time and the build substitutes them here — keyed
 * `productId → stableId → TriagedItem`. `triageItems` consults this map first,
 * so a static dashboard's upgrade digest is fully bucketed offline — no
 * `window.cowork`, no model access needed.
 */
// FORESIGHTS_START:BAKED_TRIAGE
const BAKED_TRIAGE: Readonly<Record<string, Readonly<Record<string, TriagedItem>>>> = {};
// FORESIGHTS_END:BAKED_TRIAGE

/** Per-item triage payload. Field-name shape is contract — don't rename. */
export interface TriageInput {
  /** Stable identifier — used to key the response back to the input. */
  readonly stableId: string;
  /** Item text — what the item is. Truncated to 420 chars before sending. */
  readonly text: string;
  /** Structured title, kept separate so markdown/truncation cannot hide it. */
  readonly title?: string;
  /** Source kind, e.g. release-breaking, release-alpha, pr, rfc, rss. */
  readonly kind?: string;
  /** Release version when available. */
  readonly version?: string;
  /** Brief.why — earlier model context, not evidence. Truncated to 320 chars. */
  readonly why?: string;
  /** Earlier integration hypotheses, not evidence. Truncated to 180 chars. */
  readonly ints?: string;
}

export interface TriageOpts {
  /** Wizard-injected product description, e.g. `"CDK Insights — an AWS CDK ..."`. */
  readonly productDescriptor: string;
  /** Items per Haiku call — defaults to 6 to leave room for evidence fields. */
  readonly batchSize?: number;
  /**
   * Product id — keys the `BAKED_TRIAGE` lookup. Pass it (the digest bar
   * does) to let a static dashboard use pre-baked verdicts; omit it and the
   * baked tier is skipped and every item is triaged live.
   */
  readonly productId?: string;
}

const BUCKETS: ReadonlySet<TriageBucket> = new Set<TriageBucket>(['green', 'yellow', 'red']);

/** Default reason recorded when a triage batch fails or an item is absent. */
export const TRIAGE_FAIL_REASON = '(triage call failed — defaulted to yellow)';

/** Build the system prompt. Exported for test inspection. */
export const buildTriagePrompt = (productDescriptor: string): string =>
  [
    `You triage news items for ${productDescriptor}.`,
    '',
    'For each item, classify it into ONE bucket:',
    '- "green": Implement now. The supplied source explicitly shows a shipped/merged, active change; the product impact and action are directly supported; no material verification remains. Small handful at most.',
    '- "yellow": Worth considering. Useful but needs human judgment, has dependencies, or could wait.',
    '- "red": Skip. Low impact, redundant, premature, or out of scope.',
    '',
    'Evidence rules:',
    '- title/txt/kind/version are source evidence. why/ints are earlier model hypotheses and MUST NOT be treated as evidence.',
    '- Set basis="source" only when source fields directly establish the verdict. Otherwise use "inference" or "unknown".',
    '- Alpha/preview work, RFCs/issues, open proposals, and changes needing source or repo verification cannot be green.',
    '- Documentation/chore changes are usually red unless they expose a specific existing product bug; then yellow.',
    '- Compare items in this batch. If one reverts or supersedes another, do not recommend implementing the withdrawn change.',
    '- Never invent security impact, pricing, defaults, APIs, permissions, resource properties, or implementation status.',
    '',
    'Be ruthless. Most items should be RED. Only the top ~15% deserve GREEN.',
    '',
    'Respond with JSON ONLY — one entry per input item, same order:',
    '[{"id":"...","bucket":"green"|"yellow"|"red","basis":"source"|"inference"|"unknown","reason":"1-sentence justification"}]',
    '',
    'NO PROSE, NO MARKDOWN FENCES.',
  ].join('\n');

/**
 * Shape of the per-item JSON payload sent to Haiku. Named interface (not
 * Record) so consumers and tests can read `.id` / `.txt` / etc. without
 * the index-signature dance.
 */
export interface TrimmedTriageItem {
  readonly id: string;
  readonly txt: string;
  readonly ttl?: string;
  readonly kind?: string;
  readonly ver?: string;
  readonly why?: string;
  readonly ints?: string;
}

/** Trim per-item fields to keep each batch under the IPC ceiling. */
export const trimTriageItem = (input: TriageInput): TrimmedTriageItem => {
  const base = {
    id: input.stableId,
    txt: (input.text ?? '').replace(/\s+/g, ' ').slice(0, 420),
  };
  return {
    ...base,
    ...(input.title ? { ttl: input.title.replace(/\s+/g, ' ').slice(0, 180) } : {}),
    ...(input.kind ? { kind: input.kind.slice(0, 40) } : {}),
    ...(input.version ? { ver: input.version.slice(0, 40) } : {}),
    ...(input.why ? { why: input.why.slice(0, 320) } : {}),
    ...(input.ints ? { ints: input.ints.slice(0, 180) } : {}),
  };
};

/** Coerce an arbitrary string into a known TriageBucket; defaults to 'yellow'. */
const coerceBucket = (raw: unknown): TriageBucket =>
  typeof raw === 'string' && BUCKETS.has(raw as TriageBucket) ? (raw as TriageBucket) : 'yellow';

interface MaybeText {
  readonly text?: unknown;
  readonly content?: unknown;
}

/** Normalize the askClaude return shape into a flat string. */
const normaliseTriageText = (raw: unknown): string => {
  if (typeof raw === 'string') return raw;
  if (raw == null) return '';
  if (typeof raw !== 'object') return String(raw);
  const obj = raw as MaybeText;
  if (typeof obj.text === 'string') return obj.text;
  if (Array.isArray(obj.content)) {
    return obj.content
      .map((c) => {
        if (c != null && typeof c === 'object') {
          const t = (c as MaybeText).text;
          if (typeof t === 'string') return t;
        }
        return '';
      })
      .join('');
  }
  return JSON.stringify(obj);
};

/**
 * Parse one batch's response into TriagedItem entries.
 * Returns a Map keyed by stableId so the caller can de-dup across batches.
 */
const parseTriageBatch = (text: string): Map<string, TriagedItem> => {
  const out = new Map<string, TriagedItem>();
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[0]);
  } catch {
    return out;
  }
  if (!Array.isArray(parsed)) return out;
  for (const t of parsed) {
    if (t == null || typeof t !== 'object') continue;
    const o = t as {
      id?: unknown;
      stableId?: unknown;
      bucket?: unknown;
      basis?: unknown;
      reason?: unknown;
    };
    const id =
      typeof o.id === 'string' && o.id.length > 0
        ? o.id
        : typeof o.stableId === 'string' && o.stableId.length > 0
          ? o.stableId
          : '';
    if (!id) continue;
    out.set(id, {
      stableId: id,
      bucket: coerceBucket(o.bucket),
      reasoning: typeof o.reason === 'string' ? o.reason : '',
      evidenceBasis:
        o.basis === 'source' || o.basis === 'inference' || o.basis === 'unknown'
          ? (o.basis as TriageEvidenceBasis)
          : 'unknown',
    });
  }
  return out;
};

const referencesIn = (input: TriageInput): ReadonlySet<string> => {
  const refs = new Set<string>();
  const text = `${input.title ?? ''} ${input.text}`;
  for (const match of text.matchAll(/(?:#|\/(?:issues|pull)\/)(\d{2,})/gi)) {
    if (match[1]) refs.add(match[1]);
  }
  return refs;
};

const isRevert = (input: TriageInput): boolean =>
  /\b(?:revert(?:ed|s|ing)?|roll(?:ed)?\s*back|withdrawn)\b/i.test(
    `${input.title ?? ''} ${input.text}`,
  );

const withDowngrade = (item: TriagedItem, bucket: TriageBucket, reason: string): TriagedItem => ({
  ...item,
  bucket,
  reasoning: reason,
});

/**
 * Deterministic safety net after model triage. It prevents the most damaging
 * false-positive classes even when the model ignores the prompt: unsupported
 * green verdicts, proposals/alpha APIs promoted as ready, and changes that a
 * related source item explicitly says were reverted.
 */
export const applyTriageAccuracyGuards = (
  inputs: readonly TriageInput[],
  triaged: readonly TriagedItem[],
): readonly TriagedItem[] => {
  const inputById = new Map(inputs.map((input) => [input.stableId, input]));
  const revertedIds = new Set<string>();
  const refsById = new Map(inputs.map((input) => [input.stableId, referencesIn(input)]));

  for (const input of inputs.filter(isRevert)) {
    revertedIds.add(input.stableId);
    const refs = refsById.get(input.stableId) ?? new Set<string>();
    if (refs.size === 0) continue;
    for (const candidate of inputs) {
      if (candidate.stableId === input.stableId) continue;
      const candidateRefs = refsById.get(candidate.stableId) ?? new Set<string>();
      if ([...refs].some((ref) => candidateRefs.has(ref))) revertedIds.add(candidate.stableId);
    }
  }

  return triaged.map((item) => {
    const input = inputById.get(item.stableId);
    if (!input) return item;
    if (revertedIds.has(item.stableId)) {
      return withDowngrade(
        item,
        'red',
        'A supplied source item reports this change as reverted or withdrawn; do not implement against it.',
      );
    }
    const kind = input.kind?.toLowerCase() ?? '';
    if (
      item.bucket === 'green' &&
      (kind === 'rfc' || kind === 'issue' || kind.includes('alpha') || kind.includes('proposal'))
    ) {
      return withDowngrade(
        item,
        'yellow',
        'This is alpha or proposal-stage work, so implementation should wait for a stable shipped contract.',
      );
    }
    if (item.bucket === 'green' && item.evidenceBasis !== 'source') {
      return withDowngrade(
        item,
        'yellow',
        'The implementation case is inferred rather than established by the supplied source; verify it first.',
      );
    }
    return item;
  });
};

/**
 * Triage a flat list of items. Returns one TriagedItem per input item, in
 * the same order. Per-batch error containment: if a batch's Haiku call
 * throws or its response is unparseable, the items in THAT batch default
 * to yellow + TRIAGE_FAIL_REASON. Items NOT returned by Haiku (e.g. model
 * dropped one) get the same default.
 *
 * Tiered (mirrors `fetchBrief`): an item with a build-time pre-baked verdict
 * in `BAKED_TRIAGE[opts.productId]` skips the Haiku batch entirely. In an
 * artifact build `BAKED_TRIAGE` is `{}`, so every item is triaged live as
 * before; in `outputMode: 'static'` the wizard fills it and no Haiku call
 * is made.
 */
export const triageItems = async (
  deps: Pick<Deps, 'askClaude'>,
  items: readonly TriageInput[],
  opts: TriageOpts,
): Promise<readonly TriagedItem[]> => {
  if (items.length === 0) return [];
  // Richer evidence fields need smaller batches to stay below Cowork's ~8KB
  // IPC ceiling. Custom callers can still override this explicitly.
  const batchSize = opts.batchSize ?? Math.min(6, ASK_CLAUDE_BATCH_SIZE);
  if (batchSize <= 0) {
    throw new Error(`triageItems: batchSize must be positive, got ${batchSize}`);
  }

  // Tier 1 — build-time pre-baked verdicts. `BAKED_TRIAGE` is `{}` in an
  // artifact build, so `baked` is empty there and `needLive` === every item:
  // identical behaviour to pre-3c. In static mode the wizard fills it.
  const baked: Readonly<Record<string, TriagedItem>> =
    (opts.productId ? BAKED_TRIAGE[opts.productId] : undefined) ?? {};
  const needLive = items.filter((it) => baked[it.stableId] === undefined);

  const prompt = buildTriagePrompt(opts.productDescriptor);
  const triageById = new Map<string, TriagedItem>();

  for (let i = 0; i < needLive.length; i += batchSize) {
    const batch = needLive.slice(i, i + batchSize);
    const trimmed = batch.map(trimTriageItem);
    try {
      const raw = await askClaude(
        deps,
        `${prompt}\n\nITEMS (${batch.length}):\n${JSON.stringify(trimmed)}`,
        [trimmed],
      );
      const text = normaliseTriageText(raw);
      const parsed = parseTriageBatch(text);
      for (const [id, t] of parsed) {
        triageById.set(id, t);
      }
    } catch {
      // Per-batch containment: don't drop the items, default to yellow.
    }

    // Backfill: any item in THIS batch the model didn't return gets a
    // yellow fail-default. Crucial so digests don't silently drop items.
    for (const it of batch) {
      if (!triageById.has(it.stableId)) {
        triageById.set(it.stableId, {
          stableId: it.stableId,
          bucket: 'yellow',
          reasoning: TRIAGE_FAIL_REASON,
        });
      }
    }
  }

  const ordered = items.map(
    (it) =>
      baked[it.stableId] ??
      triageById.get(it.stableId) ?? {
        stableId: it.stableId,
        bucket: 'yellow' as TriageBucket,
        reasoning: TRIAGE_FAIL_REASON,
      },
  );
  return applyTriageAccuracyGuards(items, ordered);
};
