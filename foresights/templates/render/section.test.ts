// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import type { Deps } from '../types';
import { appendToSection } from './section';

const deps: Pick<Deps, 'document'> = { document: window.document };

const setBody = (html: string): void => {
  window.document.body.innerHTML = html;
};
const skeleton = (id: string): string =>
  `<div id="${id}-body" class="section-body skeleton"><div class="card skeleton-card">Loading…</div></div>`;
const bodyHtml = (id: string): string =>
  window.document.getElementById(`${id}-body`)?.innerHTML ?? '(missing)';

describe('appendToSection', () => {
  beforeEach(() => setBody(skeleton('rel')));

  it('clears the loading skeleton on the first write', () => {
    appendToSection(deps, 'rel', '<div class="card">a</div>');
    expect(bodyHtml('rel')).toBe('<div class="card">a</div>');
    expect(window.document.getElementById('rel-body')?.classList.contains('skeleton')).toBe(false);
  });

  it('appends — a second source accumulates instead of overwriting (the F8 fix)', () => {
    appendToSection(deps, 'rel', '<div class="card">a</div>');
    appendToSection(deps, 'rel', '<div class="card">b</div>');
    expect(bodyHtml('rel')).toBe('<div class="card">a</div><div class="card">b</div>');
  });

  it('shows the empty-state placeholder for an empty first source', () => {
    appendToSection(deps, 'rel', '', 'Nothing here.');
    expect(bodyHtml('rel')).toBe('<div class="err section-empty">Nothing here.</div>');
  });

  it('escapes the empty-state message', () => {
    appendToSection(deps, 'rel', '', '<x> & y');
    expect(bodyHtml('rel')).toBe('<div class="err section-empty">&lt;x&gt; &amp; y</div>');
  });

  it('omits the placeholder when no emptyState is given', () => {
    appendToSection(deps, 'rel', '');
    expect(bodyHtml('rel')).toBe('');
  });

  it('a later real source wipes a lone empty-state placeholder', () => {
    appendToSection(deps, 'rel', '', 'Nothing here.');
    appendToSection(deps, 'rel', '<div class="card">a</div>');
    expect(bodyHtml('rel')).toBe('<div class="card">a</div>');
  });

  it('an empty later source leaves existing content alone', () => {
    appendToSection(deps, 'rel', '<div class="card">a</div>');
    appendToSection(deps, 'rel', '', 'Nothing here.');
    expect(bodyHtml('rel')).toBe('<div class="card">a</div>');
  });

  it('does NOT wipe a genuine error card when real content follows', () => {
    appendToSection(deps, 'rel', '<div class="err">boom</div>');
    appendToSection(deps, 'rel', '<div class="card">a</div>');
    expect(bodyHtml('rel')).toBe('<div class="err">boom</div><div class="card">a</div>');
  });

  it('is a no-op when the section body is absent', () => {
    setBody('<div id="unrelated">x</div>');
    expect(() => appendToSection(deps, 'rel', '<div class="card">a</div>')).not.toThrow();
    expect(window.document.getElementById('unrelated')?.textContent).toBe('x');
  });
});
