import { describe, expect, it, vi } from 'vitest';
import { callTool, normalizeResult } from './call-tool';

describe('normalizeResult', () => {
  it('passes null through unchanged', () => {
    expect(normalizeResult(null)).toBeNull();
  });

  it('passes undefined through unchanged', () => {
    expect(normalizeResult(undefined)).toBeUndefined();
  });

  it('passes a plain array through unchanged', () => {
    const arr = [1, 2, 3];
    expect(normalizeResult(arr)).toBe(arr);
  });

  it('unwraps a {content: [{text:"<json>"}]} envelope and parses JSON', () => {
    const wrapped = {
      content: [{ type: 'text', text: '{"a":1,"b":2}' }],
    };
    expect(normalizeResult(wrapped)).toEqual({ a: 1, b: 2 });
  });

  it('concatenates multi-chunk content arrays before parsing', () => {
    const wrapped = {
      content: [
        { type: 'text', text: '{"a":' },
        { type: 'text', text: '1}' },
      ],
    };
    expect(normalizeResult(wrapped)).toEqual({ a: 1 });
  });

  it('returns the raw text when content cannot be parsed as JSON', () => {
    const wrapped = { content: [{ type: 'text', text: 'not json' }] };
    expect(normalizeResult(wrapped)).toBe('not json');
  });

  it('handles missing text fields in content chunks', () => {
    const wrapped = { content: [{ type: 'text' }, { type: 'text', text: '"ok"' }] };
    expect(normalizeResult(wrapped)).toBe('ok');
  });

  it('unwraps a {text:"<json>"} envelope and parses', () => {
    const wrapped = { text: '[1,2,3]' };
    expect(normalizeResult(wrapped)).toEqual([1, 2, 3]);
  });

  it('returns the raw text from a {text} envelope when JSON parsing fails', () => {
    const wrapped = { text: 'plain string' };
    expect(normalizeResult(wrapped)).toBe('plain string');
  });

  it('parses a bare JSON string into an object', () => {
    expect(normalizeResult('{"x":1}')).toEqual({ x: 1 });
  });

  it('returns a non-JSON string unchanged', () => {
    expect(normalizeResult('hello')).toBe('hello');
  });

  it('returns an unknown-shape object unchanged', () => {
    const obj = { foo: 'bar' };
    expect(normalizeResult(obj)).toBe(obj);
  });

  it('passes a number through unchanged', () => {
    expect(normalizeResult(42)).toBe(42);
  });
});

describe('callTool', () => {
  it('invokes deps.callTool with the given name and args', async () => {
    const callToolFn = vi.fn().mockResolvedValue({ ok: true });
    const result = await callTool({ callTool: callToolFn }, 'tool-name', { foo: 'bar' });
    expect(callToolFn).toHaveBeenCalledWith('tool-name', { foo: 'bar' });
    expect(result).toEqual({ ok: true });
  });

  it('normalises a wrapped result before returning', async () => {
    const callToolFn = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"x":1}' }],
    });
    const result = await callTool({ callTool: callToolFn }, 'tool-name', {});
    expect(result).toEqual({ x: 1 });
  });

  it('propagates rejection from the underlying tool', async () => {
    const callToolFn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(callTool({ callTool: callToolFn }, 'tool-name', {})).rejects.toThrow('boom');
  });
});
