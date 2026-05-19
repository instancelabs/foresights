/**
 * MCP tool dispatch + result normalisation.
 *
 * Some MCP harnesses wrap results in {content: [{type:'text', text:'...'}]};
 * others return raw JSON. normalizeResult unifies the shapes so callers
 * always receive parsed data.
 *
 * Status: Phase 2 scaffold — real impl + tests land in Phase 3.
 */

import type { Deps } from '../types';

interface ContentWrapper {
  content: ReadonlyArray<{ text?: string }>;
}

interface TextWrapper {
  text: string;
}

const isContentWrapper = (v: object): v is ContentWrapper =>
  'content' in v && Array.isArray((v as { content: unknown }).content);

const isTextWrapper = (v: object): v is TextWrapper =>
  'text' in v && typeof (v as { text: unknown }).text === 'string';

const tryParse = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

/** Normalise an MCP tool result into a plain JS value. */
export const normalizeResult = (r: unknown): unknown => {
  if (r == null) return r;
  if (Array.isArray(r)) return r;
  if (typeof r === 'object') {
    if (isContentWrapper(r)) {
      const text = r.content.map((c) => c?.text ?? '').join('');
      return tryParse(text);
    }
    if (isTextWrapper(r)) {
      return tryParse(r.text);
    }
    return r;
  }
  if (typeof r === 'string') {
    return tryParse(r);
  }
  return r;
};

/** Call an MCP tool through Deps; return the normalised result. */
export const callTool = async (
  deps: Pick<Deps, 'callTool'>,
  name: string,
  args: unknown,
): Promise<unknown> => {
  const raw = await deps.callTool(name, args);
  return normalizeResult(raw);
};
