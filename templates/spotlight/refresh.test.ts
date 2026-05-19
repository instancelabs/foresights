import { describe, expect, it, vi } from 'vitest';
import type { Deps, Source, Spotlight } from '../types';
import { createInMemoryStorage } from '../util/storage';
import { buildRefreshPrompt, refreshSpotlightsViaHaiku } from './refresh';

const sampleSources: readonly Source[] = [
  {
    id: 'cdk-core',
    label: 'aws/aws-cdk',
    owner: 'aws',
    repo: 'aws-cdk',
    kind: 'releases',
    section: 'releases',
    args: { perPage: 5 },
  },
];

const sampleExisting: readonly Spotlight[] = [
  {
    tag: 'X',
    title: 'Reference',
    summary: 'r',
    trick: 'r',
    code: 'r',
    why: 'r',
    url: 'u',
  },
];

const buildDeps = (overrides: Partial<Pick<Deps, 'callTool' | 'askClaude'>> = {}): Deps => ({
  callTool: overrides.callTool ?? vi.fn(),
  askClaude: overrides.askClaude ?? vi.fn(),
  runScheduledTask: vi.fn(),
  storage: createInMemoryStorage(),
  now: () => new Date('2026-05-19T12:00:00Z'),
  // The refresh module never touches document/window — minimal stubs are fine.
  document: {} as Document,
  window: {} as Window,
});

describe('buildRefreshPrompt', () => {
  it('includes the topic name', () => {
    const prompt = buildRefreshPrompt('Rust async', sampleExisting, []);
    expect(prompt).toContain('Rust async news dashboard');
  });

  it('embeds the first 3 existing spotlights as JSON reference', () => {
    const prompt = buildRefreshPrompt('Topic', sampleExisting, []);
    expect(prompt).toContain('"Reference"');
  });

  it('embeds the data samples as JSON', () => {
    const samples = [{ id: 'a', label: 'A', kind: 'releases' as const, data: { foo: 1 } }];
    const prompt = buildRefreshPrompt('Topic', sampleExisting, samples);
    expect(prompt).toContain('"foo":1');
  });

  it('demands JSON-only output (no markdown fences)', () => {
    const prompt = buildRefreshPrompt('Topic', [], []);
    expect(prompt).toContain('RESPOND WITH JSON ONLY');
    expect(prompt).toContain('no markdown fences');
  });
});

describe('refreshSpotlightsViaHaiku', () => {
  it('fetches each source via the GitHub MCP and forwards results to Haiku', async () => {
    const callTool = vi.fn().mockResolvedValue([{ tag_name: 'v1' }]);
    const askClaude = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify([
          { tag: 't', title: 'T', summary: 's', trick: 't', code: 'c', why: 'w', url: 'u' },
        ]),
      );
    const deps = buildDeps({ callTool, askClaude });

    const result = await refreshSpotlightsViaHaiku(deps, {
      topic: 'AWS CDK',
      sources: sampleSources,
      existing: sampleExisting,
      ghServer: 'mcp__gh',
    });

    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith('mcp__gh__list_releases', {
      owner: 'aws',
      repo: 'aws-cdk',
      perPage: 5,
    });
    expect(askClaude).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('T');
  });

  it('tolerates one source failing and continues with the rest', async () => {
    const callTool = vi
      .fn()
      .mockResolvedValueOnce([{ tag_name: 'v1' }])
      .mockRejectedValueOnce(new Error('boom'));
    const askClaude = vi.fn().mockResolvedValue('[]');
    const deps = buildDeps({ callTool, askClaude });

    const base = sampleSources[0];
    if (!base) throw new Error('sampleSources[0] missing');
    const twoSources: readonly Source[] = [base, { ...base, id: 'bad', owner: 'bad', repo: 'bad' }];

    await refreshSpotlightsViaHaiku(deps, {
      topic: 'T',
      sources: twoSources,
      existing: [],
      ghServer: 'mcp__gh',
    });

    expect(callTool).toHaveBeenCalledTimes(2);
    expect(askClaude).toHaveBeenCalledTimes(1);
    // Verify the failed sample is null in the payload
    const haikuPayload = askClaude.mock.calls[0]?.[1] as Array<{ data: unknown }> | undefined;
    expect(haikuPayload?.[1]?.data).toBeNull();
  });

  it('strips ```json fences from the Haiku response', async () => {
    const callTool = vi.fn().mockResolvedValue([]);
    const askClaude = vi
      .fn()
      .mockResolvedValue(
        '```json\n[{"tag":"t","title":"X","summary":"s","trick":"t","code":"c","why":"w","url":"u"}]\n```',
      );
    const deps = buildDeps({ callTool, askClaude });

    const result = await refreshSpotlightsViaHaiku(deps, {
      topic: 'T',
      sources: sampleSources,
      existing: [],
      ghServer: 'mcp__gh',
    });

    expect(result[0]?.title).toBe('X');
  });

  it('throws when Haiku returns a non-array', async () => {
    const callTool = vi.fn().mockResolvedValue([]);
    const askClaude = vi.fn().mockResolvedValue('{"oops":true}');
    const deps = buildDeps({ callTool, askClaude });

    await expect(
      refreshSpotlightsViaHaiku(deps, {
        topic: 'T',
        sources: sampleSources,
        existing: [],
        ghServer: 'mcp__gh',
      }),
    ).rejects.toThrow('Haiku response was not a JSON array');
  });
});
