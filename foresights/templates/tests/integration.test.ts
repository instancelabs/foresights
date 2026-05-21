// @vitest-environment jsdom

/**
 * Integration smoke test.
 *
 * Compiles the actual source via esbuild, loads the resulting bundle into a
 * JSDOM window with a minimal dashboard DOM scaffold and stubbed
 * window.cowork, then asserts the bundle boots without throwing.
 *
 * This is the Phase 4 milestone test: it proves the architecture is real,
 * the DI seam works, and an end-user-style bundle can execute against a
 * faithful approximation of the Cowork artifact runtime.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(HERE, '..');
const BUNDLE_PATH = resolve(TEMPLATES_DIR, 'dist/dashboard.js');

const buildBundle = (): void => {
  execFileSync(
    'node_modules/.bin/esbuild',
    [
      'dashboard.ts',
      '--bundle',
      '--format=iife',
      '--target=es2022',
      '--sourcemap=inline',
      '--outfile=dist/dashboard.js',
    ],
    { cwd: TEMPLATES_DIR, stdio: 'pipe' },
  );
};

const SPOTLIGHT_DOM = `
  <div class="sl-card">
    <span id="sl-tag"></span>
    <h3 id="sl-title"></h3>
    <p id="sl-summary"></p>
    <p id="sl-trick"></p>
    <pre id="sl-code"></pre>
    <p id="sl-why"></p>
    <a id="sl-more"></a>
    <span id="sl-pager"></span>
    <div id="sl-flags"></div>
    <button id="sl-prev" type="button">Prev</button>
    <button id="sl-next" type="button">Next</button>
  </div>
`;

interface CoworkApi {
  readonly callMcpTool: (name: string, args: unknown) => Promise<unknown>;
  readonly askClaude: (prompt: string, data?: unknown[]) => Promise<string>;
  readonly runScheduledTask: (taskId: string) => Promise<void>;
}

const installCoworkStub = (): void => {
  const cowork: CoworkApi = {
    callMcpTool: async (): Promise<unknown> => [],
    askClaude: async (): Promise<string> => '[]',
    runScheduledTask: async (): Promise<void> => undefined,
  };
  (window as unknown as { cowork: CoworkApi }).cowork = cowork;
};

describe('integration: compiled bundle boots into JSDOM', () => {
  beforeAll(() => {
    buildBundle();
    if (!existsSync(BUNDLE_PATH)) {
      throw new Error(`Bundle did not build to ${BUNDLE_PATH}`);
    }
  });

  it('builds a non-empty IIFE-wrapped bundle', () => {
    const bundle = readFileSync(BUNDLE_PATH, 'utf8');
    expect(bundle.length).toBeGreaterThan(1000);
    expect(bundle).toMatch(/^\s*(?:"use strict"\s*;\s*)?\(\s*\(?\s*\)\s*=>/);
  });

  it('boots without throwing when window.cowork is missing (static-safe)', () => {
    // v0.8.0: a static-mode dashboard runs with no Cowork artifact runtime.
    // The entry point no longer hard-throws on a missing window.cowork — it
    // builds a static Deps with rejecting stubs and boots normally.
    document.body.innerHTML = SPOTLIGHT_DOM;
    (window as unknown as { cowork: unknown }).cowork = undefined;
    const bundle = readFileSync(BUNDLE_PATH, 'utf8');
    expect(() => new Function(bundle).call(window)).not.toThrow();
  });

  it('boots successfully when window.cowork is present (empty SPOTLIGHTS case)', () => {
    document.body.innerHTML = SPOTLIGHT_DOM;
    installCoworkStub();
    const bundle = readFileSync(BUNDLE_PATH, 'utf8');
    expect(() => new Function(bundle).call(window)).not.toThrow();
    // SPOTLIGHTS is empty in the un-substituted scaffold; initSpotlight
    // returns early and the DOM is unchanged.
    expect(document.getElementById('sl-tag')?.textContent).toBe('');
  });
});
