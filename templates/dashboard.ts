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

const buildDeps = (win: CoworkWindow): Deps => {
  if (!win.cowork) {
    throw new Error(
      'Foresights: window.cowork is not available. This dashboard must run inside a Cowork artifact.',
    );
  }
  const cw = win.cowork;
  return {
    callTool: (name, args) => cw.callMcpTool(name, args),
    askClaude: (prompt, data) => cw.askClaude(prompt, data),
    runScheduledTask: (taskId) => cw.runScheduledTask(taskId),
    storage: win.localStorage,
    now: () => new Date(),
    document: win.document,
    window: win,
  };
};

// Boot at module-eval time. esbuild emits this as an IIFE so it runs as
// soon as the <script> tag executes.
void boot(buildDeps(window as CoworkWindow));
