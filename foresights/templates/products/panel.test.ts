// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuildCcPromptArgs, Deps, Product } from '../types';
import { createInMemoryStorage } from '../util/storage';
import { briefCacheKey } from './brief';
import type { CcPromptBuilder } from './cc-prompts';
import { initBriefPanel, renderBriefHtml } from './panel';

const CDKI: Product = {
  id: 'cdki',
  label: 'CDK Insights',
  cssMod: '',
  match: () => null, // unused in panel tests
};
const LC: Product = {
  id: 'lc',
  label: 'Last Command',
  cssMod: 'lc',
  match: () => null,
};

const FROZEN_NOW = (): Date => new Date('2026-05-19T12:00:00Z');

const validResponse = JSON.stringify({
  why: 'Mixins change how constructs compose, which is core to CDK Insights traversal.',
  integrations: [
    {
      title: 'Add mixin-awareness rule',
      detail: 'In src/aspects/CdkInsightsAspect.ts, detect mixin-derived constructs.',
    },
  ],
});

const makeDeps = (askClaudeImpl: (prompt: string, data?: unknown[]) => Promise<string>): Deps => {
  return {
    callTool: vi.fn(),
    askClaude: vi.fn(askClaudeImpl),
    runScheduledTask: vi.fn(),
    storage: createInMemoryStorage(),
    now: FROZEN_NOW,
    document,
    window: window as unknown as Window,
  };
};

const installCard = (html: string): HTMLElement => {
  document.body.innerHTML = html;
  const card = document.querySelector('.hl-card');
  if (!(card instanceof HTMLElement)) throw new Error('test fixture missing .hl-card');
  return card;
};

/** Build a fixture card with one `.insights-tag.expandable` badge. */
const cardWithBadge = (
  productId: string,
  overrides: Partial<Record<string, string>> = {},
): string => {
  const attrs: Record<string, string> = {
    productId,
    stableId: 'release:v1:features:add-foo',
    section: 'releases',
    title: 'Add foo support',
    url: 'https://example.com/r/1',
    reason: 'CDK area',
    kind: 'release-features',
    text: '**core:** add foo support',
    ...overrides,
  };
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${v}"`)
    .join(' ');
  return `
    <div class="hl-card">
      <h3>Release v1 <span class="insights-tag expandable" ${attrStr} title="CDK area · click for full brief">${productId}</span></h3>
      <p>Body</p>
    </div>
  `;
};

const click = (el: Element): void => {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
};

const flush = async (): Promise<void> => {
  // 4 microtask ticks covers: fetchBrief resolve → storage read → askClaude resolve → DOM write.
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

let disposeHandle: { dispose: () => void } | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  if (disposeHandle) {
    disposeHandle.dispose();
    disposeHandle = null;
  }
});

describe('renderBriefHtml (pure)', () => {
  it('renders why + integrations', () => {
    const html = renderBriefHtml(
      {
        why: 'cool reason',
        integrations: [{ title: 'do X', detail: 'in src/Y.ts' }],
      },
      'CDK Insights',
      'https://example.com/x',
      'b1',
      false,
    );
    expect(html).toContain('Why relevant to CDK Insights');
    expect(html).toContain('cool reason');
    expect(html).toContain('How it could integrate');
    expect(html).toContain('do X');
    expect(html).toContain('in src/Y.ts');
    expect(html).toContain('Open source ↗');
  });

  it('omits the integrations heading when integrations is empty', () => {
    const html = renderBriefHtml({ why: 'why', integrations: [] }, 'CDK Insights', '', 'b1', false);
    expect(html).not.toContain('How it could integrate');
  });

  it('shows the cc-prompt button only when hasCcBuilder=true', () => {
    const withCc = renderBriefHtml({ why: 'w', integrations: [] }, 'CDK Insights', '', 'b1', true);
    expect(withCc).toContain('Generate Claude Code prompt');
    expect(withCc).toContain('brief-cc-panel');

    const without = renderBriefHtml(
      { why: 'w', integrations: [] },
      'CDK Insights',
      '',
      'b1',
      false,
    );
    expect(without).not.toContain('Generate Claude Code prompt');
    expect(without).not.toContain('brief-cc-panel');
  });

  it('escapes HTML in why/integrations/productLabel', () => {
    const html = renderBriefHtml(
      {
        why: 'why <script>alert(1)</script>',
        integrations: [{ title: '<b>bold</b>', detail: '"quoted"' }],
      },
      'Evil & Co',
      'https://example.com',
      'b1',
      false,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Evil &amp; Co');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(html).toContain('&quot;quoted&quot;');
  });
});

describe('initBriefPanel — badge click flow', () => {
  it('inserts a loading panel into the host immediately on click', async () => {
    let resolveAsk: ((v: string) => void) | null = null;
    const askClaude = (): Promise<string> =>
      new Promise<string>((res) => {
        resolveAsk = res;
      });
    const deps = makeDeps(askClaude);
    disposeHandle = initBriefPanel(deps, {
      products: [CDKI],
      prompts: { cdki: 'CDKI_PROMPT' },
      fingerprintByProduct: () => 'fp1',
      topicSlug: 'aws-cdk',
    });
    const card = installCard(cardWithBadge('cdki'));
    const tag = card.querySelector('.insights-tag');
    if (!tag) throw new Error('badge missing');
    click(tag);

    const panel = card.querySelector('.insights-brief');
    expect(panel).not.toBeNull();
    expect(panel?.innerHTML).toContain('Generating CDK Insights brief…');
    expect(tag.classList.contains('expanded')).toBe(true);

    if (resolveAsk) (resolveAsk as (v: string) => void)(validResponse);
    await flush();
  });

  it('renders the brief into the panel after fetchBrief resolves', async () => {
    const deps = makeDeps(() => Promise.resolve(validResponse));
    disposeHandle = initBriefPanel(deps, {
      products: [CDKI],
      prompts: { cdki: 'CDKI_PROMPT' },
      fingerprintByProduct: () => 'fp1',
      topicSlug: 'aws-cdk',
    });
    const card = installCard(cardWithBadge('cdki'));
    const tag = card.querySelector('.insights-tag');
    if (!tag) throw new Error('badge missing');
    click(tag);
    await flush();

    const panel = card.querySelector('.insights-brief');
    expect(panel?.innerHTML).toContain('Mixins change how constructs compose');
    expect(panel?.innerHTML).toContain('Add mixin-awareness rule');
  });

  it('skips askClaude when a cached brief exists', async () => {
    const askClaude = vi.fn(() => Promise.resolve(validResponse));
    const deps = makeDeps(askClaude);
    const key = briefCacheKey('aws-cdk', 'cdki', 'fp1', 'release:v1:features:add-foo');
    deps.storage.setItem(key, JSON.stringify({ why: 'from cache', integrations: [] }));

    disposeHandle = initBriefPanel(deps, {
      products: [CDKI],
      prompts: { cdki: 'CDKI_PROMPT' },
      fingerprintByProduct: () => 'fp1',
      topicSlug: 'aws-cdk',
    });
    const card = installCard(cardWithBadge('cdki'));
    click(card.querySelector('.insights-tag') as Element);
    await flush();

    const panel = card.querySelector('.insights-brief');
    expect(panel?.innerHTML).toContain('from cache');
    expect(askClaude).not.toHaveBeenCalled();
  });

  it('toggles off when the badge is clicked a second time', async () => {
    const deps = makeDeps(() => Promise.resolve(validResponse));
    disposeHandle = initBriefPanel(deps, {
      products: [CDKI],
      prompts: { cdki: 'CDKI_PROMPT' },
      fingerprintByProduct: () => 'fp1',
      topicSlug: 'aws-cdk',
    });
    const card = installCard(cardWithBadge('cdki'));
    const tag = card.querySelector('.insights-tag') as Element;
    click(tag);
    await flush();
    expect(card.querySelector('.insights-brief')).not.toBeNull();

    click(tag);
    expect(card.querySelector('.insights-brief')).toBeNull();
    expect(tag.classList.contains('expanded')).toBe(false);
  });

  it('falls back to the regex-reason brief when the model response is unusable', async () => {
    const deps = makeDeps(() => Promise.resolve('not JSON at all'));
    disposeHandle = initBriefPanel(deps, {
      products: [CDKI],
      prompts: { cdki: 'CDKI_PROMPT' },
      fingerprintByProduct: () => 'fp1',
      topicSlug: 'aws-cdk',
    });
    const card = installCard(cardWithBadge('cdki'));
    click(card.querySelector('.insights-tag') as Element);
    await flush();
    const panel = card.querySelector('.insights-brief');
    // Phase 3a: an unusable model response (or no model at all) falls back to
    // the non-model floor — the matcher's regex reason — not an error card.
    expect(panel?.innerHTML).toContain('Why relevant to CDK Insights');
    expect(panel?.innerHTML).not.toContain("Couldn't generate brief");
  });

  it('renders an error when no prompt is configured for the productId', async () => {
    const deps = makeDeps(() => Promise.resolve(validResponse));
    disposeHandle = initBriefPanel(deps, {
      products: [CDKI],
      prompts: {}, // no prompt for cdki
      fingerprintByProduct: () => 'fp1',
      topicSlug: 'aws-cdk',
    });
    const card = installCard(cardWithBadge('cdki'));
    click(card.querySelector('.insights-tag') as Element);
    await flush();
    const panel = card.querySelector('.insights-brief');
    expect(panel?.innerHTML).toContain('No system prompt configured');
  });

  it('clears `expanded` from every badge under the host when teared down', async () => {
    const deps = makeDeps(() => Promise.resolve(validResponse));
    disposeHandle = initBriefPanel(deps, {
      products: [CDKI, LC],
      prompts: { cdki: 'CDKI', lc: 'LC' },
      fingerprintByProduct: () => 'fp1',
      topicSlug: 'aws-cdk',
    });
    document.body.innerHTML = `
      <div class="hl-card">
        <h3>Release
          <span class="insights-tag expandable" data-product-id="cdki" data-stable-id="r:1" data-section="releases" data-title="t" data-url="u" data-reason="r" data-kind="release-features" data-text="t">cdki</span>
          <span class="insights-tag expandable" data-product-id="lc" data-stable-id="r:1" data-section="releases" data-title="t" data-url="u" data-reason="r" data-kind="release-features" data-text="t">lc</span>
        </h3>
      </div>
    `;
    const card = document.querySelector('.hl-card') as HTMLElement;
    const cdkiBadge = card.querySelector('[data-product-id="cdki"]') as Element;
    const lcBadge = card.querySelector('[data-product-id="lc"]') as Element;

    click(cdkiBadge);
    await flush();
    expect(cdkiBadge.classList.contains('expanded')).toBe(true);

    // Click LC: existing panel torn down + ALL `expanded` cleared (v0.1 bug fix).
    click(lcBadge);
    expect(cdkiBadge.classList.contains('expanded')).toBe(false);
    expect(lcBadge.classList.contains('expanded')).toBe(false);
    expect(card.querySelector('.insights-brief')).toBeNull();
  });

  it('does not crash on click of a badge with no host ancestor', async () => {
    const deps = makeDeps(() => Promise.resolve(validResponse));
    disposeHandle = initBriefPanel(deps, {
      products: [CDKI],
      prompts: { cdki: 'CDKI' },
      fingerprintByProduct: () => 'fp1',
      topicSlug: 'aws-cdk',
    });
    document.body.innerHTML =
      '<span class="insights-tag expandable" data-product-id="cdki" data-stable-id="x" data-section="s" data-title="t" data-url="u" data-reason="r" data-kind="k" data-text="x">cdki</span>';
    const tag = document.querySelector('.insights-tag') as Element;
    expect(() => click(tag)).not.toThrow();
    await flush();
  });

  it('dispose() removes the click listener', async () => {
    const askClaude = vi.fn(() => Promise.resolve(validResponse));
    const deps = makeDeps(askClaude);
    const h = initBriefPanel(deps, {
      products: [CDKI],
      prompts: { cdki: 'CDKI' },
      fingerprintByProduct: () => 'fp1',
      topicSlug: 'aws-cdk',
    });
    h.dispose();
    const card = installCard(cardWithBadge('cdki'));
    click(card.querySelector('.insights-tag') as Element);
    await flush();
    expect(card.querySelector('.insights-brief')).toBeNull();
    expect(askClaude).not.toHaveBeenCalled();
  });
});

describe('initBriefPanel — cc-prompt UI', () => {
  const setupWithCcBuilder = (builder: CcPromptBuilder) => {
    const deps = makeDeps(() => Promise.resolve(validResponse));
    disposeHandle = initBriefPanel(deps, {
      products: [CDKI],
      prompts: { cdki: 'CDKI' },
      fingerprintByProduct: () => 'fp1',
      topicSlug: 'aws-cdk',
      ccBuilders: { cdki: builder },
    });
    return deps;
  };

  it('renders the cc-prompt button only when a builder is registered', async () => {
    setupWithCcBuilder(() => 'BUILT PROMPT');
    const card = installCard(cardWithBadge('cdki'));
    click(card.querySelector('.insights-tag') as Element);
    await flush();
    expect(card.querySelector('.brief-cc-btn')).not.toBeNull();
  });

  it('shows the cc panel when the button is clicked and populates its <pre>', async () => {
    const builder = vi.fn<CcPromptBuilder>((args: BuildCcPromptArgs) => {
      return `MODE=${args.mode} ID=${args.meta.stableId} BRIEF=${args.brief.why.slice(0, 6)}`;
    });
    setupWithCcBuilder(builder);
    const card = installCard(cardWithBadge('cdki'));
    click(card.querySelector('.insights-tag') as Element);
    await flush();

    const ccBtn = card.querySelector('.brief-cc-btn') as HTMLElement;
    expect(ccBtn.textContent).toBe('Generate Claude Code prompt');
    click(ccBtn);

    const ccPanel = card.querySelector('.brief-cc-panel') as HTMLElement;
    expect(ccPanel.classList.contains('hidden')).toBe(false);
    expect(ccPanel.querySelector('.brief-cc-text')?.textContent).toBe(
      'MODE=plan ID=release:v1:features:add-foo BRIEF=Mixins',
    );
    expect(ccBtn.textContent).toBe('Hide prompt');
    expect(builder).toHaveBeenCalledTimes(1);
  });

  it('switches mode to implement when the Plan+Implement button is clicked', async () => {
    const builder = vi.fn<CcPromptBuilder>((args: BuildCcPromptArgs) => `MODE=${args.mode}`);
    setupWithCcBuilder(builder);
    const card = installCard(cardWithBadge('cdki'));
    click(card.querySelector('.insights-tag') as Element);
    await flush();
    const ccBtn = card.querySelector('.brief-cc-btn') as HTMLElement;
    click(ccBtn);
    const implBtn = card.querySelector(
      '.cc-mode-toggle button[data-mode="implement"]',
    ) as HTMLElement;
    click(implBtn);
    expect(card.querySelector('.brief-cc-text')?.textContent).toBe('MODE=implement');
    // Active class moved.
    expect(implBtn.classList.contains('active')).toBe(true);
    const planBtn = card.querySelector('.cc-mode-toggle button[data-mode="plan"]') as HTMLElement;
    expect(planBtn.classList.contains('active')).toBe(false);
  });

  it('mode-button no-ops when clicked on the already-active mode', async () => {
    const builder = vi.fn<CcPromptBuilder>(() => 'X');
    setupWithCcBuilder(builder);
    const card = installCard(cardWithBadge('cdki'));
    click(card.querySelector('.insights-tag') as Element);
    await flush();
    click(card.querySelector('.brief-cc-btn') as Element);
    const calls = builder.mock.calls.length;
    click(card.querySelector('.cc-mode-toggle button[data-mode="plan"]') as Element);
    expect(builder.mock.calls.length).toBe(calls); // no extra build call
  });

  it('Copy button writes the built prompt to the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    // Inject a mocked clipboard.
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const builder = vi.fn<CcPromptBuilder>(() => 'BUILT_PROMPT_TEXT');
    setupWithCcBuilder(builder);
    const card = installCard(cardWithBadge('cdki'));
    click(card.querySelector('.insights-tag') as Element);
    await flush();
    click(card.querySelector('.brief-cc-btn') as Element);
    click(card.querySelector('.brief-cc-copy[data-format="prompt"]') as Element);
    await flush();
    expect(writeText).toHaveBeenCalledWith('BUILT_PROMPT_TEXT');
  });

  it('Copy-as-task wraps the prompt in a markdown task header', async () => {
    const captured: string[] = [];
    const writeText = vi.fn((text: string) => {
      captured.push(text);
      return Promise.resolve();
    });
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    setupWithCcBuilder(() => 'PROMPT_BODY');
    const card = installCard(cardWithBadge('cdki'));
    click(card.querySelector('.insights-tag') as Element);
    await flush();
    click(card.querySelector('.brief-cc-btn') as Element);
    click(card.querySelector('.brief-cc-copy[data-format="task"]') as Element);
    await flush();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(captured[0]).toContain('# Add foo support — cdki (plan)');
    expect(captured[0]).toContain('Source: https://example.com/r/1');
    expect(captured[0]).toContain('Generated: 2026-05-19');
    expect(captured[0]).toContain('---\n\nPROMPT_BODY');
  });

  it('Copy button is a no-op when no cc builder is registered for the product', async () => {
    const writeText = vi.fn();
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    // Set up panel with NO ccBuilders.
    const deps = makeDeps(() => Promise.resolve(validResponse));
    disposeHandle = initBriefPanel(deps, {
      products: [CDKI],
      prompts: { cdki: 'CDKI' },
      fingerprintByProduct: () => 'fp1',
      topicSlug: 'aws-cdk',
    });
    const card = installCard(cardWithBadge('cdki'));
    click(card.querySelector('.insights-tag') as Element);
    await flush();
    // No cc button is rendered.
    expect(card.querySelector('.brief-cc-btn')).toBeNull();
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('renderBriefHtml — action types', () => {
  it('renders the summary action block: "Generate summary", no mode toggle, prompt-only copy', () => {
    const html = renderBriefHtml(
      { why: 'w', integrations: [] },
      'Research Desk',
      '',
      'b1',
      false,
      'summary',
    );
    expect(html).toContain('Generate summary');
    expect(html).toContain('brief-cc-panel');
    expect(html).not.toContain('cc-mode-toggle');
    expect(html).not.toContain('data-format="task"');
    expect(html).toContain('data-format="prompt"');
  });

  it('renders the task action block labelled "Create task"', () => {
    const html = renderBriefHtml({ why: 'w', integrations: [] }, 'Acme', '', 'b1', false, 'task');
    expect(html).toContain('Create task');
    expect(html).not.toContain('cc-mode-toggle');
  });

  it('explicit actionType "claude-code" emits HTML identical to the implicit default', () => {
    const implicit = renderBriefHtml({ why: 'w', integrations: [] }, 'Acme', '', 'b1', true);
    const explicit = renderBriefHtml(
      { why: 'w', integrations: [] },
      'Acme',
      '',
      'b1',
      true,
      'claude-code',
    );
    expect(explicit).toBe(implicit);
  });
});

describe('initBriefPanel — summary action panel', () => {
  const SUMMARY_PROD: Product = {
    id: 'res',
    label: 'Research Desk',
    cssMod: '',
    match: () => null,
    actionType: 'summary',
  };

  it('renders the "Generate summary" button with no mode toggle after the brief loads', async () => {
    const deps = makeDeps(() => Promise.resolve(validResponse));
    disposeHandle = initBriefPanel(deps, {
      products: [SUMMARY_PROD],
      prompts: { res: 'RES_PROMPT' },
      fingerprintByProduct: () => 'fp1',
      topicSlug: 'research',
    });
    const card = installCard(cardWithBadge('res'));
    click(card.querySelector('.insights-tag') as Element);
    await flush();
    const ccBtn = card.querySelector('.brief-cc-btn') as HTMLElement;
    expect(ccBtn.textContent).toBe('Generate summary');
    expect(card.querySelector('.cc-mode-toggle')).toBeNull();
  });

  it('toggles the summary panel open and fills its <pre> from the registry builder', async () => {
    const deps = makeDeps(() => Promise.resolve(validResponse));
    disposeHandle = initBriefPanel(deps, {
      products: [SUMMARY_PROD],
      prompts: { res: 'RES_PROMPT' },
      fingerprintByProduct: () => 'fp1',
      topicSlug: 'research',
    });
    const card = installCard(cardWithBadge('res'));
    click(card.querySelector('.insights-tag') as Element);
    await flush();
    const ccBtn = card.querySelector('.brief-cc-btn') as HTMLElement;
    click(ccBtn);
    expect(ccBtn.textContent).toBe('Hide summary');
    const pre = card.querySelector('.brief-cc-text') as HTMLElement;
    expect(pre.textContent).toContain('Mixins change how constructs compose');
  });
});
