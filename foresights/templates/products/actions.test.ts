import { describe, expect, it } from 'vitest';
import type { Brief, BuildActionArgs, FlagMeta } from '../types';
import { ACTION_TYPES, coerceActionType } from './actions';

const brief = (overrides: Partial<Brief> = {}): Brief => ({
  why: 'Mixins reshape construct composition.',
  integrations: [
    { title: 'Add a rule', detail: 'In src/aspects/Foo.ts.' },
    { title: 'Update the writer', detail: 'Walk the new manifest.' },
  ],
  ...overrides,
});

const meta = (overrides: Partial<FlagMeta> = {}): FlagMeta => ({
  section: 'releases',
  stableId: 'release:v1:add-foo',
  title: 'Add foo support',
  url: 'https://example.com/r/1',
  ...overrides,
});

const args = (overrides: Partial<BuildActionArgs> = {}): BuildActionArgs => ({
  brief: brief(),
  meta: meta(),
  ...overrides,
});

describe('ACTION_TYPES registry', () => {
  it('has a spec for every action type id, keyed by its own id', () => {
    for (const id of ['claude-code', 'summary', 'task'] as const) {
      expect(ACTION_TYPES[id].id).toBe(id);
    }
  });

  it('only claude-code has the mode toggle and uses repo context', () => {
    expect(ACTION_TYPES['claude-code'].hasMode).toBe(true);
    expect(ACTION_TYPES['claude-code'].usesRepoContext).toBe(true);
    expect(ACTION_TYPES.summary.hasMode).toBe(false);
    expect(ACTION_TYPES.summary.usesRepoContext).toBe(false);
    expect(ACTION_TYPES.task.hasMode).toBe(false);
    expect(ACTION_TYPES.task.usesRepoContext).toBe(false);
  });

  it('claude-code offers prompt + task copy formats; summary/task offer prompt only', () => {
    expect(ACTION_TYPES['claude-code'].copyFormats).toEqual(['prompt', 'task']);
    expect(ACTION_TYPES.summary.copyFormats).toEqual(['prompt']);
    expect(ACTION_TYPES.task.copyFormats).toEqual(['prompt']);
  });

  it('every spec carries a non-empty actionLabel / hideLabel / panelTitle', () => {
    for (const spec of Object.values(ACTION_TYPES)) {
      expect(spec.actionLabel.length).toBeGreaterThan(0);
      expect(spec.hideLabel.length).toBeGreaterThan(0);
      expect(spec.panelTitle.length).toBeGreaterThan(0);
    }
  });
});

describe('summary builder', () => {
  it('leads with the brief why and lists integrations as prose bullets', () => {
    const out = ACTION_TYPES.summary.build(args());
    expect(out.startsWith('Mixins reshape construct composition.')).toBe(true);
    expect(out).toContain('How it could fit:');
    expect(out).toContain('- Add a rule — In src/aspects/Foo.ts.');
    expect(out).toContain('- Update the writer — Walk the new manifest.');
  });

  it('omits the "How it could fit" block when there are no integrations', () => {
    const out = ACTION_TYPES.summary.build(args({ brief: brief({ integrations: [] }) }));
    expect(out).toBe('Mixins reshape construct composition.');
  });

  it('digestEmbed matches build for summary', () => {
    expect(ACTION_TYPES.summary.digestEmbed(args())).toBe(ACTION_TYPES.summary.build(args()));
  });
});

describe('task builder', () => {
  it('renders title, why, and a checklist drawn from integrations', () => {
    const out = ACTION_TYPES.task.build(args());
    expect(out.startsWith('Add foo support')).toBe(true);
    expect(out).toContain('Why: Mixins reshape construct composition.');
    expect(out).toContain('Checklist:');
    expect(out).toContain('- [ ] Add a rule — In src/aspects/Foo.ts.');
    expect(out).toContain('Source: https://example.com/r/1');
  });

  it('falls back to the stableId when the item has no title', () => {
    const out = ACTION_TYPES.task.build({
      brief: brief(),
      meta: { section: 'releases', stableId: 'release:v1:add-foo' },
    });
    expect(out.startsWith('release:v1:add-foo')).toBe(true);
  });

  it('omits the Source line when the item has no url', () => {
    const out = ACTION_TYPES.task.build({
      brief: brief(),
      meta: { section: 'releases', stableId: 'sid', title: 'A title' },
    });
    expect(out).not.toContain('Source:');
  });
});

describe('claude-code fallback builder', () => {
  it('produces a generic prompt referencing the title, why, and mode', () => {
    const out = ACTION_TYPES['claude-code'].build(args({ mode: 'implement' }));
    expect(out).toContain('# Add foo support');
    expect(out).toContain('Mixins reshape construct composition.');
    expect(out).toContain('Mode: implement.');
  });

  it('defaults the mode to plan when none is supplied', () => {
    expect(ACTION_TYPES['claude-code'].build(args())).toContain('Mode: plan.');
  });
});

describe('coerceActionType', () => {
  it('passes through every registered id', () => {
    expect(coerceActionType('claude-code')).toBe('claude-code');
    expect(coerceActionType('summary')).toBe('summary');
    expect(coerceActionType('task')).toBe('task');
  });

  it('defaults to claude-code when absent', () => {
    expect(coerceActionType(undefined)).toBe('claude-code');
    expect(coerceActionType(null)).toBe('claude-code');
  });

  it('defaults to claude-code on an invalid (not merely absent) value', () => {
    // The crash this guards: ACTION_TYPES['bogus'] is undefined → .build throws.
    expect(coerceActionType('bogus')).toBe('claude-code');
    expect(coerceActionType('__proto__')).toBe('claude-code');
    expect(coerceActionType(42)).toBe('claude-code');
  });

  it('never resolves to an id missing from the registry', () => {
    for (const probe of ['claude-code', 'summary', 'task', 'nope', '', 'constructor']) {
      expect(Object.hasOwn(ACTION_TYPES, coerceActionType(probe))).toBe(true);
    }
  });
});
