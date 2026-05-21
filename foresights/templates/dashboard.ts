/**
 * Foresights dashboard — entry point.
 *
 * esbuild bundles this file (and its transitive imports) into a single IIFE
 * that the wizard injects into dashboard.html in place of {{COMPILED_JS}}.
 *
 * The only job of this file is to construct the real Deps from the browser
 * runtime (window.cowork, window.localStorage, etc.) and hand off to boot().
 * Every other concern lives in a dedicated module.
 *
 * Status: Phase 4 — wired through boot() to initSpotlight. Phase 5+ ports
 * render, products, and digest concerns; this entry point doesn't change.
 */

import { boot } from './boot';
import type { Deps } from './types';

interface CoworkWindow extends Window {
  cowork?: {
    callMcpTool: (name: string, args: unknown) => Promise<unknown>;
    askClaude: (prompt: string, data?: unknown[]) => Promise<string>;
    runScheduledTask: (taskId: string) => Promise<void>;
  };
}

/**
 * Build the `Deps` from the browser runtime.
 *
 * Inside a Cowork artifact, `window.cowork` provides the live MCP / Haiku
 * bridge. A `static`-mode dashboard (v0.8.0) runs as a plain HTML file with no
 * artifact runtime: `window.cowork` is absent, the wizard bakes the data into
 * `LOAD_BODY` instead of emitting live calls, and the dashboard renders from
 * baked literals. So a missing `window.cowork` is no longer a hard error —
 * `callTool` / `askClaude` / `runScheduledTask` become rejecting stubs. They
 * are inert in a static build (nothing calls them); any stray call (e.g. a
 * brief-panel click before the Phase 3 baked-brief work lands) rejects with a
 * clear message and degrades, instead of crashing the page.
 */
const buildDeps = (win: CoworkWindow): Deps => {
  const cw = win.cowork;
  const needsRuntime = (): Promise<never> =>
    Promise.reject(
      new Error(
        'Foresights: this feature needs the Cowork artifact runtime, which is not available here.',
      ),
    );
  return {
    callTool: cw ? (name, args) => cw.callMcpTool(name, args) : needsRuntime,
    askClaude: cw ? (prompt, data) => cw.askClaude(prompt, data) : needsRuntime,
    runScheduledTask: cw ? (taskId) => cw.runScheduledTask(taskId) : needsRuntime,
    storage: win.localStorage,
    now: () => new Date(),
    document: win.document,
    window: win,
  };
};

// Boot at module-eval time. esbuild emits this as an IIFE so it runs as
// soon as the <script> tag executes.
void boot(buildDeps(window as CoworkWindow));
