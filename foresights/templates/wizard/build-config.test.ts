import { describe, expect, it } from 'vitest';
import {
  type WizardConfig,
  type WizardProduct,
  type WizardSource,
  deriveFlagManifest,
  derivePlaceholderMap,
  deriveSentinelMap,
  genBakedBriefs,
  genCcBuilders,
  genForesightsConfigJson,
  genHighlightsMarkup,
  genLoadBody,
  genPatternsMarkup,
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
  genTipsMarkup,
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
  highlights: [],
  patterns: [],
  tips: [],
  resources: [],
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

  it('emits url + omits owner/repo for kind: "rss"', () => {
    const out = genSourcesConst([
      {
        id: 'stratechery',
        label: 'Stratechery',
        kind: 'rss',
        url: 'https://stratechery.com/feed/',
        section: 'updates',
      },
    ]);
    expect(out).toContain('kind: "rss"');
    expect(out).toContain('url: "https://stratechery.com/feed/"');
    expect(out).toContain('section: "updates"');
    expect(out).not.toContain('owner:');
    expect(out).not.toContain('repo:');
  });

  it('handles mixed github + rss sources in one SOURCES const', () => {
    const out = genSourcesConst([
      source({ id: 'gh1', section: 'releases' }),
      {
        id: 'rss1',
        label: 'Substack',
        kind: 'rss',
        url: 'https://example.substack.com/feed',
        section: 'updates',
      },
    ]);
    // GitHub entry has owner/repo, rss entry has url. Both kinds present.
    expect(out).toContain('owner: "aws"');
    expect(out).toContain('kind: "releases"');
    expect(out).toContain('kind: "rss"');
    expect(out).toContain('url: "https://example.substack.com/feed"');
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

  it('emits one try/catch per source (plus 1 for the spotlight init)', () => {
    const sources = [source({ id: 's1' }), source({ id: 's2', kind: 'issues', section: 'rfcs' })];
    const out = genLoadBody(sources, [], 'mcp__github');
    const tryCount = (out.match(/try \{/g) ?? []).length;
    // 1 init try (initSpotlight) + 2 source tries = 3.
    expect(tryCount).toBe(3);
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

  it('bakes kind: "rss" items into a renderRssItems call (no fetchRss, no callTool)', () => {
    const out = genLoadBody(
      [
        {
          id: 'sub',
          label: 'Substack',
          kind: 'rss',
          url: 'https://example.substack.com/feed',
          section: 'updates',
          items: [
            {
              title: 'Hello world',
              link: 'https://example.substack.com/p/hello',
              description: 'A first post.',
              pubDate: '2026-05-01T00:00:00Z',
              author: 'Jane',
              guid: 'https://example.substack.com/p/hello',
            },
          ],
        },
      ],
      [],
      'mcp__github',
    );
    // RSS items are baked at wizard time — no runtime fetch, no MCP call.
    expect(out).not.toContain('fetchRss');
    expect(out).not.toContain('callTool(deps');
    expect(out).not.toContain('mcp__github__list_rss');
    expect(out).toContain('renderRssItems(deps, [{');
    expect(out).toContain('"Hello world"');
    expect(out).toContain('"updates", productsArr)');
  });

  it('rss + github sources both emit their own try/catch blocks', () => {
    const out = genLoadBody(
      [
        source({ id: 'gh', section: 'releases' }),
        {
          id: 'rss',
          label: 'Feed',
          kind: 'rss',
          url: 'https://example.com/feed',
          section: 'updates',
        },
      ],
      [],
      'mcp__github',
    );
    const tryCount = (out.match(/try \{/g) ?? []).length;
    // 1 init try (initSpotlight) + 2 source tries (github + rss) = 3.
    expect(tryCount).toBe(3);
    expect(out).toContain('callTool(deps');
    expect(out).toContain('renderRssItems(deps');
  });

  it('always declares productsArr from PRODUCTS and passes it to every renderer', () => {
    const out = genLoadBody(
      [
        source({ id: 'gh', section: 'releases' }),
        {
          id: 'rss',
          label: 'Feed',
          kind: 'rss',
          url: 'https://example.com/feed',
          section: 'updates',
        },
      ],
      [],
      'mcp__github',
    );
    expect(out).toContain('const productsArr = Object.values(PRODUCTS)');
    // Renderers receive productsArr, NOT [] anymore.
    expect(out).toContain(
      'renderReleases(deps, raw as readonly Release[], "releases", productsArr)',
    );
    // rss source has no baked items here → renderRssItems gets an empty literal.
    expect(out).toContain('renderRssItems(deps, [], "updates", productsArr)');
    expect(out).not.toMatch(/renderReleases\([^)]*\[\]\)/);
  });

  it('passes productsArr to initSpotlight (was [] in v0.2.x)', () => {
    const out = genLoadBody([source()], [], 'mcp__github');
    expect(out).toContain(
      'initSpotlight(deps, { spotlights: SPOTLIGHTS, topicSlug: TOPIC_SLUG, products: productsArr }',
    );
  });

  it('mounts initBriefPanel + initDigestPanel when products.length > 0', () => {
    const out = genLoadBody(
      [source()],
      [
        product({
          id: 'cdki',
          systemPrompt: 'sp',
          rules: [{ source: 'cdk', reason: 'cdk' }],
        }),
      ],
      'mcp__github',
    );
    expect(out).toContain('initBriefPanel(deps');
    expect(out).toContain('products: productsArr');
    expect(out).toContain('prompts: PROMPTS');
    expect(out).toContain('ccBuilders: CC_PROMPT_BUILDERS');
    expect(out).toContain('topicSlug: TOPIC_SLUG');
    expect(out).toContain('initDigestPanel(deps)');
  });

  it('omits initBriefPanel + initDigestPanel when products is empty', () => {
    const out = genLoadBody([source()], [], 'mcp__github');
    expect(out).not.toContain('initBriefPanel(');
    expect(out).not.toContain('initDigestPanel(');
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

describe('genHighlightsMarkup', () => {
  it('emits a "get started" placeholder when no highlights are configured', () => {
    const out = genHighlightsMarkup(config({ highlights: [] }));
    expect(out).toContain('Add your highlights');
    expect(out).toContain('Re-run the wizard');
  });

  it('emits one .hl-card per highlight with tag, title, body, and anchor', () => {
    const out = genHighlightsMarkup(
      config({
        highlights: [
          {
            tag: 'Mar 2026 · GA',
            title: 'CDK Mixins are now stable',
            body: 'Composable abstractions you can apply via .with().',
            url: 'https://aws.amazon.com/whats-new/cdk-mixins',
            cta: "What's New",
          },
        ],
      }),
    );
    expect((out.match(/<div class="hl-card">/g) ?? []).length).toBe(1);
    expect(out).toContain('<span class="tag">Mar 2026 · GA</span>');
    expect(out).toContain('<h3>CDK Mixins are now stable</h3>');
    expect(out).toContain('href="https://aws.amazon.com/whats-new/cdk-mixins"');
    expect(out).toContain('What&#39;s New →');
  });

  it('allows inline <code> tags in title and body but escapes everything else', () => {
    const out = genHighlightsMarkup(
      config({
        highlights: [
          {
            tag: 't',
            title: 'Use <code>cdk synth</code> first',
            body: 'Bad: <script>alert(1)</script>. Good: <code>npm test</code>.',
            url: 'https://github.com/aws/aws-cdk',
          },
        ],
      }),
    );
    expect(out).toContain('Use <code>cdk synth</code> first');
    expect(out).toContain('<code>npm test</code>');
    // <script> stays escaped
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('defaults CTA to "GitHub" for github.com URLs and host for everything else', () => {
    const ghOut = genHighlightsMarkup(
      config({
        highlights: [{ tag: 't', title: 'x', body: 'b', url: 'https://github.com/foo/bar' }],
      }),
    );
    expect(ghOut).toContain('GitHub →');

    const otherOut = genHighlightsMarkup(
      config({
        highlights: [{ tag: 't', title: 'x', body: 'b', url: 'https://constructs.dev/abc' }],
      }),
    );
    expect(otherOut).toContain('constructs.dev →');
  });
});

describe('genPatternsMarkup', () => {
  it('emits a placeholder when no patterns are configured', () => {
    const out = genPatternsMarkup(config({ patterns: [] }));
    expect(out).toContain('Add your patterns');
  });

  it('emits one .hl-card per pattern', () => {
    const out = genPatternsMarkup(
      config({
        patterns: [
          {
            tag: 'Generative AI',
            title: 'awslabs/generative-ai-cdk-constructs',
            body: 'Official AWS Labs L3 constructs.',
            url: 'https://github.com/awslabs/generative-ai-cdk-constructs',
          },
          {
            tag: 'Patterns hub',
            title: 'cdkpatterns.com',
            body: 'Curated patterns library.',
            url: 'https://cdkpatterns.com',
          },
        ],
      }),
    );
    expect((out.match(/<div class="hl-card">/g) ?? []).length).toBe(2);
    expect(out).toContain('GitHub →');
    expect(out).toContain('cdkpatterns.com →');
  });
});

describe('genTipsMarkup', () => {
  it('emits a placeholder when no tips are configured', () => {
    const out = genTipsMarkup(config({ tips: [] }));
    expect(out).toContain('Add your tips');
  });

  it('emits one .tip per entry with an em-dashed why suffix when supplied', () => {
    const out = genTipsMarkup(
      config({
        tips: [
          {
            title: 'Pin your <code>cdk.context.json</code>',
            why: 'deterministic synth',
            body: 'Commit it. Treat regenerations as PRs.',
          },
        ],
      }),
    );
    expect(out).toContain('<div class="tip">');
    expect(out).toContain('Pin your <code>cdk.context.json</code>');
    expect(out).toContain('<span class="why">— deterministic synth</span>');
    expect(out).toContain('Commit it. Treat regenerations as PRs.');
  });

  it('omits the why span when not supplied', () => {
    const out = genTipsMarkup(
      config({
        tips: [{ title: 'Be precise', body: 'About what you commit.' }],
      }),
    );
    expect(out).not.toContain('class="why"');
  });

  it('emits a <pre class="code-block"> when code is supplied', () => {
    const out = genTipsMarkup(
      config({
        tips: [
          {
            title: 'Try this',
            body: 'A worked example.',
            code: '<span class="k">const</span> x = 1;',
          },
        ],
      }),
    );
    expect(out).toContain('<pre class="code-block">');
    expect(out).toContain('<span class="k">const</span> x = 1;');
  });

  it('does NOT emit a plain <pre> (cascade trap)', () => {
    const out = genTipsMarkup(
      config({
        tips: [{ title: 'x', body: 'y', code: '<span class="k">z</span>' }],
      }),
    );
    expect(out).not.toMatch(/<pre(?!\s+class=)/);
  });
});

describe('genResourcesMarkup', () => {
  it('emits a placeholder when no resources are configured', () => {
    const out = genResourcesMarkup(config({ resources: [] }));
    expect(out).toContain('Add resources');
    expect(out).toContain('Re-run the wizard');
  });

  it('emits one <a class="res"> per resource with name + desc + url', () => {
    const out = genResourcesMarkup(
      config({
        resources: [
          {
            name: 'aws/aws-cdk releases',
            desc: 'Source of truth for every weekly minor.',
            url: 'https://github.com/aws/aws-cdk/releases',
          },
          {
            name: 'constructs.dev',
            desc: 'Construct Hub.',
            url: 'https://constructs.dev/',
          },
        ],
      }),
    );
    expect((out.match(/<a class="res"/g) ?? []).length).toBe(2);
    expect(out).toContain('<div class="res-name">aws/aws-cdk releases</div>');
    expect(out).toContain('<div class="res-desc">Source of truth for every weekly minor.</div>');
    expect(out).toContain('href="https://constructs.dev/"');
  });

  it('escapes name + desc to prevent HTML injection', () => {
    const out = genResourcesMarkup(
      config({
        resources: [
          {
            name: '<script>alert(1)</script>',
            desc: '"quoted"',
            url: 'https://example.com',
          },
        ],
      }),
    );
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('&quot;quoted&quot;');
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

describe('genForesightsConfigJson', () => {
  it('round-trips the full config through JSON.parse', () => {
    const c = config({ products: [product()] });
    expect(JSON.parse(genForesightsConfigJson(c))).toEqual(c);
  });

  it('escapes < so the payload cannot break out of the <script> element', () => {
    const json = genForesightsConfigJson(
      config({ artifactDescription: 'A </script> here must stay inert.' }),
    );
    expect(json).not.toContain('<');
    expect((JSON.parse(json) as WizardConfig).artifactDescription).toBe(
      'A </script> here must stay inert.',
    );
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
      'BAKED_BRIEFS',
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
      'FORESIGHTS_CONFIG_JSON',
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

describe('action types — genProductsConst + genCcBuilders', () => {
  it('genProductsConst omits actionType for a default (claude-code) product', () => {
    expect(genProductsConst([product()])).not.toContain('actionType');
  });

  it('genProductsConst omits actionType for an explicit claude-code product', () => {
    expect(genProductsConst([product({ actionType: 'claude-code' })])).not.toContain('actionType');
  });

  it('genProductsConst emits actionType for a summary product', () => {
    const out = genProductsConst([product({ id: 'res', actionType: 'summary' })]);
    expect(out).toContain('actionType: "summary"');
  });

  it('genCcBuilders emits builders only for claude-code products', () => {
    const out = genCcBuilders([
      product({ id: 'cc' }),
      product({ id: 'sum', actionType: 'summary' }),
      product({ id: 'tsk', actionType: 'task' }),
    ]);
    expect(out).toContain('"cc":');
    expect(out).not.toContain('"sum":');
    expect(out).not.toContain('"tsk":');
  });

  it('genCcBuilders emits an empty Record when every product is non-claude-code', () => {
    const out = genCcBuilders([product({ id: 'sum', actionType: 'summary' })]);
    expect(out).toContain(
      'export const CC_PROMPT_BUILDERS: Readonly<Record<string, CcPromptBuilder>> = {}',
    );
  });
});

describe('action types — additive guarantee', () => {
  it('a claude-code config produces a sentinel map with no actionType token anywhere', () => {
    const map = deriveSentinelMap(config({ products: [product()] }));
    for (const value of Object.values(map)) {
      expect(value).not.toContain('actionType');
    }
  });

  it('omitting actionType and setting it explicitly to claude-code produce an identical sentinel map', () => {
    const omitted = deriveSentinelMap(config({ products: [product({ id: 'p' })] }));
    const explicit = deriveSentinelMap(
      config({ products: [product({ id: 'p', actionType: 'claude-code' })] }),
    );
    expect(explicit).toEqual(omitted);
  });
});

describe('cadence — genLoadBody', () => {
  it('omits cadence from the initSpotlight call when cadence is undefined', () => {
    const out = genLoadBody([source()], [], 'mcp__github');
    expect(out).toContain(
      'initSpotlight(deps, { spotlights: SPOTLIGHTS, topicSlug: TOPIC_SLUG, products: productsArr })',
    );
    expect(out).not.toContain('cadence:');
  });

  it('omits cadence when it is explicitly daily (byte-identical to the default)', () => {
    expect(genLoadBody([source()], [], 'mcp__github', 'daily')).not.toContain('cadence:');
  });

  it('emits cadence in the initSpotlight call for weekly', () => {
    const out = genLoadBody([source()], [], 'mcp__github', 'weekly');
    expect(out).toContain(
      'initSpotlight(deps, { spotlights: SPOTLIGHTS, topicSlug: TOPIC_SLUG, products: productsArr, cadence: "weekly" })',
    );
  });

  it('emits cadence for on-demand', () => {
    expect(genLoadBody([source()], [], 'mcp__github', 'on-demand')).toContain(
      'cadence: "on-demand"',
    );
  });

  it('a config with no cadence and one with cadence: daily produce an identical LOAD_BODY', () => {
    const omitted = deriveSentinelMap(config()).LOAD_BODY;
    const explicit = deriveSentinelMap(config({ cadence: 'daily' })).LOAD_BODY;
    expect(explicit).toBe(omitted);
  });
});

describe('outputMode — genLoadBody', () => {
  it('artifact mode (the default) emits a live callTool for github sources', () => {
    const out = genLoadBody([source()], [], 'mcp__github');
    expect(out).toContain('callTool(deps, "mcp__github__list_releases"');
    expect(out).toContain('renderReleases(deps, raw as readonly Release[]');
  });

  it('static mode attempts a live callTool with the baked snapshot as the fallback', () => {
    const baked = [
      {
        tag_name: 'v1.2.0',
        name: 'v1.2.0',
        body: '',
        html_url: 'https://example.com/r/v1.2.0',
        published_at: '2026-05-01T00:00:00Z',
      },
    ];
    const out = genLoadBody([source({ baked })], [], 'mcp__github', undefined, 'static');
    // Progressive: a live fetch is attempted first...
    expect(out).toContain('callTool(deps, "mcp__github__list_releases"');
    expect(out).toContain('renderReleases(deps, raw as readonly Release[]');
    // ...and the baked snapshot is the catch fallback.
    expect(out).toContain('renderReleases(deps, [{');
    expect(out).toContain('"v1.2.0"');
    expect(out).toContain('as unknown as readonly Release[], "releases", productsArr)');
    // the baked fallback is emitted after the live attempt
    expect(out.indexOf('as unknown as readonly Release[]')).toBeGreaterThan(
      out.indexOf('await callTool(deps'),
    );
  });

  it('static mode falls back to an empty literal when a source has no baked data', () => {
    const out = genLoadBody([source()], [], 'mcp__github', undefined, 'static');
    expect(out).toContain(
      'renderReleases(deps, [] as unknown as readonly Release[], "releases", productsArr)',
    );
  });

  it('static mode routes every github kind to its renderer + cast (live + baked)', () => {
    const out = genLoadBody(
      [
        source({ id: 'r', kind: 'releases', section: 'releases' }),
        source({ id: 'i', kind: 'issues', section: 'rfcs' }),
        source({ id: 'p', kind: 'pull_requests', section: 'prs' }),
      ],
      [],
      'mcp__github',
      undefined,
      'static',
    );
    expect(out).toContain('renderReleases(deps, [] as unknown as readonly Release[]');
    expect(out).toContain('renderRfcs(deps, [] as unknown as readonly Issue[]');
    expect(out).toContain('renderPrs(deps, [] as unknown as readonly PullRequest[]');
    // each kind also gets its live-fetch attempt
    expect(out).toContain('__list_releases');
    expect(out).toContain('__list_issues');
    expect(out).toContain('__list_pull_requests');
  });

  it('rss sources still bake regardless of outputMode', () => {
    const rss: WizardSource = {
      id: 'feed',
      label: 'Feed',
      kind: 'rss',
      url: 'https://example.com/feed',
      section: 'updates',
    };
    expect(genLoadBody([rss], [], 'mcp__github')).toContain('renderRssItems(deps');
    expect(genLoadBody([rss], [], 'mcp__github', undefined, 'static')).toContain(
      'renderRssItems(deps',
    );
  });

  it('omitting outputMode is byte-identical to outputMode: artifact (additive guarantee)', () => {
    const omitted = deriveSentinelMap(config()).LOAD_BODY;
    const explicit = deriveSentinelMap(config({ outputMode: 'artifact' })).LOAD_BODY;
    expect(explicit).toBe(omitted);
  });
});

describe('genBakedBriefs', () => {
  it('emits an empty BAKED_BRIEFS map when briefs are omitted', () => {
    const out = genBakedBriefs(undefined);
    expect(out).toContain(
      'const BAKED_BRIEFS: Readonly<Record<string, Readonly<Record<string, Brief>>>> = {};',
    );
  });

  it('emits the same empty map for an empty briefs object (additive guarantee)', () => {
    expect(genBakedBriefs({})).toBe(genBakedBriefs(undefined));
  });

  it('embeds each baked brief keyed by product then stableId', () => {
    const out = genBakedBriefs({
      cdki: {
        'pr:42': { why: 'Touches the construct tree.', integrations: [] },
      },
    });
    expect(out).toContain('"cdki"');
    expect(out).toContain('"pr:42"');
    expect(out).toContain('Touches the construct tree.');
  });

  it('escapes quotes / backslashes / markup so the literal stays valid', () => {
    const briefs = {
      lc: {
        'release:v1:features:x': {
          why: 'Has "quotes", a \\ backslash, and a </script> tag.',
          integrations: [{ title: 'In `lc-api`', detail: 'See src/handler.ts.' }],
        },
      },
    };
    const out = genBakedBriefs(briefs);
    // The emitted object literal round-trips through JSON.parse unchanged.
    const literal = out.slice(out.indexOf('= ') + 2, out.lastIndexOf(';'));
    expect(JSON.parse(literal)).toEqual(briefs);
  });

  it('deriveSentinelMap wires genBakedBriefs into the BAKED_BRIEFS sentinel', () => {
    const baked = deriveSentinelMap(
      config({ briefs: { cdki: { 'rfc:7': { why: 'Relevant RFC.', integrations: [] } } } }),
    ).BAKED_BRIEFS;
    expect(baked).toContain('Relevant RFC.');
    // A config with no briefs leaves the sentinel as the shipped empty map.
    expect(deriveSentinelMap(config()).BAKED_BRIEFS).toBe(genBakedBriefs(undefined));
  });
});

describe('deriveFlagManifest', () => {
  it('returns an empty manifest when the config has no products', () => {
    expect(deriveFlagManifest(config())).toEqual([]);
  });

  it('flags a release bullet that matches a product rule (and skips the rest)', () => {
    const manifest = deriveFlagManifest(
      config({
        products: [product()],
        sources: [
          source({
            kind: 'releases',
            section: 'releases',
            baked: [
              {
                tag_name: 'v1.0.0',
                name: 'v1.0.0',
                body: '### Features\n* improve cdk synth\n* totally unrelated bullet',
                html_url: 'https://example.com/r/v1.0.0',
                published_at: '2026-05-01T00:00:00Z',
              },
            ],
          }),
        ],
      }),
    );
    expect(manifest).toEqual([
      {
        productId: 'cdki',
        stableId: 'release:v1.0.0:features:improve-cdk-synth',
        kind: 'release-features',
        text: 'improve cdk synth',
        title: 'improve cdk synth',
        url: 'https://example.com/r/v1.0.0',
      },
    ]);
  });

  it('tags each source kind with the right kind label', () => {
    const manifest = deriveFlagManifest(
      config({
        products: [product()],
        sources: [
          source({
            id: 'p',
            kind: 'pull_requests',
            section: 'prs',
            baked: [
              {
                number: 7,
                title: 'feat: cdk thing',
                html_url: 'https://example.com/pr/7',
                merged_at: '2026-05-01T00:00:00Z',
              },
            ],
          }),
          source({
            id: 'i',
            kind: 'issues',
            section: 'rfcs',
            baked: [
              {
                number: 9,
                title: 'cdk rfc',
                body: 'body',
                html_url: 'https://example.com/i/9',
                labels: [],
                updated_at: '2026-05-01T00:00:00Z',
              },
            ],
          }),
          {
            id: 'f',
            label: 'Feed',
            kind: 'rss',
            url: 'https://example.com/feed',
            section: 'updates',
            items: [
              {
                title: 'cdk news',
                link: 'https://example.com/post',
                description: 'about cdk',
                pubDate: '2026-05-01T00:00:00Z',
                author: 'A',
                guid: 'guid-1',
              },
            ],
          },
        ],
      }),
    );
    expect(manifest.map((e) => `${e.kind}:${e.stableId}`)).toEqual([
      'pr:pr:7',
      'rfc:rfc:9',
      'rss:rss:guid-1',
    ]);
  });

  it('emits one entry per matching product, in product declaration order', () => {
    const manifest = deriveFlagManifest(
      config({
        products: [
          product({ id: 'a', rules: [{ source: 'cdk', flags: 'i', reason: 'a' }] }),
          product({ id: 'b', rules: [{ source: 'synth', flags: 'i', reason: 'b' }] }),
        ],
        sources: [
          source({
            kind: 'pull_requests',
            section: 'prs',
            baked: [
              {
                number: 1,
                title: 'feat: cdk synth speedup',
                html_url: 'https://example.com/pr/1',
                merged_at: '2026-05-01T00:00:00Z',
              },
            ],
          }),
        ],
      }),
    );
    expect(manifest.map((e) => e.productId)).toEqual(['a', 'b']);
  });

  it('treats a github source with no baked data as zero flagged items', () => {
    // config()'s default source is a releases source with no `baked`.
    expect(deriveFlagManifest(config({ products: [product()] }))).toEqual([]);
  });
});
