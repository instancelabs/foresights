/**
 * Integration test for the build orchestrator.
 *
 * Runs `build()` against the real `templates/` tree (the workspace this test
 * file lives in) with `skipPreflight: true`. That verifies the substitution
 * pipeline + bundle-injection + HTML output without spending 10s on
 * biome/tsc/esbuild — those are exercised by the regular `npm run preflight`
 * already.
 *
 * The full pipeline (with the toolchain enabled) is what the wizard SKILL
 * runs in production; this test covers everything except the subprocess
 * shell-outs.
 */

import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { build, injectBundleAndSubstitute } from './build';
import type { WizardConfig } from './build-config';

// The templates dir is the parent of this file's `wizard/` directory.
const TEMPLATES_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

const TEST_OUT_PREFIX = resolve(TEMPLATES_DIR, '../tmp-wizard-test');

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
  sources: [
    {
      id: 'cdk-core',
      label: 'aws/aws-cdk',
      owner: 'aws',
      repo: 'aws-cdk',
      kind: 'releases',
      section: 'releases',
      perPage: 5,
    },
  ],
  spotlights: [],
  products: [],
  highlights: [],
  patterns: [],
  tips: [],
  resources: [],
};

afterEach(async () => {
  // Best-effort cleanup of the test output directory.
  try {
    await rm(TEST_OUT_PREFIX, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('build (skipPreflight) — end-to-end substitution + injection', () => {
  it('returns the expected artifact metadata', async () => {
    const outFile = resolve(TEST_OUT_PREFIX, 'dashboard.html');
    const result = await build({
      config: minimalConfig,
      templatesDir: TEMPLATES_DIR,
      outFile,
      skipPreflight: true,
    });
    expect(result.outFile).toBe(outFile);
    expect(result.artifact.name).toBe('AWS CDK news');
    expect(result.artifact.description).toBe('desc');
    expect(result.outBytes).toBeGreaterThan(1000);
  });

  it('substitutes the {{TOPIC}} placeholder in the final HTML', async () => {
    const outFile = resolve(TEST_OUT_PREFIX, 'dashboard.html');
    await build({
      config: minimalConfig,
      templatesDir: TEMPLATES_DIR,
      outFile,
      skipPreflight: true,
    });
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(outFile, 'utf8');
    expect(html).toContain('AWS CDK — what');
    expect(html).not.toContain('{{TOPIC}}');
    expect(html).not.toContain('{{TAGLINE_SUFFIX}}');
  });

  it('substitutes the SECTION_NAV sentinel with a nav button per source', async () => {
    const outFile = resolve(TEST_OUT_PREFIX, 'dashboard.html');
    const base = minimalConfig.sources[0];
    if (!base) throw new Error('test fixture missing base source');
    await build({
      config: {
        ...minimalConfig,
        sources: [
          { ...base, id: 's1', section: 'releases' },
          { ...base, id: 's2', kind: 'issues', section: 'rfcs' },
        ],
      },
      templatesDir: TEMPLATES_DIR,
      outFile,
      skipPreflight: true,
    });
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(outFile, 'utf8');
    // SECTION_NAV emits anchor buttons jumping to each section.
    expect(html).toContain('href="#releases"');
    expect(html).toContain('href="#rfcs"');
  });

  it('substitutes the SECTION_MARKUP:ABOVE_HIGHLIGHTS sentinel', async () => {
    const outFile = resolve(TEST_OUT_PREFIX, 'dashboard.html');
    await build({
      config: minimalConfig,
      templatesDir: TEMPLATES_DIR,
      outFile,
      skipPreflight: true,
    });
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(outFile, 'utf8');
    // Section-markup emits a `<section>` with id="releases-body" inside.
    expect(html).toContain('id="releases-body"');
  });

  it('injects the COMPILED_JS placeholder (with the skipped-preflight stub)', async () => {
    const outFile = resolve(TEST_OUT_PREFIX, 'dashboard.html');
    await build({
      config: minimalConfig,
      templatesDir: TEMPLATES_DIR,
      outFile,
      skipPreflight: true,
    });
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(outFile, 'utf8');
    expect(html).toContain('preflight skipped');
    expect(html).not.toContain('{{COMPILED_JS}}');
  });

  it('embeds the foresights-config block recoverable by /refresh-dashboard', async () => {
    const outFile = resolve(TEST_OUT_PREFIX, 'dashboard.html');
    await build({
      config: minimalConfig,
      templatesDir: TEMPLATES_DIR,
      outFile,
      skipPreflight: true,
    });
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(outFile, 'utf8');
    expect(html).not.toContain('{{FORESIGHTS_CONFIG_JSON}}');
    const open = '<script type="application/json" id="foresights-config">';
    const start = html.indexOf(open);
    expect(start).toBeGreaterThan(-1);
    const after = html.slice(start + open.length);
    const parsed = JSON.parse(after.slice(0, after.indexOf('</script>'))) as WizardConfig;
    expect(parsed.topic).toBe('AWS CDK');
    expect(parsed.sources[0]?.repo).toBe('aws-cdk');
  });

  it('leaves the original templates/ directory untouched', async () => {
    const { readFile } = await import('node:fs/promises');
    const beforeSources = await readFile(resolve(TEMPLATES_DIR, 'sources.ts'), 'utf8');
    const outFile = resolve(TEST_OUT_PREFIX, 'dashboard.html');
    await build({
      config: minimalConfig,
      templatesDir: TEMPLATES_DIR,
      outFile,
      skipPreflight: true,
    });
    const afterSources = await readFile(resolve(TEMPLATES_DIR, 'sources.ts'), 'utf8');
    expect(afterSources).toBe(beforeSources);
  });
});

describe('injectBundleAndSubstitute (unit)', () => {
  it('replaces {{COMPILED_JS}} with the provided bundle source', () => {
    const html = '<html><script>{{COMPILED_JS}}</script></html>';
    const out = injectBundleAndSubstitute(html, '/* my bundle */', minimalConfig);
    expect(out).toContain('<script>/* my bundle */</script>');
  });

  it('substitutes all the standard placeholders', () => {
    const html = '<title>{{TOPIC}} — {{TAGLINE_SUFFIX}}</title>';
    const out = injectBundleAndSubstitute(html, '', minimalConfig);
    expect(out).toBe("<title>AWS CDK — what's new</title>");
  });

  it('leaves unknown placeholders untouched (non-strict by default)', () => {
    const html = '<p>{{TOPIC}} and {{UNKNOWN}}</p>';
    const out = injectBundleAndSubstitute(html, '', minimalConfig);
    expect(out).toContain('AWS CDK');
    expect(out).toContain('{{UNKNOWN}}');
  });
});

describe('build — baked briefs (Phase 3b)', () => {
  // A real esbuild compile (fast: skips biome + tsc, keeps esbuild) so the
  // whole chain is exercised: WizardConfig.briefs → genBakedBriefs →
  // products/brief.ts BAKED_BRIEFS sentinel → bundle → final HTML.
  it('bakes WizardConfig.briefs through to the compiled dashboard HTML', async () => {
    const outFile = resolve(TEST_OUT_PREFIX, 'dashboard.html');
    const marker = 'BAKED-BRIEF-E2E-MARKER: construct-tree traversal matters here';
    await build({
      config: {
        ...minimalConfig,
        briefs: { cdki: { 'pr:1': { why: marker, integrations: [] } } },
      },
      templatesDir: TEMPLATES_DIR,
      outFile,
      fast: true,
    });
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(outFile, 'utf8');
    expect(html).toContain(marker);
  }, 60000);
});

describe('build — baked digest triage (Phase 3c)', () => {
  // Real esbuild compile so the whole chain is exercised: WizardConfig.triage
  // → genBakedTriage → digest/triage.ts BAKED_TRIAGE sentinel → bundle → HTML.
  it('bakes WizardConfig.triage through to the compiled dashboard HTML', async () => {
    const outFile = resolve(TEST_OUT_PREFIX, 'dashboard.html');
    const marker = 'BAKED-TRIAGE-E2E-MARKER: high-impact construct-tree change';
    await build({
      config: {
        ...minimalConfig,
        triage: {
          cdki: { 'pr:1': { stableId: 'pr:1', bucket: 'green', reasoning: marker } },
        },
      },
      templatesDir: TEMPLATES_DIR,
      outFile,
      fast: true,
    });
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(outFile, 'utf8');
    expect(html).toContain(marker);
  }, 60000);
});
