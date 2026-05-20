import { describe, expect, it } from 'vitest';
import type { WizardConfig } from './build-config';
import { spliceRefresh } from './refresh';

/** A minimal built-artifact shell carrying the four curated sentinels. */
const ART = `<html><body>
<!-- FORESIGHTS_START:HIGHLIGHTS_MARKUP -->H0<!-- FORESIGHTS_END:HIGHLIGHTS_MARKUP -->
<!-- FORESIGHTS_START:PATTERNS_MARKUP -->P0<!-- FORESIGHTS_END:PATTERNS_MARKUP -->
<!-- FORESIGHTS_START:TIPS_MARKUP -->T0<!-- FORESIGHTS_END:TIPS_MARKUP -->
<!-- FORESIGHTS_START:RESOURCES_MARKUP -->R0<!-- FORESIGHTS_END:RESOURCES_MARKUP -->
<script>const SPOTLIGHTS=[];/* compiled bundle */</script>
</body></html>`;

const config = (overrides: Partial<WizardConfig> = {}): WizardConfig => ({
  topic: 'AWS CDK',
  topicSlug: 'aws-cdk',
  taglineSuffix: 'suffix',
  taglineSub: 'sub',
  accent: '#000000',
  accentSoft: '#ffffff',
  footerNote: 'footer',
  artifactName: 'name',
  artifactDescription: 'desc',
  ghServer: 'mcp__github',
  headerSourcesLinks: '',
  sources: [],
  spotlights: [],
  products: [],
  highlights: [],
  patterns: [],
  tips: [],
  resources: [],
  ...overrides,
});

describe('spliceRefresh', () => {
  it('replaces a curated section body and preserves its sentinel markers', () => {
    const out = spliceRefresh(
      ART,
      config({
        highlights: [
          { tag: 'Apr 2026', title: 'Fresh highlight', body: 'b', url: 'https://github.com/a/b' },
        ],
      }),
    );
    expect(out).toContain('FORESIGHTS_START:HIGHLIGHTS_MARKUP');
    expect(out).toContain('FORESIGHTS_END:HIGHLIGHTS_MARKUP');
    expect(out).toContain('Fresh highlight');
    expect(out).not.toContain('H0');
  });

  it('replaces all four curated sections in a single pass', () => {
    const out = spliceRefresh(ART, config());
    for (const stale of ['H0', 'P0', 'T0', 'R0']) {
      expect(out).not.toContain(stale);
    }
  });

  it('leaves the compiled bundle and surrounding markup untouched', () => {
    const out = spliceRefresh(ART, config());
    expect(out).toContain('<script>const SPOTLIGHTS=[];/* compiled bundle */</script>');
    expect(out.startsWith('<html><body>')).toBe(true);
  });

  it('is stable — splicing twice with the same config is a no-op', () => {
    const once = spliceRefresh(ART, config());
    const twice = spliceRefresh(once, config());
    expect(twice).toBe(once);
  });

  it('leaves an artifact with no sentinels unchanged', () => {
    const plain = '<html><body>no sentinels here</body></html>';
    expect(spliceRefresh(plain, config())).toBe(plain);
  });
});

describe('spliceRefresh — embedded foresights-config block', () => {
  const CONFIG_OPEN = '<script type="application/json" id="foresights-config">';

  it('rewrites the embedded config block to match the refreshed config', () => {
    const withBlock = `${CONFIG_OPEN}\n${JSON.stringify(config())}\n</script>\n${ART}`;
    const fresh = config({
      highlights: [{ tag: 'T', title: 'fresh one', body: 'b', url: 'https://github.com/a/b' }],
    });
    const out = spliceRefresh(withBlock, fresh);
    const body = out.slice(out.indexOf(CONFIG_OPEN) + CONFIG_OPEN.length, out.indexOf('</script>'));
    expect(JSON.parse(body)).toEqual(fresh);
  });

  it('does not invent a config block when the artifact has none', () => {
    expect(spliceRefresh(ART, config())).not.toContain('id="foresights-config"');
  });
});
