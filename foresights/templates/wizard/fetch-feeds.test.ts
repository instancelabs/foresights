import { describe, expect, it } from 'vitest';
import type { RssItem } from '../types';
import type { WizardSource } from './build-config';
import { type FetchLike, MAX_ITEMS_PER_FEED, fetchFeed, hydrateRssSources } from './fetch-feeds';

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example feed</title>
    <item>
      <title>First post</title>
      <link>https://example.com/1</link>
      <description>The first one.</description>
      <pubDate>Wed, 01 Apr 2026 12:00:00 GMT</pubDate>
      <guid>https://example.com/1</guid>
    </item>
    <item>
      <title>Second post</title>
      <link>https://example.com/2</link>
      <description>The second one.</description>
      <pubDate>Thu, 02 Apr 2026 12:00:00 GMT</pubDate>
      <guid>https://example.com/2</guid>
    </item>
  </channel>
</rss>`;

/** A FetchLike that always succeeds with the given body. */
const okWith =
  (body: string): FetchLike =>
  async () => ({ ok: true, text: async () => body });

describe('fetchFeed', () => {
  it('fetches and parses an RSS feed into RssItems', async () => {
    const items = await fetchFeed('https://example.com/feed', okWith(RSS_XML));
    expect(items.map((i) => i.title)).toEqual(['First post', 'Second post']);
    expect(items[0]?.link).toBe('https://example.com/1');
  });

  it('caps the result at MAX_ITEMS_PER_FEED', async () => {
    const entries = Array.from(
      { length: MAX_ITEMS_PER_FEED + 15 },
      (_, i) => `<item><title>post ${i}</title><link>https://example.com/${i}</link></item>`,
    ).join('');
    const big = `<?xml version="1.0"?><rss version="2.0"><channel>${entries}</channel></rss>`;
    const items = await fetchFeed('u', okWith(big));
    expect(items).toHaveLength(MAX_ITEMS_PER_FEED);
  });

  it('returns [] on a non-ok response', async () => {
    const items = await fetchFeed('u', async () => ({ ok: false, text: async () => '' }));
    expect(items).toEqual([]);
  });

  it('returns [] when the fetch rejects', async () => {
    const items = await fetchFeed('u', async () => {
      throw new Error('network down');
    });
    expect(items).toEqual([]);
  });

  it('returns [] for content that is not a feed', async () => {
    const items = await fetchFeed('u', okWith('<html><body>not a feed</body></html>'));
    expect(items).toEqual([]);
  });
});

describe('hydrateRssSources', () => {
  const gh: WizardSource = {
    id: 'gh',
    label: 'aws/aws-cdk',
    kind: 'releases',
    owner: 'aws',
    repo: 'aws-cdk',
  };
  const rss: WizardSource = {
    id: 'feed',
    label: 'Example',
    kind: 'rss',
    url: 'https://example.com/feed',
  };
  const stubItems: readonly RssItem[] = [
    { title: 'X', link: 'https://e/x', description: 'd', pubDate: '', author: '', guid: 'g' },
  ];
  const stubFetch = async (): Promise<readonly RssItem[]> => stubItems;
  const failFetch = async (): Promise<readonly RssItem[]> => {
    throw new Error('fetch should not have been called');
  };

  it('leaves non-rss sources untouched', async () => {
    const { sources } = await hydrateRssSources([gh], stubFetch);
    expect(sources[0]).toBe(gh);
  });

  it('populates items for an rss source that has none', async () => {
    const { sources, warnings } = await hydrateRssSources([rss], stubFetch);
    expect(sources[0]?.items).toEqual(stubItems);
    expect(warnings).toEqual([]);
  });

  it('leaves an rss source that already carries items', async () => {
    const prebaked: WizardSource = { ...rss, items: stubItems };
    const { sources, warnings } = await hydrateRssSources([prebaked], failFetch);
    expect(sources[0]).toBe(prebaked);
    expect(warnings).toEqual([]);
  });

  it('skips an rss source with no url', async () => {
    const noUrl: WizardSource = { id: 'feed', label: 'Example', kind: 'rss' };
    const { sources } = await hydrateRssSources([noUrl], failFetch);
    expect(sources[0]).toBe(noUrl);
  });

  it('does not mutate the input sources', async () => {
    const input: readonly WizardSource[] = [rss];
    await hydrateRssSources(input, stubFetch);
    expect(input[0]?.items).toBeUndefined();
  });

  it('hydrates several feeds in one pass', async () => {
    const { sources } = await hydrateRssSources([rss, { ...rss, id: 'feed2' }, gh], stubFetch);
    expect(sources[0]?.items).toEqual(stubItems);
    expect(sources[1]?.items).toEqual(stubItems);
    expect(sources[2]).toBe(gh);
  });

  it('short-circuits — never calls fetchFeed when no rss source exists', async () => {
    // failFetch throws if called; if the short-circuit works, it isn't called.
    await expect(hydrateRssSources([gh], failFetch)).resolves.toMatchObject({ warnings: [] });
  });

  it('returns the input array reference unchanged on the short-circuit path', async () => {
    // Identity check: no rss sources → the function does zero work and hands
    // back the very same array. This is what guarantees no jsdom import.
    const input: readonly WizardSource[] = [gh, { ...gh, id: 'gh2' }];
    const { sources, warnings } = await hydrateRssSources(input, failFetch);
    expect(sources).toBe(input);
    expect(warnings).toEqual([]);
  });

  it('short-circuits even with an empty sources array', async () => {
    const input: readonly WizardSource[] = [];
    const { sources, warnings } = await hydrateRssSources(input, failFetch);
    expect(sources).toBe(input);
    expect(warnings).toEqual([]);
  });

  // v0.9.1 — zero-item fetches surface as structured warnings.
  it('emits a zero-items warning when an RSS feed fetches empty', async () => {
    const emptyFetch = async (): Promise<readonly RssItem[]> => [];
    const { sources, warnings } = await hydrateRssSources([rss], emptyFetch);
    expect(sources[0]?.items).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^zero-items: rss source "feed"/);
    expect(warnings[0]).toContain('https://example.com/feed');
    expect(warnings[0]).toContain('WebFetch');
    expect(warnings[0]).toContain('/foresights-doctor');
  });

  it('emits one warning per zero-item RSS source, no warnings for the populated ones', async () => {
    // Each source gets a distinct URL so the fetch impl can dispatch by URL.
    const r1: WizardSource = { ...rss, id: 'feed1', url: 'https://e/feed1' };
    const r2: WizardSource = { ...rss, id: 'feed2', url: 'https://e/feed2' };
    const r3: WizardSource = { ...rss, id: 'feed3', url: 'https://e/feed3' };
    const { warnings } = await hydrateRssSources([r1, r2, r3, gh], async (url) =>
      url.endsWith('/feed2') ? stubItems : [],
    );
    expect(warnings).toHaveLength(2);
    expect(warnings.every((w) => w.startsWith('zero-items:'))).toBe(true);
    expect(warnings.some((w) => w.includes('"feed1"'))).toBe(true);
    expect(warnings.some((w) => w.includes('"feed3"'))).toBe(true);
    expect(warnings.some((w) => w.includes('"feed2"'))).toBe(false);
  });

  it('does not warn for pre-populated sources (the restricted-environment path)', async () => {
    // A caller that pre-populated items via WebFetch bypasses the fetch and
    // shouldn't trigger a warning — its items came from a working code path.
    const prebaked: WizardSource = { ...rss, items: stubItems };
    const { warnings } = await hydrateRssSources([prebaked], failFetch);
    expect(warnings).toEqual([]);
  });

  it('does not warn for url-less rss sources (they were already broken)', async () => {
    const noUrl: WizardSource = { id: 'feed', label: 'Example', kind: 'rss' };
    const { warnings } = await hydrateRssSources([noUrl], failFetch);
    expect(warnings).toEqual([]);
  });
});
