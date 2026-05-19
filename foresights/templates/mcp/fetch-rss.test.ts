import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { fetchRss } from './fetch-rss';

// Build a minimal Deps['window'] shape using JSDOM so DOMParser is real but
// fetch is a vi.fn we can control per-test.
const makeWindowStub = (fetchImpl: typeof fetch) => {
  const dom = new JSDOM();
  return {
    fetch: fetchImpl,
    DOMParser: dom.window.DOMParser,
  } as unknown as Window;
};

const sampleFeed = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>x</title>
<item><title>One</title><link>https://example.com/1</link><description>A</description><pubDate>Wed, 14 May 2026 09:00:00 GMT</pubDate></item>
</channel></rss>`;

describe('fetchRss', () => {
  it('returns parsed items when fetch + parse succeed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(sampleFeed, {
        status: 200,
        headers: { 'content-type': 'application/rss+xml' },
      }),
    );
    const window = makeWindowStub(fetchMock);
    const items = await fetchRss({ window }, 'https://example.com/feed');
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('One');
  });

  it('passes a sensible Accept header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(sampleFeed, { status: 200 }));
    const window = makeWindowStub(fetchMock);
    await fetchRss({ window }, 'https://example.com/feed');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/feed',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: expect.stringContaining('application/rss+xml'),
        }),
      }),
    );
  });

  it('returns [] on network failure (TypeError from CORS / DNS)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const window = makeWindowStub(fetchMock);
    const items = await fetchRss({ window }, 'https://example.com/feed');
    expect(items).toEqual([]);
  });

  it('returns [] on HTTP 404 / 500', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }));
    const window = makeWindowStub(fetchMock);
    const items = await fetchRss({ window }, 'https://example.com/feed');
    expect(items).toEqual([]);
  });

  it('returns [] when body cannot be read', async () => {
    // Construct a Response whose .text() rejects.
    const bad = {
      ok: true,
      text: () => Promise.reject(new Error('aborted')),
    } as unknown as Response;
    const fetchMock = vi.fn().mockResolvedValue(bad);
    const window = makeWindowStub(fetchMock);
    const items = await fetchRss({ window }, 'https://example.com/feed');
    expect(items).toEqual([]);
  });

  it('returns [] when body is not a valid feed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('<html><body>not a feed</body></html>', { status: 200 }));
    const window = makeWindowStub(fetchMock);
    const items = await fetchRss({ window }, 'https://example.com/feed');
    expect(items).toEqual([]);
  });
});
