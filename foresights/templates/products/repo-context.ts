/**
 * Repo-context block for Claude Code prompts.
 *
 * When a product's context has been refreshed (the ↻ button in the context
 * bar — see products/context-refresh.ts), the fetched repo layout is
 * persisted by products/context-store.ts. This module turns that stored
 * layout into a short markdown block that callers append to a generated
 * Claude Code prompt, so the prompt reflects the *current* repo structure
 * rather than only the structure baked in at wizard time.
 *
 * If the product was never refreshed, formatRepoContext returns '' and the
 * prompt is emitted unchanged — behaviour is byte-identical to pre-context-
 * loop builds for any dashboard whose user hasn't clicked ↻.
 *
 * The block has two parts: a structural overview (one bullet per fetched
 * path, with type + size) and — for file entries that carried content —
 * a verbatim content section per file. Directory entries contribute only
 * the structural bullet. v0.4.1+ context-refresh captures file content
 * (capped, see context-refresh.ts FILE_CONTENT_CAP); a pre-v0.4.1 stored
 * layout with no `content` fields degrades gracefully to overview-only.
 */

import type { Deps } from '../types';
import { getStoredContext } from './context-store';

/** One path entry as persisted in the layoutMap by context-refresh.ts. */
interface LayoutEntry {
  readonly path: string;
  readonly type: string;
  readonly size: number;
  /** File content (capped at fetch time). Present only for `type: 'file'`. */
  readonly content?: string;
}

/**
 * Narrow the opaque `layoutMap` to its `{ paths: LayoutEntry[] }` shape.
 * Returns null when the map isn't that shape; skips individual malformed
 * entries rather than discarding the whole list.
 */
const readPaths = (layoutMap: unknown): readonly LayoutEntry[] | null => {
  if (!layoutMap || typeof layoutMap !== 'object') return null;
  const candidate = (layoutMap as { paths?: unknown }).paths;
  if (!Array.isArray(candidate)) return null;
  const entries: LayoutEntry[] = [];
  for (const raw of candidate) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as { path?: unknown; type?: unknown; size?: unknown; content?: unknown };
    if (typeof e.path !== 'string') continue;
    entries.push({
      path: e.path,
      type: typeof e.type === 'string' ? e.type : 'unknown',
      size: typeof e.size === 'number' ? e.size : 0,
      ...(typeof e.content === 'string' ? { content: e.content } : {}),
    });
  }
  return entries;
};

/** Human-readable one-liner for a single layout entry. */
const describeEntry = (e: LayoutEntry): string => {
  if (e.type === 'dir') return `\`${e.path}\` — directory, ${e.size} entries`;
  if (e.type === 'file') return `\`${e.path}\` — file, ${e.size} bytes`;
  if (e.type === 'error') return `\`${e.path}\` — could not be fetched`;
  return `\`${e.path}\``;
};

/**
 * Build the repo-context markdown block for a product, or '' when the
 * product's context has never been refreshed (or the stored layout is
 * unusable / empty). Safe to call unconditionally — an empty result makes
 * `appendRepoContext` a no-op.
 */
export const formatRepoContext = (
  deps: Pick<Deps, 'storage'>,
  topicSlug: string,
  productId: string,
): string => {
  const ctx = getStoredContext(deps, topicSlug, productId);
  if (!ctx) return '';
  const paths = readPaths(ctx.layoutMap);
  if (!paths || paths.length === 0) return '';
  const refreshedOn = ctx.fetchedAt.slice(0, 10);
  const lines = [
    `## Repo context (refreshed ${refreshedOn})`,
    '',
    'The Foresights dashboard last pulled this from the product repo. Treat it as the current repo state when planning — if anything here differs from what the prompt above assumes, the repo changed since that context was baked.',
    '',
    ...paths.map((e) => `- ${describeEntry(e)}`),
  ];
  // Verbatim content section per file entry that carried content. Directory
  // and error entries contribute only the structural bullet above.
  for (const e of paths) {
    if (e.type === 'file' && e.content) {
      lines.push('', `### \`${e.path}\``, '', e.content);
    }
  }
  return lines.join('\n');
};

/**
 * Append a repo-context block to a prompt. An empty block leaves the prompt
 * unchanged, so callers can pass `formatRepoContext(...)` straight through
 * without a guard.
 */
export const appendRepoContext = (prompt: string, block: string): string =>
  block ? `${prompt}\n\n${block}` : prompt;
