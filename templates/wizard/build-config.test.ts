import { describe, expect, it } from 'vitest';
import {
  type WizardConfig,
  type WizardProduct,
  type WizardSource,
  derivePlaceholderMap,
  deriveSentinelMap,
  genCcBuilders,
  genLoadBody,
  genProductCss,
  genProductUiBars,
  genProductsConst,
  genPrompts,
  genResourcesMarkup,
  genRules,
  genSectionMarkupAboveHighlights,
  genSectionNav,
  genSourcesConst,
  genSpotlightsConst,
} from './build-config';

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

const product = (overrides: Partial<WizardProduct> = {}): WizardProduct => ({
  id: 'cdki',
  label: 'CDK Insights',
  cssMod: 'cdki',
  badgeColor: '#0a6f7d',
  badgeColorSoft: '#e6f6f8',
  badgeBorderColor: '#88cdd6',
  systemPrompt: 'You analyse CDK news for CDK Insights.',
  rules: [{ source: 'cdk', flags: 'i', reason: 'mentions CDK' }],
  ...overrides,
});

const config = (overrides: Partial<WizardConfig> = {}): WizardConfig => ({
  topic: 'AWS CDK',
  topicSlug: 'aws-cdk',
  taglineSuffix: "what's new & worth knowing",
  taglineSub: 'Spotlights, releases, and patterns.',
  accent: '#ff6a14',
  accentSoft: '#fff3eb',
  footerNote: 'Updated daily from upstream.',
  artifactName: 'AWS CDK news',
  artifactDescription: 'Live AWS CDK news dashboard.',
  ghServer: 'mcp__github',
  headerSourcesLinks: '<a href="https://github.com/aws/aws-cdk">aws-cdk</a>',
  sources: [source()],
  spotlights: [],
  products: [],
  ...overrides,
});

describe('genSourcesConst', () => {
  it('emits an empty SOURCES array when no sources are configured', () => {
    expect(genSourcesConst([])).toContain('export const SOURCES: readonly Source[] = []');
  });

  it('emits one entry per source with the right fields', () => {
    const out = genSourcesConst([source({ id: 's1', perPage: 3 })]);
    expect(out).toContain('id: "s1"');
    expect(out).toContain('kind: "releases"');
    expect(out).toContain('owner: "aws"');
    expect(out).toContain('repo: "aws-cdk"');
    expect(out).toContain('section: "releases"');
    expect(out).toContain('perPage: 3');
  });

  it('omits the section field when not provided', () => {
    const { section: _s, ...noSection } = source();
    void _s;
    const out = genSourcesConst([noSection as WizardSource]);
    expect(out).not.toContain('section:');
  });

  it('emits string-valued source args with quoted values', () => {
    const out = genSourcesConst([
      source({ kind: 'pull_requests', state: 'closed', sort: 'updated', direction: 'desc' }),
    ]);
    expect(out).toContain('state: "closed"');
    expect(out).toContain('sort: "updated"');
    expect(out).toContain('direction: "desc"');
  });
});

describe('genSpotlightsConst', () => {
  it('emits an empty array when no spotlights are configured', () => {
    expect(genSpotlightsConst([])).toContain('export const SPOTLIGHTS: readonly Spotlight[] = []');
  });

  it('emits one entry per spotlight with all seven fields', () => {
    const out = genSpotlightsConst([
      {
        tag: 'Generative AI',
        title: 'Mixins are stable',
        summary: 'A short summary.',
        trick: 'Why it is clever.',
        code: '<pre>code here</pre>',
        why: 'Why it matters.',
        url: 'https://example.com',
      },
    ]);
    expect(out).toContain('tag: "Generative AI"');
    expect(out).toContain('title: "Mixins are stable"');
    expect(out).toContain('summary: "A short summary."');
    expect(out).toContain('trick: "Why it is clever."');
    expect(out).toContain('code: ');
    expect(out).toContain('why: "Why it matters."');
    expect(out).toContain('url: "https://example.com"');
  });
});

describe('genProductsConst', () => {
  it('emits an empty Record when no products are configured', () => {
    const out = genProductsConst([]);
    expect(out).toContain('export const PRODUCTS: Readonly<Record<string, Product>> = {}');
  });

  it('emits a key per product with id/label/cssMod', () => {
    const out = genProductsConst([product({ id: 'lc', label: 'Last Command', cssMod: 'lc' })]);
    expect(out).toContain('"lc": {');
    expect(out).toContain('id: "lc"');
    expect(out).toContain('label: "Last Command"');
    expect(out).toContain('cssMod: "lc"');
  });

  it('emits a match function that iterates the rules', () => {
    const out = genProductsConst([
      product({ rules: [{ source: 'cdk', flags: 'i', reason: 'CDK keyword' }] }),
    ]);
    expect(out).toContain('match: (text)');
    expect(out).toContain('rules');
    expect(out).toContain('new RegExp("cdk", "i")');
    expect(out).toContain('reason: "CDK keyword"');
  });

  it('omits the flags arg when the rule has no flags', () => {
    const out = genProductsConst([product({ rules: [{ source: 'foo', reason: 'r' }] })]);
    expect(out).toContain('new RegExp("foo")');
    expect(out).not.toContain('new RegExp("foo", ""');
  });
});

describe('genPrompts', () => {
  it('emits an empty Record when no products', () => {
    expect(genPrompts([])).toContain('export const PROMPTS: Readonly<Record<string, string>> = {}');
  });

  it('emits one entry per product, system prompt as a string literal', () => {
    const out = genPrompts([product({ id: 'p1', systemPrompt: 'be helpful' })]);
    expect(out).toContain('"p1": "be helpful"');
  });

  it('escapes embedded quotes + newlines in the system prompt', () => {
    const out = genPrompts([product({ id: 'p1', systemPrompt: 'multi\nline "quoted"' })]);
    expect(out).toContain('\\n');
    expect(out).toContain('\\"quoted\\"');
  });
});

describe('genRules', () => {
  it('emits an empty Record when no products', () => {
    expect(genRules([])).toContain(
      'export const RULES: Readonly<Record<string, readonly Rule[]>> = {}',
    );
  });

  it('emits a list of {re, reason} per product', () => {
    const out = genRules([
      product({
        id: 'p1',
        rules: [
          { source: 'a', flags: 'i', reason: 'ra' },
          { source: 'b', reason: 'rb' },
        ],
      }),
    ]);
    expect(out).toContain('"p1": [');
    expect(out).toContain('new RegExp("a", "i"), reason: "ra"');
    expect(out).toContain('new RegExp("b"), reason: "rb"');
  });
});

describe('genCcBuilders', () => {
  it('emits an empty Record when no products', () => {
    expect(genCcBuilders([])).toContain(
      'export const CC_PROMPT_BUILDERS: Readonly<Record<string, CcPromptBuilder>> = {}',
    );
  });

  it('emits one builder fn per product, signature `({ brief, meta, mode })`', () => {
    const out = genCcBuilders([product({ id: 'p1' })]);
    expect(out).toContain('"p1":');
    expect(out).toContain('({ brief, meta, mode })');
  });

  it('uses the user-supplied ccPromptBody when provided', () => {
    const out = genCcBuilders([product({ ccPromptBody: 'return "CUSTOM_BODY";' })]);
    expect(out).toContain('return "CUSTOM_BODY";');
  });
});

describe('genLoadBody', () => {
  it('always calls initSpotlight first', () => {
    expect(genLoadBody([], [], 'mcp__github')).toContain('initSpotlight(deps');
  });

  it('falls back to an empty resolved promise when no sources are configured', () => {
    expect(genLoadBody([], [], 'mcp__github')).toContain('await Promise.resolve()');
  });

  it('emits one try/catch per source', () => {
    const sources = [source({ id: 's1' }), source({ id: 's2', kind: 'issues', section: 'rfcs' })];
    const out = genLoadBody(sources, [], 'mcp__github');
    const tryCount = (out.match(/try \{/g) ?? []).length;
    expect(tryCount).toBe(2);
  });

  it('routes each kind to the matching renderer', () => {
    const out = genLoadBody(
      [
        source({ id: 'r', kind: 'releases', section: 'releases' }),
        source({ id: 'i', kind: 'issues', section: 'rfcs' }),
        source({ id: 'p', kind: 'pull_requests', section: 'prs' }),
      ],
      [],
      'mcp__github',
    );
    expect(out).toContain('renderReleases(deps');
    expect(out).toContain('renderRfcs(deps');
    expect(out).toContain('renderPrs(deps');
  });

  it('uses the ghServer prefix for tool names', () => {
    const out = genLoadBody([source()], [], 'mcp__org-uuid-thing');
    expect(out).toContain('"mcp__org-uuid-thing__list_releases"');
  });

  it('falls back to the kind as section when section is undefined', () => {
    const { section: _s, ...noSection } = source();
    void _s;
    const out = genLoadBody(
      [{ ...noSection, kind: 'pull_requests' } as WizardSource],
      [],
      'mcp__github',
    );
    expect(out).toContain('"pull-requests"');
  });
});

describe('genSectionNav', () => {
  it('emits one nav button per distinct section', () => {
    const out = genSectionNav([
      source({ section: 'releases' }),
      source({ section: 'rfcs' }),
      source({ section: 'releases' }), // duplicate — should merge
    ]);
    expect((out.match(/<a /g) ?? []).length).toBe(2);
  });

  it('renders section names as title-cased labels', () => {
    const out = genSectionNav([source({ section: 'recent-prs' })]);
    expect(out).toContain('Recent Prs');
  });
});

describe('genSectionMarkupAboveHighlights', () => {
  it('emits one section block per distinct section', () => {
    const out = genSectionMarkupAboveHighlights([
      source({ section: 'releases' }),
      source({ section: 'rfcs' }),
    ]);
    expect((out.match(/<section/g) ?? []).length).toBe(2);
  });

  it('each section has a `${id}-body` skeleton container', () => {
    const out = genSectionMarkupAboveHighlights([source({ section: 'releases' })]);
    expect(out).toContain('id="releases-body"');
  });
});

describe('genResourcesMarkup', () => {
  it('uses the user-supplied headerSourcesLinks when present', () => {
    const out = genResourcesMarkup(config({ headerSourcesLinks: '<a href="x">x</a>' }));
    expect(out).toContain('<a href="x">x</a>');
  });

  it('falls back to a "Refresh content" hint when no links are supplied', () => {
    const out = genResourcesMarkup(config({ headerSourcesLinks: '' }));
    expect(out).toContain('Refresh content');
  });
});

describe('genProductCss', () => {
  it('returns near-empty for no products', () => {
    expect(genProductCss([]).trim().length).toBe(0);
  });

  it('emits one `.insights-tag.<cssMod>` rule per product', () => {
    const out = genProductCss([product({ cssMod: 'cdki' }), product({ id: 'lc', cssMod: 'lc' })]);
    expect(out).toContain('.insights-tag.cdki');
    expect(out).toContain('.insights-tag.lc');
  });

  it('skips products with an empty cssMod', () => {
    const out = genProductCss([product({ cssMod: '' })]);
    expect(out).not.toContain('.insights-tag.');
  });
});

describe('genProductUiBars', () => {
  it('returns near-empty for no products', () => {
    expect(genProductUiBars([]).trim().length).toBe(0);
  });

  it('emits one brief-all + one digest button per product', () => {
    const out = genProductUiBars([product({ id: 'p1' }), product({ id: 'p2' })]);
    expect(out).toContain('id="brief-all-btn-p1"');
    expect(out).toContain('id="brief-all-btn-p2"');
    expect(out).toContain('id="digest-btn-p1"');
    expect(out).toContain('id="digest-btn-p2"');
  });

  it('includes the digest-panel scaffold so digest/panel.ts can mount', () => {
    const out = genProductUiBars([product({ id: 'p1' })]);
    expect(out).toContain('id="digest-panel"');
    expect(out).toContain('id="digest-panel-title"');
    expect(out).toContain('id="digest-panel-body"');
    expect(out).toContain('id="digest-copy-btn"');
    expect(out).toContain('id="digest-download-btn"');
    expect(out).toContain('id="digest-close-btn"');
  });
});

describe('deriveSentinelMap', () => {
  it('covers every sentinel the dashboard template references', () => {
    const map = deriveSentinelMap(config());
    const expected = [
      'SOURCES_CONST',
      'SPOTLIGHTS_CONST',
      'LOAD_BODY',
      'PRODUCTS_CONFIG:PRODUCTS_CONST',
      'PRODUCTS_CONFIG:PROMPTS',
      'PRODUCTS_CONFIG:RULES',
      'PRODUCTS_CONFIG:CONTEXT_REFRESH',
      'PRODUCTS_CONFIG:CC_BUILDERS',
      'SECTION_NAV',
      'SECTION_MARKUP:ABOVE_HIGHLIGHTS',
      'SECTION_MARKUP:BELOW_HIGHLIGHTS',
      'HIGHLIGHTS_MARKUP',
      'PATTERNS_MARKUP',
      'TIPS_MARKUP',
      'RESOURCES_MARKUP',
      'PRODUCT_UI_BARS',
      'PRODUCT_CSS',
    ];
    for (const name of expected) {
      expect(map).toHaveProperty(name);
    }
  });
});

describe('derivePlaceholderMap', () => {
  it('covers every {{PLACEHOLDER}} in the dashboard template', () => {
    const map = derivePlaceholderMap(config(), '// bundle');
    const expected = [
      'TOPIC',
      'TOPIC_SLUG',
      'TAGLINE_SUFFIX',
      'TAGLINE_SUB',
      'ACCENT',
      'ACCENT_SOFT',
      'FOOTER_NOTE',
      'ARTIFACT_NAME',
      'ARTIFACT_DESCRIPTION',
      'GH_SERVER',
      'HEADER_SOURCES_LINKS',
      'COMPILED_JS',
    ];
    for (const name of expected) {
      expect(map).toHaveProperty(name);
    }
  });

  it('passes through the compiled-bundle source as COMPILED_JS', () => {
    const map = derivePlaceholderMap(config(), '/* fake bundle */');
    expect(map.COMPILED_JS).toBe('/* fake bundle */');
  });
});
