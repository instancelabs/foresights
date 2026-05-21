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
import type { Deps, TriageBucket, TriagedItem } from '../types';

/** Per-item triage payload. Field-name shape is contract — don't rename. */
export interface TriageInput {
  /** Stable identifier — used to key the response back to the input. */
  readonly stableId: string;
  /** Item text — what the item is. Truncated to 140 chars before sending. */
  readonly text: string;
  /** Brief.why — adds product-context. Truncated to 180 chars. */
  readonly why?: string;
  /** Concatenated integration titles. Truncated to 90 chars. */
  readonly ints?: string;
}

export interface TriageOpts {
  /** Wizard-injected product description, e.g. `"CDK Insights — an AWS CDK ..."`. */
  readonly productDescriptor: string;
  /** Items per Haiku call — defaults to ASK_CLAUDE_BATCH_SIZE (10). */
  readonly batchSize?: number;
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
    '- "green": Implement now. Genuinely high-impact, well-scoped, low-risk. Small handful at most.',
    '- "yellow": Worth considering. Useful but needs human judgment, has dependencies, or could wait.',
    '- "red": Skip. Low impact, redundant, premature, or out of scope.',
    '',
    'Be ruthless. Most items should be RED. Only the top ~15% deserve GREEN.',
    '',
    'Respond with JSON ONLY — one entry per input item, same order:',
    '[{"id":"...","bucket":"green"|"yellow"|"red","reason":"1-sentence justification"}]',
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
  readonly why?: string;
  readonly ints?: string;
}

/** Trim per-item fields to keep each batch under the IPC ceiling. */
export const trimTriageItem = (input: TriageInput): TrimmedTriageItem => {
  const base = {
    id: input.stableId,
    txt: (input.text ?? '').replace(/\s+/g, ' ').slice(0, 140),
  };
  return {
    ...base,
    ...(input.why ? { why: input.why.slice(0, 180) } : {}),
    ...(input.ints ? { ints: input.ints.slice(0, 90) } : {}),
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
    const o = t as { id?: unknown; stableId?: unknown; bucket?: unknown; reason?: unknown };
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
    });
  }
  return out;
};

/**
 * Triage a flat list of items. Returns one TriagedItem per input item, in
 * the same order. Per-batch error containment: if a batch's Haiku call
 * throws or its response is unparseable, the items in THAT batch default
 * to yellow + TRIAGE_FAIL_REASON. Items NOT returned by Haiku (e.g. model
 * dropped one) get the same default.
 */
export const triageItems = async (
  deps: Pick<Deps, 'askClaude'>,
  items: readonly TriageInput[],
  opts: TriageOpts,
): Promise<readonly TriagedItem[]> => {
  if (items.length === 0) return [];
  const batchSize = opts.batchSize ?? ASK_CLAUDE_BATCH_SIZE;
  if (batchSize <= 0) {
    throw new Error(`triageItems: batchSize must be positive, got ${batchSize}`);
  }

  const prompt = buildTriagePrompt(opts.productDescriptor);
  const triageById = new Map<string, TriagedItem>();

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
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

  return items.map(
    (it) =>
      triageById.get(it.stableId) ?? {
        stableId: it.stableId,
        bucket: 'yellow' as TriageBucket,
        reasoning: TRIAGE_FAIL_REASON,
      },
  );
};
