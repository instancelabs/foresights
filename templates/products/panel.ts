/**
 * Brief panel mount — click-to-expand UI for `.insights-tag.expandable`
 * spans emitted by the render/* modules.
 *
 * Ports the brief click handler + renderInsightsBriefHtml + cc-prompt panel
 * from the v0.1 aws-cdk-news.html reference. Data-attribute-driven: the
 * renderers embed the Flag + BriefItem fields in `data-*` attrs on each
 * badge span, and this module reconstructs them on click. No JS-level
 * registry is required for badge → meta lookup.
 *
 * A small per-init registry maps `brief-id` → {brief, flag, item} so the
 * cc-prompt panel can find its source data without re-fetching or stuffing
 * JSON into data attributes.
 *
 * v0.1-bug-look-out:
 * - When two badges share a host, the v0.1 toggle-off path stripped the
 *   `expanded` class from the *clicked* tag rather than from whichever tag
 *   actually owned the existing panel — so the original badge ended up
 *   stuck in `expanded` state with no panel beneath. v0.2 removes
 *   `expanded` from every `.insights-tag.expanded` under the same host
 *   when a panel is torn down.
 * - The v0.1 host selector omitted `.sl-card` even though spotlight badges
 *   are wrapped in `.sl-flags .insights-tag`. v0.2 includes it.
 */

import type { Brief, Deps, Flag, Product } from '../types';
import { escHtml } from '../util/escape';
import { type BriefItem, fetchBrief } from './brief';
import type { CcPromptBuilder } from './cc-prompts';

/** Host containers a brief panel can sit inside. */
const HOST_SELECTOR = 'li, .card, .pr-item, .hl-card, .sl-card';

export interface InitBriefPanelOpts {
  /** All configured products — used to look up productLabel for the brief header. */
  readonly products: readonly Product[];
  /** Per-product Haiku system prompts (the wizard emits one per product). */
  readonly prompts: Readonly<Record<string, string>>;
  /**
   * Per-product cache fingerprint. Pure function — called every fetch so
   * a context refresh (which updates the underlying registry) is observed
   * without re-initing the panel.
   */
  readonly fingerprintByProduct: (productId: string) => string;
  /** Topic slug — namespaces the cache key. */
  readonly topicSlug: string;
  /** Per-product Claude Code prompt builders. Empty = no cc-prompt UI. */
  readonly ccBuilders?: Readonly<Record<string, CcPromptBuilder>>;
  /**
   * Override for the loading message ("Generating <product> brief…"). Useful
   * if the dashboard wants to brand the loading text differently.
   */
  readonly loadingLabel?: (productLabel: string) => string;
}

interface BriefEntry {
  readonly brief: Brief;
  readonly flag: Flag;
  readonly item: BriefItem;
  readonly url: string;
}

interface PanelHandle {
  /** Tear down event listeners — for tests and re-init. */
  readonly dispose: () => void;
}

/**
 * Read a `data-*` attribute as a guaranteed string (empty when missing).
 * Routed through this helper so we stay TS4111-clean on `DOMStringMap` access.
 */
const dataStr = (el: HTMLElement, camelKey: string): string => el.dataset[camelKey] ?? '';

const optionalStr = (el: HTMLElement, camelKey: string): string | undefined => {
  const v = el.dataset[camelKey];
  return v && v !== '' ? v : undefined;
};

/** Narrow a mode string. */
const readMode = (raw: string): 'plan' | 'implement' =>
  raw === 'implement' ? 'implement' : 'plan';

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
  const item: BriefItem = {
    kind,
    text,
    url,
    reason,
    ...(version !== undefined ? { version } : {}),
    ...(source !== undefined ? { source } : {}),
  };
  return item;
};

const findHost = (span: Element): HTMLElement | null => {
  const host = span.closest(HOST_SELECTOR);
  return host instanceof HTMLElement ? host : null;
};

const labelFor = (products: readonly Product[], productId: string): string => {
  const p = products.find((x) => x.id === productId);
  return p?.label ?? productId;
};

const defaultLoadingLabel = (productLabel: string): string => `Generating ${productLabel} brief…`;

/**
 * Pure HTML for the brief body — why / integrations / cc-prompt scaffold /
 * footer. Exported for unit testing without DOM mount.
 */
export const renderBriefHtml = (
  brief: Brief,
  productLabel: string,
  url: string,
  briefId: string,
  hasCcBuilder: boolean,
): string => {
  const integrations = brief.integrations
    .map((i) => `<li><strong>${escHtml(i.title)}</strong> — ${escHtml(i.detail)}</li>`)
    .join('');
  const ccBlock = hasCcBuilder
    ? `<div class="brief-cc-actions"><button class="brief-cc-btn" type="button" data-brief-id="${escHtml(briefId)}">Generate Claude Code prompt</button></div><div class="brief-cc-panel hidden" data-brief-id="${escHtml(briefId)}" data-mode="plan"><div class="brief-cc-header"><strong>Claude Code prompt</strong><div class="brief-cc-controls"><div class="cc-mode-toggle" role="group" aria-label="Prompt mode"><button type="button" class="active" data-mode="plan" title="Tell Claude Code to produce a plan and wait for approval">Plan</button><button type="button" data-mode="implement" title="Tell Claude Code to plan AND implement">Plan + Implement</button></div><button class="brief-cc-copy" type="button" data-format="prompt" title="Copy the prompt text">Copy</button><button class="brief-cc-copy" type="button" data-format="task" title="Copy as a markdown task file">Copy as task</button></div></div><pre class="brief-cc-text"></pre></div>`
    : '';
  const footer = `<div class="footer"><span>Generated by Haiku · cached locally</span>${
    url ? `<a href="${escHtml(url)}" target="_blank" rel="noopener">Open source ↗</a>` : ''
  }</div>`;
  return `<h5>Why relevant to ${escHtml(productLabel)}</h5><p>${escHtml(brief.why)}</p>${
    integrations ? `<h5>How it could integrate</h5><ul>${integrations}</ul>` : ''
  }${ccBlock}${footer}`;
};

const writeToClipboard = async (deps: Deps, text: string): Promise<boolean> => {
  const nav = deps.window.navigator;
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to execCommand fallback
    }
  }
  // Fallback for restricted contexts.
  try {
    const ta = deps.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    deps.document.body.appendChild(ta);
    ta.select();
    const ok = deps.document.execCommand?.('copy') ?? false;
    deps.document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
};

/**
 * Install the brief panel click delegate. Returns a `dispose` to tear it
 * down — used by tests and any future re-init flow.
 */
export const initBriefPanel = (deps: Deps, opts: InitBriefPanelOpts): PanelHandle => {
  const ac = new AbortController();
  const briefStore = new Map<string, BriefEntry>();
  let briefSeq = 0;
  const loadingLabel = opts.loadingLabel ?? defaultLoadingLabel;
  const ccBuilders = opts.ccBuilders ?? {};

  /** Look up the brief by briefId — used by cc-prompt handlers. */
  const lookupBrief = (briefId: string): BriefEntry | undefined => briefStore.get(briefId);

  /** Remove every brief panel under `host` and reset every `expanded` badge. */
  const tearDownPanel = (host: HTMLElement): void => {
    for (const panel of host.querySelectorAll(':scope > .insights-brief')) {
      // Drop registry entries owned by this panel so the Map doesn't leak.
      for (const cc of panel.querySelectorAll<HTMLElement>('[data-brief-id]')) {
        const id = dataStr(cc, 'briefId');
        if (id) briefStore.delete(id);
      }
      panel.remove();
    }
    for (const tag of host.querySelectorAll('.insights-tag.expanded')) {
      tag.classList.remove('expanded');
    }
  };

  /** Async brief flow — insert loading, fetch, render. */
  const expandBrief = async (span: HTMLElement, host: HTMLElement): Promise<void> => {
    const flag = readFlag(span);
    const item = readItem(span);
    const productLabel = labelFor(opts.products, flag.productId);
    const prompt = opts.prompts[flag.productId] ?? '';
    const fingerprint = opts.fingerprintByProduct(flag.productId);

    const panel = deps.document.createElement('div');
    panel.className = 'insights-brief';
    panel.innerHTML = `<span class="loading">${escHtml(loadingLabel(productLabel))}</span>`;
    host.appendChild(panel);
    span.classList.add('expanded');

    if (!prompt) {
      panel.innerHTML = `<div class="err">No system prompt configured for product '${escHtml(flag.productId)}'.</div>`;
      return;
    }

    try {
      const brief = await fetchBrief(deps, {
        flag,
        prompt,
        fingerprint,
        topicSlug: opts.topicSlug,
        item,
      });
      briefSeq += 1;
      const briefId = `b${briefSeq}`;
      const urlStr = flag.url ?? '';
      briefStore.set(briefId, { brief, flag, item, url: urlStr });
      const hasCcBuilder = Object.hasOwn(ccBuilders, flag.productId);
      panel.innerHTML = renderBriefHtml(brief, productLabel, urlStr, briefId, hasCcBuilder);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      panel.innerHTML = `<div class="err">Couldn't generate brief: ${escHtml(msg)}</div>`;
    }
  };

  // ----- click delegate: badge expand/collapse -----
  deps.document.addEventListener(
    'click',
    (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      // 1) cc-prompt copy button — highest specificity so toggle handlers
      //    below don't double-fire on the panel click.
      const copyBtn = target.closest('.brief-cc-copy');
      if (copyBtn instanceof HTMLElement) {
        e.preventDefault();
        e.stopPropagation();
        void onCopyClick(copyBtn);
        return;
      }

      // 2) cc-prompt plan/implement mode toggle.
      const modeBtn = target.closest('.cc-mode-toggle button');
      if (modeBtn instanceof HTMLElement) {
        e.preventDefault();
        e.stopPropagation();
        onModeClick(modeBtn);
        return;
      }

      // 3) cc-prompt show/hide panel.
      const ccBtn = target.closest('.brief-cc-btn');
      if (ccBtn instanceof HTMLElement) {
        e.preventDefault();
        e.stopPropagation();
        onCcBtnClick(ccBtn);
        return;
      }

      // 4) badge expand/collapse.
      const tag = target.closest('.insights-tag.expandable');
      if (tag instanceof HTMLElement) {
        e.preventDefault();
        e.stopPropagation();
        const host = findHost(tag);
        if (!host) return;
        const existing = host.querySelector(':scope > .insights-brief');
        if (existing) {
          tearDownPanel(host);
          return;
        }
        void expandBrief(tag, host);
      }
    },
    { signal: ac.signal },
  );

  // ---- cc-prompt: toggle the prompt panel for a brief ----
  const onCcBtnClick = (btn: HTMLElement): void => {
    const briefId = dataStr(btn, 'briefId');
    if (!briefId || !briefStore.has(briefId)) return;
    const root = btn.closest('.insights-brief');
    if (!root) return;
    const panel = root.querySelector<HTMLElement>(
      `.brief-cc-panel[data-brief-id="${cssEscape(briefId)}"]`,
    );
    if (!panel) return;
    if (panel.classList.contains('hidden')) {
      refreshPanelText(panel, briefId);
      panel.classList.remove('hidden');
      btn.textContent = 'Hide prompt';
    } else {
      panel.classList.add('hidden');
      btn.textContent = 'Generate Claude Code prompt';
    }
  };

  // ---- cc-prompt: plan / implement mode toggle ----
  const onModeClick = (btn: HTMLElement): void => {
    const panel = btn.closest('.brief-cc-panel');
    if (!(panel instanceof HTMLElement)) return;
    const newMode = readMode(dataStr(btn, 'mode'));
    if (readMode(dataStr(panel, 'mode')) === newMode) return; // no-op
    // setAttribute mirrors into dataset and dodges DOMStringMap's index-signature
    // dance (biome wants .mode; tsc wants ['mode']).
    panel.setAttribute('data-mode', newMode);
    for (const b of panel.querySelectorAll<HTMLElement>('.cc-mode-toggle button')) {
      b.classList.toggle('active', dataStr(b, 'mode') === newMode);
    }
    const briefId = dataStr(panel, 'briefId');
    if (briefId) refreshPanelText(panel, briefId);
  };

  // ---- cc-prompt: copy ----
  const onCopyClick = async (btn: HTMLElement): Promise<void> => {
    const panel = btn.closest('.brief-cc-panel');
    if (!(panel instanceof HTMLElement)) return;
    const briefId = dataStr(panel, 'briefId');
    if (!briefId) return;
    const entry = lookupBrief(briefId);
    if (!entry) return;
    const mode = readMode(dataStr(panel, 'mode'));
    const format = dataStr(btn, 'format') === 'task' ? 'task' : 'prompt';
    const builder = ccBuilders[entry.flag.productId];
    if (!builder) return;
    const built = builder({ brief: entry.brief, meta: entry.flag, mode });
    const text = format === 'task' ? wrapAsTask(built, entry, mode, deps.now()) : built;
    if (!text) return;

    const originalLabel = btn.textContent ?? 'Copy';
    const ok = await writeToClipboard(deps, text);
    if (ok) {
      btn.textContent = format === 'task' ? 'Task copied ✓' : 'Copied ✓';
      btn.classList.add('copied');
      deps.window.setTimeout(() => {
        btn.textContent = originalLabel;
        btn.classList.remove('copied');
      }, 1500);
    } else {
      btn.textContent = 'Copy failed';
      deps.window.setTimeout(() => {
        btn.textContent = originalLabel;
      }, 1800);
    }
  };

  /** Re-render the cc prompt text inside `panel` from the registry entry. */
  const refreshPanelText = (panel: HTMLElement, briefId: string): void => {
    const entry = lookupBrief(briefId);
    if (!entry) return;
    const mode = readMode(dataStr(panel, 'mode'));
    const builder = ccBuilders[entry.flag.productId];
    const text = builder ? builder({ brief: entry.brief, meta: entry.flag, mode }) : '';
    const pre = panel.querySelector<HTMLElement>('.brief-cc-text');
    if (pre) pre.textContent = text;
  };

  return { dispose: () => ac.abort() };
};

/** Wrap a prompt as a markdown task file with header + run instructions. */
const wrapAsTask = (
  prompt: string,
  entry: BriefEntry,
  mode: 'plan' | 'implement',
  now: Date,
): string => {
  const today = now.toISOString().slice(0, 10);
  const titleStr = entry.flag.title ?? entry.flag.stableId;
  const urlStr = entry.flag.url ?? '(no url)';
  const head = `# ${titleStr} — ${entry.flag.productId} (${mode})\n\nSource: ${urlStr}\nGenerated: ${today}\n\n---\n\n`;
  return head + prompt;
};

/** CSS.escape polyfill — jsdom has it, but be defensive. */
const cssEscape = (s: string): string => {
  // biome-ignore lint/suspicious/noExplicitAny: globalThis.CSS may be missing in old runtimes.
  const css = (globalThis as any).CSS as { escape?: (s: string) => string } | undefined;
  if (css?.escape) return css.escape(s);
  return s.replace(/["\\]/g, '\\$&');
};
