import { describe, expect, it } from 'vitest';
import { classifyFetchUrl } from './url-guard';

describe('classifyFetchUrl — allowed', () => {
  it.each([
    'https://example.com/feed.xml',
    'http://example.com/feed.xml',
    'https://blog.aws.amazon.com/posts.atom',
    'https://github.com/aws/aws-cdk/releases.atom',
    'https://feeds.feedburner.com/HighScalability',
  ])('accepts %s', (url) => {
    expect(classifyFetchUrl(url).safe).toBe(true);
  });
});

describe('classifyFetchUrl — rejected schemes', () => {
  it.each([
    ['javascript:alert(1)', /non-http/],
    ['data:text/plain,foo', /non-http/],
    ['file:///etc/passwd', /non-http/],
    ['ftp://example.com/feed.xml', /non-http/],
    ['gopher://example.com/feed', /non-http/],
  ])('rejects %s', (url, pattern) => {
    const r = classifyFetchUrl(url);
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(pattern);
  });
});

describe('classifyFetchUrl — rejected hosts (IPv4)', () => {
  it.each([
    ['http://localhost/admin', /loopback/],
    ['http://localhost:8080/admin', /loopback/],
    ['http://foo.localhost/x', /loopback/],
    ['http://127.0.0.1/x', /loopback.*127/],
    ['http://127.0.0.1:8080/x', /loopback.*127/],
    ['http://127.1.2.3/x', /loopback.*127/],
    ['http://169.254.169.254/latest/meta-data/', /link-local.*metadata/],
    ['http://10.0.0.1/x', /10.0.0.0\/8/],
    ['http://10.255.255.255/x', /10.0.0.0\/8/],
    ['http://172.16.0.1/x', /172.16.0.0\/12/],
    ['http://172.31.255.255/x', /172.16.0.0\/12/],
    ['http://192.168.1.1/x', /192.168.0.0\/16/],
    ['http://192.168.0.0/x', /192.168.0.0\/16/],
    ['http://0.0.0.0/x', /unspecified/],
  ])('rejects %s', (url, pattern) => {
    const r = classifyFetchUrl(url);
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(pattern);
  });
});

describe('classifyFetchUrl — accepted-IPv4 edge cases', () => {
  // Ensure RFC1918 boundaries don't over-match.
  it.each([
    'http://9.255.255.255/x', // just outside 10/8
    'http://11.0.0.1/x', // just outside 10/8
    'http://172.15.0.1/x', // just outside 172.16/12
    'http://172.32.0.1/x', // just outside 172.16/12
    'http://192.167.0.1/x', // just outside 192.168/16
    'http://192.169.0.1/x', // just outside 192.168/16
  ])('accepts public-IP boundary %s', (url) => {
    expect(classifyFetchUrl(url).safe).toBe(true);
  });
});

describe('classifyFetchUrl — rejected hosts (IPv6)', () => {
  it.each([
    ['http://[::1]/x', /loopback.*::1/],
    ['http://[fe80::1]/x', /link-local.*fe80/],
    ['http://[fe80::abcd:1234]/x', /link-local.*fe80/],
    ['http://[fc00::1]/x', /unique-local/],
    ['http://[fd12:3456::1]/x', /unique-local/],
    ['http://[::]/x', /unspecified/],
  ])('rejects %s', (url, pattern) => {
    const r = classifyFetchUrl(url);
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(pattern);
  });

  it('accepts public IPv6 (2001:db8::1 — documentation range, but not link-local)', () => {
    // This range is technically reserved for docs, but it's not on any of
    // our private allowlists, so it routes as "public" for the guard's
    // purposes. The point is the guard doesn't over-match `2001:...`.
    expect(classifyFetchUrl('http://[2001:db8::1]/x').safe).toBe(true);
  });
});

describe('classifyFetchUrl — unparseable', () => {
  it('rejects garbage', () => {
    expect(classifyFetchUrl('not a url').safe).toBe(false);
    expect(classifyFetchUrl('').safe).toBe(false);
  });
});
