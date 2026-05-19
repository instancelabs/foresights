/**
 * DOM error helper — renders a fail-state card into a target body div.
 * Status: Phase 5 ports the real impl.
 */

import type { Deps } from '../types';
import { escHtml } from '../util/escape';

export const renderError = (deps: Deps, targetId: string, err: unknown): void => {
  const target = deps.document.getElementById(targetId);
  if (!target) return;
  const msg = err instanceof Error ? err.message : String(err);
  target.innerHTML = `<div class="err">${escHtml(msg)}</div>`;
};
