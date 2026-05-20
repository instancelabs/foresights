/**
 * DOM error helper — appends a fail-state card into a section body.
 *
 * Routed through `appendToSection` (like every other renderer) so an error
 * from one source doesn't wipe cards a sibling source already rendered into
 * the same section, and so it targets `#<section>-body` rather than the
 * `<section>` wrapper. The error card carries only `err` (no `section-empty`),
 * so a later successful source never wipes it.
 */

import type { Deps } from '../types';
import { escHtml } from '../util/escape';
import { appendToSection } from './section';

export const renderError = (deps: Deps, section: string, err: unknown): void => {
  const msg = err instanceof Error ? err.message : String(err);
  appendToSection(deps, section, `<div class="err">${escHtml(msg)}</div>`);
};
