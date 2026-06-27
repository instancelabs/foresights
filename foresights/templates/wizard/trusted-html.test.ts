import { describe, expect, it } from 'vitest';
import { validateAllTrustedHtml, validateTrustedHtml } from './trusted-html';

describe('validateTrustedHtml — allowed inputs', () => {
  it('accepts empty / null / undefined', () => {
    expect(() => validateTrustedHtml('f', '')).not.toThrow();
    expect(() => validateTrustedHtml('f', null)).not.toThrow();
    expect(() => validateTrustedHtml('f', undefined)).not.toThrow();
  });

  it('accepts plain text', () => {
    expect(() => validateTrustedHtml('f', 'Hello, world!')).not.toThrow();
  });

  it('accepts <code> spans', () => {
    expect(() => validateTrustedHtml('f', 'Use <code>npm test</code> to run tests.')).not.toThrow();
  });

  it('accepts <strong> / <em>', () => {
    expect(() =>
      validateTrustedHtml('f', '<strong>Bold</strong> and <em>italic</em>.'),
    ).not.toThrow();
  });

  it('accepts <span class="k|s|t|n|c">', () => {
    expect(() =>
      validateTrustedHtml(
        'f',
        '<span class="k">const</span> <span class="n">x</span> = <span class="s">"hi"</span>;',
      ),
    ).not.toThrow();
    expect(() =>
      validateTrustedHtml('f', '<span class="t">string</span> <span class="c">// note</span>'),
    ).not.toThrow();
  });

  it('accepts <br>, <br/>, <br />', () => {
    expect(() => validateTrustedHtml('f', 'one<br>two<br/>three<br />four')).not.toThrow();
  });

  it('accepts spans with single-quoted class', () => {
    expect(() => validateTrustedHtml('f', "<span class='k'>const</span>")).not.toThrow();
  });

  it('accepts a realistic syntax-highlighted spotlight code block', () => {
    const code =
      '<span class="k">const</span> <span class="n">app</span> = <span class="k">new</span> <span class="t">App</span>();' +
      '<span class="c">// init</span>' +
      '<span class="k">const</span> <span class="n">stack</span> = <span class="k">new</span> <span class="t">Stack</span>(<span class="n">app</span>, <span class="s">"MyStack"</span>);';
    expect(() => validateTrustedHtml('f', code)).not.toThrow();
  });
});

describe('validateTrustedHtml — rejected inputs', () => {
  it('rejects <script>', () => {
    expect(() => validateTrustedHtml('f', '<script>alert(1)</script>')).toThrowError(
      /script.*not in allowlist/,
    );
  });

  it('rejects <iframe>', () => {
    expect(() => validateTrustedHtml('f', '<iframe src="evil"></iframe>')).toThrowError(
      /iframe.*not in allowlist/,
    );
  });

  it('rejects <img onerror=...>', () => {
    expect(() => validateTrustedHtml('f', '<img src=x onerror=alert(1)>')).toThrowError(
      /img.*not in allowlist/,
    );
  });

  it('rejects <span onclick=...>', () => {
    expect(() => validateTrustedHtml('f', '<span onclick="alert(1)">x</span>')).toThrowError(
      /unsupported attributes/,
    );
  });

  it('rejects <span style=...>', () => {
    expect(() => validateTrustedHtml('f', '<span style="color:red">x</span>')).toThrowError(
      /unsupported attributes/,
    );
  });

  it('rejects <span class="bad-class">', () => {
    expect(() => validateTrustedHtml('f', '<span class="bad">x</span>')).toThrowError(
      /span class "bad" not in allowlist/,
    );
  });

  it('rejects <code class="foo">', () => {
    expect(() => validateTrustedHtml('f', '<code class="foo">x</code>')).toThrowError(
      /unsupported attributes/,
    );
  });

  it('rejects an unterminated <img …// (no closing >)', () => {
    // Bypass class: TAG_RE only matches a complete <...>, so this yields no
    // match — but spliced into `<pre …>…</pre>` the trailing </pre> supplies
    // the `>` and the tag fires. Must be rejected.
    expect(() => validateTrustedHtml('f', '<img src=x onerror=alert(1)//')).toThrowError(
      /unterminated "<"/,
    );
  });

  it('rejects a complete-tag prefix followed by an unterminated <', () => {
    expect(() => validateTrustedHtml('f', '<code>ok</code><img onerror=alert(1)//')).toThrowError(
      /unterminated "<"/,
    );
  });

  it('rejects a bare unterminated < after valid content', () => {
    expect(() => validateTrustedHtml('f', 'a < b')).toThrowError(/unterminated "<"/);
  });

  it('still accepts content whose every < is closed', () => {
    expect(() => validateTrustedHtml('f', '<code>a</code> then <em>b</em>')).not.toThrow();
  });

  it('includes the field name in the error message', () => {
    expect(() => validateTrustedHtml('spotlights[2].code', '<script>x</script>')).toThrowError(
      /spotlights\[2\]\.code/,
    );
  });

  it('throws on non-string values', () => {
    expect(() => validateTrustedHtml('f', 42 as unknown as string)).toThrowError(
      /must be a string/,
    );
  });
});

describe('validateAllTrustedHtml — config-level', () => {
  it('walks every spotlight + tip field', () => {
    expect(() =>
      validateAllTrustedHtml({
        spotlights: [
          {
            summary: 'safe',
            trick: '<code>ok</code>',
            code: '<span class="k">const</span> x = 1;',
            why: '<strong>important</strong>',
          },
        ],
        tips: [{ code: '<span class="s">"hello"</span>' }],
      }),
    ).not.toThrow();
  });

  it('flags an XSS in spotlight.code with the right field name', () => {
    expect(() =>
      validateAllTrustedHtml({
        spotlights: [
          { summary: 'ok', trick: 'ok', code: '<img src=x onerror=alert(1)>', why: 'ok' },
        ],
      }),
    ).toThrowError(/spotlights\[0\]\.code/);
  });

  it('flags an XSS in tips[].code with the right field name', () => {
    expect(() =>
      validateAllTrustedHtml({
        tips: [{ code: 'ok' }, { code: '<script>x</script>' }],
      }),
    ).toThrowError(/tips\[1\]\.code/);
  });

  it('accepts empty spotlights / tips arrays', () => {
    expect(() => validateAllTrustedHtml({})).not.toThrow();
    expect(() => validateAllTrustedHtml({ spotlights: [], tips: [] })).not.toThrow();
  });
});
