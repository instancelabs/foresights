/**
 * Section-splice refresh — the fast path for the `/refresh-dashboard` skill.
 *
 * Re-curates the four curated markup sections of an already-built dashboard
 * artifact WITHOUT a full rebuild. The HTML-side sentinels — HIGHLIGHTS_MARKUP,
 * PATTERNS_MARKUP, TIPS_MARKUP, RESOURCES_MARKUP — survive into the built
 * artifact (they're plain HTML comments, untouched by esbuild), so
 * `substituteSentinels` can swap their bodies in place. The compiled bundle,
 * the spotlight carousel, and the product machinery are all left byte-for-byte
 * identical.
 *
 * A refresh that must also touch spotlights, data sources, or products can't
 * use this path — those live inside the compiled bundle, behind no surviving
 * sentinel. For that case the skill recovers the embedded `foresights-config`
 * block and re-runs `wizard/build.ts` instead.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  type WizardConfig,
  genHighlightsMarkup,
  genPatternsMarkup,
  genResourcesMarkup,
  genTipsMarkup,
} from './build-config';
import { substituteSentinels } from './substitute';

/**
 * Splice freshly-curated content into an already-built dashboard artifact.
 *
 * Pure function: given the current artifact HTML and a `WizardConfig` whose
 * `highlights` / `patterns` / `tips` / `resources` arrays hold the fresh
 * content, returns the updated HTML. Only those four sections change; the
 * sentinel comment markers themselves are preserved, so the result can be
 * spliced again on the next refresh.
 *
 * Each generator reads exactly one config array — but passing the whole
 * recovered config keeps the call honest and avoids a partial-object cast.
 * A sentinel missing from the artifact is left unchanged (non-strict
 * substitution), so this is safe to run against older dashboards too.
 */
export const spliceRefresh = (artifactHtml: string, config: WizardConfig): string =>
  substituteSentinels(artifactHtml, {
    HIGHLIGHTS_MARKUP: genHighlightsMarkup(config),
    PATTERNS_MARKUP: genPatternsMarkup(config),
    TIPS_MARKUP: genTipsMarkup(config),
    RESOURCES_MARKUP: genResourcesMarkup(config),
  });

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

interface CliArgs {
  readonly artifactPath: string;
  readonly configPath: string;
  readonly outFile: string;
}

const parseArgs = (argv: readonly string[]): CliArgs => {
  let artifactPath = '';
  let configPath = '';
  let outFile = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--artifact') artifactPath = argv[++i] ?? '';
    else if (a === '--config') configPath = argv[++i] ?? '';
    else if (a === '--out') outFile = argv[++i] ?? '';
  }
  if (!artifactPath || !configPath || !outFile) {
    throw new Error('Usage: node wizard/refresh.ts --artifact <path> --config <path> --out <path>');
  }
  return {
    artifactPath: resolve(artifactPath),
    configPath: resolve(configPath),
    outFile: resolve(outFile),
  };
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const artifactHtml = await readFile(args.artifactPath, 'utf8');
  const configRaw = await readFile(args.configPath, 'utf8');
  const config = JSON.parse(configRaw) as WizardConfig;
  const updated = spliceRefresh(artifactHtml, config);
  await writeFile(args.outFile, updated, 'utf8');
  const outBytes = Buffer.byteLength(updated, 'utf8');
  process.stdout.write(`${JSON.stringify({ outFile: args.outFile, outBytes })}\n`);
};

// Only run main() when invoked as a script (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
