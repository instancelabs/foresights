import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { parseRss } from './rss-parser';

// Build a DOMParser via JSDOM. The shape matches the browser DOMParser
// closely enough for the parser's needs.
const makeParser = (): DOMParser => new new JSDOM().window.DOMParser();

describe('parseRss — RSS 2.0', () => {
  const sampleRss = `<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <title>Sample Blog</title>
        <link>https://example.com</link>
        <item>
          <title>First post</title>
          <link>https://example.com/first</link>
          <description>A useful thing.</description>
          <pubDate>Wed, 14 May 2026 09:00:00 GMT</pubDate>
          <author>jane@example.com (Jane)</author>
          <guid>https://example.com/first#1</guid>
        </item>
        <item>
          <title>Second post</title>
          <link>https://example.com/second</link>
          <description>Another thing.</description>
          <pubDate>Wed, 15 May 2026 10:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

  it('extracts both items in document order', () => {
    const items = parseRss(sampleRss, makeParser());
    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe('First post');
    expect(items[1]?.title).toBe('Second post');
  });

  it('extracts link, description, and pubDate', () => {
    const items = parseRss(sampleRss, makeParser());
    expect(items[0]?.link).toBe('https://example.com/first');
    expect(items[0]?.description).toBe('A useful thing.');
    expect(items[0]?.pubDate).toMatch(/^2026-05-14T09:00:00/);
  });

  it('falls back to link when guid is absent', () => {
    const items = parseRss(sampleRss, makeParser());
    expect(items[1]?.guid).toBe('https://example.com/second');
  });

  it('uses explicit guid when present', () => {
    const items = parseRss(sampleRss, makeParser());
    expect(items[0]?.guid).toBe('https://example.com/first#1');
  });

  it('extracts author when present, empty string when absent', () => {
    const items = parseRss(sampleRss, makeParser());
    expect(items[0]?.author).toBe('jane@example.com (Jane)');
    expect(items[1]?.author).toBe('');
  });
});

describe('parseRss — Atom 1.0', () => {
  const sampleAtom = `<?xml version="1.0" encoding="utf-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Sample Atom Feed</title>
      <link href="https://example.com" rel="self"/>
      <entry>
        <title>Atom entry one</title>
        <link href="https://example.com/atom-one" rel="alternate"/>
        <link href="https://example.com/atom-one.json" rel="self"/>
        <id>tag:example.com,2026:atom-one</id>
        <published>2026-05-14T09:00:00Z</published>
        <updated>2026-05-15T10:00:00Z</updated>
        <author><name>Atom Author</name></author>
        <summary>Atom summary text.</summary>
      </entry>
    </feed>`;

  it('extracts entries', () => {
    const items = parseRss(sampleAtom, makeParser());
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('Atom entry one');
  });

  it('prefers rel="alternate" link over rel="self"', () => {
    const items = parseRss(sampleAtom, makeParser());
    expect(items[0]?.link).toBe('https://example.com/atom-one');
  });

  it('extracts author name from <author><name>', () => {
    const items = parseRss(sampleAtom, makeParser());
    expect(items[0]?.author).toBe('Atom Author');
  });

  it('uses <id> as guid', () => {
    const items = parseRss(sampleAtom, makeParser());
    expect(items[0]?.guid).toBe('tag:example.com,2026:atom-one');
  });

  it('prefers <published> over <updated> for pubDate', () => {
    const items = parseRss(sampleAtom, makeParser());
    expect(items[0]?.pubDate).toMatch(/^2026-05-14T09:00:00/);
  });

  it('uses <summary> as description, falls back to <content>', () => {
    const items = parseRss(sampleAtom, makeParser());
    expect(items[0]?.description).toBe('Atom summary text.');
  });
});

describe('parseRss — robustness', () => {
  it('returns [] for empty string input', () => {
    expect(parseRss('', makeParser())).toEqual([]);
  });

  it('returns [] for clearly-non-feed XML', () => {
    expect(parseRss('<html><body><p>not a feed</p></body></html>', makeParser())).toEqual([]);
  });

  it('returns [] for malformed XML (parsererror)', () => {
    expect(parseRss('<rss><channel><item></rss>', makeParser())).toEqual([]);
  });

  it('returns [] for an RSS feed with an empty channel', () => {
    const xml = '<rss version="2.0"><channel><title>x</title></channel></rss>';
    expect(parseRss(xml, makeParser())).toEqual([]);
  });

  it('handles items with all fields missing — returns empty-string defaults', () => {
    const xml = '<rss version="2.0"><channel><item></item></channel></rss>';
    const items = parseRss(xml, makeParser());
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      title: '',
      link: '',
      description: '',
      pubDate: '',
      author: '',
      guid: '',
    });
  });
});
