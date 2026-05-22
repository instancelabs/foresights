// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initRefreshButton } from './refresh-button';
import type { Deps } from './types';
import { createInMemoryStorage } from './util/storage';

/** Hero markup mirroring dashboard.html — `.hero .meta` is the mount target. */
const HERO = `
  <header class="hero">
    <div><h1>Topic — what's new</h1></div>
    <div class="meta">
      <div><strong id="last-refresh">—</strong></div>
      <div><a href="#">source</a></div>
    </div>
  </header>`;

/** Real global setTimeout — used to drain the click handler's async chain. */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

interface DepsBundle {
  readonly deps: Deps;
  readonly writeText: ReturnType<typeof vi.fn>;
  readonly setTimeoutMock: ReturnType<typeof vi.fn>;
  readonly clearTimeoutMock: ReturnType<typeof vi.fn>;
}

/**
 * Build a Deps with the real jsdom document (so `.hero .meta` querying and
 * DOM mutation work) and a fake window: a controllable `navigator.clipboard`
 * and stubbed `setTimeout` / `clearTimeout` so the revert-to-idle timer is
 * inspectable without real time passing.
 */
const makeDeps = (writeTextImpl?: (t: string) => Promise<void>): DepsBundle => {
  const writeText = vi.fn(writeTextImpl ?? (async () => undefined));
  const setTimeoutMock = vi.fn(() => 7 as unknown as number);
  const clearTimeoutMock = vi.fn();
  const win = {
    navigator: { clipboard: { writeText } },
    setTimeout: setTimeoutMock,
    clearTimeout: clearTimeoutMock,
  } as unknown as Window;
  const deps: Deps = {
    callTool: vi.fn(),
    askClaude: vi.fn(),
    runScheduledTask: vi.fn(),
    storage: createInMemoryStorage(),
    now: () => new Date('2026-05-22T00:00:00Z'),
    document,
    window: win,
  };
  return { deps, writeText, setTimeoutMock, clearTimeoutMock };
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('initRefreshButton — injection', () => {
  it('injects a button into .hero .meta', () => {
    document.body.innerHTML = HERO;
    const { deps } = makeDeps();
    const { button } = initRefreshButton(deps, { topic: 'AWS CDK' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.id).toBe('foresights-refresh-btn');
    expect(button.type).toBe('button');
    expect(button.closest('.hero .meta')).not.toBeNull();
    expect(button.textContent).toContain('Refresh');
  });

  it('falls back to .hero when there is no .meta', () => {
    document.body.innerHTML = '<header class="hero"><h1>x</h1></header>';
    const { deps } = makeDeps();
    const { button } = initRefreshButton(deps, { topic: 'x' });
    expect(button.parentElement?.classList.contains('hero')).toBe(true);
  });

  it('falls back to <body> when there is no hero at all', () => {
    const { deps } = makeDeps();
    const { button } = initRefreshButton(deps, { topic: 'x' });
    expect(button.parentElement).toBe(document.body);
  });

  it('is idempotent — a second init replaces rather than stacks the button', () => {
    document.body.innerHTML = HERO;
    const { deps } = makeDeps();
    initRefreshButton(deps, { topic: 'x' });
    initRefreshButton(deps, { topic: 'x' });
    expect(document.querySelectorAll('#foresights-refresh-btn')).toHaveLength(1);
  });
});

describe('initRefreshButton — instruction', () => {
  it('defaults the instruction to "/refresh-dashboard for <topic>"', () => {
    const { deps } = makeDeps();
    const { instruction, button } = initRefreshButton(deps, { topic: 'Rust async' });
    expect(instruction).toBe('/refresh-dashboard for Rust async');
    expect(button.title).toContain('/refresh-dashboard for Rust async');
  });

  it('honours an explicit instruction override', () => {
    const { deps } = makeDeps();
    const { instruction } = initRefreshButton(deps, {
      topic: 'x',
      instruction: '/refresh-dashboard for my-dash',
    });
    expect(instruction).toBe('/refresh-dashboard for my-dash');
  });
});

describe('initRefreshButton — clipboard handoff', () => {
  it('copies the instruction to the clipboard on click', async () => {
    const { deps, writeText } = makeDeps();
    const { button } = initRefreshButton(deps, { topic: 'AWS CDK' });
    button.click();
    await tick();
    expect(writeText).toHaveBeenCalledWith('/refresh-dashboard for AWS CDK');
    expect(button.textContent).toContain('Copied');
  });

  it('shows a failure label when the copy fails', async () => {
    const { deps } = makeDeps(async () => {
      throw new Error('clipboard blocked');
    });
    // A document whose execCommand fallback also fails, so writeToClipboard
    // returns false deterministically (real createElement / body delegated).
    const failDoc = {
      createElement: (t: string) => document.createElement(t),
      getElementById: (id: string) => document.getElementById(id),
      querySelector: (s: string) => document.querySelector(s),
      body: document.body,
      execCommand: () => false,
    } as unknown as Document;
    const { button } = initRefreshButton({ ...deps, document: failDoc }, { topic: 'x' });
    button.click();
    await tick();
    expect(button.textContent).toContain('failed');
  });

  it('reverts to the idle label after the reset timer fires', async () => {
    const { deps, setTimeoutMock } = makeDeps();
    const { button } = initRefreshButton(deps, { topic: 'x' });
    button.click();
    await tick();
    expect(button.textContent).toContain('Copied');
    // Fire the revert callback the button registered via window.setTimeout.
    const revert = setTimeoutMock.mock.calls[0]?.[0] as () => void;
    revert();
    expect(button.textContent).toBe('↻ Refresh dashboard');
  });
});

describe('initRefreshButton — dispose', () => {
  it('removes the button and stops responding to clicks', async () => {
    document.body.innerHTML = HERO;
    const { deps, writeText, clearTimeoutMock } = makeDeps();
    const { dispose } = initRefreshButton(deps, { topic: 'x' });
    dispose();
    expect(document.getElementById('foresights-refresh-btn')).toBeNull();
    expect(clearTimeoutMock).toHaveBeenCalled();
    await tick();
    expect(writeText).not.toHaveBeenCalled();
  });
});
