import { describe, expect, it, vi } from 'vitest';
import type { BriefItem } from '../products/brief';
import type { CcPromptBuilder } from '../products/cc-prompts';
import type { Brief, BuildCcPromptArgs, Flag, TriagedItem } from '../types';
import { type DigestEntry, renderDigestMarkdown } from './markdown';

const flag = (overrides: Partial<Flag> = {}): Flag => ({
  productId: 'cdki',
  stableId: 'release:v1:features:add-foo',
  section: 'releases',
  title: 'Add foo',
  url: 'https://example.com/r/1',
  reason: 'CDK area',
  ...overrides,
});

const item = (overrides: Partial<BriefItem> = {}): BriefItem => ({
  kind: 'release-features',
  text: '**core:** add foo support',
  url: 'https://example.com/r/1',
  reason: 'CDK area',
  version: 'v1.2.3',
  ...overrides,
});

const brief = (overrides: Partial<Brief> = {}): Brief => ({
  why: 'Mixins reshape construct composition.',
  integrations: [
    {
      title: 'Add mixin-awareness rule',
      detail: 'In src/aspects/CdkInsightsAspect.ts, detect mixin-derived constructs.',
    },
    { title: 'Update source-map writer', detail: 'Walk the new manifest layout.' },
  ],
  ...overrides,
});

const entry = (
  stableId: string,
  itemOverrides: Partial<BriefItem> = {},
  briefOverrides: Partial<Brief> = {},
): DigestEntry => ({
  flag: flag({ stableId }),
  item: item({ ...itemOverrides }),
  brief: brief({ ...briefOverrides }),
});

const triaged = (
  stableId: string,
  bucket: TriagedItem['bucket'],
  reasoning = `${bucket}-reason`,
): TriagedItem => ({ stableId, bucket, reasoning });

const BASE = {
  productLabel: 'CDK Insights',
  productSlug: 'cdk-insights',
  date: '2026-05-19',
};

describe('renderDigestMarkdown — header + summary', () => {
  it('emits the product label and date in the H1', () => {
    const md = renderDigestMarkdown({ ...BASE, entries: [], triaged: [] });
    expect(md).toContain('# CDK Insights upgrade digest — 2026-05-19');
  });

  it('reports the total considered-items count', () => {
    const md = renderDigestMarkdown({
      ...BASE,
      entries: [entry('a'), entry('b')],
      triaged: [triaged('a', 'green'), triaged('b', 'red')],
    });
    expect(md).toContain('2 flagged items considered');
  });

  it('shows the bucket counts in the summary blockquote', () => {
    const md = renderDigestMarkdown({
      ...BASE,
      entries: [entry('a'), entry('b'), entry('c'), entry('d')],
      triaged: [
        triaged('a', 'green'),
        triaged('b', 'green'),
        triaged('c', 'yellow'),
        triaged('d', 'red'),
      ],
    });
    expect(md).toMatch(/🟢 Implement now: 2 · 🟡 Worth considering: 1 · 🔴 Skip: 1\./);
  });
});

describe('renderDigestMarkdown — bucket sections', () => {
  it('emits the green section only when there are green entries', () => {
    const onlyRed = renderDigestMarkdown({
      ...BASE,
      entries: [entry('a')],
      triaged: [triaged('a', 'red')],
    });
    expect(onlyRed).not.toContain('## 🟢 Implement now');
    expect(onlyRed).toContain('## 🔴 Skip');
  });

  it('orders sections as green → yellow → red', () => {
    const md = renderDigestMarkdown({
      ...BASE,
      entries: [
        entry('a', { text: 'green item' }),
        entry('b', { text: 'yellow item' }),
        entry('c', { text: 'red item' }),
      ],
      triaged: [triaged('a', 'green'), triaged('b', 'yellow'), triaged('c', 'red')],
    });
    const greenIdx = md.indexOf('## 🟢');
    const yellowIdx = md.indexOf('## 🟡');
    const redIdx = md.indexOf('## 🔴');
    expect(greenIdx).toBeGreaterThan(-1);
    expect(yellowIdx).toBeGreaterThan(greenIdx);
    expect(redIdx).toBeGreaterThan(yellowIdx);
  });

  it('defaults entries with no triage to the yellow bucket', () => {
    const md = renderDigestMarkdown({
      ...BASE,
      entries: [entry('a', { text: 'orphan item' })],
      triaged: [], // no triage at all
    });
    expect(md).toContain('## 🟡 Worth considering (1)');
    expect(md).not.toContain('## 🟢');
    expect(md).not.toContain('## 🔴');
  });
});

describe('renderDigestMarkdown — green/yellow detail block', () => {
  const ccBuilder: CcPromptBuilder = vi.fn(
    (args: BuildCcPromptArgs) => `MODE=${args.mode} STABLE=${args.meta.stableId}`,
  );

  it('renders the cleaned title as an H3 with a 1-based index', () => {
    const md = renderDigestMarkdown({
      ...BASE,
      entries: [
        entry('a', { text: '[Feature] **core:** add a thing' }),
        entry('b', { text: 'second item' }),
      ],
      triaged: [triaged('a', 'green'), triaged('b', 'green')],
      ccBuilder,
    });
    expect(md).toContain('### 1. add a thing');
    expect(md).toContain('### 2. second item');
  });

  it('emits Source / Version / Why it matters / Triage rationale lines', () => {
    const md = renderDigestMarkdown({
      ...BASE,
      entries: [entry('a')],
      triaged: [triaged('a', 'green', 'high-impact for the static analyser')],
      ccBuilder,
    });
    expect(md).toContain('**Source:** <https://example.com/r/1>');
    expect(md).toContain('**Version:** v1.2.3');
    expect(md).toContain('**Why it matters:** Mixins reshape construct composition.');
    expect(md).toContain('**Triage rationale:** high-impact for the static analyser');
  });

  it('omits Source when flag.url is empty', () => {
    const md = renderDigestMarkdown({
      ...BASE,
      entries: [
        {
          flag: flag({ url: '' }),
          item: item(),
          brief: brief(),
        },
      ],
      triaged: [triaged('release:v1:features:add-foo', 'green')],
      ccBuilder,
    });
    expect(md).not.toContain('**Source:**');
  });

  it('omits Version when item.version is undefined', () => {
    const md = renderDigestMarkdown({
      ...BASE,
      entries: [
        {
          flag: flag(),
          item: { kind: 'pr', text: 'no version', url: '', reason: 'r' },
          brief: brief(),
        },
      ],
      triaged: [triaged('release:v1:features:add-foo', 'green')],
      ccBuilder,
    });
    expect(md).not.toContain('**Version:**');
  });

  it('renders the integration plan as a numbered list when integrations exist', () => {
    const md = renderDigestMarkdown({
      ...BASE,
      entries: [entry('a')],
      triaged: [triaged('a', 'green')],
      ccBuilder,
    });
    expect(md).toContain('**Integration plan:**');
    expect(md).toContain('1. **Add mixin-awareness rule** — In src/aspects/');
    expect(md).toContain('2. **Update source-map writer** — Walk the new manifest layout.');
  });

  it('omits the integration plan when integrations is empty', () => {
    const md = renderDigestMarkdown({
      ...BASE,
      entries: [entry('a', {}, { integrations: [] })],
      triaged: [triaged('a', 'green')],
      ccBuilder,
    });
    expect(md).not.toContain('**Integration plan:**');
  });

  it('embeds the Claude Code prompt inside a <details> block with ``` fence', () => {
    const md = renderDigestMarkdown({
      ...BASE,
      entries: [entry('a')],
      triaged: [triaged('a', 'green')],
      ccBuilder,
    });
    expect(md).toContain('<details>');
    expect(md).toContain('<summary>Claude Code prompt (click to expand)</summary>');
    // entry('a') overrides stableId to 'a', so the cc builder sees stableId=a.
    expect(md).toMatch(/```\nMODE=plan STABLE=a\n```/);
    expect(md).toContain('</details>');
  });

  it('always passes mode="plan" to the cc builder (digest defaults to plan)', () => {
    const builder = vi.fn<CcPromptBuilder>(() => 'X');
    renderDigestMarkdown({
      ...BASE,
      entries: [entry('a'), entry('b')],
      triaged: [triaged('a', 'green'), triaged('b', 'yellow')],
      ccBuilder: builder,
    });
    expect(builder).toHaveBeenCalledTimes(2);
    for (const call of builder.mock.calls) {
      expect(call[0]?.mode).toBe('plan');
    }
  });

  it('omits the <details> block when no ccBuilder is provided', () => {
    const md = renderDigestMarkdown({
      ...BASE,
      entries: [entry('a')],
      triaged: [triaged('a', 'green')],
      // no ccBuilder
    });
    expect(md).not.toContain('<details>');
    expect(md).not.toContain('```');
  });

  it('separates items with horizontal rules', () => {
    const md = renderDigestMarkdown({
      ...BASE,
      entries: [entry('a'), entry('b')],
      triaged: [triaged('a', 'green'), triaged('b', 'green')],
      ccBuilder,
    });
    // Two items + final footer separator = 3 occurrences of "---".
    const matches = md.match(/^---$/gm);
    expect(matches?.length).toBeGreaterThanOrEqual(3);
  });
});

describe('renderDigestMarkdown — red one-liners', () => {
  it('renders red items as a single-line bullet with the triage reason', () => {
    const md = renderDigestMarkdown({
      ...BASE,
      entries: [
        entry('a', { text: '[Tag] short red item' }),
        entry('b', { text: 'another red one' }),
      ],
      triaged: [triaged('a', 'red', 'low impact'), triaged('b', 'red', 'redundant')],
    });
    expect(md).toContain('- **short red item** — low impact');
    expect(md).toContain('- **another red one** — redundant');
  });

  it('falls back to "Low impact for <productLabel>" when the reason is missing', () => {
    const md = renderDigestMarkdown({
      ...BASE,
      entries: [entry('a', { text: 'red orphan' })],
      triaged: [triaged('a', 'red', '')], // empty reasoning
    });
    expect(md).toContain('- **red orphan** — Low impact for CDK Insights.');
  });

  it('does NOT embed a cc-prompt block for red items', () => {
    const md = renderDigestMarkdown({
      ...BASE,
      entries: [entry('a')],
      triaged: [triaged('a', 'red')],
      ccBuilder: () => 'should not appear',
    });
    expect(md).not.toContain('<details>');
    expect(md).not.toContain('should not appear');
  });
});

describe('renderDigestMarkdown — footer', () => {
  it('emits the save-path footer with the date + slug', () => {
    const md = renderDigestMarkdown({
      ...BASE,
      entries: [],
      triaged: [],
    });
    expect(md).toContain('`.claude/upgrade-digests/2026-05-19-cdk-insights-upgrade-digest.md`');
  });
});
