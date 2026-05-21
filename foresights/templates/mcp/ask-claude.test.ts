import { describe, expect, it, vi } from 'vitest';
import {
  ASK_CLAUDE_BATCH_SIZE,
  askClaude,
  askClaudeBatched,
  parseJsonResponse,
} from './ask-claude';

type AskClaudeFn = (prompt: string, data?: unknown[]) => Promise<string>;

const expectCall = (
  fn: ReturnType<typeof vi.fn<AskClaudeFn>>,
  index: number,
): readonly [string, unknown[] | undefined] => {
  const call = fn.mock.calls[index];
  if (!call)
    throw new Error(
      `Expected at least ${index + 1} call(s) to askClaude, got ${fn.mock.calls.length}`,
    );
  return [call[0], call[1]];
};

describe('askClaude', () => {
  it('passes the prompt and data array through to deps.askClaude', async () => {
    const askClaudeFn = vi.fn<AskClaudeFn>().mockResolvedValue('response');
    const result = await askClaude({ askClaude: askClaudeFn }, 'hello', [{ a: 1 }]);
    expect(askClaudeFn).toHaveBeenCalledWith('hello', [{ a: 1 }]);
    expect(result).toBe('response');
  });

  it('passes undefined when no data array is given', async () => {
    const askClaudeFn = vi.fn<AskClaudeFn>().mockResolvedValue('ok');
    await askClaude({ askClaude: askClaudeFn }, 'no-data');
    expect(askClaudeFn).toHaveBeenCalledWith('no-data', undefined);
  });

  it('defensively copies the data array (so callers can mutate after the call)', async () => {
    const askClaudeFn = vi.fn<AskClaudeFn>().mockResolvedValue('ok');
    const data = [{ a: 1 }];
    await askClaude({ askClaude: askClaudeFn }, 'x', data);
    const [, args] = expectCall(askClaudeFn, 0);
    expect(args).not.toBe(data);
    expect(args).toEqual(data);
  });
});

describe('askClaudeBatched', () => {
  it('exposes ASK_CLAUDE_BATCH_SIZE = 10 (IPC payload safety)', () => {
    expect(ASK_CLAUDE_BATCH_SIZE).toBe(10);
  });

  it('issues one call per ≤batchSize chunk', async () => {
    const askClaudeFn = vi.fn<AskClaudeFn>().mockResolvedValue('chunk-response');
    const items = Array.from({ length: 25 }, (_, i) => ({ id: i }));
    const responses = await askClaudeBatched({ askClaude: askClaudeFn }, 'prompt', items);

    expect(askClaudeFn).toHaveBeenCalledTimes(3); // 10 + 10 + 5
    expect(responses).toHaveLength(3);
    expect(expectCall(askClaudeFn, 0)[1]).toHaveLength(10);
    expect(expectCall(askClaudeFn, 1)[1]).toHaveLength(10);
    expect(expectCall(askClaudeFn, 2)[1]).toHaveLength(5);
  });

  it('reuses the same prompt across chunks', async () => {
    const askClaudeFn = vi.fn<AskClaudeFn>().mockResolvedValue('ok');
    const items = Array.from({ length: 15 }, (_, i) => i);
    await askClaudeBatched({ askClaude: askClaudeFn }, 'fixed-prompt', items);
    expect(expectCall(askClaudeFn, 0)[0]).toBe('fixed-prompt');
    expect(expectCall(askClaudeFn, 1)[0]).toBe('fixed-prompt');
  });

  it('respects a custom batchSize', async () => {
    const askClaudeFn = vi.fn<AskClaudeFn>().mockResolvedValue('ok');
    const items = [1, 2, 3, 4, 5];
    await askClaudeBatched({ askClaude: askClaudeFn }, 'p', items, 2);
    expect(askClaudeFn).toHaveBeenCalledTimes(3); // 2 + 2 + 1
  });

  it('returns an empty array for an empty items list', async () => {
    const askClaudeFn = vi.fn<AskClaudeFn>().mockResolvedValue('ok');
    const responses = await askClaudeBatched({ askClaude: askClaudeFn }, 'p', []);
    expect(responses).toEqual([]);
    expect(askClaudeFn).not.toHaveBeenCalled();
  });

  it('throws on non-positive batchSize', async () => {
    await expect(
      askClaudeBatched({ askClaude: vi.fn<AskClaudeFn>() }, 'p', [1, 2, 3], 0),
    ).rejects.toThrow('batchSize must be positive');
  });

  it('runs chunks sequentially, not concurrently', async () => {
    const calls: number[] = [];
    let call = 0;
    const askClaudeFn = vi.fn<AskClaudeFn>().mockImplementation(async () => {
      const myCall = call++;
      // Force a tick to give a parallel implementation a chance to interleave
      await Promise.resolve();
      calls.push(myCall);
      return `r${myCall}`;
    });
    await askClaudeBatched({ askClaude: askClaudeFn }, 'p', [1, 2, 3, 4, 5], 1);
    expect(calls).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('parseJsonResponse', () => {
  it('parses a bare JSON object', () => {
    expect(parseJsonResponse('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses a bare JSON array', () => {
    expect(parseJsonResponse('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('strips ```json ... ``` code fences', () => {
    expect(parseJsonResponse('```json\n{"x":1}\n```')).toEqual({ x: 1 });
  });

  it('strips bare ``` ... ``` code fences', () => {
    expect(parseJsonResponse('```\n{"y":2}\n```')).toEqual({ y: 2 });
  });

  it('handles uppercase JSON fence label', () => {
    expect(parseJsonResponse('```JSON\n{"z":3}\n```')).toEqual({ z: 3 });
  });

  it('trims surrounding whitespace', () => {
    expect(parseJsonResponse('   \n  {"a":1}  \n  ')).toEqual({ a: 1 });
  });

  it('throws SyntaxError on invalid JSON', () => {
    expect(() => parseJsonResponse('not json')).toThrow(SyntaxError);
  });

  it('preserves type information via generic', () => {
    interface Shape {
      id: number;
      name: string;
    }
    const parsed = parseJsonResponse<Shape>('{"id":1,"name":"a"}');
    expect(parsed.id).toBe(1);
    expect(parsed.name).toBe('a');
  });
});
