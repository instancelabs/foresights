/**
 * Clipboard write — `navigator.clipboard.writeText` with an `execCommand`
 * fallback for restricted contexts.
 *
 * Mirrors the private `writeToClipboard` helper in `products/panel.ts`. That
 * module keeps its own verbatim copy on purpose: `products/panel.ts` is on
 * every dashboard's code path, and inlining the helper there means an
 * artifact-mode bundle stays byte-identical to pre-Phase-3d builds. This
 * shared module exists for code paths that are *only* reachable in static
 * mode (the `refresh-button.ts` handoff button), where esbuild tree-shakes
 * it out of an artifact build entirely.
 *
 * The two copies are behaviourally identical and should be kept in sync.
 */

import type { Deps } from '../types';

/**
 * Copy `text` to the clipboard. Resolves `true` on success, `false` when both
 * the async Clipboard API and the synchronous `execCommand` fallback fail
 * (e.g. a sandbox with no clipboard permission and no `execCommand`).
 */
export const writeToClipboard = async (deps: Deps, text: string): Promise<boolean> => {
  const nav = deps.window.navigator;
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to execCommand fallback
    }
  }
  // Fallback for restricted contexts.
  try {
    const ta = deps.document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    deps.document.body.appendChild(ta);
    ta.select();
    const ok = deps.document.execCommand?.('copy') ?? false;
    deps.document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
};
