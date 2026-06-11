import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import type { Deps, Product, RssItem } from '../types';
import { createInMemoryStorage } from '../util/storage';
import { renderRssItems, snippet } from './rss';

const buildDeps = (): Deps => {
  const dom = new JSDOM('<!doctype html><div id="updates-body"></div>');
  return {
    callTool: vi.fn(),
    askClaude: vi.fn(),
    runScheduledTask: vi.fn(),
    storage: createInMemoryStorage(),
    now: () => new Date('2026-05-20T12:00:00Z'),
    document: dom.window.document,
    window: dom.window as unknown as Window,
  };
};

const sampleItem = (overrides: Partial<RssItem> = {}): RssItem => ({
  title: 'Sample post',
  link: 'https://example.com/post',
  description: 'A useful summary of the post.',
  pubDate: '2026-05-19T09:00:00Z',
  author: 'Jane',
  guid: 'https://example.com/post#1',
  ...overrides,
});

describe('renderRssItems', () => {
  it('renders one card per item up to 10', () => {
    const deps = buildDeps();
    const items = Array.from({ length: 15 }, (_, i) =>
      sampleItem({ title: `Post ${i}`, guid: `g${i}`, link: `https://example.com/${i}` }),
    );
    renderRssItems(deps, items, 'updates', []);
    const root = deps.document.getElementById('updates-body');
    expect(root?.querySelectorAll('.pr-item').length).toBe(10);
  });

  it('renders an empty-state placeholder when items is empty', () => {
    const deps = buildDeps();
    renderRssItems(deps, [], 'updates', []);
    const root = deps.document.getElementById('updates-body');
    expect(root?.innerHTML).toContain('No recent items in this feed');
    expect(root?.innerHTML).toContain('section-empty');
  });

  it('does nothing when the target container is missing', () => {
    const deps = buildDeps();
    expect(() => renderRssItems(deps, [sampleItem()], 'nonexistent', [])).not.toThrow();
  });

  it('escapes title text', () => {
    const deps = buildDeps();
    renderRssItems(deps, [sampleItem({ title: 'a<script>alert(1)</script>' })], 'updates', []);
    const html = deps.document.getElementById('updates-body')?.innerHTML ?? '';
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('strips embedded HTML in description before showing the snippet', () => {
    const deps = buildDeps();
    renderRssItems(
      deps,
      [sampleItem({ description: '<p>Hello <strong>world</strong></p>' })],
      'updates',
      [],
    );
    const html = deps.document.getElementById('updates-body')?.innerHTML ?? '';
    expect(html).toContain('Hello world');
    expect(html).not.toContain('<strong>');
  });

  it('truncates long descriptions with ellipsis', () => {
    const deps = buildDeps();
    const longDesc = 'x'.repeat(500);
    renderRssItems(deps, [sampleItem({ description: longDesc })], 'updates', []);
    const html = deps.document.getElementById('updates-body')?.innerHTML ?? '';
    expect(html).toContain('…');
  });

  it('omits the snippet div entirely when description is empty', () => {
    const deps = buildDeps();
    renderRssItems(deps, [sampleItem({ description: '' })], 'updates', []);
    const html = deps.document.getElementById('updates-body')?.innerHTML ?? '';
    expect(html).not.toContain('rss-snippet');
  });

  it('falls back to "(untitled)" when title is empty', () => {
    const deps = buildDeps();
    renderRssItems(deps, [sampleItem({ title: '' })], 'updates', []);
    const html = deps.document.getElementById('updates-body')?.innerHTML ?? '';
    expect(html).toContain('(untitled)');
  });

  it('runs flagsForText against title + description and emits badges', () => {
    const deps = buildDeps();
    const product: Product = {
      id: 'p1',
      label: 'Insights',
      cssMod: 'insights',
      match: (text) => (/bedrock/i.test(text) ? 'mentions bedrock' : null),
    };
    renderRssItems(
      deps,
      [sampleItem({ title: 'New Bedrock model', description: 'foo bar' })],
      'updates',
      [product],
    );
    const html = deps.document.getElementById('updates-body')?.innerHTML ?? '';
    expect(html).toContain('insights-tag');
    expect(html).toContain('Insights');
  });

  it('uses guid for stableId when present, falls back to link', () => {
    const deps = buildDeps();
    const product: Product = {
      id: 'p1',
      label: 'P',
      cssMod: 'p',
      match: () => 'always',
    };
    renderRssItems(
      deps,
      [
        sampleItem({ guid: '', link: 'https://example.com/no-guid' }),
        sampleItem({ guid: 'tag:example,2026:item-with-guid', link: 'https://other.com' }),
      ],
      'updates',
      [product],
    );
    const html = deps.document.getElementById('updates-body')?.innerHTML ?? '';
    expect(html).toContain('rss:https-example-com-no-guid');
    expect(html).toContain('rss:tag-example-2026-item-with-guid');
  });
});

describe('snippet', () => {
  it('decodes entities and strips Reddit boilerplate', () => {
    const raw =
      '<div><p>We&#39;re here​</p></div> ' +
      'submitted by <a href="...">/u/x</a> <a href="...">[link]</a> <a>[comments]</a>';
    expect(snippet(raw)).toBe("We're here");
  });

  it('decodes numeric, hex, and named entities', () => {
    expect(snippet('a&#32;b&#x26;c &amp; &quot;q&quot; &lt;t&gt; &nbsp;end')).toBe(
      'a b&c & "q" <t> end',
    );
  });

  it('strips zero-width chars and bare preview.redd.it URLs', () => {
    const raw = 'Cool build​ here https://preview.redd.it/abc123.png?width=640';
    expect(snippet(raw)).toBe('Cool build here');
  });

  it('leaves non-Reddit (Substack) bodies unchanged apart from tag-stripping', () => {
    const raw = '<p>A useful summary of the post.</p>';
    expect(snippet(raw)).toBe('A useful summary of the post.');
  });

  it('still truncates long decoded text with an ellipsis', () => {
    expect(snippet('x'.repeat(500))).toHaveLength(221);
    expect(snippet('x'.repeat(500)).endsWith('…')).toBe(true);
  });
});
