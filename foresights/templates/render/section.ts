/**
 * Section-body writer shared by every renderer.
 *
 * Foresights lets several sources feed one `section` (the "merged section"
 * pattern). `genLoadBody` emits one render call per source, all targeting the
 * same `#<section>-body`. If each call did `root.innerHTML = …` the calls
 * would overwrite each other and only the last source would survive — so all
 * section writes go through `appendToSection`, which appends instead.
 *
 * The first renderer to touch a section clears its "Loading…" skeleton; every
 * renderer then appends. An empty source (`html === ''`) still clears the
 * skeleton — the section is done loading, just empty from this source — and,
 * if nothing has rendered yet, drops in an `emptyState` placeholder. A later
 * source with real content wipes a lone placeholder before appending. Genuine
 * error cards (`renderError`, class `err` without `section-empty`) are never
 * wiped, so a failing source stays visible alongside siblings that succeeded.
 */

import type { Deps } from '../types';
import { escHtml } from '../util/escape';

export const appendToSection = (
  deps: Pick<Deps, 'document'>,
  section: string,
  html: string,
  emptyState?: string,
): void => {
  const root = deps.document.getElementById(`${section}-body`);
  if (!root) return;
  // First renderer to touch the section clears the loading skeleton.
  if (root.classList.contains('skeleton')) {
    root.classList.remove('skeleton');
    root.innerHTML = '';
  }
  if (html.length > 0) {
    // Real content arriving wipes a lone empty-state placeholder a prior
    // (empty) source left behind. Error cards lack `section-empty`, so they
    // are deliberately not matched here.
    const onlyChild = root.children.length === 1 ? root.children[0] : null;
    if (onlyChild?.classList.contains('section-empty')) {
      root.innerHTML = '';
    }
    root.insertAdjacentHTML('beforeend', html);
    return;
  }
  // Empty source: only show the placeholder if nothing has rendered yet.
  if (root.children.length === 0 && emptyState !== undefined) {
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="err section-empty">${escHtml(emptyState)}</div>`,
    );
  }
};
