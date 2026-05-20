/**
 * Per-product context refresh — ↻ button + GitHub MCP fetcher.
 *
 * For each product that opted into context refresh at wizard time, this
 * module wires the ↻ button to a fetch-from-repo flow:
 *
 *   1. Click → fetch each configured `paths[]` entry via the GitHub MCP
 *      `get_file_contents` tool. Files return their text content;
 *      directories return their child listing.
 *   2. Serialise the responses into a compact `layoutMap` JSON blob.
 *   3. Hash the serialisation into a fingerprint.
 *   4. Persist via `context-store.setStoredContext`. Existing cached briefs
 *      key against the old fingerprint and become unreachable, so the next
 *      brief click re-runs Haiku with the refreshed context.
 *   5. Update the button + status text in place ("Refreshed 2s ago · 27
 *      paths indexed").
 *
 * Design notes:
 * - Errors surface in the button label + console. No throw escapes init.
 * - The `paths` array is intentionally opaque to this module — CC prompt
 *   builders (templates/products/cc-prompts.ts) interpret the saved
 *   `layoutMap` per their own conventions.
 * - The status text is a sibling `<span id="context-status-${id}">` of the
 *   button — present in PRODUCT_UI_BARS markup when contextRefresh is
 *   configured for a product.
 */

import { callTool } from '../mcp/call-tool';
import type { Deps, Product } from '../types';
import {
  type StoredContext,
  fingerprintOf,
  getStoredContext,
  setStoredContext,
} from './context-store';

/** Per-product context-refresh spec the wizard emits via CONTEXT_REFRESHERS. */
export interface ContextRefreshSpec {
  /** GitHub repo coordinates. */
  readonly owner: string;
  readonly repo: string;
  /**
   * Repo-relative paths to fetch. Each path is passed to the GitHub MCP's
   * `get_file_contents` tool — files return content, directories return
   * a child listing. Mix as needed.
   */
  readonly paths: readonly string[];
  /**
   * Human-readable unit shown in the status text — e.g. "service folders"
   * for CDK Insights' `src/rules/` listing, or "lc-* repos" for Last
   * Command's org search. Defaults to "paths indexed" if absent.
   */
  readonly unitLabel?: string;
}

export interface InitContextRefreshBarOpts {
  readonly products: readonly Product[];
  /** Map of productId → refresh spec. Products missing from this map have no ↻ button wired. */
  readonly refreshers: Readonly<Record<string, ContextRefreshSpec>>;
  /** Topic slug — namespaces the localStorage key so multi-dashboard users don't collide. */
  readonly topicSlug: string;
  /** MCP server prefix for the user's GitHub MCP (e.g. `mcp__github`). */
  readonly ghServer: string;
}

export interface ContextRefreshBarHandle {
  readonly dispose: () => void;
  /** Re-read each product's stored context and re-render the status text. */
  readonly refreshStatus: () => void;
}

/** Compact serialised entry per fetched path. Used to compute the fingerprint. */
interface FetchedEntry {
  readonly path: string;
  /** 'file' | 'dir' | 'error' — what the MCP returned. */
  readonly type: string;
  /** For files: content hash. For dirs: child-list hash. For errors: error message. */
  readonly hash: string;
  /** For dirs: child count. For files: byte length. Used in status text. */
  readonly size: number;
}

interface FetchResultRaw {
  readonly type?: unknown;
  readonly content?: unknown;
  readonly entries?: unknown;
  readonly name?: unknown;
  readonly size?: unknown;
}

/** Coerce an MCP `get_file_contents` response into a FetchedEntry. */
const normaliseResponse = (path: string, raw: unknown): FetchedEntry => {
  if (raw === null || typeof raw !== 'object') {
    return { path, type: 'error', hash: fingerprintOf('null'), size: 0 };
  }
  if (Array.isArray(raw)) {
    // Directory listing — array of {name, type, ...}.
    const names = raw
      .map((e) =>
        e && typeof e === 'object' && 'name' in e && typeof (e as FetchResultRaw).name === 'string'
          ? String((e as FetchResultRaw).name)
          : '',
      )
      .filter((n) => n.length > 0)
      .sort();
    return { path, type: 'dir', hash: fingerprintOf(names.join('|')), size: names.length };
  }
  const obj = raw as FetchResultRaw;
  if (typeof obj.content === 'string') {
    return {
      path,
      type: 'file',
      hash: fingerprintOf(obj.content),
      size: obj.content.length,
    };
  }
  if (Array.isArray(obj.entries)) {
    const names = obj.entries
      .map((e) =>
        e && typeof e === 'object' && 'name' in e && typeof (e as FetchResultRaw).name === 'string'
          ? String((e as FetchResultRaw).name)
          : '',
      )
      .filter((n) => n.length > 0)
      .sort();
    return { path, type: 'dir', hash: fingerprintOf(names.join('|')), size: names.length };
  }
  return { path, type: 'error', hash: fingerprintOf('unknown-shape'), size: 0 };
};

/** Fetch every path for a product. Skipped paths surface as type=error entries. */
const fetchAllPaths = async (
  deps: Pick<Deps, 'callTool'>,
  spec: ContextRefreshSpec,
  ghServer: string,
): Promise<readonly FetchedEntry[]> => {
  const tool = `${ghServer}__get_file_contents`;
  const results: FetchedEntry[] = [];
  for (const path of spec.paths) {
    try {
      const raw = await callTool(deps, tool, {
        owner: spec.owner,
        repo: spec.repo,
        path,
      });
      results.push(normaliseResponse(path, raw));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ path, type: 'error', hash: fingerprintOf(msg), size: 0 });
    }
  }
  return results;
};

/** Format the status text shown next to the ↻ button. */
const formatStatus = (ctx: StoredContext | null, now: Date, unitLabel: string): string => {
  if (!ctx) return 'Not refreshed yet';
  const fetched = new Date(ctx.fetchedAt);
  const ms = now.getTime() - fetched.getTime();
  const mins = Math.round(ms / 60000);
  const ageStr =
    mins < 1
      ? 'just now'
      : mins < 60
        ? `${mins}m ago`
        : mins < 1440
          ? `${Math.round(mins / 60)}h ago`
          : `${Math.round(mins / 1440)}d ago`;
  const count = ctx.itemCount ?? 0;
  return `refreshed ${ageStr} from repo · ${count} ${unitLabel}`;
};

/** Run the refresh flow for a single product. Catches all errors. */
const refreshOne = async (
  deps: Deps,
  product: Product,
  spec: ContextRefreshSpec,
  ghServer: string,
  topicSlug: string,
  updateStatus: (text: string) => void,
): Promise<boolean> => {
  try {
    const entries = await fetchAllPaths(deps, spec, ghServer);
    const fp = fingerprintOf(entries.map((e) => `${e.path}:${e.type}:${e.hash}`).join('||'));
    const layoutMap = { paths: entries };
    const ctx: StoredContext = {
      layoutMap,
      fingerprint: fp,
      fetchedAt: deps.now().toISOString(),
      itemCount: entries.length,
    };
    setStoredContext(deps, topicSlug, product.id, ctx);
    updateStatus(formatStatus(ctx, deps.now(), spec.unitLabel ?? 'paths indexed'));
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Foresights: context refresh failed for ${product.id}`, err);
    updateStatus(`Refresh failed: ${msg.slice(0, 60)}`);
    return false;
  }
};

/**
 * Install the per-product ↻ buttons. Returns `{ dispose, refreshStatus }`.
 * Buttons are no-ops if a product's id isn't in `refreshers`.
 */
export const initContextRefreshBar = (
  deps: Deps,
  opts: InitContextRefreshBarOpts,
): ContextRefreshBarHandle => {
  const ac = new AbortController();
  const inFlight = new Set<string>();

  const findBtn = (productId: string): HTMLButtonElement | null => {
    const el = deps.document.getElementById(`context-refresh-btn-${productId}`);
    return el instanceof HTMLButtonElement ? el : null;
  };

  const findStatusEl = (productId: string): HTMLElement | null =>
    deps.document.getElementById(`context-status-${productId}`);

  const writeStatus = (productId: string, text: string): void => {
    const el = findStatusEl(productId);
    if (el) el.textContent = text;
  };

  const refreshStatus = (): void => {
    for (const product of opts.products) {
      const spec = opts.refreshers[product.id];
      if (!spec) continue;
      const ctx = getStoredContext(deps, opts.topicSlug, product.id);
      writeStatus(product.id, formatStatus(ctx, deps.now(), spec.unitLabel ?? 'paths indexed'));
    }
  };

  // Wire each product's button.
  for (const product of opts.products) {
    const spec = opts.refreshers[product.id];
    const btn = findBtn(product.id);
    if (!btn || !spec) continue;
    btn.addEventListener(
      'click',
      () => {
        if (inFlight.has(product.id)) return;
        inFlight.add(product.id);
        btn.disabled = true;
        const originalLabel = btn.textContent ?? '↻ Refresh from repo';
        btn.textContent = 'Refreshing…';
        void (async () => {
          await refreshOne(deps, product, spec, opts.ghServer, opts.topicSlug, (text) =>
            writeStatus(product.id, text),
          );
          btn.textContent = originalLabel;
          btn.disabled = false;
          inFlight.delete(product.id);
        })();
      },
      { signal: ac.signal },
    );
  }

  // Initial status render.
  refreshStatus();

  return {
    dispose: () => ac.abort(),
    refreshStatus,
  };
};
