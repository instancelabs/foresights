import { describe, expect, it } from 'vitest';
import type { Deps } from '../types';
import { createInMemoryStorage } from '../util/storage';
import { setStoredContext } from './context-store';
import { appendRepoContext, formatRepoContext } from './repo-context';

const buildDeps = (): Pick<Deps, 'storage'> => ({
  storage: createInMemoryStorage(),
});

describe('formatRepoContext', () => {
  it('returns "" when the product has no stored context', () => {
    expect(formatRepoContext(buildDeps(), 'topic', 'p')).toBe('');
  });

  it('returns "" when the stored layoutMap has no paths array', () => {
    const deps = buildDeps();
    setStoredContext(deps, 'topic', 'p', {
      layoutMap: { notPaths: true },
      fingerprint: 'x',
      fetchedAt: '2026-05-20T10:00:00Z',
    });
    expect(formatRepoContext(deps, 'topic', 'p')).toBe('');
  });

  it('returns "" when paths is an empty array', () => {
    const deps = buildDeps();
    setStoredContext(deps, 'topic', 'p', {
      layoutMap: { paths: [] },
      fingerprint: 'x',
      fetchedAt: '2026-05-20T10:00:00Z',
    });
    expect(formatRepoContext(deps, 'topic', 'p')).toBe('');
  });

  it('renders a header with the refresh date and one line per path', () => {
    const deps = buildDeps();
    setStoredContext(deps, 'aws-cdk', 'cdki', {
      layoutMap: {
        paths: [
          { path: 'CLAUDE.md', type: 'file', hash: 'h1', size: 4231 },
          { path: 'src/rules', type: 'dir', hash: 'h2', size: 31 },
        ],
      },
      fingerprint: 'fp',
      fetchedAt: '2026-05-20T10:00:00Z',
    });
    const out = formatRepoContext(deps, 'aws-cdk', 'cdki');
    expect(out).toContain('## Repo context (refreshed 2026-05-20)');
    expect(out).toContain('`CLAUDE.md` — file, 4231 bytes');
    expect(out).toContain('`src/rules` — directory, 31 entries');
  });

  it('describes error entries without a size', () => {
    const deps = buildDeps();
    setStoredContext(deps, 'topic', 'p', {
      layoutMap: { paths: [{ path: 'gone.md', type: 'error', hash: 'h', size: 0 }] },
      fingerprint: 'x',
      fetchedAt: '2026-05-20T10:00:00Z',
    });
    expect(formatRepoContext(deps, 'topic', 'p')).toContain('`gone.md` — could not be fetched');
  });

  it('skips malformed path entries but keeps the valid ones', () => {
    const deps = buildDeps();
    setStoredContext(deps, 'topic', 'p', {
      layoutMap: {
        paths: [{ path: 'ok.md', type: 'file', size: 10 }, { nope: true }, 42, null],
      },
      fingerprint: 'x',
      fetchedAt: '2026-05-20T10:00:00Z',
    });
    const out = formatRepoContext(deps, 'topic', 'p');
    expect(out).toContain('`ok.md`');
    expect((out.match(/^- /gm) ?? []).length).toBe(1);
  });
});

describe('appendRepoContext', () => {
  it('returns the prompt unchanged when the block is empty', () => {
    expect(appendRepoContext('PROMPT', '')).toBe('PROMPT');
  });

  it('appends the block separated by a blank line', () => {
    expect(appendRepoContext('PROMPT', 'BLOCK')).toBe('PROMPT\n\nBLOCK');
  });
});
