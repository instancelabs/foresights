import { describe, expect, it } from 'vitest';
import type { Deps } from '../types';
import { createInMemoryStorage } from '../util/storage';
import {
  contextKey,
  effectiveFingerprint,
  effectiveLayoutMap,
  fingerprintOf,
  getStoredContext,
  setStoredContext,
} from './context-store';

const buildDeps = (): Pick<Deps, 'storage'> => ({
  storage: createInMemoryStorage(),
});

describe('contextKey', () => {
  it('namespaces by topic + product', () => {
    expect(contextKey('aws-cdk', 'cdki')).toBe('foresights:context:aws-cdk:cdki');
    expect(contextKey('rust-async', 'tokio')).toBe('foresights:context:rust-async:tokio');
  });
});

describe('fingerprintOf', () => {
  it('returns the same hash for identical input', () => {
    expect(fingerprintOf('hello')).toBe(fingerprintOf('hello'));
  });

  it('returns different hashes for different inputs', () => {
    expect(fingerprintOf('hello')).not.toBe(fingerprintOf('world'));
  });

  it('handles empty string', () => {
    expect(typeof fingerprintOf('')).toBe('string');
  });

  it('returns a base36 string (no leading zeros / negative numbers)', () => {
    const h = fingerprintOf('test content');
    expect(h).toMatch(/^[0-9a-z]+$/);
  });
});

describe('getStoredContext / setStoredContext', () => {
  it('round-trips a stored context', () => {
    const deps = buildDeps();
    const ctx = {
      layoutMap: { services: ['s3', 'iam'] },
      fingerprint: 'abc123',
      fetchedAt: '2026-05-20T12:00:00Z',
      itemCount: 27,
    };
    setStoredContext(deps, 'aws-cdk', 'cdki', ctx);
    const out = getStoredContext(deps, 'aws-cdk', 'cdki');
    expect(out).toEqual(ctx);
  });

  it('returns null for absent context', () => {
    const deps = buildDeps();
    expect(getStoredContext(deps, 'topic', 'product')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const deps = buildDeps();
    deps.storage.setItem(contextKey('topic', 'product'), '{not json');
    expect(getStoredContext(deps, 'topic', 'product')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    const deps = buildDeps();
    deps.storage.setItem(contextKey('topic', 'product'), JSON.stringify({ layoutMap: {} }));
    expect(getStoredContext(deps, 'topic', 'product')).toBeNull();
  });

  it('preserves layoutMap shape exactly (opaque)', () => {
    const deps = buildDeps();
    const oddShape = { a: 1, b: [2, 3], c: { d: 'nested' } };
    setStoredContext(deps, 'topic', 'product', {
      layoutMap: oddShape,
      fingerprint: 'x',
      fetchedAt: 'now',
    });
    expect(getStoredContext(deps, 'topic', 'product')?.layoutMap).toEqual(oddShape);
  });
});

describe('effectiveFingerprint', () => {
  it('returns "static" when no context stored', () => {
    const deps = buildDeps();
    expect(effectiveFingerprint(deps, 'topic', 'p')).toBe('static');
  });

  it('returns stored fingerprint when context exists', () => {
    const deps = buildDeps();
    setStoredContext(deps, 'topic', 'p', {
      layoutMap: {},
      fingerprint: 'fresh-abc',
      fetchedAt: 'now',
    });
    expect(effectiveFingerprint(deps, 'topic', 'p')).toBe('fresh-abc');
  });
});

describe('effectiveLayoutMap', () => {
  it('returns null when no context stored', () => {
    const deps = buildDeps();
    expect(effectiveLayoutMap(deps, 'topic', 'p')).toBeNull();
  });

  it('returns the layoutMap when present', () => {
    const deps = buildDeps();
    setStoredContext(deps, 'topic', 'p', {
      layoutMap: { foo: 'bar' },
      fingerprint: 'x',
      fetchedAt: 'now',
    });
    expect(effectiveLayoutMap(deps, 'topic', 'p')).toEqual({ foo: 'bar' });
  });
});
