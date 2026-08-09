import { describe, expect, it, vi } from 'vitest';
import type { Deps } from '../types';
import {
  TRIAGE_FAIL_REASON,
  type TriageInput,
  applyTriageAccuracyGuards,
  buildTriagePrompt,
  triageItems,
  trimTriageItem,
} from './triage';

type AskClaude = Deps['askClaude'];

const PROD_DESCRIPTOR = 'WidgetCorp — a fictional widget service';

const makeDeps = (impl: AskClaude): Pick<Deps, 'askClaude'> => ({
  askClaude: vi.fn(impl),
});

const item = (id: string, extra: Partial<TriageInput> = {}): TriageInput => ({
  stableId: id,
  text: `text-for-${id}`,
  ...extra,
});

const triageResponse = (
  entries: ReadonlyArray<{
    id: string;
    bucket: string;
    reason: string;
    basis?: 'source' | 'inference' | 'unknown';
  }>,
): string => JSON.stringify(entries.map((entry) => ({ basis: 'source', ...entry })));

describe('buildTriagePrompt', () => {
  it('embeds the product descriptor', () => {
    const p = buildTriagePrompt('FooCorp — does foo things');
    expect(p).toContain('FooCorp — does foo things');
  });

  it('lists all three buckets with descriptions', () => {
    const p = buildTriagePrompt(PROD_DESCRIPTOR);
    expect(p).toContain('"green"');
    expect(p).toContain('"yellow"');
    expect(p).toContain('"red"');
    expect(p).toContain('Implement now');
    expect(p).toContain('Worth considering');
    expect(p).toContain('Skip');
  });

  it("includes the 'be ruthless' instruction so most items land in red", () => {
    expect(buildTriagePrompt(PROD_DESCRIPTOR)).toMatch(/Be ruthless/);
  });

  it('separates source evidence from earlier model hypotheses', () => {
    const p = buildTriagePrompt(PROD_DESCRIPTOR);
    expect(p).toContain('why/ints are earlier model hypotheses');
    expect(p).toContain('MUST NOT be treated as evidence');
    expect(p).toContain('reverts or supersedes');
  });

  it('demands JSON-only / no fences', () => {
    const p = buildTriagePrompt(PROD_DESCRIPTOR);
    expect(p).toMatch(/JSON ONLY/);
    expect(p).toMatch(/NO MARKDOWN FENCES/i);
  });
});

describe('trimTriageItem', () => {
  it('keeps stableId verbatim as `id`', () => {
    expect(trimTriageItem({ stableId: 'release:v1', text: 'x' }).id).toBe('release:v1');
  });

  it('collapses whitespace + truncates text to 420 chars', () => {
    const long = 'a '.repeat(200); // 400 chars with single spaces — trimmed below
    const trimmed = trimTriageItem({ stableId: 's', text: long });
    expect(trimmed.txt?.length).toBeLessThanOrEqual(420);
    expect(trimmed.txt).not.toMatch(/\s{2,}/);
  });

  it('collapses runs of whitespace into single spaces', () => {
    const trimmed = trimTriageItem({ stableId: 's', text: 'foo\n\n\tbar   baz' });
    expect(trimmed.txt).toBe('foo bar baz');
  });

  it('truncates why to 320 chars', () => {
    const why = 'w'.repeat(500);
    expect(trimTriageItem({ stableId: 's', text: 't', why }).why?.length).toBe(320);
  });

  it('truncates ints to 180 chars', () => {
    const ints = 'i'.repeat(500);
    expect(trimTriageItem({ stableId: 's', text: 't', ints }).ints?.length).toBe(180);
  });

  it('keeps structured title, kind, and version evidence', () => {
    expect(
      trimTriageItem({
        stableId: 's',
        text: 'body',
        title: 'A title',
        kind: 'release-breaking',
        version: 'v2.0.0',
      }),
    ).toMatchObject({ ttl: 'A title', kind: 'release-breaking', ver: 'v2.0.0' });
  });

  it('omits why and ints when not provided', () => {
    const t = trimTriageItem({ stableId: 's', text: 't' });
    expect(t.why).toBeUndefined();
    expect(t.ints).toBeUndefined();
  });
});

describe('triageItems — happy path', () => {
  it('returns [] for an empty input list without calling Haiku', async () => {
    const askClaude = vi.fn<AskClaude>();
    const out = await triageItems(makeDeps(askClaude), [], {
      productDescriptor: PROD_DESCRIPTOR,
    });
    expect(out).toEqual([]);
    expect(askClaude).not.toHaveBeenCalled();
  });

  it('classifies each input into the model-returned bucket', async () => {
    const askClaude = vi.fn<AskClaude>().mockResolvedValue(
      triageResponse([
        { id: 'a', bucket: 'green', reason: 'big win' },
        { id: 'b', bucket: 'red', reason: 'not relevant' },
        { id: 'c', bucket: 'yellow', reason: 'maybe' },
      ]),
    );
    const out = await triageItems(makeDeps(askClaude), [item('a'), item('b'), item('c')], {
      productDescriptor: PROD_DESCRIPTOR,
    });
    expect(out).toEqual([
      { stableId: 'a', bucket: 'green', reasoning: 'big win', evidenceBasis: 'source' },
      { stableId: 'b', bucket: 'red', reasoning: 'not relevant', evidenceBasis: 'source' },
      { stableId: 'c', bucket: 'yellow', reasoning: 'maybe', evidenceBasis: 'source' },
    ]);
  });

  it('preserves input order even when model returns out of order', async () => {
    const askClaude = vi.fn<AskClaude>().mockResolvedValue(
      triageResponse([
        { id: 'c', bucket: 'green', reason: 'c' },
        { id: 'a', bucket: 'red', reason: 'a' },
        { id: 'b', bucket: 'yellow', reason: 'b' },
      ]),
    );
    const out = await triageItems(makeDeps(askClaude), [item('a'), item('b'), item('c')], {
      productDescriptor: PROD_DESCRIPTOR,
    });
    expect(out.map((t) => t.stableId)).toEqual(['a', 'b', 'c']);
  });

  it('accepts `stableId` as a synonym for `id` in the response', async () => {
    const askClaude = vi
      .fn<AskClaude>()
      .mockResolvedValue(
        triageResponse([{ id: '', stableId: 'a', bucket: 'green', reason: 'r' } as never]),
      );
    const out = await triageItems(makeDeps(askClaude), [item('a')], {
      productDescriptor: PROD_DESCRIPTOR,
    });
    expect(out[0]?.stableId).toBe('a');
  });

  it('embeds the descriptor + item count in the prompt sent to Haiku', async () => {
    const askClaude = vi
      .fn<AskClaude>()
      .mockResolvedValue(triageResponse([{ id: 'a', bucket: 'green', reason: 'r' }]));
    await triageItems(makeDeps(askClaude), [item('a')], { productDescriptor: 'X-product' });
    const call = askClaude.mock.calls[0];
    if (!call) throw new Error('expected one askClaude call');
    const [prompt] = call;
    expect(prompt).toContain('X-product');
    expect(prompt).toContain('ITEMS (1):');
  });
});

describe('triageItems — batching', () => {
  it('splits into conservative six-item batches by default', async () => {
    const askClaude = vi.fn<AskClaude>().mockImplementation(async (_p, data) => {
      const batch = (data?.[0] as Array<{ id: string }>) ?? [];
      return triageResponse(batch.map((b) => ({ id: b.id, bucket: 'red', reason: 'r' })));
    });
    const items = Array.from({ length: 25 }, (_, i) => item(`i${i}`));
    await triageItems(makeDeps(askClaude), items, { productDescriptor: PROD_DESCRIPTOR });
    expect(askClaude).toHaveBeenCalledTimes(5); // ceil(25/6) = 5
  });

  it('respects a custom batchSize', async () => {
    const askClaude = vi.fn<AskClaude>().mockImplementation(async (_p, data) => {
      const batch = (data?.[0] as Array<{ id: string }>) ?? [];
      return triageResponse(batch.map((b) => ({ id: b.id, bucket: 'green', reason: 'r' })));
    });
    const items = Array.from({ length: 7 }, (_, i) => item(`i${i}`));
    await triageItems(makeDeps(askClaude), items, {
      productDescriptor: PROD_DESCRIPTOR,
      batchSize: 3,
    });
    expect(askClaude).toHaveBeenCalledTimes(3); // ceil(7/3) = 3
  });

  it('throws on non-positive batchSize', async () => {
    const askClaude = vi.fn<AskClaude>();
    await expect(
      triageItems(makeDeps(askClaude), [item('a')], {
        productDescriptor: PROD_DESCRIPTOR,
        batchSize: 0,
      }),
    ).rejects.toThrow(/batchSize must be positive/);
  });
});

describe('triageItems — error containment', () => {
  it('defaults items in a failed batch to yellow + apology reason', async () => {
    const askClaude = vi.fn<AskClaude>().mockRejectedValue(new Error('IPC payload too large'));
    const out = await triageItems(makeDeps(askClaude), [item('a'), item('b')], {
      productDescriptor: PROD_DESCRIPTOR,
    });
    expect(out).toEqual([
      { stableId: 'a', bucket: 'yellow', reasoning: TRIAGE_FAIL_REASON },
      { stableId: 'b', bucket: 'yellow', reasoning: TRIAGE_FAIL_REASON },
    ]);
  });

  it('only the failed batch defaults to yellow — other batches succeed', async () => {
    let n = 0;
    const askClaude = vi.fn<AskClaude>().mockImplementation(async (_p, data) => {
      n += 1;
      if (n === 2) throw new Error('one bad batch');
      const batch = (data?.[0] as Array<{ id: string }>) ?? [];
      return triageResponse(batch.map((b) => ({ id: b.id, bucket: 'green', reason: 'good' })));
    });
    const items = Array.from({ length: 6 }, (_, i) => item(`i${i}`));
    const out = await triageItems(makeDeps(askClaude), items, {
      productDescriptor: PROD_DESCRIPTOR,
      batchSize: 3,
    });
    expect(out[0]?.bucket).toBe('green');
    expect(out[2]?.bucket).toBe('green');
    expect(out[3]?.bucket).toBe('yellow');
    expect(out[3]?.reasoning).toBe(TRIAGE_FAIL_REASON);
    expect(out[5]?.reasoning).toBe(TRIAGE_FAIL_REASON);
  });

  it('defaults to yellow when an item is missing from the model response', async () => {
    const askClaude = vi
      .fn<AskClaude>()
      .mockResolvedValue(triageResponse([{ id: 'a', bucket: 'green', reason: 'a' }]));
    const out = await triageItems(makeDeps(askClaude), [item('a'), item('b')], {
      productDescriptor: PROD_DESCRIPTOR,
    });
    expect(out[0]?.bucket).toBe('green');
    expect(out[1]?.bucket).toBe('yellow');
    expect(out[1]?.reasoning).toBe(TRIAGE_FAIL_REASON);
  });

  it('coerces unknown bucket strings into yellow', async () => {
    const askClaude = vi
      .fn<AskClaude>()
      .mockResolvedValue(
        triageResponse([{ id: 'a', bucket: 'purple-rain', reason: 'weird model output' }]),
      );
    const out = await triageItems(makeDeps(askClaude), [item('a')], {
      productDescriptor: PROD_DESCRIPTOR,
    });
    expect(out[0]?.bucket).toBe('yellow');
    expect(out[0]?.reasoning).toBe('weird model output');
  });

  it('survives a non-JSON response and defaults to yellow', async () => {
    const askClaude = vi
      .fn<AskClaude>()
      .mockResolvedValue('Sure thing! I will triage these items soon.');
    const out = await triageItems(makeDeps(askClaude), [item('a')], {
      productDescriptor: PROD_DESCRIPTOR,
    });
    expect(out[0]?.bucket).toBe('yellow');
    expect(out[0]?.reasoning).toBe(TRIAGE_FAIL_REASON);
  });

  it('survives malformed JSON inside the response and defaults to yellow', async () => {
    const askClaude = vi.fn<AskClaude>().mockResolvedValue('[not valid, json]');
    const out = await triageItems(makeDeps(askClaude), [item('a')], {
      productDescriptor: PROD_DESCRIPTOR,
    });
    expect(out[0]?.bucket).toBe('yellow');
    expect(out[0]?.reasoning).toBe(TRIAGE_FAIL_REASON);
  });

  it('extracts the array even when the response wraps it in prose', async () => {
    const askClaude = vi
      .fn<AskClaude>()
      .mockResolvedValue(
        `Here you go:\n${triageResponse([{ id: 'a', bucket: 'green', reason: 'r' }])}\nDone.`,
      );
    const out = await triageItems(makeDeps(askClaude), [item('a')], {
      productDescriptor: PROD_DESCRIPTOR,
    });
    expect(out[0]?.bucket).toBe('green');
  });
});

describe('triageItems — response shape normalisation', () => {
  it('accepts {text: string} return values', async () => {
    const askClaude = vi.fn<AskClaude>().mockResolvedValue({
      text: triageResponse([{ id: 'a', bucket: 'green', reason: 'r' }]),
    } as unknown as string);
    const out = await triageItems(makeDeps(askClaude), [item('a')], {
      productDescriptor: PROD_DESCRIPTOR,
    });
    expect(out[0]?.bucket).toBe('green');
  });

  it('accepts {content: [{text}]} return values', async () => {
    const askClaude = vi.fn<AskClaude>().mockResolvedValue({
      content: [{ text: triageResponse([{ id: 'a', bucket: 'green', reason: 'r' }]) }],
    } as unknown as string);
    const out = await triageItems(makeDeps(askClaude), [item('a')], {
      productDescriptor: PROD_DESCRIPTOR,
    });
    expect(out[0]?.bucket).toBe('green');
  });
});

describe('triageItems — baked tier (BAKED_TRIAGE)', () => {
  // BAKED_TRIAGE is the empty `{}` the template ships, so every test here
  // exercises the artifact-mode path: the baked tier is a transparent no-op
  // and every item is triaged live. The populated-map path is covered e2e in
  // wizard/build.test.ts (a static build bakes verdicts through to the HTML).
  it('passing productId is inert when BAKED_TRIAGE is empty — items still triage live', async () => {
    const askClaude = vi
      .fn<AskClaude>()
      .mockResolvedValue(triageResponse([{ id: 'a', bucket: 'green', reason: 'big win' }]));
    const out = await triageItems(makeDeps(askClaude), [item('a')], {
      productDescriptor: PROD_DESCRIPTOR,
      productId: 'cdki',
    });
    expect(askClaude).toHaveBeenCalledTimes(1);
    expect(out).toEqual([
      {
        stableId: 'a',
        bucket: 'green',
        reasoning: 'big win',
        evidenceBasis: 'source',
      },
    ]);
  });
});

describe('applyTriageAccuracyGuards', () => {
  it('demotes an unsupported green verdict', () => {
    const out = applyTriageAccuracyGuards(
      [item('a', { kind: 'release-features' })],
      [
        {
          stableId: 'a',
          bucket: 'green',
          reasoning: 'sounds useful',
          evidenceBasis: 'inference',
        },
      ],
    );
    expect(out[0]?.bucket).toBe('yellow');
    expect(out[0]?.reasoning).toContain('inferred');
  });

  it('caps RFC and alpha work at yellow even when the model says green', () => {
    const out = applyTriageAccuracyGuards(
      [item('rfc', { kind: 'rfc' }), item('alpha', { kind: 'release-alpha' })],
      [
        {
          stableId: 'rfc',
          bucket: 'green',
          reasoning: 'ship it',
          evidenceBasis: 'source',
        },
        {
          stableId: 'alpha',
          bucket: 'green',
          reasoning: 'ship it',
          evidenceBasis: 'source',
        },
      ],
    );
    expect(out.map((entry) => entry.bucket)).toEqual(['yellow', 'yellow']);
  });

  it('rejects both sides of a correlated revert pair', () => {
    const out = applyTriageAccuracyGuards(
      [
        item('feature', { title: 'feat: ALB integration (#36247)', kind: 'release-features' }),
        item('revert', {
          title: 'revert ALB integration (#38305), closes #36247',
          kind: 'release-fixes',
        }),
      ],
      [
        {
          stableId: 'feature',
          bucket: 'green',
          reasoning: 'new feature',
          evidenceBasis: 'source',
        },
        {
          stableId: 'revert',
          bucket: 'yellow',
          reasoning: 'revert',
          evidenceBasis: 'source',
        },
      ],
    );
    expect(out.map((entry) => entry.bucket)).toEqual(['red', 'red']);
    expect(out[0]?.reasoning).toContain('reverted or withdrawn');
  });
});
