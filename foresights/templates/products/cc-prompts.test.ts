import { describe, expect, it } from 'vitest';
import type { BuildCcPromptArgs } from '../types';
import { buildRichCcPrompt } from './cc-prompts';

const baseArgs = (over: Partial<BuildCcPromptArgs['meta']> = {}): BuildCcPromptArgs => ({
  brief: {
    why: 'This affects how findings attribute to source.',
    integrations: [
      { title: 'Add an Aspect rule', detail: 'Extend src/aspects/ with a new check.' },
      { title: 'Surface in SARIF', detail: 'Emit the finding via cdk-insights-action.' },
    ],
  },
  meta: {
    section: 'releases',
    stableId: 'rel-1',
    title: 'CDK Mixins are now stable',
    url: 'https://example.com/mixins',
    ...over,
    // reason is on Flag (not FlagMeta) but the panel passes it at runtime
    ...({ reason: 'Aspects API surface change' } as object),
  } as BuildCcPromptArgs['meta'],
  mode: 'plan',
});

describe('buildRichCcPrompt', () => {
  it('includes the source URL, flag reason, why, and every integration', () => {
    const out = buildRichCcPrompt('CDK Insights', baseArgs());
    expect(out).toContain('# CDK Insights: CDK Mixins are now stable');
    expect(out).toContain('**Source:** https://example.com/mixins');
    expect(out).toContain(
      'Why Foresights flagged this for CDK Insights:** Aspects API surface change',
    );
    expect(out).toContain('This affects how findings attribute to source.');
    expect(out).toContain('## Suggested integrations');
    expect(out).toContain('- **Add an Aspect rule** — Extend src/aspects/ with a new check.');
    expect(out).toContain('- **Surface in SARIF** — Emit the finding via cdk-insights-action.');
    expect(out).toContain(
      'Mode: plan. Treat the source item and suggested integrations as leads, not verified requirements.',
    );
    expect(out).toContain('check whether the change shipped or was reverted');
  });

  it('reflects implement mode in the closing instruction', () => {
    const args = { ...baseArgs(), mode: 'implement' as const };
    const out = buildRichCcPrompt('CDK Insights', args);
    expect(out).toContain('Mode: implement.');
    expect(out).toContain('Ground your changes');
  });

  it('falls back to stableId when title is absent and omits empty sections', () => {
    const out = buildRichCcPrompt('Prod', {
      brief: { why: 'because', integrations: [] },
      meta: { section: 's', stableId: 'abc123' } as BuildCcPromptArgs['meta'],
      mode: 'plan',
    });
    expect(out).toContain('# Prod: abc123');
    expect(out).not.toContain('**Source:**');
    expect(out).not.toContain('## Suggested integrations');
  });
});
