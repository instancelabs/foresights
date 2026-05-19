// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deps } from '../types';
import { createInMemoryStorage } from '../util/storage';
import { type DigestPanelHandle, initDigestPanel, mdToHtml } from './panel';

const FROZEN_NOW = (): Date => new Date('2026-05-19T12:00:00Z');

const makeDeps = (): Deps => ({
  callTool: vi.fn(),
  askClaude: vi.fn(),
  runScheduledTask: vi.fn(),
  storage: createInMemoryStorage(),
  now: FROZEN_NOW,
  document,
  window: window as unknown as Window,
});

const installScaffold = (): void => {
  document.body.innerHTML = `
    <div id="digest-panel" class="hidden">
      <div id="digest-panel-title"></div>
      <div id="digest-panel-body"></div>
      <button id="digest-copy-btn" type="button">Copy markdown</button>
      <button id="digest-download-btn" type="button">Download .md</button>
      <button id="digest-close-btn" type="button">Close</button>
    </div>
  `;
};

const click = (el: Element | null): void => {
  if (!el) throw new Error('click: element missing');
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

let handle: DigestPanelHandle | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  if (handle) {
    handle.dispose();
    handle = null;
  }
});

describe('mdToHtml', () => {
  it('emits h1 / h2 / h3 from #, ##, ###', () => {
    const out = mdToHtml('# A\n## B\n### C');
    expect(out).toContain('<h1>A</h1>');
    expect(out).toContain('<h2>B</h2>');
    expect(out).toContain('<h3>C</h3>');
  });

  it('emits <hr> from --- on its own line', () => {
    expect(mdToHtml('---')).toContain('<hr>');
  });

  it('emits <blockquote> from `> ...`', () => {
    expect(mdToHtml('> a quote')).toContain('<blockquote>a quote</blockquote>');
  });

  it('converts **bold** to <strong>', () => {
    expect(mdToHtml('**bold word**')).toContain('<strong>bold word</strong>');
  });

  it('converts `inline code` to <code>', () => {
    expect(mdToHtml('`x` and `y`')).toContain('<code>x</code>');
  });

  it('converts ```fenced code``` into <pre><code>', () => {
    const out = mdToHtml('```\nfn main() {}\n```');
    expect(out).toContain('<pre><code>');
    expect(out).toContain('fn main() {}');
  });

  it('converts [link](url) to anchors with target=_blank', () => {
    const out = mdToHtml('[home](https://example.com)');
    expect(out).toContain('<a href="https://example.com" target="_blank" rel="noopener">home</a>');
  });

  it('groups consecutive `- item` lines into a <ul>', () => {
    const out = mdToHtml('- one\n- two\n- three');
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>one</li>');
    expect(out).toContain('<li>three</li>');
    expect(out).toContain('</ul>');
  });

  it('groups consecutive `N. item` lines into a <ul> (degenerate but matches v0.1)', () => {
    const out = mdToHtml('1. first\n2. second');
    expect(out).toContain('<li>first</li>');
    expect(out).toContain('<li>second</li>');
  });

  it('escapes raw HTML in the input', () => {
    const out = mdToHtml('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });
});

describe('initDigestPanel — open / close', () => {
  it('open() reveals the panel + sets title + body innerHTML', () => {
    installScaffold();
    const deps = makeDeps();
    handle = initDigestPanel(deps);
    handle.open({
      markdown: '# Title\n\nbody text',
      productLabel: 'CDK Insights',
      productSlug: 'cdk-insights',
      date: '2026-05-19',
    });
    const panel = document.getElementById('digest-panel');
    expect(panel?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('digest-panel-title')?.textContent).toBe(
      'CDK Insights upgrade digest',
    );
    expect(document.getElementById('digest-panel-body')?.innerHTML).toContain('<h1>Title</h1>');
  });

  it('stores the markdown + slug in data-* for v0.1 dataset compatibility', () => {
    installScaffold();
    const deps = makeDeps();
    handle = initDigestPanel(deps);
    handle.open({
      markdown: 'TEST_MARKDOWN',
      productLabel: 'X',
      productSlug: 'x-slug',
      date: '2026-05-19',
    });
    const panel = document.getElementById('digest-panel');
    expect(panel?.getAttribute('data-markdown')).toBe('TEST_MARKDOWN');
    expect(panel?.getAttribute('data-product-slug')).toBe('x-slug');
  });

  it('close() hides the panel', () => {
    installScaffold();
    const deps = makeDeps();
    handle = initDigestPanel(deps);
    handle.open({
      markdown: '# x',
      productLabel: 'X',
      productSlug: 'x',
      date: '2026-05-19',
    });
    expect(document.getElementById('digest-panel')?.classList.contains('hidden')).toBe(false);
    handle.close();
    expect(document.getElementById('digest-panel')?.classList.contains('hidden')).toBe(true);
  });

  it('clicking the close button hides the panel', () => {
    installScaffold();
    const deps = makeDeps();
    handle = initDigestPanel(deps);
    handle.open({
      markdown: '# x',
      productLabel: 'X',
      productSlug: 'x',
      date: '2026-05-19',
    });
    click(document.getElementById('digest-close-btn'));
    expect(document.getElementById('digest-panel')?.classList.contains('hidden')).toBe(true);
  });

  it('open() can be called multiple times to switch products', () => {
    installScaffold();
    const deps = makeDeps();
    handle = initDigestPanel(deps);
    handle.open({
      markdown: '# A',
      productLabel: 'A-Product',
      productSlug: 'a',
      date: '2026-05-19',
    });
    handle.open({
      markdown: '# B',
      productLabel: 'B-Product',
      productSlug: 'b',
      date: '2026-05-19',
    });
    expect(document.getElementById('digest-panel-title')?.textContent).toBe(
      'B-Product upgrade digest',
    );
    expect(document.getElementById('digest-panel-body')?.innerHTML).toContain('<h1>B</h1>');
  });

  it('open() is a no-op when scaffold elements are missing — does not throw', () => {
    document.body.innerHTML = ''; // no scaffold
    const deps = makeDeps();
    handle = initDigestPanel(deps);
    expect(() =>
      handle?.open({
        markdown: '# x',
        productLabel: 'X',
        productSlug: 'x',
        date: '2026-05-19',
      }),
    ).not.toThrow();
  });
});

describe('initDigestPanel — copy button', () => {
  it('writes the latest markdown to navigator.clipboard.writeText', async () => {
    installScaffold();
    const deps = makeDeps();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    handle = initDigestPanel(deps);
    handle.open({
      markdown: 'WHAT_GETS_COPIED',
      productLabel: 'X',
      productSlug: 'x',
      date: '2026-05-19',
    });
    click(document.getElementById('digest-copy-btn'));
    await flush();
    expect(writeText).toHaveBeenCalledWith('WHAT_GETS_COPIED');
  });

  it('flashes "Copied ✓" on the button after a successful copy', async () => {
    installScaffold();
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.resolve()) },
      configurable: true,
    });
    handle = initDigestPanel(makeDeps());
    handle.open({
      markdown: 'X',
      productLabel: 'X',
      productSlug: 'x',
      date: '2026-05-19',
    });
    const btn = document.getElementById('digest-copy-btn') as HTMLButtonElement;
    click(btn);
    await flush();
    expect(btn.textContent).toBe('Copied ✓');
    expect(btn.classList.contains('copied')).toBe(true);
  });

  it('does nothing when no markdown has been opened yet', () => {
    installScaffold();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    handle = initDigestPanel(makeDeps());
    click(document.getElementById('digest-copy-btn'));
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('initDigestPanel — download button', () => {
  it('builds a blob URL and triggers an anchor click with the right filename', () => {
    installScaffold();
    const deps = makeDeps();
    const createObjectURL = vi.fn(() => 'blob:fake-url-1');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true,
    });
    // Spy on anchor.click() so we can assert it fires.
    const realCreateElement = document.createElement.bind(document);
    const anchors: HTMLAnchorElement[] = [];
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        const el = realCreateElement(tag);
        if (tag === 'a') {
          anchors.push(el as HTMLAnchorElement);
          (el as HTMLAnchorElement).click = vi.fn();
        }
        return el;
      });

    handle = initDigestPanel(deps);
    handle.open({
      markdown: '# digest',
      productLabel: 'CDK Insights',
      productSlug: 'cdk-insights',
      date: '2026-05-19',
    });
    click(document.getElementById('digest-download-btn'));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchors).toHaveLength(1);
    const anchor = anchors[0];
    if (!anchor) throw new Error('expected one anchor');
    expect(anchor.download).toBe('2026-05-19-cdk-insights-upgrade-digest.md');
    expect(anchor.href).toBe('blob:fake-url-1');
    expect(anchor.click).toHaveBeenCalledTimes(1);

    createElementSpy.mockRestore();
  });

  it('does not download when no markdown has been opened yet', () => {
    installScaffold();
    const createObjectURL = vi.fn(() => 'blob:should-not-be-created');
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true,
    });
    handle = initDigestPanel(makeDeps());
    click(document.getElementById('digest-download-btn'));
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});

describe('initDigestPanel — dispose', () => {
  it('removes event listeners so subsequent clicks no-op', async () => {
    installScaffold();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const local = initDigestPanel(makeDeps());
    local.open({
      markdown: 'X',
      productLabel: 'X',
      productSlug: 'x',
      date: '2026-05-19',
    });
    local.dispose();
    click(document.getElementById('digest-copy-btn'));
    await flush();
    expect(writeText).not.toHaveBeenCalled();
  });
});
