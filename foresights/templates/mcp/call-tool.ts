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

/**
 * Try common GitHub MCP wrapping keys. Some tools return the resource array
 * directly; others wrap it in `{issues: [...]}` / `{items: [...]}` /
 * `{pull_requests: [...]}` / `{releases: [...]}` alongside pagination
 * metadata. v0.1 of the aws-cdk-news dashboard handled this inline; v0.2+
 * centralises it here so every renderer can assume an array.
 */
const ARRAY_WRAPPER_KEYS = ['items', 'issues', 'pull_requests', 'releases', 'data'] as const;

const unwrapArrayShape = (v: object): unknown => {
  for (const key of ARRAY_WRAPPER_KEYS) {
    const candidate = (v as Record<string, unknown>)[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return v;
};

/** Normalise an MCP tool result into a plain JS value. */
export const normalizeResult = (r: unknown): unknown => {
  if (r == null) return r;
  if (Array.isArray(r)) return r;
  if (typeof r === 'object') {
    if (isContentWrapper(r)) {
      const text = r.content.map((c) => c?.text ?? '').join('');
      const parsed = tryParse(text);
      // Recurse — the parsed text might itself be a wrapped object.
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? unwrapArrayShape(parsed)
        : parsed;
    }
    if (isTextWrapper(r)) {
      const parsed = tryParse(r.text);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? unwrapArrayShape(parsed)
        : parsed;
    }
    // Last resort — check if this plain object looks like a GH MCP shape.
    return unwrapArrayShape(r);
  }
  if (typeof r === 'string') {
    const parsed = tryParse(r);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? unwrapArrayShape(parsed)
      : parsed;
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
