/**
 * Brief-all bar — "Brief all flagged: [Product]" buttons.
 *
 * Counts flagged items per product, shows progress in the button label, and
 * on click opens every unexpanded brief panel in parallel (with a small
 * concurrency limit so we don't fan-out 30 Haiku calls at once).
 *
 * Each badge carries the full Flag + BriefItem context via data-* attrs
 * (set by `flagBadgeAttrs` in products/badge.ts). We read those inline to
 * avoid maintaining a separate JS-side registry.
 *
 * Button label states:
 *   - 0 flagged items   → "Product" (disabled)
 *   - N flagged, M open → "Product (M/N)" (enabled)
 *   - During run        → "Product: M/N…"
 *   - All open          → "Product · all open ✓" (disabled)
 *   - Right after run   → "Product · ready ✓" → resets to "Product (N/N)"
 *
 * The button label updates live via a MutationObserver — when new badges
 * render (live data fetch settles, RSS feed loads), the count refreshes
 * automatically. No manual `refresh()` call required from the caller.
 */

import type { Deps, Flag, Product } from '../types';
import { escHtml } from '../util/escape';
import { type BriefItem, fetchBrief } from './brief';
import type { CcPromptBuilder } from './cc-prompts';
import { renderBriefHtml } from './panel';

/** Host selector mirrors products/panel.ts — kept in sync for behavioural parity. */
const HOST_SELECTOR = 'li, .card, .pr-item, .hl-card, .sl-card';

export interface InitBriefAllBarOpts {
  readonly products: readonly Product[];
  readonly prompts: Readonly<Record<string, string>>;
  readonly ccBuilders?: Readonly<Record<string, CcPromptBuilder>>;
  readonly topicSlug: string;
  readonly fingerprintByProduct: (productId: string) => string;
  /** Max parallel Haiku calls per briefAll run. Default 3. */
  readonly concurrency?: number;
  /** Override for the loading-state label. Useful for tests. */
  readonly loadingLabel?: (productLabel: string) => string;
}

export interface BriefAllBarHandle {
  /** Manually re-count badges and update every button. Idempotent. */
  readonly refresh: () => void;
  /** Tear down click handlers + MutationObserver. */
  readonly dispose: () => void;
}

const dataStr = (el: HTMLElement, camelKey: string): string => el.dataset[camelKey] ?? '';

const optionalStr = (el: HTMLElement, camelKey: string): string | undefined => {
  const v = el.dataset[camelKey];
  return v && v !== '' ? v : undefined;
};

/** Read a Flag back from a badge's data-* attrs. */
const readFlag = (span: HTMLElement): Flag => ({
  productId: dataStr(span, 'productId'),
  stableId: dataStr(span, 'stableId'),
  section: dataStr(span, 'section'),
  title: dataStr(span, 'title'),
  url: dataStr(span, 'url'),
  reason: dataStr(span, 'reason'),
});

/** Read the BriefItem back from a badge's data-* attrs. */
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

const defaultLoadingLabel = (productLabel: string): string => `Generating ${productLabel} brief…`;

/**
 * Install the brief-all bar handlers. Returns `{ refresh, dispose }`.
 *
 * If a per-product button isn't in the DOM the function silently no-ops for
 * that product — this matches the products/panel.ts convention so a partial
 * wizard render doesn't fail the whole load.
 */
export const initBriefAllBar = (deps: Deps, opts: InitBriefAllBarOpts): BriefAllBarHandle => {
  const concurrency = opts.concurrency ?? 3;
  const loadingLabel = opts.loadingLabel ?? defaultLoadingLabel;
  const ccBuilders = opts.ccBuilders ?? {};
  const ac = new AbortController();
  /** Per-productId busy flag — tracked in closure to dodge dataset/tsc/biome lint clash. */
  const busy = new Set<string>();

  const findBtn = (productId: string): HTMLButtonElement | null => {
    const el = deps.document.getElementById(`brief-all-btn-${productId}`);
    return el instanceof HTMLButtonElement ? el : null;
  };

  const queryAll = (productId: string): readonly HTMLElement[] =>
    Array.from(
      deps.document.querySelectorAll<HTMLElement>(
        `.insights-tag.expandable[data-product-id="${productId}"]`,
      ),
    );

  const queryExpanded = (productId: string): readonly HTMLElement[] =>
    Array.from(
      deps.document.querySelectorAll<HTMLElement>(
        `.insights-tag.expandable[data-product-id="${productId}"].expanded`,
      ),
    );

  /**
   * Per-product (total, done) cache. Used to skip DOM writes when counts
   * haven't changed — critical because the MutationObserver below watches
   * document.body subtree changes, which includes button.textContent
   * updates. Without this guard, every textContent write re-fires the
   * observer, producing an infinite refresh loop that locks up the page
   * before live data can render.
   */
  const lastCounts = new Map<string, { total: number; done: number }>();

  const updateButton = (product: Product): void => {
    const btn = findBtn(product.id);
    if (!btn) return;
    if (busy.has(product.id)) return; // mid-run; don't disturb
    const total = queryAll(product.id).length;
    const done = queryExpanded(product.id).length;
    const prev = lastCounts.get(product.id);
    if (prev && prev.total === total && prev.done === done) return; // no-op
    lastCounts.set(product.id, { total, done });
    if (total === 0) {
      btn.textContent = product.label;
      btn.disabled = true;
    } else if (done === total) {
      btn.textContent = `${product.label} · all open ✓`;
      btn.disabled = true;
    } else {
      btn.textContent = `${product.label} (${done}/${total})`;
      btn.disabled = false;
    }
  };

  const refresh = (): void => {
    for (const product of opts.products) updateButton(product);
  };

  const briefAll = async (product: Product): Promise<void> => {
    const btn = findBtn(product.id);
    if (!btn) return;
    const systemPrompt = opts.prompts[product.id];
    if (!systemPrompt) {
      btn.textContent = `${product.label} · no prompt configured`;
      btn.disabled = true;
      return;
    }

    const tags = Array.from(
      deps.document.querySelectorAll<HTMLElement>(
        `.insights-tag.expandable[data-product-id="${product.id}"]:not(.expanded)`,
      ),
    );
    if (tags.length === 0) return;

    busy.add(product.id);
    btn.disabled = true;

    // Baseline = briefs already open before this run starts.
    const baseline = queryExpanded(product.id).length;

    interface Task {
      readonly panel: HTMLDivElement;
      readonly flag: Flag;
      readonly item: BriefItem;
      readonly url: string;
    }
    const tasks: Task[] = [];
    // Step 1 — synchronously create panels with a loading state. Skip
    // badges whose host already has a brief panel (another badge owns it).
    for (const span of tags) {
      const host = span.closest(HOST_SELECTOR);
      if (!(host instanceof HTMLElement)) continue;
      if (host.querySelector(':scope > .insights-brief')) continue;
      const flag = readFlag(span);
      const item = readItem(span);
      const panel = deps.document.createElement('div');
      panel.className = 'insights-brief';
      panel.innerHTML = `<span class="loading">${escHtml(loadingLabel(product.label))}</span>`;
      host.appendChild(panel);
      span.classList.add('expanded');
      tasks.push({ panel, flag, item, url: item.url });
    }

    const total = tasks.length;
    let completed = 0;
    const updateProgress = (): void => {
      btn.textContent = `${product.label}: ${baseline + completed}/${baseline + total}…`;
    };
    updateProgress();

    // Step 2 — concurrency-limited fetch. Workers shift tasks off the queue.
    const queue = tasks.slice();
    const workerCount = Math.min(concurrency, queue.length);
    const hasCcBuilder = Boolean(ccBuilders[product.id]);
    const workers = Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const task = queue.shift();
        if (!task) break;
        const briefId = `briefall-${product.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        try {
          const brief = await fetchBrief(deps, {
            flag: task.flag,
            prompt: systemPrompt,
            fingerprint: opts.fingerprintByProduct(task.flag.productId),
            topicSlug: opts.topicSlug,
            item: task.item,
          });
          task.panel.innerHTML = renderBriefHtml(
            brief,
            product.label,
            task.url,
            briefId,
            hasCcBuilder,
            product.actionType,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          task.panel.innerHTML = `<div class="err">Couldn't generate brief: ${escHtml(msg)}</div>`;
        }
        completed++;
        updateProgress();
      }
    });
    await Promise.all(workers);

    btn.textContent = `${product.label} · ready ✓`;
    deps.window.setTimeout(() => {
      busy.delete(product.id);
      updateButton(product);
    }, 1500);
  };

  // Wire click handlers per product.
  for (const product of opts.products) {
    const btn = findBtn(product.id);
    if (!btn) continue;
    btn.addEventListener(
      'click',
      () => {
        void briefAll(product);
      },
      { signal: ac.signal },
    );
  }

  // Initial state.
  refresh();

  // Observe DOM for new badges (live data renders async; RSS feeds may
  // resolve after first paint). Refresh button counts whenever the body
  // tree changes. The observer is cheap because refresh() is O(n) per
  // product over a small badge set.
  const MO = (deps.window as Window & { MutationObserver?: typeof MutationObserver })
    .MutationObserver;
  let observer: MutationObserver | null = null;
  if (MO) {
    observer = new MO(() => refresh());
    observer.observe(deps.document.body, { childList: true, subtree: true });
  }

  return {
    refresh,
    dispose: () => {
      ac.abort();
      observer?.disconnect();
    },
  };
};
