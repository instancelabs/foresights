import { describe, expect, it } from 'vitest';
import { escHtml, safeHref, safeUrl } from './escape';

describe('escHtml', () => {
  it('escapes all six HTML special characters (incl. backtick)', () => {
    expect(escHtml('&<>"\'`')).toBe('&amp;&lt;&gt;&quot;&#39;&#96;');
  });

  it('returns empty string for null', () => {
    expect(escHtml(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(escHtml(undefined)).toBe('');
  });

  it('coerces non-string values to strings before escaping', () => {
    expect(escHtml(42)).toBe('42');
    expect(escHtml(true)).toBe('true');
  });

  it('leaves safe text unchanged', () => {
    expect(escHtml('Hello, world!')).toBe('Hello, world!');
  });

  it('escapes mixed safe and unsafe characters', () => {
    expect(escHtml('foo <script>alert("x")</script>')).toBe(
      'foo &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it('handles repeated special characters', () => {
    expect(escHtml('&&&')).toBe('&amp;&amp;&amp;');
  });

  it('escapes characters embedded in object toString output', () => {
    const obj = {
      toString: () => '<bad>',
    };
    expect(escHtml(obj)).toBe('&lt;bad&gt;');
  });

  it('escapes backtick to prevent template-literal-context bleed', () => {
    expect(escHtml('foo`bar')).toBe('foo&#96;bar');
  });
});

describe('safeHref', () => {
  it('allows http URLs', () => {
    expect(safeHref('http://example.com/path')).toBe('http://example.com/path');
  });

  it('allows https URLs', () => {
    expect(safeHref('https://example.com/path?q=1#frag')).toBe('https://example.com/path?q=1#frag');
  });

  it('allows mailto URLs', () => {
    expect(safeHref('mailto:hi@example.com')).toBe('mailto:hi@example.com');
  });

  it('allows anchor-only URLs', () => {
    expect(safeHref('#section-2')).toBe('#section-2');
  });

  it('allows relative paths', () => {
    expect(safeHref('/docs/page.html')).toBe('/docs/page.html');
  });

  it('rejects javascript: URLs', () => {
    expect(safeHref('javascript:alert(1)')).toBe('#');
  });

  it('rejects case-variant javascript: URLs', () => {
    expect(safeHref('JaVaScRiPt:alert(1)')).toBe('#');
    expect(safeHref('JAVASCRIPT:alert(1)')).toBe('#');
  });

  it('rejects javascript: URLs with leading whitespace', () => {
    expect(safeHref('   javascript:alert(1)')).toBe('#');
    expect(safeHref('\tjavascript:alert(1)')).toBe('#');
    expect(safeHref('\njavascript:alert(1)')).toBe('#');
  });

  it('rejects data: URLs', () => {
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBe('#');
  });

  it('rejects vbscript: URLs', () => {
    expect(safeHref('vbscript:msgbox(1)')).toBe('#');
  });

  it('rejects file: URLs', () => {
    expect(safeHref('file:///etc/passwd')).toBe('#');
  });

  it('rejects null / undefined / non-string inputs', () => {
    expect(safeHref(null)).toBe('#');
    expect(safeHref(undefined)).toBe('#');
    expect(safeHref(42)).toBe('#');
    expect(safeHref({})).toBe('#');
  });

  it('rejects empty + whitespace-only strings', () => {
    expect(safeHref('')).toBe('#');
    expect(safeHref('   ')).toBe('#');
  });

  it('escapes HTML metacharacters in allowed URLs', () => {
    expect(safeHref('https://example.com/?q=<x>&y="z"')).toBe(
      'https://example.com/?q=&lt;x&gt;&amp;y=&quot;z&quot;',
    );
  });

  it('preserves case in the path of allowed URLs', () => {
    expect(safeHref('https://Example.COM/PathWithCase')).toBe('https://Example.COM/PathWithCase');
  });
});

describe('safeUrl', () => {
  it('returns the original URL (un-escaped) for allowed schemes', () => {
    expect(safeUrl('https://example.com/?q=<x>&y="z"')).toBe('https://example.com/?q=<x>&y="z"');
  });

  it('returns "#" for javascript:', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('#');
    expect(safeUrl('   JaVaScRiPt:alert(1)')).toBe('#');
  });

  it('returns "#" for data:', () => {
    expect(safeUrl('data:text/plain,foo')).toBe('#');
  });

  it('returns "#" for null / empty', () => {
    expect(safeUrl(null)).toBe('#');
    expect(safeUrl('')).toBe('#');
    expect(safeUrl('   ')).toBe('#');
  });

  it('allows anchor + relative URLs verbatim', () => {
    expect(safeUrl('#frag')).toBe('#frag');
    expect(safeUrl('/path')).toBe('/path');
  });
});
