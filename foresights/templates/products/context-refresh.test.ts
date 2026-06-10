import { describe, expect, it } from 'vitest';
import { FILE_CONTENT_CAP, normaliseResponse } from './context-refresh';

describe('normaliseResponse — files', () => {
  it('captures file content alongside the hash and size', () => {
    const e = normaliseResponse('CLAUDE.md', { content: 'hello world' });
    expect(e.type).toBe('file');
    expect(e.content).toBe('hello world');
    expect(e.size).toBe(11);
    expect(typeof e.hash).toBe('string');
  });

  it('keeps short content verbatim (no truncation marker)', () => {
    const e = normaliseResponse('README.md', { content: 'short' });
    expect(e.content).toBe('short');
    expect(e.content).not.toContain('truncated');
  });

  it('truncates content past the cap and appends a marker', () => {
    const big = 'x'.repeat(FILE_CONTENT_CAP + 500);
    const e = normaliseResponse('huge.md', { content: big });
    expect(e.content?.startsWith('x'.repeat(FILE_CONTENT_CAP))).toBe(true);
    expect(e.content).toContain('(truncated at 16KB)');
    // size still reflects the FULL file, not the capped slice.
    expect(e.size).toBe(FILE_CONTENT_CAP + 500);
  });

  it('hashes the full content even when the stored slice is truncated', () => {
    const big = 'x'.repeat(FILE_CONTENT_CAP + 500);
    const fullHash = normaliseResponse('a.md', { content: big }).hash;
    const shorterHash = normaliseResponse('a.md', {
      content: 'x'.repeat(FILE_CONTENT_CAP),
    }).hash;
    // Different full content → different hash, even though both capped
    // slices are identical. This is what keeps the fingerprint accurate.
    expect(fullHash).not.toBe(shorterHash);
  });
});

describe('normaliseResponse — string file payloads (real GitHub MCP shape)', () => {
  it('treats a bare string as file content', () => {
    const e = normaliseResponse('CLAUDE.md', 'hello world');
    expect(e.type).toBe('file');
    expect(e.content).toBe('hello world');
    expect(e.size).toBe(11);
  });

  it('strips the "successfully downloaded text file (SHA: …)" prefix', () => {
    const raw =
      'successfully downloaded text file (SHA: 91d5a119dc173ec5a267d762c7898e4f12f79e42)# CDK Insights\n\nbody';
    const e = normaliseResponse('CLAUDE.md', raw);
    expect(e.type).toBe('file');
    expect(e.content).toBe('# CDK Insights\n\nbody');
    expect(e.content?.startsWith('successfully downloaded')).toBe(false);
  });

  it('truncates a long string payload past the cap', () => {
    const big = 'x'.repeat(FILE_CONTENT_CAP + 500);
    const e = normaliseResponse('huge.md', big);
    expect(e.content).toContain('(truncated at 16KB)');
    expect(e.size).toBe(FILE_CONTENT_CAP + 500);
  });
});

describe('normaliseResponse — directories', () => {
  it('treats a bare array as a directory listing with no content', () => {
    const e = normaliseResponse('src/rules', [{ name: 'b.ts' }, { name: 'a.ts' }]);
    expect(e.type).toBe('dir');
    expect(e.size).toBe(2);
    expect(e.content).toBeUndefined();
  });

  it('treats an { entries: [...] } object as a directory with no content', () => {
    const e = normaliseResponse('src', { entries: [{ name: 'x.ts' }] });
    expect(e.type).toBe('dir');
    expect(e.size).toBe(1);
    expect(e.content).toBeUndefined();
  });
});

describe('normaliseResponse — errors', () => {
  it('returns a type=error entry with no content for null', () => {
    const e = normaliseResponse('gone', null);
    expect(e.type).toBe('error');
    expect(e.content).toBeUndefined();
  });

  it('returns a type=error entry for an unrecognised object shape', () => {
    const e = normaliseResponse('weird', { somethingElse: true });
    expect(e.type).toBe('error');
    expect(e.content).toBeUndefined();
  });
});
