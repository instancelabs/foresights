/**
 * Phase 3d — refresh-button emission tests.
 *
 * Two layers, kept in one file because they share the one concern:
 *  - `genLoadBody` string assertions — the `static` branch emits the
 *    `initRefreshButton` call; the artifact branch never does (the additive
 *    guarantee).
 *  - End-to-end `build()` (real esbuild) assertions — a static build bundles
 *    `refresh-button.ts`; an artifact build tree-shakes it out, so an
 *    artifact dashboard's HTML stays byte-identical.
 */

import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from './build';
import { type WizardConfig, type WizardSource, genLoadBody } from './build-config';

const TEMPLATES_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const TEST_OUT_PREFIX = resolve(TEMPLATES_DIR, '../tmp-wizard-refresh-test');

const source = (overrides: Partial<WizardSource> = {}): WizardSource => ({
  id: 'cdk-core',
  label: 'aws/aws-cdk',
  owner: 'aws',
  repo: 'aws-cdk',
  kind: 'releases',
  section: 'releases',
  perPage: 5,
  ...overrides,
});

const minimalConfig: WizardConfig = {
  topic: 'AWS CDK',
  topicSlug: 'aws-cdk',
  taglineSuffix: "what's new",
  taglineSub: 'sub',
  accent: '#ff6a14',
  accentSoft: '#fff3eb',
  footerNote: 'footer',
  artifactName: 'AWS CDK news',
  artifactDescription: 'desc',
  ghServer: 'mcp__github',
  headerSourcesLinks: '<a href="x">x</a>',
  sources: [source()],
  spotlights: [],
  products: [],
  highlights: [],
  tips: [],
  patterns: [],
  resources: [],
};

afterEach(async () => {
  try {
    await rm(TEST_OUT_PREFIX, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('genLoadBody — refresh-handoff button emission', () => {
  it('emits initRefreshButton in static mode', () => {
    const out = genLoadBody([source()], [], 'mcp__github', undefined, 'static');
    expect(out).toContain('initRefreshButton(deps, { topic: TOPIC })');
    // wrapped in the same try/catch guard as every other init
    expect(out).toContain('Foresights: initRefreshButton failed');
  });

  it('never emits initRefreshButton in artifact mode (additive guarantee)', () => {
    expect(genLoadBody([source()], [], 'mcp__github')).not.toContain('initRefreshButton');
    expect(genLoadBody([source()], [], 'mcp__github', undefined, 'artifact')).not.toContain(
      'initRefreshButton',
    );
  });

  it('emits the button even when a static dashboard has no sources', () => {
    const out = genLoadBody([], [], 'mcp__github', undefined, 'static');
    expect(out).toContain('initRefreshButton(deps, { topic: TOPIC })');
  });
});

describe('build — static-mode refresh button (e2e)', () => {
  // Real esbuild compile so the whole chain runs: outputMode 'static' →
  // genLoadBody → boot.ts import → refresh-button.ts bundled → final HTML.
  it('bundles the refresh-handoff button into a static-mode dashboard', async () => {
    const outFile = resolve(TEST_OUT_PREFIX, 'dashboard.html');
    await build({
      config: { ...minimalConfig, outputMode: 'static' },
      templatesDir: TEMPLATES_DIR,
      outFile,
      fast: true,
    });
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(outFile, 'utf8');
    expect(html).toContain('initRefreshButton');
    expect(html).toContain('foresights-refresh-btn');
    expect(html).toContain('/refresh-dashboard for ');
  }, 60000);

  it('omits the refresh button from an artifact-mode dashboard (tree-shaken)', async () => {
    const outFile = resolve(TEST_OUT_PREFIX, 'dashboard.html');
    await build({
      config: minimalConfig,
      templatesDir: TEMPLATES_DIR,
      outFile,
      fast: true,
    });
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(outFile, 'utf8');
    expect(html).not.toContain('foresights-refresh-btn');
  }, 60000);
});
