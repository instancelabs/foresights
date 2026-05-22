// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Deps } from '../types';
import { writeToClipboard } from './clipboard';
import { createInMemoryStorage } from './storage';

/**
 * Build a Deps whose `window.navigator.clipboard` and `document.execCommand`
 * are independently controllable. The document delegates `createElement` to
 * the real jsdom document (so the `<textarea>` fallback's `.value` / `.style`
 * / `.select()` all work) but exposes a stubbed `execCommand` — or none, to
 * exercise the optional-chaining guard.
 */
const makeDeps = (opts: {
  clipboard?: { writeText: (t: string) => Promise<void> } | undefined;
  execCommand?: ((cmd: string) => boolean) | undefined;
}): Deps => {
  const win = {
    navigator: opts.clipboard ? { clipboard: opts.clipboard } : {},
  } as unknown as Window;
  const doc = {
    createElement: (tag: string) => document.createElement(tag),
    body: document.body,
    execCommand: opts.execCommand,
  } as unknown as Document;
  return {
    callTool: vi.fn(),
    askClaude: vi.fn(),
    runScheduledTask: vi.fn(),
    storage: createInMemoryStorage(),
    now: () => new Date('2026-05-22T00:00:00Z'),
    document: doc,
    window: win,
  };
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('writeToClipboard', () => {
  it('uses the async Clipboard API when available and resolves true', async () => {
    const writeText = vi.fn(async () => undefined);
    const ok = await writeToClipboard(makeDeps({ clipboard: { writeText } }), 'hello');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand when the Clipboard API rejects', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied');
    });
    const execCommand = vi.fn(() => true);
    const ok = await writeToClipboard(makeDeps({ clipboard: { writeText }, execCommand }), 'x');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('uses execCommand when there is no Clipboard API at all', async () => {
    const execCommand = vi.fn(() => true);
    const ok = await writeToClipboard(makeDeps({ execCommand }), 'x');
    expect(ok).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('returns false when both the Clipboard API and execCommand fail', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied');
    });
    const ok = await writeToClipboard(
      makeDeps({ clipboard: { writeText }, execCommand: () => false }),
      'x',
    );
    expect(ok).toBe(false);
  });

  it('returns false when execCommand is absent (optional-chaining guard)', async () => {
    const ok = await writeToClipboard(makeDeps({ execCommand: undefined }), 'x');
    expect(ok).toBe(false);
  });

  it('cleans up the temporary textarea after the execCommand fallback', async () => {
    await writeToClipboard(makeDeps({ execCommand: () => true }), 'x');
    expect(document.querySelector('textarea')).toBeNull();
  });
});
