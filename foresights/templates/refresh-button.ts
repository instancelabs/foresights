/**
 * Static-mode refresh handoff button.
 *
 * A `static`-mode dashboard is a standalone HTML file with no `window.cowork`
 * runtime, so it cannot re-fetch its own live data or re-curate its content.
 * Refreshing it is a *skill* action — `/refresh-dashboard` — and that skill
 * runs inside Claude, not in the page.
 *
 * This module bridges that gap: it injects a "Refresh" button into the hero
 * that copies a ready-to-paste `/refresh-dashboard for <topic>` instruction
 * to the clipboard. The user pastes it into Claude and the skill takes over.
 * Same clipboard-handoff pattern the Claude Code prompt buttons already use
 * (`products/panel.ts`) — pure DOM, no runtime dependency.
 *
 * Artifact-mode dashboards never reach this code: `genLoadBody` emits the
 * `initRefreshButton` call only in its `static` branch, so esbuild
 * tree-shakes this module (and `util/clipboard.ts`) out of an artifact
 * bundle entirely. An artifact build's output stays byte-identical.
 */

import type { Deps } from './types';
import { writeToClipboard } from './util/clipboard';

export interface InitRefreshButtonOpts {
  /** Dashboard topic — interpolated into the copied instruction. */
  readonly topic: string;
  /**
   * Override for the copied instruction. Defaults to
   * `/refresh-dashboard for <topic>`. Exposed mainly for tests.
   */
  readonly instruction?: string;
}

export interface RefreshButtonHandle {
  /** The injected button element. */
  readonly button: HTMLButtonElement;
  /** The instruction string the button copies. */
  readonly instruction: string;
  /** Remove the button and tear down its click handler. */
  readonly dispose: () => void;
}

/** DOM id of the injected button — also used to dedupe on re-init. */
const BUTTON_ID = 'foresights-refresh-btn';

/** Mount targets, in preference order. */
const MOUNT_SELECTORS = ['.hero .meta', '.hero', 'body'] as const;

/** Idle / success / failure button labels. */
const IDLE_LABEL = '↻ Refresh dashboard';
const DONE_LABEL = 'Copied ✓ — paste to Claude';
const FAIL_LABEL = 'Copy failed — try again';

/** How long the copied/failed label shows before reverting to idle (ms). */
const RESET_MS = 2600;

/** First matching mount target; falls back to `<body>` so this never throws. */
const findMount = (deps: Deps): HTMLElement => {
  for (const sel of MOUNT_SELECTORS) {
    const el = deps.document.querySelector(sel);
    if (el instanceof HTMLElement) return el;
  }
  return deps.document.body;
};

/**
 * Inject the static-mode refresh button and wire its clipboard handoff.
 *
 * Idempotent: a stale button from a prior init is removed first, so a
 * re-init never stacks duplicates.
 */
export const initRefreshButton = (deps: Deps, opts: InitRefreshButtonOpts): RefreshButtonHandle => {
  const instruction = opts.instruction ?? `/refresh-dashboard for ${opts.topic}`;

  // Drop a stale button from a prior init so re-running stays idempotent.
  deps.document.getElementById(BUTTON_ID)?.remove();

  const button = deps.document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.textContent = IDLE_LABEL;
  button.title = `Copy "${instruction}" to the clipboard, then paste it to Claude`;
  // Inline styles keep this module self-contained — it adds no rule to the
  // template's <style> block, so an artifact build's HTML stays byte-identical.
  button.style.cssText = [
    'margin-top:8px',
    'padding:6px 12px',
    'font:inherit',
    'font-size:13px',
    'line-height:1.4',
    'cursor:pointer',
    'border:1px solid currentColor',
    'border-radius:6px',
    'background:transparent',
    'color:inherit',
    'opacity:0.85',
  ].join(';');

  const ac = new AbortController();
  let resetTimer = 0;

  const flash = (label: string): void => {
    button.textContent = label;
    deps.window.clearTimeout(resetTimer);
    resetTimer = deps.window.setTimeout(() => {
      button.textContent = IDLE_LABEL;
    }, RESET_MS);
  };

  button.addEventListener(
    'click',
    () => {
      void (async () => {
        const ok = await writeToClipboard(deps, instruction);
        flash(ok ? DONE_LABEL : FAIL_LABEL);
      })();
    },
    { signal: ac.signal },
  );

  findMount(deps).appendChild(button);

  return {
    button,
    instruction,
    dispose: () => {
      ac.abort();
      deps.window.clearTimeout(resetTimer);
      button.remove();
    },
  };
};
