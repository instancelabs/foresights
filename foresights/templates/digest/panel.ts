/**
 * Digest panel mount — copy / download / close handlers for the per-product
 * upgrade digest UI.
 *
 * The dashboard template has the panel DOM scaffold baked in (one shared
 * panel for all products; the wizard emits per-product trigger buttons
 * separately). This module installs the handlers and exposes
 * `open` / `close` / `dispose` so the caller can drive the panel
 * programmatically once a digest has been composed.
 *
 * DOM scaffold expected (IDs configurable via opts for tests; defaults
 * match the template):
 *
 *   <div id="digest-panel" class="hidden">
 *     <div id="digest-panel-title">…</div>
 *     <div id="digest-panel-body">…</div>
 *     <button id="digest-copy-btn">Copy markdown</button>
 *     <button id="digest-download-btn">Download .md</button>
 *     <button id="digest-close-btn">Close</button>
 *   </div>
 *
 * v0.1-bug-look-out:
 * - v0.1 stored the markdown in `panel.dataset.markdown`. We carry that
 *   forward (so external Copy/Download wiring can still find the markdown)
 *   but ALSO keep the latest payload in a closure variable — dataset
 *   reads coerce to string and lose nothing here, but the closure path
 *   is more direct and survives any third-party DOM tampering.
 * - v0.1 fired the Download via a synthetic anchor click but never
 *   removed the temporary anchor from the DOM until the next call (and
 *   the click-then-detach approach is sensitive to ordering). v0.2
 *   appends → clicks → removes synchronously, and revokes the object
 *   URL after a short delay to give the browser time to start the
 *   download.
 */

import type { Deps } from '../types';
import { escHtml, safeHref } from '../util/escape';

export interface InitDigestPanelOpts {
  /** ID of the panel container element. Default: `'digest-panel'`. */
  readonly panelId?: string;
  /** ID of the title element. Default: `'digest-panel-title'`. */
  readonly titleId?: string;
  /** ID of the body element. Default: `'digest-panel-body'`. */
  readonly bodyId?: string;
  /** ID of the copy button. Default: `'digest-copy-btn'`. */
  readonly copyBtnId?: string;
  /** ID of the download button. Default: `'digest-download-btn'`. */
  readonly downloadBtnId?: string;
  /** ID of the close button. Default: `'digest-close-btn'`. */
  readonly closeBtnId?: string;
}

export interface OpenDigestArgs {
  /** The composed markdown digest. */
  readonly markdown: string;
  /** Display label shown in the panel header. */
  readonly productLabel: string;
  /**
   * Slug for the download filename — combined with the date as
   * `${date}-${productSlug}-upgrade-digest.md`.
   */
  readonly productSlug: string;
  /** Date for the download filename. YYYY-MM-DD. */
  readonly date: string;
}

export interface DigestPanelHandle {
  /** Open the panel with the given markdown payload. */
  readonly open: (args: OpenDigestArgs) => void;
  /** Hide the panel. Does NOT clear the markdown payload. */
  readonly close: () => void;
  /** Tear down event listeners — used by tests and any re-init flow. */
  readonly dispose: () => void;
}

/**
 * Render markdown → HTML for the digest panel body. Subset of CommonMark
 * sufficient for the digest renderer's output: headings (h1/h2/h3),
 * horizontal rules, blockquotes, bold, inline code, fenced code blocks,
 * links, and unordered + ordered lists.
 *
 * Exported for unit testing without DOM mount.
 */
export const mdToHtml = (md: string): string => {
  let html = escHtml(md);
  // escHtml escapes backticks to `&#96;` (v0.9.3 / finding L1 — defence
  // for any template-literal-context consumer). Markdown's inline-code
  // and fenced-code syntax both rely on literal backticks, so restore
  // them here BEFORE the code-block / inline-code regexes run. This is
  // safe because the only thing parsed in the digest panel is the
  // markdown the caller passed in — anything that survives the regex
  // patterns below stays escaped, including the now-restored backticks
  // in normal prose (which will appear in the final HTML as a literal
  // backtick character, which is the markdown rendering the user wrote).
  html = html.replace(/&#96;/g, '`');

  // Code blocks first so their content isn't double-processed. The fence is
  // matched as a run of 3+ backticks with a backreference for the close, so
  // digest prompts wrapped in a longer fence (renderDigestMarkdown widens it
  // when the embedded prompt itself contains ```) still parse correctly.
  html = html.replace(
    /(`{3,})(?:\w*)\n([\s\S]*?)\1/g,
    (_full, _fence: string, code: string) => `<pre><code>${code}</code></pre>`,
  );

  // Headings.
  html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');
  html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');

  // Horizontal rule.
  html = html.replace(/^---$/gm, '<hr>');

  // Blockquotes (escHtml has already turned `>` into `&gt;`).
  html = html.replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>');

  // Bold.
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Inline code.
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Links. Route the captured URL ($2) through `safeHref` so a
  // `[click](javascript:...)` payload in Haiku-emitted triage prose
  // degrades to a `#` anchor instead of an active script URL.
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, text: string, url: string) =>
      `<a href="${safeHref(url)}" target="_blank" rel="noopener">${text}</a>`,
  );

  // Lists — numbered and bulleted, both converted to <li>.
  html = html.replace(/^\d+\. (.*)$/gm, '<li>$1</li>');
  html = html.replace(/^- (.*)$/gm, '<li>$1</li>');
  // Group consecutive <li> runs into <ul> blocks.
  html = html.replace(
    /(<li>[\s\S]*?<\/li>)(\n<li>[\s\S]*?<\/li>)*/g,
    (m) => `<ul>${m.replace(/\n/g, '')}</ul>`,
  );

  // Whitelist <details> / <summary> — renderDigestMarkdown intentionally
  // emits these around embedded Claude Code prompts so the panel renders
  // collapsible sections. They got escaped to `&lt;details&gt;` etc. by the
  // initial escHtml pass; restore them here. Everything else (including
  // <script>, <iframe>, etc.) stays escaped.
  //
  // Anchored to whole lines (`^…$` + `m`): the digest renderer always emits
  // these markers as standalone lines, so a brief / triage / item string that
  // happens to contain a literal `<details>` inline stays escaped and can't
  // inject collapsible structure into the panel (content-spoofing vector).
  html = html.replace(/^&lt;(\/?details)&gt;$/gm, '<$1>');
  html = html.replace(/^&lt;summary&gt;(.*?)&lt;\/summary&gt;$/gm, '<summary>$1</summary>');

  return html;
};

/** Best-effort clipboard write with execCommand fallback for restricted contexts. */
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
  const ta = deps.document.createElement('textarea');
  try {
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    deps.document.body.appendChild(ta);
    ta.select();
    return deps.document.execCommand?.('copy') ?? false;
  } catch {
    return false;
  } finally {
    // Always detach — if execCommand throws mid-copy the textarea would
    // otherwise leak into the DOM on every failed copy.
    if (ta.parentNode) ta.parentNode.removeChild(ta);
  }
};

/** Trigger a download of the markdown via a Blob + objectURL + synthetic anchor. */
const downloadMarkdown = (deps: Deps, markdown: string, filename: string): void => {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = deps.document.createElement('a');
  a.href = url;
  a.download = filename;
  deps.document.body.appendChild(a);
  a.click();
  deps.document.body.removeChild(a);
  // Revoke the object URL on the next tick so the browser has time to read it.
  deps.window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
};

const flashLabel = (
  deps: Deps,
  btn: HTMLElement,
  okText: string,
  failText: string,
  ok: boolean,
  durationMs: number,
): void => {
  const original = btn.textContent ?? '';
  btn.textContent = ok ? okText : failText;
  if (ok) btn.classList.add('copied');
  deps.window.setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('copied');
  }, durationMs);
};

/**
 * Install the digest panel handlers. Returns `{ open, close, dispose }`.
 *
 * The panel container must exist in the DOM at init time. If any of the
 * other elements (title/body/buttons) is missing, the corresponding action
 * silently no-ops — this is intentional so a partially-rendered template
 * doesn't break the rest of the dashboard.
 */
export const initDigestPanel = (deps: Deps, opts: InitDigestPanelOpts = {}): DigestPanelHandle => {
  const panelId = opts.panelId ?? 'digest-panel';
  const titleId = opts.titleId ?? 'digest-panel-title';
  const bodyId = opts.bodyId ?? 'digest-panel-body';
  const copyBtnId = opts.copyBtnId ?? 'digest-copy-btn';
  const downloadBtnId = opts.downloadBtnId ?? 'digest-download-btn';
  const closeBtnId = opts.closeBtnId ?? 'digest-close-btn';

  const panel = deps.document.getElementById(panelId);
  const titleEl = deps.document.getElementById(titleId);
  const bodyEl = deps.document.getElementById(bodyId);
  const copyBtn = deps.document.getElementById(copyBtnId);
  const downloadBtn = deps.document.getElementById(downloadBtnId);
  const closeBtn = deps.document.getElementById(closeBtnId);

  const ac = new AbortController();
  // Closure storage — survives external dataset tampering and avoids a
  // string-coerce roundtrip every time we copy.
  let currentMarkdown = '';
  let currentSlug = '';
  let currentDate = '';

  if (copyBtn) {
    copyBtn.addEventListener(
      'click',
      () => {
        if (!currentMarkdown) return;
        void (async () => {
          const ok = await writeToClipboard(deps, currentMarkdown);
          flashLabel(deps, copyBtn, 'Copied ✓', 'Copy failed', ok, 1500);
        })();
      },
      { signal: ac.signal },
    );
  }

  if (downloadBtn) {
    downloadBtn.addEventListener(
      'click',
      () => {
        if (!currentMarkdown) return;
        try {
          const filename = `${currentDate}-${currentSlug}-upgrade-digest.md`;
          downloadMarkdown(deps, currentMarkdown, filename);
        } catch {
          flashLabel(deps, downloadBtn, '', 'Download failed', false, 1800);
        }
      },
      { signal: ac.signal },
    );
  }

  if (closeBtn) {
    closeBtn.addEventListener(
      'click',
      () => {
        if (panel) panel.classList.add('hidden');
      },
      { signal: ac.signal },
    );
  }

  const open = (args: OpenDigestArgs): void => {
    currentMarkdown = args.markdown;
    currentSlug = args.productSlug;
    currentDate = args.date;

    if (titleEl) titleEl.textContent = `${args.productLabel} upgrade digest`;
    if (bodyEl) bodyEl.innerHTML = mdToHtml(args.markdown);
    if (panel) {
      // Preserve the v0.1 dataset contract so external scripts can still
      // discover the markdown payload (e.g. an embedded /digest-save copy).
      panel.setAttribute('data-markdown', args.markdown);
      panel.setAttribute('data-product-slug', args.productSlug);
      panel.classList.remove('hidden');
    }
  };

  const close = (): void => {
    if (panel) panel.classList.add('hidden');
  };

  return {
    open,
    close,
    dispose: () => ac.abort(),
  };
};
