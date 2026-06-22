import { describe, expect, it } from 'vitest';
import {
  validateChrome,
  validateHeaderSourcesLinks,
  validateProductChrome,
} from './validate-chrome';

describe('validateProductChrome — colours', () => {
  it('accepts hex / named / functional colours', () => {
    expect(() =>
      validateProductChrome({
        accent: '#0af',
        accentSoft: '#00aaff80',
        products: [
          {
            id: 'cdki',
            cssMod: 'cdki',
            badgeColor: 'rebeccapurple',
            badgeColorSoft: 'rgba(10, 20, 30, 0.5)',
            badgeBorderColor: 'hsl(210 50% 40%)',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects a CSS-breakout colour value', () => {
    expect(() => validateProductChrome({ accent: 'red} body{display:none} .x{color:red' })).toThrow(
      /accent.*safe CSS colour/,
    );
  });

  it('rejects a </style> breakout in a badge colour', () => {
    expect(() =>
      validateProductChrome({
        products: [{ id: 'p', cssMod: '', badgeColor: '#fff</style><script>alert(1)</script>' }],
      }),
    ).toThrow(/badgeColor/);
  });
});

describe('validateProductChrome — id / cssMod', () => {
  it('accepts safe id + cssMod (empty cssMod allowed)', () => {
    expect(() =>
      validateProductChrome({ products: [{ id: 'last-command_2', cssMod: '' }] }),
    ).not.toThrow();
  });

  it('rejects an attribute-breakout id', () => {
    expect(() =>
      validateProductChrome({ products: [{ id: 'x" onmouseover="alert(1)', cssMod: '' }] }),
    ).toThrow(/products\[0\]\.id/);
  });

  it('rejects a selector-breakout cssMod', () => {
    expect(() => validateProductChrome({ products: [{ id: 'p', cssMod: 'x}body{}' }] })).toThrow(
      /cssMod/,
    );
  });
});

describe('validateHeaderSourcesLinks', () => {
  it('accepts plain text and safe anchor links', () => {
    expect(() =>
      validateHeaderSourcesLinks(
        '<a href="https://github.com/aws/aws-cdk" target="_blank" rel="noopener">aws-cdk</a>, <a href="/local">local</a> · plain text',
      ),
    ).not.toThrow();
  });

  it('accepts empty / undefined', () => {
    expect(() => validateHeaderSourcesLinks('')).not.toThrow();
    expect(() => validateHeaderSourcesLinks(undefined)).not.toThrow();
  });

  it('rejects a <script> tag', () => {
    expect(() => validateHeaderSourcesLinks('hi <script>alert(1)</script>')).toThrow(/script/);
  });

  it('rejects an <img onerror> tag', () => {
    expect(() => validateHeaderSourcesLinks('<img src=x onerror=alert(1)>')).toThrow(/not allowed/);
  });

  it('rejects an anchor with an event handler', () => {
    expect(() =>
      validateHeaderSourcesLinks('<a href="https://x" onclick="alert(1)">x</a>'),
    ).toThrow(/unsupported attribute/);
  });

  it('accepts relative / anchor hrefs (no scheme)', () => {
    for (const href of ['x', 'page.html', '/local', './a', '#frag', '//cdn.example.com/a']) {
      expect(() => validateHeaderSourcesLinks(`<a href="${href}">link</a>`)).not.toThrow();
    }
  });

  it('rejects a javascript: href', () => {
    expect(() => validateHeaderSourcesLinks('<a href="javascript:alert(1)">x</a>')).toThrow(
      /disallowed scheme/,
    );
  });

  it('rejects dangerous schemes including a whitespace-smuggled one', () => {
    expect(() => validateHeaderSourcesLinks('<a href="data:text/html,x">x</a>')).toThrow(
      /disallowed scheme/,
    );
    // Browsers strip the tab before reading the scheme → still javascript:.
    expect(() => validateHeaderSourcesLinks('<a href="java\tscript:alert(1)">x</a>')).toThrow(
      /disallowed scheme/,
    );
  });
});

describe('validateChrome — composite', () => {
  it('runs product + header validation together', () => {
    expect(() =>
      validateChrome({
        accent: '#fff',
        products: [{ id: 'p', cssMod: 'p', badgeColor: '#000' }],
        headerSourcesLinks: '<a href="https://example.com">x</a>',
      }),
    ).not.toThrow();
    expect(() => validateChrome({ headerSourcesLinks: '<iframe></iframe>' })).toThrow();
  });
});
