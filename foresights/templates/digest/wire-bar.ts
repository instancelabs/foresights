/**
 * Digest bar — per-product "Upgrade digest" buttons.
 *
 * Wires each `#digest-btn-${productId}` button to the full digest workflow:
 *   1. Gather all `.insights-tag.expandable[data-product-id="X"]` badges
 *   2. Fetch briefs for each (concurrency-limited; uses fetchBrief's cache)
 *   3. Triage via Haiku — green/yellow/red bucketing
 *   4. Build DigestEntry[] joining flag + item + brief
 *   5. Render the canonical markdown digest
 *   6. Open the shared digest panel
 *
 * The digest panel itself (overlay, copy/download/close) is owned by
 * `digest/panel.ts`'s `initDigestPanel`. This module owns the BUTTON click
 * lifecycle and the data pipeline that feeds the panel's open() call.
 */

import { type BriefItem, fetchBrief } from '../products/brief';
import type { CcPromptBuilder } from '../products/cc-prompts';
import type { Deps, Flag, Product, TriageBucket, TriagedItem } from '../types';
import { todayLocalDate } from '../util/date';
import { type DigestEntry, type RenderDigestArgs, renderDigestMarkdown } from './markdown';
import type { DigestPanelHandle } from './panel';
import { type TriageInput, triageItems } from './triage';

export interface InitDigestBarOpts {
  readonly products: readonly Product[];
  readonly prompts: Readonly<Record<string, string>>;
  readonly ccBuilders?: Readonly<Record<string, CcPromptBuilder>>;
  readonly topicSlug: string;
  readonly fingerprintByProduct: (productId: string) => string;
  /**
   * The digest-panel handle returned by initDigestPanel. The bar uses this
   * to surface the rendered markdown.
   */
  readonly panel: DigestPanelHandle;
  /** Max parallel Haiku calls per digest run. Default 3. */
  readonly concurrency?: number;
  /**
   * Override for today's date in YYYY-MM-DD form. Tests inject; prod uses
   * `todayLocalDate(deps.now())`.
   */
  readonly dateFn?: () => string;
}

export interface DigestBarHandle {
  /** Tear down click listeners. */
  readonly dispose: () => void;
}

const dataStr = (el: HTMLElement, camelKey: string): string => el.dataset[camelKey] ?? '';

const optionalStr = (el: HTMLElement, camelKey: string): string | undefined => {
  const v = el.dataset[camelKey];
  return v && v !== '' ? v : undefined;
};

const readFlag = (span: HTMLElement): Flag => ({
  productId: dataStr(span, 'productId'),
  stableId: dataStr(span, 'stableId'),
  section: dataStr(span, 'section'),
  title: dataStr(span, 'title'),
  url: dataStr(span, 'url'),
  reason: dataStr(span, 'reason'),
});

const readItem = (span: HTMLElement): BriefItem => {
  const kind = dataStr(span, 'kind') || 'item';
  const text = dataStr(span, 'text') || dataStr(span, 'title');
  const url = dataStr(span, 'url');
  const reason = dataStr(span, 'reason');
  const version = optionalStr(span, 'version');
  const source = optionalStr(span, 'source');
  return {
    kind,
    text,
    url,
    reason,
    ...(version !== undefined ? { version } : {}),
    ...(source !== undefined ? { source } : {}),
  };
};

/** Slugify a product label for use as a filename fragment. */
const slugifyLabel = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/**
 * Concurrency-limited fetch — collects {flag, item, brief} per badge for the
 * product. Skips badges whose fetch throws so one bad item doesn't break the
 * whole digest.
 */
const collectEntries = async (
  deps: Deps,
  product: Product,
  systemPrompt: string,
  topicSlug: string,
  fingerprint: string,
  concurrency: number,
  onProgress: (done: number, total: number) => void,
): Promise<readonly DigestEntry[]> => {
  const tags = Array.from(
    deps.document.querySelectorAll<HTMLElement>(
      `.insights-tag.expandable[data-product-id="${product.id}"]`,
    ),
  );
  // De-dupe by stableId so multi-host items only get one entry.
  const seen = new Set<string>();
  const uniques: { flag: Flag; item: BriefItem }[] = [];
  for (const span of tags) {
    const flag = readFlag(span);
    if (!flag.stableId || seen.has(flag.stableId)) continue;
    seen.add(flag.stableId);
    uniques.push({ flag, item: readItem(span) });
  }

  const total = uniques.length;
  const entries: DigestEntry[] = [];
  let done = 0;
  onProgress(0, total);

  const queue = uniques.slice();
  const workerCount = Math.min(concurrency, queue.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      try {
        const brief = await fetchBrief(deps, {
          flag: next.flag,
          prompt: systemPrompt,
          fingerprint,
          topicSlug,
          item: next.item,
        });
        entries.push({ flag: next.flag, item: next.item, brief });
      } catch {
        // Skip — digest renders what it has.
      }
      done++;
      onProgress(done, total);
    }
  });
  await Promise.all(workers);
  return entries;
};

/**
 * Build TriageInput[] from DigestEntry[]. The TriageInput shape carries the
 * stableId so the triage response maps back to the original entry.
 */
const buildTriageInputs = (entries: readonly DigestEntry[]): readonly TriageInput[] =>
  entries.map((e) => {
    const ints = e.brief.integrations.map((i) => i.title).join('; ');
    const base: TriageInput = {
      stableId: e.flag.stableId,
      text: e.item.text,
    };
    return {
      ...base,
      ...(e.brief.why ? { why: e.brief.why } : {}),
      ...(ints ? { ints } : {}),
    };
  });

/**
 * Install per-product digest button click handlers. Returns `{ dispose }`.
 */
export const initDigestBar = (deps: Deps, opts: InitDigestBarOpts): DigestBarHandle => {
  const concurrency = opts.concurrency ?? 3;
  const ac = new AbortController();
  const dateFn = opts.dateFn ?? (() => todayLocalDate(deps.now));
  const ccBuilders = opts.ccBuilders ?? {};

  const findBtn = (productId: string): HTMLButtonElement | null => {
    const el = deps.document.getElementById(`digest-btn-${productId}`);
    return el instanceof HTMLButtonElement ? el : null;
  };

  const runDigest = async (product: Product): Promise<void> => {
    const btn = findBtn(product.id);
    if (!btn) return;
    const systemPrompt = opts.prompts[product.id];
    if (!systemPrompt) {
      btn.textContent = `${product.label}: no prompt`;
      return;
    }

    const originalLabel = btn.textContent ?? `${product.label} digest`;
    btn.disabled = true;
    btn.textContent = `${product.label}: gathering…`;

    try {
      // Step 1 — brief every flagged item (with progress in button text).
      const entries = await collectEntries(
        deps,
        product,
        systemPrompt,
        opts.topicSlug,
        opts.fingerprintByProduct(product.id),
        concurrency,
        (done, total) => {
          btn.textContent = `${product.label}: briefing ${done}/${total}…`;
        },
      );

      if (entries.length === 0) {
        btn.textContent = `${product.label}: nothing flagged`;
        deps.window.setTimeout(() => {
          btn.disabled = false;
          btn.textContent = originalLabel;
        }, 1500);
        return;
      }

      // Step 2 — triage via Haiku.
      btn.textContent = `${product.label}: triaging ${entries.length}…`;
      const productDescriptor = `${product.label} — see system prompt`;
      const triaged: readonly TriagedItem[] = await triageItems(deps, buildTriageInputs(entries), {
        productDescriptor,
      });

      // Step 3 — render markdown + open panel.
      const date = dateFn();
      const renderArgs: RenderDigestArgs = {
        productLabel: product.label,
        productSlug: product.cssMod || slugifyLabel(product.label),
        date,
        entries,
        triaged,
        ...(ccBuilders[product.id] ? { ccBuilder: ccBuilders[product.id] } : {}),
      };
      const markdown = renderDigestMarkdown(renderArgs);

      opts.panel.open({
        markdown,
        productLabel: product.label,
        productSlug: renderArgs.productSlug,
        date,
      });

      const counts = countBuckets(triaged);
      btn.textContent = `${product.label} · 🟢${counts.green} 🟡${counts.yellow} 🔴${counts.red}`;
    } catch (err) {
      console.error(`Foresights: digest run failed for ${product.id}`, err);
      btn.textContent = `${product.label}: digest failed`;
    } finally {
      deps.window.setTimeout(() => {
        btn.disabled = false;
      }, 1500);
    }
  };

  // Wire each product's button.
  for (const product of opts.products) {
    const btn = findBtn(product.id);
    if (!btn) continue;
    btn.addEventListener(
      'click',
      () => {
        void runDigest(product);
      },
      { signal: ac.signal },
    );
  }

  return { dispose: () => ac.abort() };
};

/** Count buckets in a triaged set for the post-run button summary. */
const countBuckets = (triaged: readonly TriagedItem[]): Readonly<Record<TriageBucket, number>> => {
  const counts: Record<TriageBucket, number> = { green: 0, yellow: 0, red: 0 };
  for (const t of triaged) counts[t.bucket]++;
  return counts;
};
