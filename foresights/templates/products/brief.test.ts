import { describe, expect, it, vi } from 'vitest';
import type { Deps, Flag } from '../types';
import { createInMemoryStorage } from '../util/storage';
import { type BriefItem, briefCacheKey, briefFromReason, fetchBrief, hashKey } from './brief';

const FLAG: Flag = {
  section: 'releases',
  stableId: 'release:v1.0:features:add-foo',
  title: 'Add foo',
  url: 'https://example.com/r/1',
  productId: 'cdki',
  reason: 'CDK area',
};

const ITEM: BriefItem = {
  kind: 'release-features',
  text: '**core:** add foo support',
  url: 'https://example.com/r/1',
  reason: 'CDK area',
  version: 'v1.0',
  source: 'aws/aws-cdk',
};

const PROMPT = 'TEST_SYSTEM_PROMPT';
const FINGERPRINT = 'fp123';
const TOPIC_SLUG = 'aws-cdk';

type AskClaude = Deps['askClaude'];
const makeDeps = (askClaudeImpl: AskClaude): Pick<Deps, 'storage' | 'askClaude'> => ({
  storage: createInMemoryStorage(),
  askClaude: askClaudeImpl,
});

const validResponse = JSON.stringify({
  why: 'Mixins change how constructs compose, which is core to how CDK Insights traverses the construct tree.',
  integrations: [
    {
      title: 'Add mixin-awareness rule',
      detail: 'In src/aspects/CdkInsightsAspect.ts, detect mixin-derived constructs.',
    },
  ],
});

describe('hashKey', () => {
  it('is deterministic for the same input', () => {
    expect(hashKey('hello')).toBe(hashKey('hello'));
  });

  it('differs across inputs', () => {
    expect(hashKey('a')).not.toBe(hashKey('b'));
  });

  it('handles empty string', () => {
    expect(hashKey('')).toBe((5381 >>> 0).toString(36));
  });

  it('returns base-36 lowercase', () => {
    expect(hashKey('foo')).toMatch(/^[0-9a-z]+$/);
  });
});

describe('briefCacheKey', () => {
  it('composes the canonical cache key format', () => {
    const key = briefCacheKey('aws-cdk', 'cdki', 'fp123', 'release:v1');
    expect(key.startsWith('aws-cdk-news.brief.cdki.fp123.')).toBe(true);
    expect(key.endsWith(hashKey('release:v1'))).toBe(true);
  });

  it('produces different keys for different products', () => {
    const k1 = briefCacheKey('aws-cdk', 'cdki', 'fp', 's1');
    const k2 = briefCacheKey('aws-cdk', 'lc', 'fp', 's1');
    expect(k1).not.toBe(k2);
  });

  it('produces different keys for different fingerprints — context refresh invalidates', () => {
    const k1 = briefCacheKey('aws-cdk', 'cdki', 'old', 's1');
    const k2 = briefCacheKey('aws-cdk', 'cdki', 'new', 's1');
    expect(k1).not.toBe(k2);
  });

  it('produces different keys for different topic slugs', () => {
    const k1 = briefCacheKey('aws-cdk', 'cdki', 'fp', 's1');
    const k2 = briefCacheKey('serverless-ts', 'cdki', 'fp', 's1');
    expect(k1).not.toBe(k2);
  });
});

describe('fetchBrief — cache miss path', () => {
  it('calls askClaude with the system prompt + ITEM block', async () => {
    const askClaude = vi.fn<AskClaude>().mockResolvedValue(validResponse);
    const deps = makeDeps(askClaude);
    await fetchBrief(deps, {
      flag: FLAG,
      prompt: PROMPT,
      fingerprint: FINGERPRINT,
      topicSlug: TOPIC_SLUG,
      item: ITEM,
    });
    expect(askClaude).toHaveBeenCalledTimes(1);
    const call = askClaude.mock.calls[0];
    if (!call) throw new Error('expected exactly one askClaude call');
    const [promptArg, dataArg] = call;
    expect(promptArg.startsWith(PROMPT)).toBe(true);
    expect(promptArg.includes('ITEM:\n')).toBe(true);
    expect(dataArg).toEqual([
      {
        type: 'release-features',
        source: 'aws/aws-cdk',
        text: '**core:** add foo support',
        url: 'https://example.com/r/1',
        initial_relevance_reason: 'CDK area',
        version: 'v1.0',
      },
    ]);
  });

  it('parses a clean JSON response into a Brief', async () => {
    const askClaude = vi.fn<AskClaude>().mockResolvedValue(validResponse);
    const deps = makeDeps(askClaude);
    const brief = await fetchBrief(deps, {
      flag: FLAG,
      prompt: PROMPT,
      fingerprint: FINGERPRINT,
      topicSlug: TOPIC_SLUG,
      item: ITEM,
    });
    expect(brief.why).toContain('Mixins change');
    expect(brief.integrations).toHaveLength(1);
    expect(brief.integrations[0]).toEqual({
      title: 'Add mixin-awareness rule',
      detail: 'In src/aspects/CdkInsightsAspect.ts, detect mixin-derived constructs.',
    });
  });

  it('writes the parsed brief back to storage so subsequent calls cache-hit', async () => {
    const askClaude = vi.fn<AskClaude>().mockResolvedValue(validResponse);
    const deps = makeDeps(askClaude);
    await fetchBrief(deps, {
      flag: FLAG,
      prompt: PROMPT,
      fingerprint: FINGERPRINT,
      topicSlug: TOPIC_SLUG,
      item: ITEM,
    });
    const expectedKey = briefCacheKey(TOPIC_SLUG, FLAG.productId, FINGERPRINT, FLAG.stableId);
    const cached = deps.storage.getItem(expectedKey);
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached ?? 'null').why).toContain('Mixins change');
  });

  it('omits version from the payload when item.version is undefined', async () => {
    const askClaude = vi.fn<AskClaude>().mockResolvedValue(validResponse);
    const deps = makeDeps(askClaude);
    // exactOptionalPropertyTypes — must omit the prop, not assign undefined.
    const { version: _v, ...itemNoVersion } = ITEM;
    void _v;
    await fetchBrief(deps, {
      flag: FLAG,
      prompt: PROMPT,
      fingerprint: FINGERPRINT,
      topicSlug: TOPIC_SLUG,
      item: itemNoVersion,
    });
    const call = askClaude.mock.calls[0];
    if (!call) throw new Error('expected exactly one askClaude call');
    const [, dataArg] = call;
    expect(dataArg).toBeDefined();
    expect((dataArg as unknown[])[0]).not.toHaveProperty('version');
  });

  it('defaults source to empty string when undefined', async () => {
    const askClaude = vi.fn<AskClaude>().mockResolvedValue(validResponse);
    const deps = makeDeps(askClaude);
    const { source: _s, ...itemNoSource } = ITEM;
    void _s;
    await fetchBrief(deps, {
      flag: FLAG,
      prompt: PROMPT,
      fingerprint: FINGERPRINT,
      topicSlug: TOPIC_SLUG,
      item: itemNoSource,
    });
    const call = askClaude.mock.calls[0];
    if (!call) throw new Error('expected exactly one askClaude call');
    const [, dataArg] = call;
    expect((dataArg as Array<{ source: string }>)[0]?.source).toBe('');
  });
});

describe('fetchBrief — cache hit path', () => {
  it('returns the cached brief without calling askClaude', async () => {
    const askClaude = vi.fn<AskClaude>();
    const deps = makeDeps(askClaude);
    const key = briefCacheKey(TOPIC_SLUG, FLAG.productId, FINGERPRINT, FLAG.stableId);
    deps.storage.setItem(
      key,
      JSON.stringify({
        why: 'cached why',
        integrations: [{ title: 'cached t', detail: 'cached d' }],
      }),
    );
    const brief = await fetchBrief(deps, {
      flag: FLAG,
      prompt: PROMPT,
      fingerprint: FINGERPRINT,
      topicSlug: TOPIC_SLUG,
      item: ITEM,
    });
    expect(brief.why).toBe('cached why');
    expect(askClaude).not.toHaveBeenCalled();
  });

  it('ignores a corrupt cache entry and falls back to askClaude', async () => {
    const askClaude = vi.fn<AskClaude>().mockResolvedValue(validResponse);
    const deps = makeDeps(askClaude);
    const key = briefCacheKey(TOPIC_SLUG, FLAG.productId, FINGERPRINT, FLAG.stableId);
    deps.storage.setItem(key, '{not valid json');
    const brief = await fetchBrief(deps, {
      flag: FLAG,
      prompt: PROMPT,
      fingerprint: FINGERPRINT,
      topicSlug: TOPIC_SLUG,
      item: ITEM,
    });
    expect(brief.why).toContain('Mixins change');
    expect(askClaude).toHaveBeenCalledTimes(1);
  });

  it('ignores a cache entry that is missing why and falls back', async () => {
    const askClaude = vi.fn<AskClaude>().mockResolvedValue(validResponse);
    const deps = makeDeps(askClaude);
    const key = briefCacheKey(TOPIC_SLUG, FLAG.productId, FINGERPRINT, FLAG.stableId);
    deps.storage.setItem(key, JSON.stringify({ integrations: [] }));
    const brief = await fetchBrief(deps, {
      flag: FLAG,
      prompt: PROMPT,
      fingerprint: FINGERPRINT,
      topicSlug: TOPIC_SLUG,
      item: ITEM,
    });
    expect(brief.why).toContain('Mixins change');
    expect(askClaude).toHaveBeenCalledTimes(1);
  });

  it('regenerates when fingerprint changes — context refresh invalidates', async () => {
    const askClaude = vi.fn<AskClaude>().mockResolvedValue(validResponse);
    const deps = makeDeps(askClaude);
    // Cache against an OLD fingerprint.
    const oldKey = briefCacheKey(TOPIC_SLUG, FLAG.productId, 'old-fp', FLAG.stableId);
    deps.storage.setItem(oldKey, JSON.stringify({ why: 'old', integrations: [] }));
    // Fetch against a NEW fingerprint — the lookup misses, askClaude runs.
    const brief = await fetchBrief(deps, {
      flag: FLAG,
      prompt: PROMPT,
      fingerprint: 'new-fp',
      topicSlug: TOPIC_SLUG,
      item: ITEM,
    });
    expect(brief.why).toContain('Mixins change');
    expect(askClaude).toHaveBeenCalledTimes(1);
  });
});

describe('fetchBrief — askClaude response normalisation', () => {
  it('accepts a raw string response', async () => {
    const deps = makeDeps(vi.fn<AskClaude>().mockResolvedValue(validResponse));
    const brief = await fetchBrief(deps, {
      flag: FLAG,
      prompt: PROMPT,
      fingerprint: FINGERPRINT,
      topicSlug: TOPIC_SLUG,
      item: ITEM,
    });
    expect(brief.why).toContain('Mixins change');
  });

  it('accepts {text: string}', async () => {
    const deps = makeDeps(
      vi.fn<AskClaude>().mockResolvedValue({ text: validResponse } as unknown as string),
    );
    const brief = await fetchBrief(deps, {
      flag: FLAG,
      prompt: PROMPT,
      fingerprint: FINGERPRINT,
      topicSlug: TOPIC_SLUG,
      item: ITEM,
    });
    expect(brief.why).toContain('Mixins change');
  });

  it('accepts MCP-shaped {content: [{text}]} arrays', async () => {
    const deps = makeDeps(
      vi.fn<AskClaude>().mockResolvedValue({
        content: [{ text: validResponse.slice(0, 40) }, { text: validResponse.slice(40) }],
      } as unknown as string),
    );
    const brief = await fetchBrief(deps, {
      flag: FLAG,
      prompt: PROMPT,
      fingerprint: FINGERPRINT,
      topicSlug: TOPIC_SLUG,
      item: ITEM,
    });
    expect(brief.why).toContain('Mixins change');
  });

  it('accepts {response: string} as a last-resort key', async () => {
    const deps = makeDeps(
      vi.fn<AskClaude>().mockResolvedValue({ response: validResponse } as unknown as string),
    );
    const brief = await fetchBrief(deps, {
      flag: FLAG,
      prompt: PROMPT,
      fingerprint: FINGERPRINT,
      topicSlug: TOPIC_SLUG,
      item: ITEM,
    });
    expect(brief.why).toContain('Mixins change');
  });

  it('extracts JSON when Haiku wraps the response with prose', async () => {
    const wrapped = `Sure thing! Here is the brief:\n\n${validResponse}\n\nLet me know if you need more.`;
    const deps = makeDeps(vi.fn<AskClaude>().mockResolvedValue(wrapped));
    const brief = await fetchBrief(deps, {
      flag: FLAG,
      prompt: PROMPT,
      fingerprint: FINGERPRINT,
      topicSlug: TOPIC_SLUG,
      item: ITEM,
    });
    expect(brief.why).toContain('Mixins change');
  });
});

describe('fetchBrief — unusable model responses fall back to the regex reason', () => {
  const args = {
    flag: FLAG,
    prompt: PROMPT,
    fingerprint: FINGERPRINT,
    topicSlug: TOPIC_SLUG,
    item: ITEM,
  };

  it('falls back to the flag reason when the response contains no JSON', async () => {
    const deps = makeDeps(vi.fn<AskClaude>().mockResolvedValue('Sorry, I cannot help.'));
    expect(await fetchBrief(deps, args)).toEqual({ why: 'CDK area', integrations: [] });
  });

  it('falls back when the JSON inside the response is malformed', async () => {
    const deps = makeDeps(vi.fn<AskClaude>().mockResolvedValue('{ not: valid json }'));
    expect((await fetchBrief(deps, args)).why).toBe('CDK area');
  });

  it('falls back when the response is missing the why field', async () => {
    const deps = makeDeps(
      vi.fn<AskClaude>().mockResolvedValue(JSON.stringify({ integrations: [] })),
    );
    expect((await fetchBrief(deps, args)).why).toBe('CDK area');
  });

  it('falls back when why is an empty string', async () => {
    const deps = makeDeps(
      vi.fn<AskClaude>().mockResolvedValue(JSON.stringify({ why: '', integrations: [] })),
    );
    expect((await fetchBrief(deps, args)).why).toBe('CDK area');
  });

  it('falls back when askClaude itself rejects (no model / no window.cowork)', async () => {
    const deps = makeDeps(vi.fn<AskClaude>().mockRejectedValue(new Error('no cowork runtime')));
    expect(await fetchBrief(deps, args)).toEqual({ why: 'CDK area', integrations: [] });
  });

  it('does not cache the fallback brief — a later working model regenerates a real brief', async () => {
    const storage = createInMemoryStorage();
    await fetchBrief(
      { storage, askClaude: vi.fn<AskClaude>().mockRejectedValue(new Error('down')) },
      args,
    );
    const brief = await fetchBrief(
      { storage, askClaude: vi.fn<AskClaude>().mockResolvedValue(validResponse) },
      args,
    );
    expect(brief.why).toContain('Mixins change');
  });

  it('defaults integrations to [] when missing or non-array', async () => {
    const deps = makeDeps(vi.fn<AskClaude>().mockResolvedValue(JSON.stringify({ why: 'reason' })));
    expect((await fetchBrief(deps, args)).integrations).toEqual([]);
  });

  it('coerces malformed integration entries into {title:"", detail:""}', async () => {
    const malformed = JSON.stringify({
      why: 'reason',
      integrations: [
        { title: 'good', detail: 'g' },
        { title: 42, detail: { nested: true } },
        null,
        'not an object',
      ],
    });
    const deps = makeDeps(vi.fn<AskClaude>().mockResolvedValue(malformed));
    const brief = await fetchBrief(deps, args);
    // Two object entries → integrations length 2 (string + null filtered out).
    expect(brief.integrations).toHaveLength(2);
    expect(brief.integrations[0]).toEqual({ title: 'good', detail: 'g' });
    expect(brief.integrations[1]).toEqual({ title: '', detail: '' });
  });
});

describe('briefFromReason', () => {
  it('builds a minimal brief from the flag reason', () => {
    expect(briefFromReason(FLAG, ITEM)).toEqual({ why: 'CDK area', integrations: [] });
  });

  it('falls back flag reason → item reason → a generic line', () => {
    const noFlagReason: Flag = { ...FLAG, reason: '' };
    expect(briefFromReason(noFlagReason, ITEM).why).toBe('CDK area');
    expect(briefFromReason(noFlagReason, { ...ITEM, reason: '' }).why).toMatch(/relevant/i);
  });
});

describe('fetchBrief — storage quirks', () => {
  it('does not throw when storage.setItem throws (quota / SecurityError)', async () => {
    const askClaude = vi.fn<AskClaude>().mockResolvedValue(validResponse);
    const storage = createInMemoryStorage();
    const failingStorage: Storage = {
      ...storage,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    const deps = { storage: failingStorage, askClaude };
    await expect(
      fetchBrief(deps, {
        flag: FLAG,
        prompt: PROMPT,
        fingerprint: FINGERPRINT,
        topicSlug: TOPIC_SLUG,
        item: ITEM,
      }),
    ).resolves.toBeDefined();
  });

  it('does not throw when storage.getItem throws (SecurityError)', async () => {
    const askClaude = vi.fn<AskClaude>().mockResolvedValue(validResponse);
    const storage = createInMemoryStorage();
    const failingStorage: Storage = {
      ...storage,
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    const deps = { storage: failingStorage, askClaude };
    const brief = await fetchBrief(deps, {
      flag: FLAG,
      prompt: PROMPT,
      fingerprint: FINGERPRINT,
      topicSlug: TOPIC_SLUG,
      item: ITEM,
    });
    expect(brief.why).toContain('Mixins change');
  });
});

describe('fetchBrief — output contract', () => {
  it('appends the JSON output-shape contract so a contract-less prompt still parses', async () => {
    const askClaude = vi.fn<AskClaude>().mockResolvedValue(validResponse);
    const deps = makeDeps(askClaude);
    await fetchBrief(deps, {
      flag: FLAG,
      prompt: 'Last Command is a SaaS. Frame the post as a feature for lc-storm-service.',
      fingerprint: FINGERPRINT,
      topicSlug: TOPIC_SLUG,
      item: ITEM,
    });
    const promptArg = askClaude.mock.calls[0]?.[0] ?? '';
    expect(promptArg).toContain('"why"');
    expect(promptArg).toContain('"integrations"');
    expect(promptArg.toLowerCase()).toContain('json object');
  });
});
