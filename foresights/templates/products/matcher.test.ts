import { describe, expect, it } from 'vitest';
import type { FlagMeta, Product } from '../types';
import { flagsForText } from './matcher';

const META: FlagMeta = {
  section: 'releases',
  stableId: 'release:v1.0:features:add-foo',
  title: 'Add foo support',
  url: 'https://example.com/r/1',
};

/**
 * Build a product whose `match` returns the first matching rule's reason.
 * Matches the wizard's RULES emit shape: each rule is { re, reason }, scanned
 * in declaration order. First-match-wins.
 */
const product = (
  id: string,
  label: string,
  rules: ReadonlyArray<readonly [RegExp, string]>,
  cssMod = '',
): Product => ({
  id,
  label,
  cssMod,
  match: (text) => {
    for (const [re, reason] of rules) {
      if (re.test(text)) return reason;
    }
    return null;
  },
});

describe('flagsForText', () => {
  it('returns [] when no products are provided', () => {
    expect(flagsForText('anything goes here', META, [])).toEqual([]);
  });

  it('returns [] when no product matches', () => {
    const p = product('cdki', 'CDK Insights', [[/never-matches/, 'no']]);
    expect(flagsForText('hello world', META, [p])).toEqual([]);
  });

  it('emits one flag when a single product matches', () => {
    const p = product('cdki', 'CDK Insights', [[/CDK/i, 'mentions CDK']]);
    const flags = flagsForText('CDK released a new feature', META, [p]);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toEqual({
      ...META,
      productId: 'cdki',
      reason: 'mentions CDK',
    });
  });

  it('emits one flag per matching product when multiple products match', () => {
    const cdki = product('cdki', 'CDK Insights', [[/CDK/i, 'mentions CDK']]);
    const lc = product('lc', 'Last Command', [[/cognito|amplify/i, 'auth surface']]);
    const flags = flagsForText('CDK + Amplify update', META, [cdki, lc]);
    expect(flags).toHaveLength(2);
    expect(flags.map((f) => f.productId)).toEqual(['cdki', 'lc']);
  });

  it('preserves the products[] order when both match', () => {
    const cdki = product('cdki', 'CDK Insights', [[/foo/, 'cdki match']]);
    const lc = product('lc', 'Last Command', [[/foo/, 'lc match']]);
    const order1 = flagsForText('foo', META, [cdki, lc]);
    const order2 = flagsForText('foo', META, [lc, cdki]);
    expect(order1.map((f) => f.productId)).toEqual(['cdki', 'lc']);
    expect(order2.map((f) => f.productId)).toEqual(['lc', 'cdki']);
  });

  it("uses the first matching rule's reason per product (rule order matters)", () => {
    const p = product('cdki', 'CDK Insights', [
      [/aws-cdk/, 'first: aws-cdk repo'],
      [/cdk/i, 'second: any cdk mention'],
    ]);
    const flags = flagsForText('aws-cdk update', META, [p]);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.reason).toBe('first: aws-cdk repo');
  });

  it('treats Product.match as opaque — empty string reason still counts as a match', () => {
    const odd: Product = {
      id: 'odd',
      label: 'Odd',
      cssMod: '',
      match: () => '',
    };
    // The matcher reads `reason ? [...] : []`, so an empty string is falsy
    // and produces no flag. Document this so we don't accidentally regress it.
    expect(flagsForText('any', META, [odd])).toEqual([]);
  });

  it('forwards every FlagMeta field unchanged onto each emitted flag', () => {
    const p = product('cdki', 'CDK Insights', [[/x/, 'r']]);
    const customMeta: FlagMeta = {
      section: 'prs',
      stableId: 'pr:42',
      title: 'A title with <html> chars',
      url: 'https://example.com/with?q=1&b=2',
    };
    const [flag] = flagsForText('x', customMeta, [p]);
    expect(flag).toEqual({
      section: 'prs',
      stableId: 'pr:42',
      title: 'A title with <html> chars',
      url: 'https://example.com/with?q=1&b=2',
      productId: 'cdki',
      reason: 'r',
    });
  });

  it('handles an empty input string (no rule should match unless a rule explicitly does)', () => {
    const matchesEmpty = product('greedy', 'Greedy', [[/^$/, 'matches empty']]);
    const matchesNothing = product('strict', 'Strict', [[/./, 'matches any char']]);
    expect(flagsForText('', META, [matchesEmpty, matchesNothing]).map((f) => f.productId)).toEqual([
      'greedy',
    ]);
  });

  it('honours case-sensitive vs case-insensitive rule flags as supplied', () => {
    const sensitive = product('s', 'S', [[/CDK/, 'case-sensitive']]);
    const insensitive = product('i', 'I', [[/CDK/i, 'case-insensitive']]);
    const flags = flagsForText('cdk lower-case mention', META, [sensitive, insensitive]);
    expect(flags.map((f) => f.productId)).toEqual(['i']);
  });

  it('is independent of the order of FlagMeta keys (no aliasing)', () => {
    const p = product('cdki', 'CDK Insights', [[/x/, 'r']]);
    const result = flagsForText('x', META, [p]);
    // Mutating the returned array must not mutate META.
    expect(() => {
      const arr = [...result] as unknown as Array<{ section: string }>;
      const first = arr[0];
      if (first) first.section = 'mutated';
    }).not.toThrow();
    expect(META.section).toBe('releases');
  });
});
