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
 * The block is a structural overview: one bullet per fetched path, with
 * type + size, plus an instruction to open the paths in the repo. We
 * deliberately DON'T dump file bodies into the prompt — Claude Code has the
 * repo and reads current files itself (and auto-loads CLAUDE.md), so a path
 * list avoids prompt bloat and staleness. context-refresh.ts still captures
 * file content for the change-detection fingerprint; it just isn't inlined.
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
    'These are the product repo paths the Foresights dashboard tracks for this product. Open them in the repo to ground your work against the current source — they reflect the repo as of the refresh date above and may have changed since. Claude Code auto-loads CLAUDE.md.',
    '',
    ...paths.map((e) => `- ${describeEntry(e)}`),
  ];
  return lines.join('\n');
};

/**
 * Append a repo-context block to a prompt. An empty block leaves the prompt
 * unchanged, so callers can pass `formatRepoContext(...)` straight through
 * without a guard.
 */
export const appendRepoContext = (prompt: string, block: string): string =>
  block ? `${prompt}\n\n${block}` : prompt;
