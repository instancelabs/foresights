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
  genForesightsConfigJson,
  genHighlightsMarkup,
  genPatternsMarkup,
  genResourcesMarkup,
  genTipsMarkup,
} from './build-config';
import { substituteSentinels } from './substitute';

/** Opening tag of the artifact's embedded build-config block. */
const CONFIG_BLOCK_OPEN = '<script type="application/json" id="foresights-config">';

/**
 * Rewrite the embedded `foresights-config` block so it matches the
 * refreshed config.
 *
 * Without this, a splice would leave the artifact internally inconsistent:
 * the visible cards updated, but the embedded snapshot still describing the
 * old build — which the next refresh would then recover and treat as the
 * "previous content" reference. Pre-v0.5.0 artifacts have no such block and
 * are returned unchanged.
 */
const reembedConfig = (html: string, config: WizardConfig): string => {
  const start = html.indexOf(CONFIG_BLOCK_OPEN);
  if (start < 0) return html;
  const bodyStart = start + CONFIG_BLOCK_OPEN.length;
  const bodyEnd = html.indexOf('</script>', bodyStart);
  if (bodyEnd < 0) return html;
  return `${html.slice(0, bodyStart)}\n${genForesightsConfigJson(config)}\n${html.slice(bodyEnd)}`;
};

/**
 * Splice freshly-curated content into an already-built dashboard artifact.
 *
 * Pure function: given the current artifact HTML and a `WizardConfig` whose
 * `highlights` / `patterns` / `tips` / `resources` arrays hold the fresh
 * content, returns the updated HTML. Two things change — the four curated
 * markup sections, and the embedded `foresights-config` block (kept in sync
 * so the artifact stays self-describing for the next refresh). The sentinel
 * markers and everything else — compiled bundle, spotlights, product
 * machinery — are preserved byte-for-byte, so the result can be spliced
 * again on the next refresh.
 *
 * Each generator reads exactly one config array — but passing the whole
 * recovered config keeps the call honest and feeds the re-embedded block.
 * A sentinel (or the config block) missing from the artifact is left
 * unchanged, so this is safe to run against pre-v0.5.0 dashboards too.
 */
export const spliceRefresh = (artifactHtml: string, config: WizardConfig): string => {
  const withSections = substituteSentinels(artifactHtml, {
    HIGHLIGHTS_MARKUP: genHighlightsMarkup(config),
    PATTERNS_MARKUP: genPatternsMarkup(config),
    TIPS_MARKUP: genTipsMarkup(config),
    RESOURCES_MARKUP: genResourcesMarkup(config),
  });
  return reembedConfig(withSections, config);
};

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
