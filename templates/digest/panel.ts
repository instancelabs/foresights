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
import { escHtml } from '../util/escape';

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

  // Code blocks first so their content isn't double-processed.
  html = html.replace(
    /```(?:\w*)\n([\s\S]*?)```/g,
    (_, code: string) => `<pre><code>${code}</code></pre>`,
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

  // Links.
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>',
  );

  // Lists — numbered and bulleted, both converted to <li>.
  html = html.replace(/^\d+\. (.*)$/gm, '<li>$1</li>');
  html = html.replace(/^- (.*)$/gm, '<li>$1</li>');
  // Group consecutive <li> runs into <ul> blocks.
  html = html.replace(
    /(<li>[\s\S]*?<\/li>)(\n<li>[\s\S]*?<\/li>)*/g,
    (m) => `<ul>${m.replace(/\n/g, '')}</ul>`,
  );

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
