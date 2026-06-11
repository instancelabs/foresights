import { flagsForText } from '../products/matcher';
import { type FlagUnit, issueUnits, prUnits, releaseUnits, rssUnits } from '../render/flag-units';
import type {
  ActionTypeId,
  Brief,
  Cadence,
  Issue,
  Product,
  PullRequest,
  Release,
  RssItem,
  TriagedItem,
} from '../types';
import { escHtml, safeHref } from '../util/escape';

/** Dashboard output mode — see `WizardConfig.outputMode`. */
export type OutputMode = 'artifact' | 'static';

/**
 * Wizard input → substitution maps.
 *
 * Each generator below emits one sentinel's body, derived purely from the
 * `WizardConfig`. The composite `deriveSentinelMap` / `derivePlaceholderMap`
 * call every generator and assemble the maps the build orchestrator hands to
 * `substitute.ts`.
 *
 * Design principles:
 *
 *   1. Generators are PURE functions of `WizardConfig`. No filesystem, no
 *      MCP calls, no DOM.
 *   2. Each generator's output must produce code that compiles under the
 *      existing strict tsconfig (templates/tsconfig.json). The build's tsc
 *      step will catch any drift.
 *   3. Defaults are conservative — `products: []` produces empty objects
 *      for all `PRODUCTS_CONFIG:*` sentinels, matching the typed-stub
 *      module defaults. So the wizard "no products" case is identity-
 *      substitution-safe.
 *   4. Code-gen is straight-line — no string templating frameworks. Hand-
 *      rolled `JSON.stringify` + small helpers keep output diff-stable.
 */

/**
 * One data source the wizard wants the dashboard to fetch.
 *
 * GitHub kinds (`releases | issues | pull_requests`) need `owner` + `repo`.
 * The `rss` kind (Phase 10.1) needs `url` instead. They're declared on the
 * same interface as optional fields rather than a discriminated union to
 * keep the JSON wizard config flat — the generators below dispatch on
 * `kind` and read the right field.
 *
 * For `rss`, the wizard also fills `items` with the feed's parsed entries
 * (fetched at build time); `genLoadBody` bakes them into the dashboard,
 * since the artifact sandbox blocks live cross-origin fetch.
 */
export interface WizardSource {
  /** Short slug for chip rendering + IDs. */
  readonly id: string;
  /** User-facing label, e.g. `"aws/aws-cdk"` (or feed display name for RSS). */
  readonly label: string;
  readonly kind: 'releases' | 'issues' | 'pull_requests' | 'rss';
  /** GitHub owner (required for releases/issues/pull_requests). */
  readonly owner?: string;
  /** GitHub repo (required for releases/issues/pull_requests). */
  readonly repo?: string;
  /** Feed URL (required for rss). */
  readonly url?: string;
  /**
   * Baked RSS items for `kind: 'rss'` — the wizard fetches + parses the feed
   * at build time and stores recent entries here. `genLoadBody` bakes them
   * into the dashboard as a literal; the artifact sandbox blocks live
   * cross-origin `window.fetch`, so this is how RSS reaches a built artifact.
   */
  readonly items?: readonly RssItem[];
  /**
   * Baked GitHub data for the GitHub kinds — in `outputMode: 'static'` the
   * wizard agent fetches the source's items via the GitHub MCP and stores the
   * normalised array here. `genLoadBody` bakes it into the dashboard as a
   * literal instead of emitting a live `callTool`. Ignored in `'artifact'`
   * mode (live fetch on open). Element type is `unknown` because it varies by
   * kind (Release / Issue / PullRequest); the renderer `as` cast in
   * `genLoadBody` narrows it.
   */
  readonly baked?: readonly unknown[];
  /** Which section to feed. Omit to merge into the default per-kind section. */
  readonly section?: string;
  readonly perPage?: number;
  readonly state?: string;
  readonly orderBy?: string;
  readonly direction?: string;
  readonly sort?: string;
}

/** One spotlight card. Mirrors `templates/types.ts#Spotlight`. */
export interface WizardSpotlight {
  readonly tag: string;
  readonly title: string;
  readonly summary: string;
  readonly trick: string;
  readonly code: string;
  readonly why: string;
  readonly url: string;
  /**
   * Optional product id this spotlight maps to. Emitted into the generated
   * `Spotlight` literal only when present, so spotlights without it build
   * byte-identically to pre-existing output.
   */
  readonly productId?: string;
}

/** One matcher rule for a product. `source`/`flags` are the RegExp inputs. */
export interface WizardProductRule {
  /** Regex source string — passed to `new RegExp(source, flags)`. */
  readonly source: string;
  /** Regex flags, e.g. `"i"`. Omit for none. */
  readonly flags?: string;
  /** Reason surfaced in the brief panel + digest. */
  readonly reason: string;
}

/**
 * One curated highlight card baked at wizard time.
 *
 * The wizard populates these from a Haiku batch (see SKILL.md → "Wizard-time
 * Haiku batches"). The generator emits one `<div class="hl-card">` per entry.
 *
 * `title` and `body` may contain inline `<code>...</code>` tags (and only those
 * — every other HTML metacharacter gets escaped by `escAllowCode`). `tag` is
 * plain text. `url` is escaped into the `href` attribute. `cta` defaults to
 * `"GitHub"` when the URL points at github.com, otherwise the hostname.
 */
export interface WizardHighlightCard {
  /** Short chip text shown above the title — e.g. `"Mar 2026 · GA"`. */
  readonly tag: string;
  /** One-line heading. May contain inline `<code>`. */
  readonly title: string;
  /** 1–2 sentence body. May contain inline `<code>`. */
  readonly body: string;
  /** Canonical link rendered as the "more" anchor. */
  readonly url: string;
  /** Anchor text (without the `→`). Defaults to hostname / "GitHub". */
  readonly cta?: string;
}

/** A single community / pattern card — same shape as a highlight card. */
export interface WizardPatternCard {
  readonly tag: string;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly cta?: string;
}

/**
 * A single advanced-tip card. The `why` field renders as
 * `<span class="why">— ...</span>` after the title.
 *
 * `code` is a pre-rendered code block — Haiku should emit ready-to-render HTML
 * using `<span class="k">`/`<span class="s">`/`<span class="t">` for syntax
 * tokens. If `code` is empty the `<pre>` is omitted.
 */
export interface WizardTipCard {
  /** Heading text. May include inline `<code>`. */
  readonly title: string;
  /** Optional suffix shown as `<span class="why">— ${why}</span>`. */
  readonly why?: string;
  /** Body paragraph. May include inline `<code>`. */
  readonly body: string;
  /** Optional pre-rendered code block. Trusted HTML — escape upstream. */
  readonly code?: string;
}

/** A single "where to keep watching" resource link. */
export interface WizardResourceLink {
  /** Display name — e.g. `"aws/aws-cdk releases"`. Plain text. */
  readonly name: string;
  /** One-line description. Plain text. */
  readonly desc: string;
  /** Canonical URL. */
  readonly url: string;
}

/** One product the wizard wants to flag matched items for. */
export interface WizardProduct {
  /** Short id, e.g. `"cdki"`. Used as the dict key. */
  readonly id: string;
  /** Display label, e.g. `"CDK Insights"`. */
  readonly label: string;
  /** CSS modifier class — applied as `.insights-tag.<cssMod>`. Empty string allowed. */
  readonly cssMod: string;
  /** Brand accent hex for the badge background. */
  readonly badgeColor: string;
  /** Brand accent hex for the badge hover background (lighter). */
  readonly badgeColorSoft: string;
  /** Brand accent hex for the badge border. */
  readonly badgeBorderColor: string;
  /** Per-product Haiku system prompt. */
  readonly systemPrompt: string;
  /** Matcher rules, scanned in declaration order — first match wins. */
  readonly rules: readonly WizardProductRule[];
  /**
   * Which action this product's flagged items offer — `'claude-code'`
   * (the default), `'summary'`, or `'task'`. Omit for `'claude-code'`.
   * Only `'claude-code'` products use `ccPromptBody` + `contextRefresh`;
   * the wizard skips repo-nav extraction for `'summary'` / `'task'`.
   */
  readonly actionType?: ActionTypeId;
  /**
   * Optional Claude Code prompt builder body. Receives `({ brief, meta, mode })`.
   * Emit just the function body (everything between `=> {` and `}`).
   * Default: a generic builder that interpolates brief.why + meta.title + mode.
   */
  readonly ccPromptBody?: string;
  /**
   * Optional context refresh spec — if set, the dashboard renders a ↻ button
   * next to this product that re-fetches the listed paths from the repo via
   * the GitHub MCP, bumps the brief-cache fingerprint, and stores a fresh
   * layout map. Useful when the product's repo structure changes (new
   * services, new src/rules subfolders) and existing baked rules would
   * miss the new ground.
   */
  readonly contextRefresh?: {
    readonly repoOwner: string;
    readonly repoName: string;
    readonly paths: readonly string[];
    /**
     * Human-readable unit shown in the context-bar status text. Default
     * "paths indexed" — overridden per product to match the v0.1 phrasing
     * (CDK Insights uses "service folders", Last Command uses "lc-* repos").
     */
    readonly unitLabel?: string;
  };
}

/** The full wizard input. */
export interface WizardConfig {
  readonly topic: string;
  readonly topicSlug: string;
  readonly taglineSuffix: string;
  readonly taglineSub: string;
  readonly accent: string;
  readonly accentSoft: string;
  readonly footerNote: string;
  readonly artifactName: string;
  readonly artifactDescription: string;
  /** The MCP server name prefix for the user's GitHub MCP, e.g. `"mcp__github"`. */
  readonly ghServer: string;
  /** Pre-rendered HTML for the header source links (comma-separated anchors). */
  readonly headerSourcesLinks: string;
  readonly sources: readonly WizardSource[];
  readonly spotlights: readonly WizardSpotlight[];
  /**
   * Spotlight rotation cadence — `'daily'` (the default), `'weekly'`, or
   * `'on-demand'`. Omit for `'daily'` so a daily dashboard's LOAD_BODY stays
   * byte-identical to pre-cadence output.
   */
  readonly cadence?: Cadence;
  /**
   * Output mode. `'artifact'` (the default) emits the live Cowork-artifact
   * dashboard — GitHub sources fetch on open via `window.cowork`. `'static'`
   * bakes GitHub data (from `WizardSource.baked`) into the HTML so the
   * dashboard runs as a standalone file with no artifact runtime. Omit for
   * `'artifact'` so an artifact build's `LOAD_BODY` stays byte-identical to
   * pre-v0.8.0 output.
   */
  readonly outputMode?: OutputMode;
  /**
   * Pre-baked briefs — `productId → stableId → Brief`. In `outputMode:
   * 'static'` the wizard runs `build.ts --emit-flags` to enumerate every
   * flagged unit, generates a `Brief` per entry via a Haiku batch, and places
   * the result here; `genBakedBriefs` embeds it as `products/brief.ts`'s
   * `BAKED_BRIEFS` map. Omit for `'artifact'` builds — `genBakedBriefs`
   * then emits the same empty `{}` the template ships.
   */
  readonly briefs?: Readonly<Record<string, Readonly<Record<string, Brief>>>>;
  /**
   * Pre-baked digest triage — `productId → stableId → TriagedItem`. In
   * `outputMode: 'static'` the wizard pre-computes the 🟢 / 🟡 / 🔴 verdict
   * for every flagged item (same `--emit-flags` manifest the briefs use) and
   * places it here; `genBakedTriage` embeds it as `digest/triage.ts`'s
   * `BAKED_TRIAGE` map, so the upgrade digest is fully bucketed offline. Omit
   * for `'artifact'` builds — triage then runs live on the digest button.
   */
  readonly triage?: Readonly<Record<string, Readonly<Record<string, TriagedItem>>>>;
  readonly products: readonly WizardProduct[];
  /**
   * Curated highlight cards baked at wizard time (Haiku batch). Empty array
   * produces a single "get started" placeholder card so the section still
   * renders meaningfully on a misconfigured run.
   */
  readonly highlights: readonly WizardHighlightCard[];
  /** Curated community / pattern cards. Same empty-array semantics as `highlights`. */
  readonly patterns: readonly WizardPatternCard[];
  /** Advanced-tip cards. Empty array → placeholder card. */
  readonly tips: readonly WizardTipCard[];
  /** "Where to keep watching" links. Empty array → placeholder anchor. */
  readonly resources: readonly WizardResourceLink[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** JSON.stringify with a fixed 2-space indent — used everywhere for diff stability. */
const j = (v: unknown): string => JSON.stringify(v);

/**
 * Strip HTML tags + collapse whitespace. Keeps baked RSS text plain so it
 * carries no markup into the `<script>` the compiled bundle is inlined into.
 */
const stripTags = (s: string): string =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Stringify a JS RegExp literal. Empty flags → no trailing flag chars. */
const regexLiteral = (source: string, flags = ''): string =>
  `new RegExp(${j(source)}${flags ? `, ${j(flags)}` : ''})`;

/** Indent every line of `body` by 2 spaces. */
const indent2 = (body: string): string =>
  body
    .split('\n')
    .map((l) => (l.length > 0 ? `  ${l}` : l))
    .join('\n');

// ---------------------------------------------------------------------------
// TS generators
// ---------------------------------------------------------------------------

/**
 * Emit the body of the `SOURCES_CONST` sentinel — a typed `SOURCES` const.
 * Sits in `templates/sources.ts` between the markers.
 */
export const genSourcesConst = (sources: readonly WizardSource[]): string => {
  if (sources.length === 0) {
    return '\nexport const SOURCES: readonly Source[] = [];\n';
  }
  const entries = sources.map((s) => {
    const argFields: string[] = [];
    if (s.perPage !== undefined) argFields.push(`perPage: ${s.perPage}`);
    if (s.state) argFields.push(`state: ${j(s.state)}`);
    if (s.orderBy) argFields.push(`orderBy: ${j(s.orderBy)}`);
    if (s.direction) argFields.push(`direction: ${j(s.direction)}`);
    if (s.sort) argFields.push(`sort: ${j(s.sort)}`);
    const argsLit = argFields.length > 0 ? `{ ${argFields.join(', ')} }` : '{}';
    const sectionLine = s.section ? `\n    section: ${j(s.section)},` : '';
    // Kind-discriminated source fields: github sources carry owner/repo,
    // rss carries url. Default values for the missing fields (owner: "",
    // repo: "") keep the emitted shape unambiguous; the runtime
    // `genLoadBody` dispatch reads only the right field per kind.
    if (s.kind === 'rss') {
      return `  {
    id: ${j(s.id)},
    label: ${j(s.label)},
    kind: ${j(s.kind)},
    url: ${j(s.url ?? '')},${sectionLine}
    args: ${argsLit},
  },`;
    }
    return `  {
    id: ${j(s.id)},
    label: ${j(s.label)},
    owner: ${j(s.owner ?? '')},
    repo: ${j(s.repo ?? '')},
    kind: ${j(s.kind)},${sectionLine}
    args: ${argsLit},
  },`;
  });
  return `\nexport const SOURCES: readonly Source[] = [\n${entries.join('\n')}\n];\n`;
};

/**
 * Emit the body of the `SPOTLIGHTS_CONST` sentinel — typed `SPOTLIGHTS` const.
 */
export const genSpotlightsConst = (spotlights: readonly WizardSpotlight[]): string => {
  if (spotlights.length === 0) {
    return '\nexport const SPOTLIGHTS: readonly Spotlight[] = [];\n';
  }
  const entries = spotlights
    .map((sp) => {
      // productId is emitted ONLY when present, so a spotlight without it is
      // byte-identical to pre-productId output.
      const pid = sp.productId ? `\n    productId: ${j(sp.productId)},` : '';
      return `  {
    tag: ${j(sp.tag)},
    title: ${j(sp.title)},
    summary: ${j(sp.summary)},
    trick: ${j(sp.trick)},
    code: ${j(sp.code)},
    why: ${j(sp.why)},
    url: ${j(sp.url)},${pid}
  },`;
    })
    .join('\n');
  return `\nexport const SPOTLIGHTS: readonly Spotlight[] = [\n${entries}\n];\n`;
};

/**
 * Emit the body of `PRODUCTS_CONFIG:PRODUCTS_CONST` — typed `PRODUCTS` Record.
 * Each entry is a `Product` from `types.ts` with a `match` function that
 * iterates the product's rules and returns the first matching reason.
 */
export const genProductsConst = (products: readonly WizardProduct[]): string => {
  if (products.length === 0) {
    return '\nexport const PRODUCTS: Readonly<Record<string, Product>> = {};\n';
  }
  const entries = products
    .map((p) => {
      const ruleLits = p.rules
        .map((r) => `  { re: ${regexLiteral(r.source, r.flags ?? '')}, reason: ${j(r.reason)} }`)
        .join(',\n      ');
      // actionType is emitted ONLY for non-claude-code products, so a
      // claude-code product literal is byte-identical to pre-Phase-10.5
      // output (the runtime defaults an absent actionType to 'claude-code').
      const actionTypeLine =
        p.actionType && p.actionType !== 'claude-code'
          ? `\n    actionType: ${j(p.actionType)},`
          : '';
      return `  ${j(p.id)}: {
    id: ${j(p.id)},
    label: ${j(p.label)},
    cssMod: ${j(p.cssMod)},${actionTypeLine}
    match: (text) => {
      const rules: ReadonlyArray<{ re: RegExp; reason: string }> = [
      ${ruleLits}
      ];
      for (const r of rules) {
        if (r.re.test(text)) return r.reason;
      }
      return null;
    },
  },`;
    })
    .join('\n');
  return `\nexport const PRODUCTS: Readonly<Record<string, Product>> = {\n${entries}\n};\n`;
};

/** Emit `PRODUCTS_CONFIG:PROMPTS` — Record<productId, string>. */
export const genPrompts = (products: readonly WizardProduct[]): string => {
  if (products.length === 0) {
    return '\nexport const PROMPTS: Readonly<Record<string, string>> = {};\n';
  }
  const entries = products.map((p) => `  ${j(p.id)}: ${j(p.systemPrompt)},`).join('\n');
  return `\nexport const PROMPTS: Readonly<Record<string, string>> = {\n${entries}\n};\n`;
};

/**
 * Emit `PRODUCTS_CONFIG:RULES` — Record<productId, readonly Rule[]>. Mirrors
 * the match-fn rules from PRODUCTS, but as a separate Record for any caller
 * that wants to inspect or refresh them at runtime.
 */
export const genRules = (products: readonly WizardProduct[]): string => {
  if (products.length === 0) {
    return '\nexport const RULES: Readonly<Record<string, readonly Rule[]>> = {};\n';
  }
  const entries = products
    .map((p) => {
      const ruleLits = p.rules
        .map((r) => `    { re: ${regexLiteral(r.source, r.flags ?? '')}, reason: ${j(r.reason)} }`)
        .join(',\n');
      return `  ${j(p.id)}: [\n${ruleLits}\n  ],`;
    })
    .join('\n');
  return `\nexport const RULES: Readonly<Record<string, readonly Rule[]>> = {\n${entries}\n};\n`;
};

/**
 * Emit `PRODUCTS_CONFIG:CONTEXT_REFRESH` — one entry per product that opted
 * into context refresh. The emitted Record maps productId → ContextRefreshSpec
 * (the runtime shape consumed by initContextRefreshBar in
 * products/context-refresh.ts). Products without `contextRefresh` config get
 * no entry, which means no ↻ button is wired for them.
 *
 * Note: the type alias here intentionally inlines the shape (rather than
 * importing ContextRefreshSpec from products/context-refresh.ts) because
 * the sentinel sits in products/context-refresh.ts itself — making it
 * import-cycle-free keeps the toolchain happy.
 */
export const genContextRefresh = (products: readonly WizardProduct[]): string => {
  const withRefresh = products.filter((p) => p.contextRefresh !== undefined);
  if (withRefresh.length === 0) {
    return '\nexport const CONTEXT_REFRESHERS: Readonly<Record<string, ContextRefreshSpec>> = {};\n';
  }
  const entries = withRefresh
    .map((p) => {
      // Narrowed inside the filter; non-null assertion below is safe.
      const cr = p.contextRefresh as NonNullable<WizardProduct['contextRefresh']>;
      const pathLits = cr.paths.map((path) => `      ${j(path)}`).join(',\n');
      const unitLine = cr.unitLabel ? `\n    unitLabel: ${j(cr.unitLabel)},` : '';
      return `  ${j(p.id)}: {
    owner: ${j(cr.repoOwner)},
    repo: ${j(cr.repoName)},
    paths: [
${pathLits},
    ],${unitLine}
  },`;
    })
    .join('\n');
  return `\nexport const CONTEXT_REFRESHERS: Readonly<Record<string, ContextRefreshSpec>> = {\n${entries}\n};\n`;
};

/**
 * Emit `PRODUCTS_CONFIG:CC_BUILDERS` — Record<productId, CcPromptBuilder>.
 * Uses each product's optional `ccPromptBody`, or a generic default that
 * references every fn parameter (brief / meta / mode) and avoids template
 * literals to dodge generator-side escaping. The product label is JSON-
 * stringified at emit time so it stays safely quoted in the output.
 */
export const genCcBuilders = (products: readonly WizardProduct[]): string => {
  // CC prompt builders are emitted ONLY for claude-code products (the
  // default). summary / task products carry no per-product builder — their
  // action is built generically by the ACTION_TYPES registry at runtime.
  const ccProducts = products.filter((p) => !p.actionType || p.actionType === 'claude-code');
  if (ccProducts.length === 0) {
    return '\nexport const CC_PROMPT_BUILDERS: Readonly<Record<string, CcPromptBuilder>> = {};\n';
  }
  const entries = ccProducts
    .map((p) => {
      // Default body — hands the rich, self-contained prompt assembly to the
      // tested `buildRichCcPrompt` helper (defined above the sentinel in
      // cc-prompts.ts, so it's in scope for the emitted builders). The label
      // is JSON-stringified so it stays safely quoted in the output.
      const body =
        p.ccPromptBody ?? `return buildRichCcPrompt(${j(p.label)}, { brief, meta, mode });`;
      return `  ${j(p.id)}: ({ brief, meta, mode }) => {\n${indent2(body)}\n  },`;
    })
    .join('\n');
  return `\nexport const CC_PROMPT_BUILDERS: Readonly<Record<string, CcPromptBuilder>> = {\n${entries}\n};\n`;
};

/**
 * Emit the body of the `BAKED_BRIEFS` sentinel in `products/brief.ts` — a
 * `productId → stableId → Brief` map of briefs the wizard pre-generated via
 * Haiku at build time (`outputMode: 'static'`). `fetchBrief` consults it as
 * tier 1, above the localStorage cache.
 *
 * Empty / omitted `briefs` emits the exact `{}` declaration the template
 * ships, so an `'artifact'` build's `products/brief.ts` is semantically
 * unchanged. Brief text is embedded with `JSON.stringify` — which escapes
 * every quote / backslash / control char — so an arbitrary Haiku brief cannot
 * break the emitted literal. (Same trust + escaping model as the spotlight /
 * RSS baked-content generators; the bundle is then esbuild-compiled.)
 */
export const genBakedBriefs = (briefs?: WizardConfig['briefs']): string => {
  const decl = 'const BAKED_BRIEFS: Readonly<Record<string, Readonly<Record<string, Brief>>>>';
  if (!briefs || Object.keys(briefs).length === 0) {
    return `\n${decl} = {};\n`;
  }
  return `\n${decl} = ${JSON.stringify(briefs, null, 2)};\n`;
};

/**
 * Emit the body of the `BAKED_TRIAGE` sentinel in `digest/triage.ts` — a
 * `productId → stableId → TriagedItem` map of digest verdicts the wizard
 * pre-computed at build time (`outputMode: 'static'`). `triageItems` consults
 * it first, so the upgrade digest is fully bucketed with no Haiku call.
 *
 * Empty / omitted `triage` emits the exact `{}` declaration the template
 * ships, so an `'artifact'` build's `digest/triage.ts` is semantically
 * unchanged. Same `JSON.stringify` escaping + trust model as `genBakedBriefs`.
 */
export const genBakedTriage = (triage?: WizardConfig['triage']): string => {
  const decl =
    'const BAKED_TRIAGE: Readonly<Record<string, Readonly<Record<string, TriagedItem>>>>';
  if (!triage || Object.keys(triage).length === 0) {
    return `\n${decl} = {};\n`;
  }
  return `\n${decl} = ${JSON.stringify(triage, null, 2)};\n`;
};

/**
 * Emit the body of `LOAD_BODY` — the per-source fetch/render block that
 * goes inside `boot()` in `templates/boot.ts`.
 *
 * For Phase 8 we emit the minimum: spotlight init + per-source fetch +
 * matching renderer. Future enhancement: brief panel + digest panel +
 * upgrade-bar wiring (requires additional imports the wizard would also
 * have to inject).
 */
export const genLoadBody = (
  sources: readonly WizardSource[],
  products: readonly WizardProduct[],
  ghServer: string,
  cadence?: Cadence,
  outputMode?: OutputMode,
): string => {
  const lines: string[] = [];
  // Materialise the configured products as an array. Used by every renderer
  // call below so matchers fire against each item and badges get emitted.
  // When the wizard has zero products, this is `[]` and renderers behave
  // exactly as the no-flagging case.
  lines.push('const productsArr = Object.values(PRODUCTS);');
  lines.push('');
  // Every init is wrapped in try/catch + console.error so a runtime error in
  // one piece (e.g. a malformed product regex, a missing DOM element) doesn't
  // cascade and block live data fetches below. Errors surface in DevTools
  // console with a clear prefix so the user can diagnose.
  lines.push('// Spotlight carousel — pure DOM wiring; safe to call before live data fetches.');
  lines.push('try {');
  // cadence is emitted only for non-daily dashboards, so a daily build's
  // LOAD_BODY stays byte-identical to pre-cadence output.
  const cadenceOpt = cadence && cadence !== 'daily' ? `, cadence: ${j(cadence)}` : '';
  lines.push(
    `  initSpotlight(deps, { spotlights: SPOTLIGHTS, topicSlug: TOPIC_SLUG, products: productsArr${cadenceOpt} });`,
  );
  lines.push('} catch (err) { console.error("Foresights: initSpotlight failed", err); }');
  // Static-mode refresh handoff. A standalone HTML dashboard has no Cowork
  // runtime, so it can't re-fetch or re-curate itself — `/refresh-dashboard`
  // is a skill that runs inside Claude. This button copies that instruction
  // to the clipboard for the user to paste. Emitted only for static builds;
  // an artifact build's LOAD_BODY stays byte-identical and the unused
  // `initRefreshButton` import tree-shakes away.
  if (outputMode === 'static') {
    lines.push('');
    lines.push('try {');
    lines.push('  initRefreshButton(deps, { topic: TOPIC });');
    lines.push('} catch (err) { console.error("Foresights: initRefreshButton failed", err); }');
  }
  // Mount the brief panel + digest panel only when products are configured —
  // they listen for clicks on `.insights-tag` badges and on `#digest-btn-*`
  // buttons, neither of which exist in a no-products dashboard.
  if (products.length > 0) {
    lines.push('');
    lines.push('try {');
    lines.push('  initBriefPanel(deps, {');
    lines.push('    products: productsArr,');
    lines.push('    prompts: PROMPTS,');
    lines.push('    ccBuilders: CC_PROMPT_BUILDERS,');
    lines.push('    topicSlug: TOPIC_SLUG,');
    lines.push('    fingerprintByProduct: (id) => effectiveFingerprint(deps, TOPIC_SLUG, id),');
    lines.push('  });');
    lines.push('} catch (err) { console.error("Foresights: initBriefPanel failed", err); }');
    lines.push('try {');
    lines.push('  initBriefAllBar(deps, {');
    lines.push('    products: productsArr,');
    lines.push('    prompts: PROMPTS,');
    lines.push('    ccBuilders: CC_PROMPT_BUILDERS,');
    lines.push('    topicSlug: TOPIC_SLUG,');
    lines.push('    fingerprintByProduct: (id) => effectiveFingerprint(deps, TOPIC_SLUG, id),');
    lines.push('  });');
    lines.push('} catch (err) { console.error("Foresights: initBriefAllBar failed", err); }');
    lines.push('try {');
    lines.push('  const digestPanelHandle = initDigestPanel(deps);');
    lines.push('  initDigestBar(deps, {');
    lines.push('    products: productsArr,');
    lines.push('    prompts: PROMPTS,');
    lines.push('    ccBuilders: CC_PROMPT_BUILDERS,');
    lines.push('    topicSlug: TOPIC_SLUG,');
    lines.push('    fingerprintByProduct: (id) => effectiveFingerprint(deps, TOPIC_SLUG, id),');
    lines.push('    panel: digestPanelHandle,');
    lines.push('  });');
    lines.push('} catch (err) { console.error("Foresights: initDigestPanel/Bar failed", err); }');
    lines.push('try {');
    lines.push('  initContextRefreshBar(deps, {');
    lines.push('    products: productsArr,');
    lines.push('    refreshers: CONTEXT_REFRESHERS,');
    lines.push('    topicSlug: TOPIC_SLUG,');
    lines.push(`    ghServer: ${j(ghServer)},`);
    lines.push('  });');
    lines.push('} catch (err) { console.error("Foresights: initContextRefreshBar failed", err); }');
  }
  lines.push('');
  if (sources.length === 0) {
    lines.push('await Promise.resolve();');
    return `\n${lines.join('\n')}\n`;
  }
  // Per-source dispatch: each source becomes either a GitHub MCP fetch +
  // matching renderer, or (for kind: 'rss') a direct browser fetch + parse +
  // RSS renderer. Errors are caught + rendered as an error card; one bad
  // source doesn't kill the whole dashboard. productsArr is passed to each
  // renderer so flagsForText can attach the right badges per item.
  for (const s of sources) {
    const section = s.section ?? s.kind.replace('_', '-');
    if (s.kind === 'rss') {
      // RSS items are fetched + parsed at wizard time and baked in here as a
      // literal. The artifact sandbox blocks cross-origin window.fetch, so a
      // live fetch from the dashboard never succeeds — baking is how RSS
      // content reaches a built artifact. /refresh-dashboard re-bakes it.
      // title/description are tag-stripped so the baked literal stays plain
      // text and carries no markup into the bundle's <script> host.
      const bakedItems = (s.items ?? []).map((it) => ({
        title: stripTags(it.title),
        link: it.link,
        description: stripTags(it.description).slice(0, 500),
        pubDate: it.pubDate,
        author: it.author,
        guid: it.guid,
      }));
      lines.push('try {');
      lines.push(`  renderRssItems(deps, ${j(bakedItems)}, ${j(section)}, productsArr);`);
      lines.push('} catch (err) {');
      lines.push(`  renderError(deps, ${j(section)}, err);`);
      lines.push('}');
      continue;
    }
    const renderFn =
      s.kind === 'releases' ? 'renderReleases' : s.kind === 'issues' ? 'renderRfcs' : 'renderPrs';
    const typeCast =
      s.kind === 'releases'
        ? 'readonly Release[]'
        : s.kind === 'issues'
          ? 'readonly Issue[]'
          : 'readonly PullRequest[]';
    const toolName = `${ghServer}__list_${s.kind}`;
    const argFields: string[] = [`owner: ${j(s.owner ?? '')}`, `repo: ${j(s.repo ?? '')}`];
    if (s.perPage !== undefined) argFields.push(`perPage: ${s.perPage}`);
    if (s.state) argFields.push(`state: ${j(s.state)}`);
    if (s.orderBy) argFields.push(`orderBy: ${j(s.orderBy)}`);
    if (s.direction) argFields.push(`direction: ${j(s.direction)}`);
    if (s.sort) argFields.push(`sort: ${j(s.sort)}`);
    const args = `{ ${argFields.join(', ')} }`;
    if (outputMode === 'static') {
      // Static mode is progressive (Phase 2): attempt a live fetch first, and
      // render the build-time baked snapshot if it fails. When the dashboard
      // runs with no Cowork runtime, `callTool` is a reject-stub, so the catch
      // falls straight to the baked snapshot; opened as an artifact (runtime
      // present) the live fetch wins. A live-fetch failure also falls back to
      // baked. `s.baked` is the agent-fetched array; `/refresh-dashboard`
      // re-bakes it. The `as unknown as` on the baked literal mirrors the
      // live path's `raw as` (raw is `unknown`, the baked literal is not).
      lines.push('try {');
      lines.push(`  const raw = await callTool(deps, ${j(toolName)}, ${args});`);
      lines.push(`  ${renderFn}(deps, raw as ${typeCast}, ${j(section)}, productsArr);`);
      lines.push('} catch {');
      lines.push('  try {');
      lines.push(
        `    ${renderFn}(deps, ${j(s.baked ?? [])} as unknown as ${typeCast}, ${j(section)}, productsArr);`,
      );
      lines.push('  } catch (bakedErr) {');
      lines.push(`    renderError(deps, ${j(section)}, bakedErr);`);
      lines.push('  }');
      lines.push('}');
      continue;
    }
    lines.push('try {');
    lines.push(`  const raw = await callTool(deps, ${j(toolName)}, ${args});`);
    lines.push(`  ${renderFn}(deps, raw as ${typeCast}, ${j(section)}, productsArr);`);
    lines.push('} catch (err) {');
    lines.push(`  renderError(deps, ${j(section)}, err);`);
    lines.push('}');
  }
  return `\n${lines.join('\n')}\n`;
};

// ---------------------------------------------------------------------------
// HTML / CSS generators
// ---------------------------------------------------------------------------

/** Distinct sections in source-declaration order (with no-section sources merged into their kind). */
const distinctSections = (sources: readonly WizardSource[]): readonly string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sources) {
    const sec = s.section ?? s.kind.replace('_', '-');
    if (!seen.has(sec)) {
      seen.add(sec);
      out.push(sec);
    }
  }
  return out;
};

const titleCase = (s: string): string =>
  s
    .split(/[-_]/)
    .map((p) => (p.length > 0 ? p[0]?.toUpperCase() + p.slice(1) : p))
    .join(' ');

/** Emit `SECTION_NAV` — anchor buttons jumping to each section. */
export const genSectionNav = (sources: readonly WizardSource[]): string => {
  const sections = distinctSections(sources);
  if (sections.length === 0) return '\n';
  const buttons = sections
    .map((id) => `    <a href="#${id}" class="nav-btn">${titleCase(id)}</a>`)
    .join('\n');
  return `\n${buttons}\n`;
};

/** Emit `SECTION_MARKUP:ABOVE_HIGHLIGHTS` — one `<section>` per source above the highlights. */
export const genSectionMarkupAboveHighlights = (sources: readonly WizardSource[]): string => {
  const sections = distinctSections(sources);
  if (sections.length === 0) return '\n';
  const blocks = sections.map(
    (id) => `  <section id="${id}" class="data-section">
    <div class="section-header">
      <h2>${titleCase(id)}</h2>
    </div>
    <div class="section-body skeleton" id="${id}-body">
      <div class="card skeleton-card">Loading…</div>
    </div>
  </section>`,
  );
  return `\n${blocks.join('\n')}\n`;
};

/** Emit `SECTION_MARKUP:BELOW_HIGHLIGHTS` — empty by default (sections live above). */
export const genSectionMarkupBelowHighlights = (_sources: readonly WizardSource[]): string => '\n';

/**
 * HTML-escape `s`, but allow bare `<code>...</code>` tags through. Used by the
 * curated-content generators on fields the wizard's Haiku batch may emit with
 * inline code spans (e.g. card titles, body paragraphs). Anything other than a
 * tagless `<code>`/`</code>` pair stays escaped — `<code class="x">` would not
 * pass, neither would `<script>`.
 */
const escAllowCode = (s: string): string =>
  escHtml(s)
    .replace(/&lt;code&gt;/g, '<code>')
    .replace(/&lt;\/code&gt;/g, '</code>');

/**
 * Pick a sensible CTA label for the "more" anchor on a card. Defaults to
 * `"GitHub"` for github.com URLs and the bare hostname for everything else.
 * Falls back to `"Link"` if the URL fails to parse.
 */
const defaultCta = (url: string): string => {
  try {
    const host = new URL(url).hostname;
    if (host === 'github.com' || host.endsWith('.github.com')) return 'GitHub';
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return 'Link';
  }
};

/** Emit one `<div class="hl-card">` for a highlight or pattern card. */
const hlCardHtml = (c: WizardHighlightCard | WizardPatternCard): string => {
  const cta = c.cta ?? defaultCta(c.url);
  return `      <div class="hl-card">
        <span class="tag">${escHtml(c.tag)}</span>
        <h3>${escAllowCode(c.title)}</h3>
        <p>${escAllowCode(c.body)}</p>
        <a class="more" href="${safeHref(c.url)}" target="_blank" rel="noopener">${escHtml(cta)} →</a>
      </div>`;
};

/**
 * Emit `HIGHLIGHTS_MARKUP` — the 6 curated highlight cards baked at wizard time.
 * Empty array → a single "get started" placeholder so the section still renders.
 */
export const genHighlightsMarkup = (config: WizardConfig): string => {
  if (config.highlights.length === 0) {
    return `\n      <div class="hl-card"><span class="tag">Get started</span><h3>Add your highlights</h3><p>Re-run the wizard with the latest live data to seed highlight cards.</p></div>\n`;
  }
  return `\n${config.highlights.map(hlCardHtml).join('\n')}\n    `;
};

/**
 * Emit `PATTERNS_MARKUP` — the 6 curated community / pattern cards. Same shape
 * as highlights.
 */
export const genPatternsMarkup = (config: WizardConfig): string => {
  if (config.patterns.length === 0) {
    return `\n      <div class="hl-card"><span class="tag">Patterns</span><h3>Add your patterns</h3><p>Re-run the wizard to seed pattern cards.</p></div>\n`;
  }
  return `\n${config.patterns.map(hlCardHtml).join('\n')}\n    `;
};

/**
 * Emit `TIPS_MARKUP` — the 8 advanced-tip cards. Each card may include an
 * optional `<span class="why">` suffix in the title and an optional
 * `<pre class="code-block">` body.
 */
export const genTipsMarkup = (config: WizardConfig): string => {
  if (config.tips.length === 0) {
    return `\n    <div class="tip"><h3>Add your tips</h3><p>Re-run the wizard to seed tips.</p></div>\n`;
  }
  const cards = config.tips.map((t) => {
    const why = t.why ? ` <span class="why">— ${escAllowCode(t.why)}</span>` : '';
    const code = t.code ? `\n      <pre class="code-block">${t.code}</pre>` : '';
    return `    <div class="tip">
      <h3>${escAllowCode(t.title)}${why}</h3>
      <p>${escAllowCode(t.body)}</p>${code}
    </div>`;
  });
  return `\n${cards.join('\n')}\n    `;
};

/**
 * Emit `RESOURCES_MARKUP` — the "where to keep watching" anchor grid. One
 * `<a class="res">` per `WizardResourceLink`.
 */
export const genResourcesMarkup = (config: WizardConfig): string => {
  if (config.resources.length === 0) {
    return `\n      <a class="res" href="#" onclick="return false"><div class="res-name">Add resources</div><div class="res-desc">Re-run the wizard to seed this section.</div></a>\n`;
  }
  const cards = config.resources.map(
    (r) =>
      `      <a class="res" href="${safeHref(r.url)}" target="_blank" rel="noopener"><div class="res-name">${escHtml(r.name)}</div><div class="res-desc">${escHtml(r.desc)}</div></a>`,
  );
  return `\n${cards.join('\n')}\n    `;
};

/** Emit `PRODUCT_CSS` — `.insights-tag.<cssMod>` styling per product. */
export const genProductCss = (products: readonly WizardProduct[]): string => {
  if (products.length === 0) return '\n';
  const blocks = products
    .filter((p) => p.cssMod.length > 0)
    .map(
      (p) => `  .insights-tag.${p.cssMod} {
    background: ${p.badgeColorSoft};
    color: ${p.badgeColor};
    border-color: ${p.badgeBorderColor};
  }
  .insights-tag.${p.cssMod}.expandable:hover { background: ${p.badgeColorSoft}; border-color: ${p.badgeColor}; }`,
    );
  return `\n${blocks.join('\n')}\n`;
};

/** Emit `PRODUCT_UI_BARS` — the brief-all bar + digest bar + context-refresh bar. */
export const genProductUiBars = (products: readonly WizardProduct[]): string => {
  if (products.length === 0) return '\n';
  // Bars and per-product buttons are visible by default when products are
  // configured. The v0.1 reference used an `updateBriefAllButton()` polling
  // loop to hide bars when nothing was flagged yet; v0.3 simplifies — bars
  // stay visible since the user explicitly opted into these products at
  // wizard time. The digest-panel keeps its `hidden` class because that's
  // an overlay panel that initDigestPanel toggles on/off itself.
  const briefBtns = products
    .map(
      (p) =>
        `    <button id="brief-all-btn-${p.id}" class="brief-all-btn brief-all-btn-${p.cssMod || p.id}" type="button" data-product-id="${p.id}">${p.label}</button>`,
    )
    .join('\n');
  const digestBtns = products
    .map(
      (p) =>
        `    <button id="digest-btn-${p.id}" class="digest-btn" type="button" data-product-id="${p.id}">${p.label} digest</button>`,
    )
    .join('\n');
  // Context-refresh bars — one PER product that opted in (mirrors v0.1's
  // per-product `<div class="context-bar">` shape). Each bar:
  //   <span class="context-label">${label} context:</span>
  //   <span class="context-status" id="context-status-${id}">…</span>
  //   <button class="context-btn" id="context-refresh-btn-${id}">↻ Refresh from repo</button>
  // The status text starts as "…" so the initial render in
  // initContextRefreshBar's refreshStatus() can swap to either
  // "Not refreshed yet" (no stored context) or "refreshed Xd ago · N units"
  // (rehydrated from localStorage).
  const contextBars = products
    .filter((p) => p.contextRefresh !== undefined)
    .map(
      (p) =>
        `  <div id="context-bar-${p.id}" class="context-bar">
    <span class="context-label">${p.label} context:</span>
    <span class="context-status" id="context-status-${p.id}">…</span>
    <button class="context-btn" id="context-refresh-btn-${p.id}" type="button" data-product-id="${p.id}">↻ Refresh from repo</button>
  </div>`,
    )
    .join('\n');
  const contextBar = contextBars.length > 0 ? `\n${contextBars}` : '';
  return `
  <div id="brief-all-bar" class="brief-all-bar">
    <span class="brief-all-label">Brief all flagged:</span>
${briefBtns}
  </div>
  <div id="digest-bar" class="digest-bar">
    <span class="digest-bar-label">Generate upgrade digest:</span>
${digestBtns}
  </div>${contextBar}
  <div id="digest-panel" class="digest-panel hidden">
    <div class="digest-panel-header">
      <div class="digest-panel-title" id="digest-panel-title">Upgrade digest</div>
      <div class="digest-panel-controls">
        <button id="digest-copy-btn" type="button">Copy markdown</button>
        <button id="digest-download-btn" type="button">Download .md</button>
        <button id="digest-close-btn" type="button">Close</button>
      </div>
    </div>
    <div class="digest-panel-body" id="digest-panel-body"></div>
  </div>
`;
};

// ---------------------------------------------------------------------------
// Config-embed generator
// ---------------------------------------------------------------------------

/**
 * Serialise the full `WizardConfig` for the artifact's
 * `<script type="application/json" id="foresights-config">` block.
 *
 * `/refresh-dashboard` reads this block to recover the exact inputs that
 * built the dashboard — topic, sources, products, branding — so a refresh
 * is lossless rather than scraped from rendered HTML. The whole config is
 * embedded (not a hand-picked subset) so the snapshot stays faithful and
 * the generator never drifts from the `WizardConfig` interface.
 *
 * `<` is escaped to its `\\u003c` JSON unicode escape so the payload
 * cannot break out of the surrounding `<script>` element — a value
 * containing `</script>` would otherwise close the tag early. The result
 * stays valid JSON: `\\u003c` decodes back to `<` under `JSON.parse`.
 */
export const genForesightsConfigJson = (config: WizardConfig): string =>
  JSON.stringify(config).replace(/</g, '\\u003c');

// ---------------------------------------------------------------------------
// Composite maps
// ---------------------------------------------------------------------------

/**
 * Explicit-keys interface for the sentinel map. Named (rather than
 * Record<string,string>) so callers can `.SOURCES_CONST` access without
 * tripping noPropertyAccessFromIndexSignature, while still being
 * assignable to `Readonly<Record<string, string>>` for `substitute.ts`'s
 * generic parameter.
 */
export interface SentinelMap {
  readonly SOURCES_CONST: string;
  readonly SPOTLIGHTS_CONST: string;
  readonly LOAD_BODY: string;
  readonly 'PRODUCTS_CONFIG:PRODUCTS_CONST': string;
  readonly 'PRODUCTS_CONFIG:PROMPTS': string;
  readonly 'PRODUCTS_CONFIG:RULES': string;
  readonly 'PRODUCTS_CONFIG:CONTEXT_REFRESH': string;
  readonly 'PRODUCTS_CONFIG:CC_BUILDERS': string;
  readonly BAKED_BRIEFS: string;
  readonly BAKED_TRIAGE: string;
  readonly SECTION_NAV: string;
  readonly 'SECTION_MARKUP:ABOVE_HIGHLIGHTS': string;
  readonly 'SECTION_MARKUP:BELOW_HIGHLIGHTS': string;
  readonly HIGHLIGHTS_MARKUP: string;
  readonly PATTERNS_MARKUP: string;
  readonly TIPS_MARKUP: string;
  readonly RESOURCES_MARKUP: string;
  readonly PRODUCT_UI_BARS: string;
  readonly PRODUCT_CSS: string;
}

/**
 * Explicit-keys interface for the placeholder map. Same rationale as
 * `SentinelMap`.
 */
export interface PlaceholderMap {
  readonly TOPIC: string;
  readonly TOPIC_SLUG: string;
  readonly TAGLINE_SUFFIX: string;
  readonly TAGLINE_SUB: string;
  readonly ACCENT: string;
  readonly ACCENT_SOFT: string;
  readonly FOOTER_NOTE: string;
  readonly ARTIFACT_NAME: string;
  readonly ARTIFACT_DESCRIPTION: string;
  readonly GH_SERVER: string;
  readonly HEADER_SOURCES_LINKS: string;
  readonly COMPILED_JS: string;
  readonly FORESIGHTS_CONFIG_JSON: string;
}

/** Build the full sentinel-content map from a wizard config. */
export const deriveSentinelMap = (config: WizardConfig): SentinelMap => ({
  // TS sentinels
  SOURCES_CONST: genSourcesConst(config.sources),
  SPOTLIGHTS_CONST: genSpotlightsConst(config.spotlights),
  LOAD_BODY: genLoadBody(
    config.sources,
    config.products,
    config.ghServer,
    config.cadence,
    config.outputMode,
  ),
  'PRODUCTS_CONFIG:PRODUCTS_CONST': genProductsConst(config.products),
  'PRODUCTS_CONFIG:PROMPTS': genPrompts(config.products),
  'PRODUCTS_CONFIG:RULES': genRules(config.products),
  'PRODUCTS_CONFIG:CONTEXT_REFRESH': genContextRefresh(config.products),
  'PRODUCTS_CONFIG:CC_BUILDERS': genCcBuilders(config.products),
  BAKED_BRIEFS: genBakedBriefs(config.briefs),
  BAKED_TRIAGE: genBakedTriage(config.triage),

  // HTML sentinels
  SECTION_NAV: genSectionNav(config.sources),
  'SECTION_MARKUP:ABOVE_HIGHLIGHTS': genSectionMarkupAboveHighlights(config.sources),
  'SECTION_MARKUP:BELOW_HIGHLIGHTS': genSectionMarkupBelowHighlights(config.sources),
  HIGHLIGHTS_MARKUP: genHighlightsMarkup(config),
  PATTERNS_MARKUP: genPatternsMarkup(config),
  TIPS_MARKUP: genTipsMarkup(config),
  RESOURCES_MARKUP: genResourcesMarkup(config),
  PRODUCT_UI_BARS: genProductUiBars(config.products),

  // CSS sentinels
  PRODUCT_CSS: genProductCss(config.products),
});

/** Build the full placeholder-value map from a wizard config. */
export const derivePlaceholderMap = (config: WizardConfig, compiledJs: string): PlaceholderMap => ({
  TOPIC: config.topic,
  TOPIC_SLUG: config.topicSlug,
  TAGLINE_SUFFIX: config.taglineSuffix,
  TAGLINE_SUB: config.taglineSub,
  ACCENT: config.accent,
  ACCENT_SOFT: config.accentSoft,
  FOOTER_NOTE: config.footerNote,
  ARTIFACT_NAME: config.artifactName,
  ARTIFACT_DESCRIPTION: config.artifactDescription,
  GH_SERVER: config.ghServer,
  HEADER_SOURCES_LINKS: config.headerSourcesLinks,
  COMPILED_JS: compiledJs,
  FORESIGHTS_CONFIG_JSON: genForesightsConfigJson(config),
});

// ---------------------------------------------------------------------------
// Flag manifest — the first pass of the two-pass static-mode wizard flow.
//
// `build.ts --emit-flags` writes this manifest; the `/create-dashboard` /
// `/refresh-dashboard` agent then generates one Haiku brief per entry and
// feeds them back as `WizardConfig.briefs` for the real build (see SKILL.md).
// ---------------------------------------------------------------------------

/** One flagged (product × item) pair — a brief the wizard must pre-generate. */
export interface FlagManifestEntry {
  /** The product whose matcher fired. */
  readonly productId: string;
  /** Stable id of the flagged item — the `BAKED_BRIEFS` lookup key. */
  readonly stableId: string;
  /** Item kind — `pr` / `rfc` / `rss` / `release-<bucket>`. */
  readonly kind: string;
  /** The text the matcher ran against — the brief's ITEM body. */
  readonly text: string;
  /** Item title. */
  readonly title: string;
  /** Canonical URL — best effort; empty string acceptable. */
  readonly url: string;
}

/**
 * Compile a `WizardProduct` into a runtime `Product`. The `match` function is
 * byte-for-byte equivalent to the one `genProductsConst` emits into the
 * dashboard — rules scanned in declaration order, `new RegExp(source, flags)`,
 * first match wins — so the manifest flags exactly what the live dashboard
 * flags.
 */
const compileProduct = (p: WizardProduct): Product => ({
  id: p.id,
  label: p.label,
  cssMod: p.cssMod,
  match: (text: string): string | null => {
    for (const r of p.rules) {
      if (new RegExp(r.source, r.flags ?? '').test(text)) return r.reason;
    }
    return null;
  },
});

/**
 * Enumerate every flagged (product × item) pair from a config's baked data.
 *
 * Pure + deterministic — it runs the shared `render/flag-units` enumerators
 * and `products/matcher` over `source.baked` (GitHub) / `source.items` (RSS),
 * so the manifest's stableIds are identical to the renderers' and to the
 * `BAKED_BRIEFS` keys `fetchBrief` looks up. No staging / substitution is
 * needed — the matcher derives purely from `config.products[].rules`, the same
 * input `genProductsConst` compiles. Entries are ordered source → item →
 * product. Empty when the config has no products.
 */
export const deriveFlagManifest = (config: WizardConfig): readonly FlagManifestEntry[] => {
  const products = config.products.map(compileProduct);
  if (products.length === 0) return [];
  const entries: FlagManifestEntry[] = [];
  const pushFlags = (unit: FlagUnit<unknown>, kind: string): void => {
    const flags = flagsForText(
      unit.matchText,
      { section: '', stableId: unit.stableId, title: unit.title, url: unit.url },
      products,
    );
    for (const f of flags) {
      entries.push({
        productId: f.productId,
        stableId: unit.stableId,
        kind,
        text: unit.matchText,
        title: unit.title,
        url: unit.url,
      });
    }
  };
  for (const s of config.sources) {
    if (s.kind === 'rss') {
      for (const u of rssUnits(s.items ?? [])) pushFlags(u, 'rss');
    } else if (s.kind === 'releases') {
      for (const u of releaseUnits((s.baked ?? []) as readonly Release[])) {
        pushFlags(u, `release-${u.source.bucket}`);
      }
    } else if (s.kind === 'issues') {
      for (const u of issueUnits((s.baked ?? []) as readonly Issue[])) pushFlags(u, 'rfc');
    } else {
      for (const u of prUnits((s.baked ?? []) as readonly PullRequest[])) pushFlags(u, 'pr');
    }
  }
  return entries;
};
