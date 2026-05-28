/**
 * Zero-install end-to-end — Phase 9.0.
 *
 * Proves the dogfood-feedback fix actually works in the shape a sandboxed
 * Cowork user would see. We:
 *
 *   1. Stage a fresh templates dir containing the pre-bundled
 *      `wizard/build.js` + `wizard/refresh.js` (no `.ts` is read at run time).
 *   2. Populate `node_modules/` with **only `esbuild-wasm`** — no biome, tsc,
 *      vitest, tsx, or jsdom. This is exactly what the shipped `.plugin`
 *      contains.
 *   3. Run `node wizard/build.js --config X --out Y --fast` as a subprocess.
 *   4. Verify the output is a real dashboard HTML.
 *
 * If `wizard/build.js` hasn't been built (`npm run prebuild-wizard`), the test
 * skips with a clear hint instead of failing — the orchestration lives in the
 * `preflight` script which always runs prebuild first.
 */

import { execFile } from 'node:child_process';
import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const TEMPLATES_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const STAGE_DIR = resolve(TEMPLATES_DIR, '../tmp-zero-install-test');
const BUILD_JS = resolve(TEMPLATES_DIR, 'wizard/build.js');
const ESBUILD_WASM_DIR = resolve(TEMPLATES_DIR, 'node_modules/esbuild-wasm');

const fileExists = async (p: string): Promise<boolean> => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

afterEach(async () => {
  try {
    await rm(STAGE_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

/**
 * A minimal CDK-only WizardConfig — no RSS sources, no products, no curated
 * content. The point isn't to exercise the curation pipeline (other tests
 * cover that); it's to prove `node wizard/build.js` reaches `outBytes > 0`
 * with only `esbuild-wasm` installed.
 */
const cdkOnlyConfig = {
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

describe('zero-install — node wizard/build.js with only vendored esbuild-wasm', () => {
  it('builds a CDK-only dashboard from a minimal templates dir', async () => {
    if (!(await fileExists(BUILD_JS))) {
      console.warn(
        '[zero-install.test] wizard/build.js missing — run `npm run prebuild-wizard` first. Skipping.',
      );
      return;
    }
    if (!(await fileExists(ESBUILD_WASM_DIR))) {
      console.warn(
        '[zero-install.test] node_modules/esbuild-wasm missing — run `npm install` first. Skipping.',
      );
      return;
    }

    // Stage the templates dir — skip node_modules / dist / coverage / the
    // staging dir itself / vitest's own temp output. Everything else (the
    // pre-bundled wizard/build.js + the source tree) goes in.
    await cp(TEMPLATES_DIR, STAGE_DIR, {
      recursive: true,
      filter: (src) =>
        !src.includes(`${TEMPLATES_DIR}/node_modules`) &&
        !src.includes(`${TEMPLATES_DIR}/dist`) &&
        !src.includes(`${TEMPLATES_DIR}/coverage`) &&
        !src.startsWith(STAGE_DIR),
    });

    // Vendor only esbuild-wasm — no biome, tsc, vitest, tsx, or jsdom.
    await mkdir(resolve(STAGE_DIR, 'node_modules'), { recursive: true });
    await cp(ESBUILD_WASM_DIR, resolve(STAGE_DIR, 'node_modules/esbuild-wasm'), {
      recursive: true,
    });

    // Write the config + run the pre-bundled wizard exactly as a plugin user would.
    const cfgPath = resolve(STAGE_DIR, 'config.json');
    const outPath = resolve(STAGE_DIR, 'dashboard.html');
    await writeFile(cfgPath, JSON.stringify(cdkOnlyConfig), 'utf8');

    const { stdout } = await execFileAsync(
      'node',
      ['wizard/build.js', '--config', cfgPath, '--out', outPath, '--fast'],
      { cwd: STAGE_DIR, maxBuffer: 64 * 1024 * 1024 },
    );

    // Stdout carries the orchestrator's one-line JSON summary.
    const summary = JSON.parse(stdout.trim()) as {
      readonly outFile: string;
      readonly artifact: { readonly name: string };
      readonly outBytes: number;
    };
    expect(summary.outFile).toBe(outPath);
    expect(summary.artifact.name).toBe('AWS CDK news');
    expect(summary.outBytes).toBeGreaterThan(50_000);

    const html = await readFile(outPath, 'utf8');
    expect(html.length).toBeGreaterThan(50_000);
    // The IIFE bundle is in the output (boot-block markers).
    expect(html).toContain('initSpotlight');
    // Topic placeholder substituted.
    expect(html).toContain('AWS CDK');
    // No unsubstituted placeholders leaked.
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/);
  }, 60_000);
});
