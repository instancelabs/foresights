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
    document.body.innerHTML =
      '<div id="releases-body" class="section-body skeleton"><div class="card skeleton-card">Loading…</div></div>';
  });

  it('clears the skeleton and renders an .err element into the section body', () => {
    const deps = buildDeps();
    renderError(deps, 'releases', new Error('boom'));
    const target = document.getElementById('releases-body');
    expect(target?.innerHTML).toBe('<div class="err">boom</div>');
  });

  it('escapes HTML in the error message', () => {
    const deps = buildDeps();
    renderError(deps, 'releases', new Error('<script>x</script>'));
    const target = document.getElementById('releases-body');
    expect(target?.innerHTML).toBe('<div class="err">&lt;script&gt;x&lt;/script&gt;</div>');
  });

  it('coerces non-Error throwables via String()', () => {
    const deps = buildDeps();
    renderError(deps, 'releases', 'plain string failure');
    const target = document.getElementById('releases-body');
    expect(target?.innerHTML).toBe('<div class="err">plain string failure</div>');
  });

  it('handles undefined error values', () => {
    const deps = buildDeps();
    renderError(deps, 'releases', undefined);
    const target = document.getElementById('releases-body');
    // String(undefined) === 'undefined'
    expect(target?.innerHTML).toBe('<div class="err">undefined</div>');
  });

  it('appends after content a sibling source already rendered (does not overwrite)', () => {
    const deps = buildDeps();
    const body = document.getElementById('releases-body');
    if (body) {
      body.className = 'section-body';
      body.innerHTML = '<div class="card">existing</div>';
    }
    renderError(deps, 'releases', new Error('boom'));
    expect(document.getElementById('releases-body')?.innerHTML).toBe(
      '<div class="card">existing</div><div class="err">boom</div>',
    );
  });

  it('is a no-op when the section body does not exist', () => {
    const deps = buildDeps();
    document.body.innerHTML = '<div id="other-id">preserved</div>';
    expect(() => renderError(deps, 'releases', new Error('boom'))).not.toThrow();
    expect(document.getElementById('other-id')?.textContent).toBe('preserved');
  });
});
