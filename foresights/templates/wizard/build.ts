/**
 * Wizard build orchestrator — the `/create-dashboard` skill's build step.
 *
 * Pipeline (matches the v0.2.x brief):
 *
 *   1. Read a `WizardConfig` from a JSON file or stdin.
 *   2. Copy the `templates/` tree to a fresh working directory.
 *   3. Apply sentinel substitution to every `.ts` file in the working copy,
 *      and to `dashboard.html`. Apply placeholder substitution to
 *      `config.ts`'s typed-stub constants (TOPIC / TOPIC_SLUG / GH_SERVER).
 *   4. Run the toolchain in the working copy: biome → tsc → esbuild
 *      (→ vitest, if `--with-tests` is passed). `--fast` runs esbuild only —
 *      esbuild still parses, so syntax errors in generated code still fail.
 *
 * The CLI entry additionally hydrates RSS sources (fetch + parse feeds in
 * Node) before the build — see `main()`.
 *   5. Read the compiled bundle (`dist/dashboard.js`) and inject it into
 *      `dashboard.html` at `{{COMPILED_JS}}`. Substitute remaining
 *      placeholders (TOPIC, ACCENT, etc.).
 *   6. Write the final HTML to the output path. Print a small JSON summary
 *      to stdout so the SKILL.md caller can pick up the artifact metadata
 *      and call `mcp__cowork__create_artifact`.
 *
 * This file is pure orchestration — every step is composed of well-tested
 * primitives (`substitute.ts`, `build-config.ts`) plus shell calls to the
 * existing toolchain (biome/tsc/esbuild/vitest, which are pinned in the
 * workspace's package.json). The shell calls are factored behind a single
 * `runStep` helper so a future test environment can stub them out without
 * touching the orchestration logic.
 */

import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  type WizardConfig,
  deriveFlagManifest,
  derivePlaceholderMap,
  deriveSentinelMap,
} from './build-config';
import { hydrateRssSources } from './fetch-feeds';
import { substituteAll } from './substitute';
import { validateAllTrustedHtml } from './trusted-html';
import { stressTestProductRegexes } from './validate-regexes';

const execFileAsync = promisify(execFile);

/** The TS files in `templates/` that carry FORESIGHTS sentinels. */
export const TS_FILES_WITH_SENTINELS = [
  'sources.ts',
  'boot.ts',
  'spotlight/data.ts',
  'digest/triage.ts',
  'products/brief.ts',
  'products/cc-prompts.ts',
  'products/config.ts',
  'products/context-refresh-config.ts',
  'products/prompts.ts',
  'products/rules.ts',
] as const;

/** `templates/config.ts` placeholders the wizard wants set at build time. */
const CONFIG_PLACEHOLDERS = ['TOPIC', 'TOPIC_SLUG', 'GH_SERVER'] as const;

export interface BuildOpts {
  /** The wizard input. */
  readonly config: WizardConfig;
  /** Absolute path to the `templates/` source tree. */
  readonly templatesDir: string;
  /** Where to write the final dashboard.html. */
  readonly outFile: string;
  /**
   * Skip the biome/tsc/esbuild/vitest shell calls. Used by tests that only
   * care about the substitution + injection pipeline.
   *
   * When true, the function also skips the esbuild step — meaning the
   * COMPILED_JS placeholder gets a `// skipped` comment instead of a real
   * bundle, and the final HTML won't be runnable. Useful for fast smoke
   * tests of the substitution layer.
   */
  readonly skipPreflight?: boolean;
  /** Also run `npm run test` after typecheck. Slower; off by default. */
  readonly withTests?: boolean;
  /**
   * Fast path: skip biome + tsc, run esbuild only. esbuild still parses the
   * substituted TS, so a syntax error in generated code still fails the
   * build — what's skipped is lint + strict type-checking of a tree the
   * templates' own preflight already covers. The `/create-dashboard` wizard
   * passes this; drop it to run the full gate when debugging a build.
   */
  readonly fast?: boolean;
  /**
   * Pre-existing warnings to fold into `BuildResult.warnings` — used by
   * `main()` to pipe `hydrateRssSources` warnings through to the stdout
   * summary. Tests + library callers can leave this unset.
   */
  readonly priorWarnings?: readonly string[];
}

export interface BuildResult {
  /** Absolute path to the temp working directory. */
  readonly workDir: string;
  /** Absolute path to the written dashboard.html. */
  readonly outFile: string;
  /** Cowork artifact metadata (passed through from WizardConfig). */
  readonly artifact: {
    readonly name: string;
    readonly description: string;
  };
  /** Bytes written to the output file. */
  readonly outBytes: number;
  /**
   * Structured warning lines emitted by the build — currently sourced from
   * `hydrateRssSources` (one per RSS feed that fetched zero items). Each line
   * is prefixed with a discriminator like `zero-items:` for machine parsing.
   * v0.9.1+. Empty array on a healthy build.
   */
  readonly warnings: readonly string[];
}

/**
 * Stage the `templates/` tree into a fresh temp dir. Returns the temp
 * dir's absolute path.
 */
const stageTemplates = async (templatesDir: string): Promise<string> => {
  const work = await mkdtemp(join(tmpdir(), 'foresights-build-'));
  // Copy everything except node_modules and dist. We skip node_modules in the
  // cp (it's ~200MB and we don't need a copy), then symlink it in so the
  // staged toolchain's `npx biome/tsc/esbuild` calls resolve against the
  // host's installed deps. dist/ stays excluded entirely — esbuild emits a
  // fresh dist/ in the staged dir.
  //
  // Gitignored scratch/build cruft is excluded too — `_smoke.mjs`, vitest
  // `*.timestamp-*.mjs` scratch files, `coverage/`, and `*.tsbuildinfo`.
  // Staging them would copy them into the work dir where `biome check` and
  // `tsc` would see them; harmless today, but a latent way for a stray
  // scratch file to fail a wizard build for every user. These are the same
  // patterns scripts/build-plugin.sh drops from the packaged plugin.
  await cp(templatesDir, work, {
    recursive: true,
    filter: (src) => {
      if (src.includes(`${templatesDir}/node_modules`)) return false;
      if (src.includes(`${templatesDir}/dist`)) return false;
      if (src.includes(`${templatesDir}/coverage`)) return false;
      if (src.endsWith('/_smoke.mjs')) return false;
      if (src.endsWith('.tsbuildinfo')) return false;
      if (/\.timestamp-.*\.mjs$/.test(src)) return false;
      return true;
    },
  });
  await symlink(join(templatesDir, 'node_modules'), join(work, 'node_modules'), 'dir');
  return work;
};

/**
 * Apply `substituteSentinels` to a single file in-place. Also runs
 * `substitutePlaceholders` for the small set of TOPIC/TOPIC_SLUG/GH_SERVER
 * constants that live in `templates/config.ts`.
 */
const substituteFile = async (
  path: string,
  sentinels: Readonly<Record<string, string>>,
  placeholders: Readonly<Record<string, string>>,
): Promise<void> => {
  const src = await readFile(path, 'utf8');
  const subbed = substituteAll(src, sentinels, placeholders);
  await writeFile(path, subbed, 'utf8');
};

/**
 * Substitute the `templates/config.ts` `export const TOPIC = '...'` lines.
 * That file uses literal string assignments rather than `{{PLACEHOLDER}}`
 * tokens, so we do a targeted source rewrite instead of placeholder
 * substitution.
 */
const rewriteConfigConsts = async (configPath: string, config: WizardConfig): Promise<void> => {
  const src = await readFile(configPath, 'utf8');
  const map: Readonly<Record<string, string>> = {
    TOPIC: config.topic,
    TOPIC_SLUG: config.topicSlug,
    GH_SERVER: config.ghServer,
  };
  const rewritten = src.replace(
    /export const (TOPIC|TOPIC_SLUG|GH_SERVER) = '[^']*';/g,
    (_full, name: string) => {
      if (!CONFIG_PLACEHOLDERS.includes(name as (typeof CONFIG_PLACEHOLDERS)[number])) {
        return _full;
      }
      const value = map[name] ?? '';
      // JSON.stringify gives us safely-escaped single-line string literal;
      // swap the outer double-quotes for single to match the source style.
      return `export const ${name} = ${JSON.stringify(value)};`;
    },
  );
  await writeFile(configPath, rewritten, 'utf8');
};

/** Run one toolchain step, surfacing stdout/stderr if it fails. */
const runStep = async (cmd: string, args: readonly string[], cwd: string): Promise<void> => {
  try {
    await execFileAsync(cmd, [...args], { cwd, maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const tail = `${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim();
    throw new Error(`${cmd} ${args.join(' ')} failed in ${cwd}:\n${tail || e.message}`);
  }
};

/**
 * Bundle `dashboard.ts` → `dist/dashboard.js` via the esbuild-wasm JS API.
 *
 * Lazy-imports `esbuild-wasm` so the WASM-init cost is only paid on builds
 * that actually reach this step — tests with `skipPreflight: true` (the
 * substitute-layer ones) never load it.
 *
 * v0.9.0 — was a `runStep('npx', ['esbuild', ...])` subprocess that required
 * the `esbuild` CLI on PATH (i.e. a working `npm install`). The wasm flavour
 * ships inside the plugin as one vendored package (`node_modules/esbuild-wasm`),
 * so the wizard runs with zero install in any Node ≥20 environment — even
 * sandboxes where the npm registry is firewalled. The build output is
 * byte-equivalent to the native esbuild path; wasm is ~3–5× slower (still
 * sub-second for a typical dashboard).
 */
const runEsbuild = async (workDir: string): Promise<void> => {
  const esbuild = await import('esbuild-wasm');
  try {
    await esbuild.build({
      entryPoints: ['dashboard.ts'],
      bundle: true,
      format: 'iife',
      target: 'es2022',
      sourcemap: 'inline',
      outfile: 'dist/dashboard.js',
      absWorkingDir: workDir,
    });
  } finally {
    await esbuild.stop();
  }
};

/** Run the toolchain in the staged working dir. */
const runToolchain = async (workDir: string, withTests: boolean, fast: boolean): Promise<void> => {
  // biome auto-fixes after substitution because generated TS often has
  // trailing whitespace or formatter-disagreed line wraps. --no-errors-on-unmatched
  // is omitted because we WANT failures here surfaced.
  //
  // `fast` skips biome + tsc: the substituted tree is the templates' own
  // (preflight-green) source with generated data spliced into sentinel
  // regions, and the esbuild step below still parses every file — so a
  // malformed generated literal still fails loudly. What `fast` trades away
  // is lint + strict type-checking, which the templates' preflight covers.
  //
  // biome / tsc / vitest stay as `npx` subprocesses — they're the dev-only
  // slow-path tools, and a user who explicitly opts into `--with-tests` (or
  // away from `--fast`) has the dev devDeps installed. esbuild — the one
  // tool the `--fast` happy path *requires* — runs via the bundled
  // esbuild-wasm JS API instead, so the zero-install plugin works.
  if (!fast) {
    await runStep('npx', ['biome', 'check', '--write', '.'], workDir);
    await runStep('npx', ['tsc', '--noEmit'], workDir);
  }
  await runEsbuild(workDir);
  if (withTests) {
    await runStep('npx', ['vitest', 'run'], workDir);
  }
};

/**
 * Inject the compiled bundle into the dashboard HTML and substitute
 * placeholders. Returns the final HTML.
 */
export const injectBundleAndSubstitute = (
  dashboardHtml: string,
  compiledJs: string,
  config: WizardConfig,
): string => {
  // First the HTML's own sentinels (HIGHLIGHTS_MARKUP etc.).
  const sentinels = deriveSentinelMap(config);
  const placeholders = derivePlaceholderMap(config, compiledJs);
  // substitute.ts uses string-keyed lookup so it needs Record-shape access;
  // SentinelMap/PlaceholderMap only have declared keys, hence the explicit
  // cast at the boundary. All field types are `string` so the cast is sound.
  return substituteAll(
    dashboardHtml,
    sentinels as unknown as Readonly<Record<string, string>>,
    placeholders as unknown as Readonly<Record<string, string>>,
  );
};

/**
 * Build a dashboard end-to-end. Returns metadata the SKILL.md caller can
 * use to invoke `mcp__cowork__create_artifact`.
 */
export const build = async (opts: BuildOpts): Promise<BuildResult> => {
  // Security pre-flight (v0.9.3). Validate the WizardConfig BEFORE any
  // rendering or staging so an XSS payload in a "trusted HTML" field —
  // or a catastrophic-backtracking regex in a product matcher — fails
  // the build with a clear, field-named error rather than shipping into
  // the artifact. See `trusted-html.ts` (finding H2) and
  // `validate-regexes.ts` (finding M1).
  validateAllTrustedHtml(opts.config);
  const regexReport = stressTestProductRegexes({
    products: opts.config.products as ReadonlyArray<{
      readonly id: string;
      readonly rules: ReadonlyArray<{ readonly source: string; readonly flags?: string }>;
    }>,
  });
  if (regexReport.failures.length > 0) {
    throw new Error(
      `build: product regex stress test failed:\n  ${regexReport.failures.join('\n  ')}`,
    );
  }

  const work = await stageTemplates(opts.templatesDir);

  // Apply substitutions to every TS file that carries sentinels.
  // (Same Record-cast story as in `injectBundleAndSubstitute`.)
  const sentinels = deriveSentinelMap(opts.config) as unknown as Readonly<Record<string, string>>;
  const placeholders = derivePlaceholderMap(
    opts.config,
    '// COMPILED_JS will be injected last',
  ) as unknown as Readonly<Record<string, string>>;
  for (const rel of TS_FILES_WITH_SENTINELS) {
    await substituteFile(join(work, rel), sentinels, placeholders);
  }
  await rewriteConfigConsts(join(work, 'config.ts'), opts.config);

  // Run the toolchain (unless skipped — tests skip this for speed).
  let compiledJs = '// preflight skipped — substitution-layer test only';
  if (!opts.skipPreflight) {
    await runToolchain(work, opts.withTests === true, opts.fast === true);
    compiledJs = await readFile(join(work, 'dist/dashboard.js'), 'utf8');
  }

  // Substitute the HTML — sentinels (skeletons / nav / sections) + all
  // placeholders including {{COMPILED_JS}}.
  const dashboardHtmlSrc = await readFile(join(work, 'dashboard.html'), 'utf8');
  const finalHtml = injectBundleAndSubstitute(dashboardHtmlSrc, compiledJs, opts.config);

  await mkdir(dirname(opts.outFile), { recursive: true });
  await writeFile(opts.outFile, finalHtml, 'utf8');

  return {
    workDir: work,
    outFile: opts.outFile,
    artifact: {
      name: opts.config.artifactName,
      description: opts.config.artifactDescription,
    },
    outBytes: Buffer.byteLength(finalHtml, 'utf8'),
    warnings: [...(opts.priorWarnings ?? []), ...regexReport.warnings],
  };
};

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

interface CliArgs {
  readonly configPath: string;
  readonly outFile: string;
  readonly templatesDir: string;
  readonly skipPreflight: boolean;
  readonly withTests: boolean;
  readonly fast: boolean;
  /**
   * Emit a flag manifest instead of building. Pass 1 of the static-mode
   * two-pass flow — `--out` receives the manifest JSON, not a dashboard.
   */
  readonly emitFlags: boolean;
}

const parseArgs = (argv: readonly string[]): CliArgs => {
  let configPath = '';
  let outFile = '';
  let templatesDir = '';
  let skipPreflight = false;
  let withTests = false;
  let fast = false;
  let emitFlags = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') configPath = argv[++i] ?? '';
    else if (a === '--out') outFile = argv[++i] ?? '';
    else if (a === '--templates') templatesDir = argv[++i] ?? '';
    else if (a === '--skip-preflight') skipPreflight = true;
    else if (a === '--with-tests') withTests = true;
    else if (a === '--fast') fast = true;
    else if (a === '--emit-flags') emitFlags = true;
  }
  if (!configPath || !outFile) {
    throw new Error(
      'Usage: node wizard/build.ts --config <path> --out <path> [--templates <dir>] [--fast] [--emit-flags] [--skip-preflight] [--with-tests]',
    );
  }
  // Default templates dir = the directory of this file's parent.
  const defaultTemplates = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  return {
    configPath: resolve(configPath),
    outFile: resolve(outFile),
    templatesDir: resolve(templatesDir || defaultTemplates),
    skipPreflight,
    withTests,
    fast,
    emitFlags,
  };
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const configRaw = await readFile(args.configPath, 'utf8');
  const rawConfig = JSON.parse(configRaw) as WizardConfig;
  // Fetch + bake RSS feeds here, in Node, before the build. The artifact
  // sandbox blocks cross-origin fetch, so RSS hydration belongs in the
  // orchestrator. GitHub-only configs are untouched; rss sources that
  // already carry `items` (the restricted-environment path, where the
  // wizard agent pre-populated via `WebFetch`) are left as-is. v0.9.1+
  // surfaces zero-item fetches as structured warnings — see
  // `HydrationResult` and the SKILL.md step-5 smoke-test guidance.
  const { sources: hydrated, warnings: rssWarnings } = await hydrateRssSources(rawConfig.sources);
  const config: WizardConfig = { ...rawConfig, sources: hydrated };
  // --emit-flags: pass 1 of the static-mode two-pass flow. Enumerate every
  // flagged (product × item) pair from the baked data and write the manifest.
  // The wizard agent then generates a Haiku brief per entry and re-invokes
  // build.ts for the real build with the briefs in WizardConfig.briefs.
  if (args.emitFlags) {
    const manifest = deriveFlagManifest(config);
    await mkdir(dirname(args.outFile), { recursive: true });
    await writeFile(args.outFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    // Warn if the manifest is empty in static mode — almost always a sign
    // that GitHub `baked` data or RSS `items` came back empty for every
    // source, which means no items were available to flag.
    const emitWarnings = [...rssWarnings];
    if (manifest.length === 0 && (config.products ?? []).length > 0) {
      emitWarnings.push(
        'zero-items: flag manifest came back empty — every source either returned no items or none of them matched any product matcher. Confirm `WizardSource.baked` (GitHub) and `items` (RSS) are populated before re-running.',
      );
    }
    process.stdout.write(
      `${JSON.stringify({ mode: 'emit-flags', flags: manifest.length, outFile: args.outFile, warnings: emitWarnings })}\n`,
    );
    return;
  }
  const result = await build({
    config,
    templatesDir: args.templatesDir,
    outFile: args.outFile,
    skipPreflight: args.skipPreflight,
    withTests: args.withTests,
    fast: args.fast,
    priorWarnings: rssWarnings,
  });
  // One-line JSON summary for the SKILL.md caller to consume.
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

// Only run main() when invoked as a script (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
