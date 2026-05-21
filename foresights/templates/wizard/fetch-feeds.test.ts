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
    const out = await hydrateRssSources([gh], stubFetch);
    expect(out[0]).toBe(gh);
  });

  it('populates items for an rss source that has none', async () => {
    const out = await hydrateRssSources([rss], stubFetch);
    expect(out[0]?.items).toEqual(stubItems);
  });

  it('leaves an rss source that already carries items', async () => {
    const prebaked: WizardSource = { ...rss, items: stubItems };
    const out = await hydrateRssSources([prebaked], failFetch);
    expect(out[0]).toBe(prebaked);
  });

  it('skips an rss source with no url', async () => {
    const noUrl: WizardSource = { id: 'feed', label: 'Example', kind: 'rss' };
    const out = await hydrateRssSources([noUrl], failFetch);
    expect(out[0]).toBe(noUrl);
  });

  it('does not mutate the input sources', async () => {
    const input: readonly WizardSource[] = [rss];
    await hydrateRssSources(input, stubFetch);
    expect(input[0]?.items).toBeUndefined();
  });

  it('hydrates several feeds in one pass', async () => {
    const out = await hydrateRssSources([rss, { ...rss, id: 'feed2' }, gh], stubFetch);
    expect(out[0]?.items).toEqual(stubItems);
    expect(out[1]?.items).toEqual(stubItems);
    expect(out[2]).toBe(gh);
  });
});
