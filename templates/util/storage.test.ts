import { beforeEach, describe, expect, it } from 'vitest';
import { createInMemoryStorage } from './storage';

describe('createInMemoryStorage', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createInMemoryStorage();
  });

  it('starts empty', () => {
    expect(storage.length).toBe(0);
    expect(storage.getItem('any-key')).toBeNull();
  });

  it('stores and retrieves a value', () => {
    storage.setItem('foo', 'bar');
    expect(storage.getItem('foo')).toBe('bar');
    expect(storage.length).toBe(1);
  });

  it('coerces non-string values to strings on setItem (matches Storage contract)', () => {
    storage.setItem('n', 42 as unknown as string);
    expect(storage.getItem('n')).toBe('42');
  });

  it('overwrites existing values', () => {
    storage.setItem('foo', 'bar');
    storage.setItem('foo', 'baz');
    expect(storage.getItem('foo')).toBe('baz');
    expect(storage.length).toBe(1);
  });

  it('removes a stored value', () => {
    storage.setItem('foo', 'bar');
    storage.removeItem('foo');
    expect(storage.getItem('foo')).toBeNull();
    expect(storage.length).toBe(0);
  });

  it('clears all values', () => {
    storage.setItem('a', '1');
    storage.setItem('b', '2');
    storage.clear();
    expect(storage.length).toBe(0);
    expect(storage.getItem('a')).toBeNull();
  });

  it('returns the key at a given index', () => {
    storage.setItem('first', '1');
    storage.setItem('second', '2');
    expect(storage.key(0)).toBe('first');
    expect(storage.key(1)).toBe('second');
  });

  it('returns null for out-of-range key indexes', () => {
    storage.setItem('only', '1');
    expect(storage.key(5)).toBeNull();
  });

  it('isolates separate instances', () => {
    const a = createInMemoryStorage();
    const b = createInMemoryStorage();
    a.setItem('shared-key', 'in-a');
    expect(b.getItem('shared-key')).toBeNull();
  });
});
