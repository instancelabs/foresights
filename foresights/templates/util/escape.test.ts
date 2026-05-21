import { describe, expect, it } from 'vitest';
import { escHtml } from './escape';

describe('escHtml', () => {
  it('escapes all five HTML special characters', () => {
    expect(escHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
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
});
