// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deps } from '../types';
import { createInMemoryStorage } from '../util/storage';
import { renderError } from './error';

const FROZEN_NOW = (): Date => new Date('2026-05-19T12:00:00');

const buildDeps = (): Deps => ({
  callTool: vi.fn(),
  askClaude: vi.fn(),
  runScheduledTask: vi.fn(),
  storage: createInMemoryStorage(),
  now: FROZEN_NOW,
  document: window.document,
  window,
});

describe('renderError', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="releases-body"><span>old</span></div>';
  });

  it('replaces existing content with an .err element', () => {
    const deps = buildDeps();
    renderError(deps, 'releases-body', new Error('boom'));
    const target = document.getElementById('releases-body');
    expect(target?.innerHTML).toBe('<div class="err">boom</div>');
  });

  it('escapes HTML in the error message', () => {
    const deps = buildDeps();
    renderError(deps, 'releases-body', new Error('<script>x</script>'));
    const target = document.getElementById('releases-body');
    expect(target?.innerHTML).toBe('<div class="err">&lt;script&gt;x&lt;/script&gt;</div>');
  });

  it('coerces non-Error throwables via String()', () => {
    const deps = buildDeps();
    renderError(deps, 'releases-body', 'plain string failure');
    const target = document.getElementById('releases-body');
    expect(target?.innerHTML).toBe('<div class="err">plain string failure</div>');
  });

  it('handles undefined error values', () => {
    const deps = buildDeps();
    renderError(deps, 'releases-body', undefined);
    const target = document.getElementById('releases-body');
    // String(undefined) === 'undefined'
    expect(target?.innerHTML).toBe('<div class="err">undefined</div>');
  });

  it('is a no-op when the target id does not exist', () => {
    const deps = buildDeps();
    document.body.innerHTML = '<div id="other-id">preserved</div>';
    expect(() => renderError(deps, 'releases-body', new Error('boom'))).not.toThrow();
    expect(document.getElementById('other-id')?.textContent).toBe('preserved');
  });
});
