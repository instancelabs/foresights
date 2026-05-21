import { describe, expect, it } from 'vitest';
import {
  findPlaceholders,
  findSentinels,
  substituteAll,
  substitutePlaceholders,
  substituteSentinels,
} from './substitute';

const wrap = (form: 'html' | 'ts' | 'css', name: string, body: string): string => {
  switch (form) {
    case 'html':
      return `<!-- FORESIGHTS_START:${name} -->${body}<!-- FORESIGHTS_END:${name} -->`;
    case 'ts':
      return `// FORESIGHTS_START:${name}\n${body}// FORESIGHTS_END:${name}\n`;
    case 'css':
      return `/* FORESIGHTS_START:${name} */${body}/* FORESIGHTS_END:${name} */`;
  }
};

describe('findSentinels', () => {
  it('returns [] when no sentinels are present', () => {
    expect(findSentinels('plain text with no markers')).toEqual([]);
  });

  it('finds a single HTML sentinel', () => {
    expect(findSentinels(wrap('html', 'FOO', 'body'))).toEqual(['FOO']);
  });

  it('finds a single TS sentinel', () => {
    expect(findSentinels(wrap('ts', 'BAR', 'body'))).toEqual(['BAR']);
  });

  it('finds a single CSS sentinel', () => {
    expect(findSentinels(wrap('css', 'BAZ', 'body'))).toEqual(['BAZ']);
  });

  it('finds multiple sentinels in encounter order', () => {
    const input = wrap('html', 'A', 'a') + wrap('html', 'B', 'b') + wrap('ts', 'C', 'c');
    expect(findSentinels(input)).toEqual(['A', 'B', 'C']);
  });

  it('de-duplicates repeated sentinel names', () => {
    const input = wrap('html', 'X', '1') + wrap('html', 'X', '2');
    // A sentinel that's repeated doesn't make sense semantically, but we
    // still de-dup the names for introspection.
    expect(findSentinels(input)).toEqual(['X']);
  });

  it('handles namespaced names with colons', () => {
    expect(findSentinels(wrap('ts', 'PRODUCTS_CONFIG:RULES', 'x'))).toEqual([
      'PRODUCTS_CONFIG:RULES',
    ]);
  });
});

describe('findPlaceholders', () => {
  it('finds {{NAME}} tokens', () => {
    expect(findPlaceholders('Hello {{TOPIC}}, welcome to {{TAGLINE_SUB}}')).toEqual([
      'TOPIC',
      'TAGLINE_SUB',
    ]);
  });

  it('de-duplicates repeated placeholder names', () => {
    expect(findPlaceholders('{{X}} and {{X}} again')).toEqual(['X']);
  });

  it('does NOT match non-UPPER_SNAKE_CASE tokens', () => {
    expect(findPlaceholders('{{lowercase}} {{Mixed_Case}} {{123}}')).toEqual([]);
  });

  it('does NOT match unclosed braces', () => {
    expect(findPlaceholders('{{UNCLOSED')).toEqual([]);
    expect(findPlaceholders('UNOPENED}}')).toEqual([]);
  });
});

describe('substituteSentinels — replacement', () => {
  it('replaces HTML sentinel body with mapped content', () => {
    const out = substituteSentinels(wrap('html', 'FOO', 'old'), { FOO: 'NEW' });
    expect(out).toBe('<!-- FORESIGHTS_START:FOO -->NEW<!-- FORESIGHTS_END:FOO -->');
  });

  it('replaces TS sentinel body', () => {
    const out = substituteSentinels(wrap('ts', 'BAR', 'old\n'), { BAR: 'NEW_TS_CODE\n' });
    expect(out).toContain('NEW_TS_CODE');
    expect(out).not.toContain('old\n// FORESIGHTS_END');
  });

  it('replaces CSS sentinel body', () => {
    const out = substituteSentinels(wrap('css', 'BAZ', 'old'), { BAZ: '.foo { color: red; }' });
    expect(out).toContain('.foo { color: red; }');
  });

  it('preserves the marker comments around the replaced body', () => {
    const out = substituteSentinels(wrap('html', 'FOO', 'old'), { FOO: 'NEW' });
    expect(out).toContain('FORESIGHTS_START:FOO');
    expect(out).toContain('FORESIGHTS_END:FOO');
  });

  it('handles a namespaced sentinel name', () => {
    const out = substituteSentinels(wrap('ts', 'PRODUCTS_CONFIG:RULES', 'old\n'), {
      'PRODUCTS_CONFIG:RULES': 'export const RULES = {};\n',
    });
    expect(out).toContain('export const RULES = {};');
  });

  it('replaces multiple sentinels in one pass', () => {
    const input = `${wrap('html', 'A', 'a-old')} middle ${wrap('html', 'B', 'b-old')}`;
    const out = substituteSentinels(input, { A: 'a-new', B: 'b-new' });
    expect(out).toContain('a-new');
    expect(out).toContain('b-new');
    expect(out).toContain(' middle ');
    expect(out).not.toContain('a-old');
    expect(out).not.toContain('b-old');
  });

  it('is order-independent in the map (multi-replace one pass)', () => {
    const input = wrap('html', 'A', 'x') + wrap('html', 'B', 'y');
    const out1 = substituteSentinels(input, { A: '1', B: '2' });
    const out2 = substituteSentinels(input, { B: '2', A: '1' });
    expect(out1).toBe(out2);
  });

  it('handles multi-line replacement bodies', () => {
    const replacement = 'line1\nline2\nline3';
    const out = substituteSentinels(wrap('html', 'FOO', 'one-line'), { FOO: replacement });
    expect(out).toContain('line1\nline2\nline3');
  });
});

describe('substituteSentinels — unknowns', () => {
  it('leaves an unknown sentinel unchanged by default', () => {
    const input = wrap('html', 'KNOWN', 'k') + wrap('html', 'UNKNOWN', 'u');
    const out = substituteSentinels(input, { KNOWN: 'replaced' });
    expect(out).toContain('replaced');
    expect(out).toContain(wrap('html', 'UNKNOWN', 'u'));
  });

  it('throws on an unknown sentinel in strict mode', () => {
    expect(() => substituteSentinels(wrap('html', 'UNKNOWN', 'u'), {}, { strict: true })).toThrow(
      /missing content for "UNKNOWN"/,
    );
  });

  it('does NOT throw on an unknown sentinel when strict is false', () => {
    expect(() => substituteSentinels(wrap('html', 'UNKNOWN', 'u'), {})).not.toThrow();
  });

  it('ignores stray FORESIGHTS_START with no matching END', () => {
    const input = '<!-- FORESIGHTS_START:DANGLING -->\nstuff but no end';
    const out = substituteSentinels(input, { DANGLING: 'replaced' });
    // No closing marker → no match → leave it alone.
    expect(out).toBe(input);
  });
});

describe('substituteSentinels — edge cases', () => {
  it('does not double-substitute when replacement contains FORESIGHTS markers', () => {
    // If a user passes a replacement that itself contains FORESIGHTS_START,
    // we don't re-process (single regex pass per call).
    const replacement = '<!-- FORESIGHTS_START:NESTED --><!-- FORESIGHTS_END:NESTED -->';
    const out = substituteSentinels(wrap('html', 'OUTER', 'x'), { OUTER: replacement });
    expect(out).toContain('FORESIGHTS_START:NESTED');
    // The outer markers are still there too.
    expect(out).toContain('FORESIGHTS_START:OUTER');
  });

  it('matches non-greedily when two sentinels are adjacent', () => {
    const input = wrap('html', 'A', 'one') + wrap('html', 'A', 'two');
    // Adjacent sentinels with the same name — the regex back-reference to
    // group 2 (the name) plus non-greedy body means each START pairs with
    // the NEXT END of the same name.
    const out = substituteSentinels(input, { A: 'NEW' });
    // Both should be replaced.
    expect((out.match(/NEW/g) ?? []).length).toBe(2);
  });

  it('is idempotent: re-applying the same substitution does not change the result', () => {
    const once = substituteSentinels(wrap('html', 'FOO', 'old'), { FOO: 'NEW' });
    const twice = substituteSentinels(once, { FOO: 'NEW' });
    expect(twice).toBe(once);
  });

  it('preserves marker form when mixing — opener and closer can differ', () => {
    // Synthetic edge case: opener is CSS-form, closer is HTML-form. Real
    // templates never do this, but the regex allows it for robustness.
    const input = '/* FORESIGHTS_START:M */body<!-- FORESIGHTS_END:M -->';
    const out = substituteSentinels(input, { M: 'X' });
    expect(out).toContain('/* FORESIGHTS_START:M */');
    expect(out).toContain('X');
    expect(out).toContain('<!-- FORESIGHTS_END:M -->');
  });
});

describe('substitutePlaceholders', () => {
  it('replaces a single placeholder', () => {
    expect(substitutePlaceholders('hello {{NAME}}', { NAME: 'world' })).toBe('hello world');
  });

  it('replaces multiple placeholders', () => {
    expect(substitutePlaceholders('{{A}} + {{B}} = {{C}}', { A: '1', B: '2', C: '3' })).toBe(
      '1 + 2 = 3',
    );
  });

  it('replaces repeated occurrences of the same placeholder', () => {
    expect(substitutePlaceholders('{{X}} and {{X}}', { X: 'foo' })).toBe('foo and foo');
  });

  it('passes through values containing $ regex specials without expansion', () => {
    // String.prototype.replace's $1/$&/etc. should NOT activate here.
    expect(substitutePlaceholders('{{X}}', { X: '$1 $& $`' })).toBe('$1 $& $`');
  });

  it('leaves unknown placeholders unchanged by default', () => {
    expect(substitutePlaceholders('hi {{UNKNOWN}}', {})).toBe('hi {{UNKNOWN}}');
  });

  it('throws on unknown placeholders in strict mode', () => {
    expect(() => substitutePlaceholders('{{UNKNOWN}}', {}, { strict: true })).toThrow(
      /missing value for "UNKNOWN"/,
    );
  });

  it('does NOT match lowercase or mixed-case tokens', () => {
    expect(substitutePlaceholders('{{lower}} {{MixedCase}}', { lower: 'x', MixedCase: 'y' })).toBe(
      '{{lower}} {{MixedCase}}',
    );
  });
});

describe('substituteAll', () => {
  it('applies sentinels first, then placeholders', () => {
    const input = wrap('html', 'SECTION', 'static {{TOPIC}} hello');
    // SECTION's body is replaced; TOPIC placeholder is then expanded inside.
    const out = substituteAll(input, { SECTION: 'fresh {{TOPIC}} content' }, { TOPIC: 'CDK' });
    expect(out).toContain('fresh CDK content');
  });

  it('expands placeholders that exist outside any sentinel', () => {
    const out = substituteAll('hello {{NAME}}', {}, { NAME: 'world' });
    expect(out).toBe('hello world');
  });

  it('does NOT match sentinel-shaped strings inside a placeholder value', () => {
    // If a placeholder's VALUE contains FORESIGHTS markers, those don't get
    // re-substituted (sentinels are applied before placeholders).
    const out = substituteAll(
      'hi {{X}}',
      {},
      { X: '<!-- FORESIGHTS_START:Y -->body<!-- FORESIGHTS_END:Y -->' },
    );
    expect(out).toContain('FORESIGHTS_START:Y');
  });

  it('strict mode flows through to both passes', () => {
    expect(() => substituteAll(wrap('html', 'UNKNOWN', 'x'), {}, {}, { strict: true })).toThrow(
      /missing content for "UNKNOWN"/,
    );
  });
});
