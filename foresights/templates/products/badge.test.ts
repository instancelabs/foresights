import { describe, expect, it } from 'vitest';
import type { Flag } from '../types';
import { flagBadgeAttrs, flagBadgeHtml } from './badge';

const FLAG: Flag = {
  productId: 'cdki',
  stableId: 'release:v1:features:add-foo',
  section: 'releases',
  title: 'Add foo',
  url: 'https://example.com/r/1',
  reason: 'CDK area',
};

const META = {
  kind: 'release-features',
  text: '**core:** add foo',
};

describe('flagBadgeAttrs', () => {
  it('includes the canonical eight data-* attrs', () => {
    const out = flagBadgeAttrs(FLAG, META);
    expect(out).toContain('data-product-id="cdki"');
    expect(out).toContain('data-stable-id="release:v1:features:add-foo"');
    expect(out).toContain('data-section="releases"');
    expect(out).toContain('data-title="Add foo"');
    expect(out).toContain('data-url="https://example.com/r/1"');
    expect(out).toContain('data-reason="CDK area"');
    expect(out).toContain('data-kind="release-features"');
    expect(out).toContain('data-text=');
  });

  it('always includes expandable in the class list', () => {
    expect(flagBadgeAttrs(FLAG, META)).toContain('class="insights-tag expandable"');
  });

  it('appends the cssMod when provided', () => {
    expect(flagBadgeAttrs(FLAG, META, 'lc')).toContain('class="insights-tag lc expandable"');
  });

  it('escapes data-* values to keep HTML attrs well-formed', () => {
    const flag: Flag = {
      ...FLAG,
      title: 'Title with " quotes & <tags>',
      url: 'https://example.com/?q=1&b=2',
      reason: 'reason "with quotes"',
    };
    const out = flagBadgeAttrs(flag, META);
    expect(out).toContain('data-title="Title with &quot;');
    expect(out).toContain('&amp;');
    expect(out).not.toContain('<tags>');
  });

  it('omits version and source when not provided', () => {
    const out = flagBadgeAttrs(FLAG, META);
    expect(out).not.toContain('data-version=');
    expect(out).not.toContain('data-source=');
  });

  it('includes version and source when provided', () => {
    const out = flagBadgeAttrs(FLAG, { ...META, version: 'v1.2.3', source: 'aws/aws-cdk' });
    expect(out).toContain('data-version="v1.2.3"');
    expect(out).toContain('data-source="aws/aws-cdk"');
  });

  it('emits a tooltip title hint about click-to-expand', () => {
    expect(flagBadgeAttrs(FLAG, META)).toContain('title="CDK area · click for full brief"');
  });

  it('survives empty optional FlagMeta fields (title/url undefined)', () => {
    // Build the flag WITHOUT title/url via destructure (exactOptionalPropertyTypes
    // rejects `title: undefined`, noDelete rejects `delete obj.title`).
    const { title: _t, url: _u, ...rest } = FLAG;
    void _t;
    void _u;
    const out = flagBadgeAttrs(rest as Flag, META);
    expect(out).toContain('data-title=""');
    expect(out).toContain('data-url=""');
  });
});

describe('flagBadgeHtml', () => {
  it('wraps the attrs in a <span> with the product label as text', () => {
    const out = flagBadgeHtml(FLAG, META, 'CDK Insights');
    expect(out.startsWith('<span ')).toBe(true);
    expect(out.endsWith('</span>')).toBe(true);
    expect(out).toContain('>CDK Insights</span>');
  });

  it('escapes the product label', () => {
    const out = flagBadgeHtml(FLAG, META, 'Evil & Co <script>');
    expect(out).toContain('Evil &amp; Co &lt;script&gt;');
    expect(out).not.toContain('<script>');
  });
});
