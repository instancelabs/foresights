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

/** One data source the wizard wants the dashboard to fetch. */
export interface WizardSource {
  /** Short slug for chip rendering + IDs. */
  readonly id: string;
  /** User-facing label, e.g. `"aws/aws-cdk"`. */
  readonly label: string;
  readonly owner: string;
  readonly repo: string;
  readonly kind: 'releases' | 'issues' | 'pull_requests';
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
   * Optional Claude Code prompt builder body. Receives `({ brief, meta, mode })`.
   * Emit just the function body (everything between `=> {` and `}`).
   * Default: a generic builder that interpolates brief.why + meta.title + mode.
   */
  readonly ccPromptBody?: string;
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
  readonly products: readonly WizardProduct[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** JSON.stringify with a fixed 2-space indent — used everywhere for diff stability. */
const j = (v: unknown): string => JSON.stringify(v);

/** Stringify a JS RegExp literal. Empty flags → no trailing flag chars. */
const regexLiteral = (source: string, flags = ''): string =>
  `new RegExp(${j(source)}${flags ? `, ${j(flags)}` : ''})`;

/**
 * Escape a string so it's safe to inject as literal text inside a JS
 * backtick template literal at emit time. Handles backslashes, the
 * literal backtick, and `${` (which would otherwise start a substitution).
 */
const escForBacktick = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

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
    return `  {
    id: ${j(s.id)},
    label: ${j(s.label)},
    owner: ${j(s.owner)},
    repo: ${j(s.repo)},
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
    .map(
      (sp) => `  {
    tag: ${j(sp.tag)},
    title: ${j(sp.title)},
    summary: ${j(sp.summary)},
    trick: ${j(sp.trick)},
    code: ${j(sp.code)},
    why: ${j(sp.why)},
    url: ${j(sp.url)},
  },`,
    )
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
      return `  ${j(p.id)}: {
    id: ${j(p.id)},
    label: ${j(p.label)},
    cssMod: ${j(p.cssMod)},
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
 * Emit `PRODUCTS_CONFIG:CONTEXT_REFRESH` — empty by default. Per-product
 * context refreshers ship in v0.3.
 */
export const genContextRefresh = (_products: readonly WizardProduct[]): string =>
  '\nexport const CONTEXT_REFRESHERS: Readonly<Record<string, ContextRefresher>> = {};\n';

/**
 * Emit `PRODUCTS_CONFIG:CC_BUILDERS` — Record<productId, CcPromptBuilder>.
 * Uses each product's optional `ccPromptBody`, or a generic default that
 * references every fn parameter (brief / meta / mode) and avoids template
 * literals to dodge generator-side escaping. The product label is JSON-
 * stringified at emit time so it stays safely quoted in the output.
 */
export const genCcBuilders = (products: readonly WizardProduct[]): string => {
  if (products.length === 0) {
    return '\nexport const CC_PROMPT_BUILDERS: Readonly<Record<string, CcPromptBuilder>> = {};\n';
  }
  const entries = products
    .map((p) => {
      const safeLabel = escForBacktick(p.label);
      // Default body — emits a backtick template literal so biome's
      // useTemplate rule doesn't trigger after substitution. The \${...}
      // sequences are escaped in the generator's own template literal so
      // they stay LITERAL in the emitted source (and interpolate at
      // runtime inside the EMITTED backtick).
      const body =
        p.ccPromptBody ??
        `const title = meta.title ?? meta.stableId;\nreturn \`# ${safeLabel}: \${title}\\n\\n\${brief.why}\\n\\nMode: \${mode}. ${safeLabel} repo guidance follows.\`;`;
      return `  ${j(p.id)}: ({ brief, meta, mode }) => {\n${indent2(body)}\n  },`;
    })
    .join('\n');
  return `\nexport const CC_PROMPT_BUILDERS: Readonly<Record<string, CcPromptBuilder>> = {\n${entries}\n};\n`;
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
  _products: readonly WizardProduct[],
  ghServer: string,
): string => {
  const lines: string[] = [];
  lines.push('// Spotlight carousel — pure DOM wiring; safe to call before live data fetches.');
  lines.push(
    'initSpotlight(deps, { spotlights: SPOTLIGHTS, topicSlug: TOPIC_SLUG, products: [] });',
  );
  lines.push('');
  if (sources.length === 0) {
    lines.push('await Promise.resolve();');
    return `\n${lines.join('\n')}\n`;
  }
  // Per-source dispatch: each source becomes one `await callTool(...)` +
  // `render*(...)` pair. Errors are caught + rendered as an error card.
  for (const s of sources) {
    const section = s.section ?? s.kind.replace('_', '-');
    const toolName = `${ghServer}__list_${s.kind}`;
    const argFields: string[] = [`owner: ${j(s.owner)}`, `repo: ${j(s.repo)}`];
    if (s.perPage !== undefined) argFields.push(`perPage: ${s.perPage}`);
    if (s.state) argFields.push(`state: ${j(s.state)}`);
    if (s.orderBy) argFields.push(`orderBy: ${j(s.orderBy)}`);
    if (s.direction) argFields.push(`direction: ${j(s.direction)}`);
    if (s.sort) argFields.push(`sort: ${j(s.sort)}`);
    const args = `{ ${argFields.join(', ')} }`;
    const renderFn =
      s.kind === 'releases' ? 'renderReleases' : s.kind === 'issues' ? 'renderRfcs' : 'renderPrs';
    const typeCast =
      s.kind === 'releases'
        ? 'readonly Release[]'
        : s.kind === 'issues'
          ? 'readonly Issue[]'
          : 'readonly PullRequest[]';
    lines.push('try {');
    lines.push(`  const raw = await callTool(deps, ${j(toolName)}, ${args});`);
    lines.push(`  ${renderFn}(deps, raw as ${typeCast}, ${j(section)}, []);`);
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

/** Emit `HIGHLIGHTS_MARKUP` — skeleton highlight cards the wizard can refresh. */
export const genHighlightsMarkup = (_config: WizardConfig): string =>
  `\n      <div class="hl-card"><span class="tag">Get started</span><h3>Add your highlights</h3><p>Use the <strong>↻ Refresh content</strong> button to generate highlight cards from the latest data.</p></div>\n`;

/** Emit `PATTERNS_MARKUP` — skeleton pattern cards. */
export const genPatternsMarkup = (_config: WizardConfig): string =>
  `\n      <div class="hl-card"><span class="tag">Patterns</span><h3>Add your patterns</h3><p>Refresh content to seed pattern cards.</p></div>\n`;

/** Emit `TIPS_MARKUP` — skeleton tip cards. */
export const genTipsMarkup = (_config: WizardConfig): string =>
  `\n    <ul class="tips-list"><li>Refresh content to seed tips.</li></ul>\n`;

/** Emit `RESOURCES_MARKUP` — links derived from the user's `headerSourcesLinks` HTML. */
export const genResourcesMarkup = (config: WizardConfig): string =>
  `\n      <ul class="resources-list">${config.headerSourcesLinks ? `<li>${config.headerSourcesLinks}</li>` : '<li>Add canonical sources via Refresh content.</li>'}</ul>\n`;

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

/** Emit `PRODUCT_UI_BARS` — the brief-all bar + per-product digest button bar. */
export const genProductUiBars = (products: readonly WizardProduct[]): string => {
  if (products.length === 0) return '\n';
  const briefBtns = products
    .map(
      (p) =>
        `    <button id="brief-all-btn-${p.id}" class="brief-all-btn brief-all-btn-${p.cssMod || p.id} hidden" type="button" data-product-id="${p.id}">${p.label}</button>`,
    )
    .join('\n');
  const digestBtns = products
    .map(
      (p) =>
        `    <button id="digest-btn-${p.id}" class="digest-btn hidden" type="button" data-product-id="${p.id}">${p.label} digest</button>`,
    )
    .join('\n');
  return `
  <div id="brief-all-bar" class="brief-all-bar hidden">
    <span class="brief-all-label">Brief all flagged:</span>
${briefBtns}
  </div>
  <div id="digest-bar" class="digest-bar hidden">
    <span class="digest-bar-label">Generate upgrade digest:</span>
${digestBtns}
  </div>
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
}

/** Build the full sentinel-content map from a wizard config. */
export const deriveSentinelMap = (config: WizardConfig): SentinelMap => ({
  // TS sentinels
  SOURCES_CONST: genSourcesConst(config.sources),
  SPOTLIGHTS_CONST: genSpotlightsConst(config.spotlights),
  LOAD_BODY: genLoadBody(config.sources, config.products, config.ghServer),
  'PRODUCTS_CONFIG:PRODUCTS_CONST': genProductsConst(config.products),
  'PRODUCTS_CONFIG:PROMPTS': genPrompts(config.products),
  'PRODUCTS_CONFIG:RULES': genRules(config.products),
  'PRODUCTS_CONFIG:CONTEXT_REFRESH': genContextRefresh(config.products),
  'PRODUCTS_CONFIG:CC_BUILDERS': genCcBuilders(config.products),

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
});
