/**
 * Shared type definitions for the Foresights dashboard.
 *
 * Every other module imports from here. Keep this file pure interfaces and
 * branded type aliases — no runtime code, no side-effects.
 *
 * See references/v0.2-architecture.md for the design rationale behind the
 * Deps interface (the dependency-injection seam) and the per-product /
 * per-source shapes.
 */

// ---------------------------------------------------------------------------
// Deps — the dependency injection seam.
//
// Every module that touches the runtime (MCP, Haiku, storage, time, DOM)
// takes a Deps parameter. In production, dashboard.ts builds a Deps from
// window.cowork + window.localStorage + new Date() + window.document at
// boot. In tests, the test constructs a Deps with stubbed callTool /
// askClaude, an in-memory storage, a frozen now(), and a JSDOM document.
// ---------------------------------------------------------------------------

export interface Deps {
  /** MCP tool dispatch. Pass tool name and args, get the parsed result. */
  readonly callTool: (name: string, args: unknown) => Promise<unknown>;
  /** Haiku inference. Pass a prompt and optional data array, get the response. */
  readonly askClaude: (prompt: string, data?: unknown[]) => Promise<string>;
  /** Trigger a user-defined scheduled task by ID. */
  readonly runScheduledTask: (taskId: string) => Promise<void>;
  /** Persistent storage (real localStorage in prod, in-memory in tests). */
  readonly storage: Storage;
  /** Current date — injectable so day-rotation logic is deterministic in tests. */
  readonly now: () => Date;
  /** DOM root — real document in prod, JSDOM document in tests. */
  readonly document: Document;
  /** Window — for window.cowork access and event wiring. Tests inject a fake. */
  readonly window: Window;
}

// ---------------------------------------------------------------------------
// Sources — what live data the dashboard fetches.
// ---------------------------------------------------------------------------

/**
 * Source kinds.
 *
 * The three GitHub kinds (`releases | issues | pull_requests`) shipped in v0.1
 * and stay the default. `'rss'` is the first non-GitHub kind, added in Phase
 * 10.1 — same dashboard infrastructure, different fetch + render path.
 *
 * Future kinds (Phase 10.2+): `'reddit' | 'hackernews' | 'youtube' | 'web'`.
 */
export type SourceKind = 'releases' | 'issues' | 'pull_requests' | 'rss';

/** Args shape varies by kind. See README for the per-kind args contract. */
export interface SourceArgs {
  readonly perPage?: number;
  readonly state?: string;
  readonly orderBy?: string;
  readonly direction?: string;
  readonly sort?: string;
}

/**
 * Source — discriminated union on `kind`.
 *
 * GitHub kinds require `owner` + `repo`. RSS requires `url`. The TypeScript
 * union forces the consumer to discriminate before reading kind-specific
 * fields, which catches "I forgot to handle rss" bugs at compile time rather
 * than runtime.
 */
export type Source = GitHubSource | RssSource;

interface SourceBase {
  /** Short slug for chip rendering, IDs, and grouping. */
  readonly id: string;
  /** User-facing label (e.g. "AWS CDK"). */
  readonly label: string;
  /** Kind-specific args (perPage, state, orderBy, direction, sort). */
  readonly args: SourceArgs;
  /** Which section this source feeds. Omit to merge with same-kind sources. */
  readonly section?: string;
  /** Optional summarisation hint for body parsing (e.g. 'powertools', 'sst'). */
  readonly tone?: string;
}

export interface GitHubSource extends SourceBase {
  readonly kind: 'releases' | 'issues' | 'pull_requests';
  /** GitHub owner (org or user). */
  readonly owner: string;
  /** GitHub repo. */
  readonly repo: string;
}

export interface RssSource extends SourceBase {
  readonly kind: 'rss';
  /** Feed URL. Either RSS 2.0 (channel/item) or Atom (feed/entry). */
  readonly url: string;
}

// ---------------------------------------------------------------------------
// Products — per-product flagging + brief generation.
// ---------------------------------------------------------------------------

export interface Rule {
  /** Compiled regex matcher. */
  readonly re: RegExp;
  /** Human-readable reason this rule matched. Surfaced in the brief panel. */
  readonly reason: string;
}

export interface Product {
  /** Short ID used in CSS class suffixes, localStorage keys, and DOM IDs. */
  readonly id: string;
  /** Display name. */
  readonly label: string;
  /** Optional CSS modifier class (e.g. 'lc' adds .insights-tag.lc rules). */
  readonly cssMod: string;
  /** Match a text against this product's rules. Returns reason or null. */
  readonly match: (text: string) => string | null;
}

export interface FlagMeta {
  /** Section the flagged item lives in (for digest grouping). */
  readonly section: string;
  /** Stable identifier so digest cards survive page refreshes. */
  readonly stableId: string;
  /** Optional title surfaced in the digest. */
  readonly title?: string;
  /** Optional URL. */
  readonly url?: string;
}

/** A flag emitted by flagsForText — one per matching product. */
export interface Flag extends FlagMeta {
  readonly productId: string;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Spotlights — the rotating "one really cool pattern" card.
// ---------------------------------------------------------------------------

export interface Spotlight {
  /** Short prefix label (e.g. "Generative AI · L3"). */
  readonly tag: string;
  /** One-line plain-text title. */
  readonly title: string;
  /** 1–2 sentence pitch. May contain inline <code> markup. */
  readonly summary: string;
  /** The "why it's clever" line. */
  readonly trick: string;
  /** Pre-rendered HTML code sample with <span class="k|s|t"> highlights. */
  readonly code: string;
  /** Why this pattern matters in production. */
  readonly why: string;
  /** Canonical link. */
  readonly url: string;
}

// ---------------------------------------------------------------------------
// Briefs — the Haiku-generated "why relevant + how to integrate" panel.
// ---------------------------------------------------------------------------

export interface BriefIntegration {
  readonly title: string;
  readonly detail: string;
}

export interface Brief {
  /** 1–2 sentence answer to "why does this matter to <product>?" */
  readonly why: string;
  /** 1–3 specific integration suggestions. */
  readonly integrations: readonly BriefIntegration[];
}

// ---------------------------------------------------------------------------
// CC prompt builder — the Claude Code handoff prompt.
// ---------------------------------------------------------------------------

export type CcPromptMode = 'plan' | 'implement';

export interface BuildCcPromptArgs {
  readonly brief: Brief;
  readonly meta: FlagMeta;
  readonly mode: CcPromptMode;
}

// ---------------------------------------------------------------------------
// Digest — the per-product upgrade digest.
// ---------------------------------------------------------------------------

export type TriageBucket = 'green' | 'yellow' | 'red';

export interface TriagedItem {
  readonly stableId: string;
  readonly bucket: TriageBucket;
  readonly reasoning: string;
}

// ---------------------------------------------------------------------------
// MCP — normalised tool-call response shapes (raw shapes vary; normalize first).
// ---------------------------------------------------------------------------

export interface Release {
  readonly tag_name: string;
  readonly name: string;
  readonly body: string;
  readonly html_url: string;
  readonly published_at: string;
}

export interface Issue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly html_url?: string;
  readonly labels: ReadonlyArray<string | { name: string }>;
  readonly updated_at: string;
}

export interface PullRequest {
  readonly number: number;
  readonly title: string;
  readonly html_url: string;
  readonly merged_at: string | null;
  readonly user?: { login: string };
}

/**
 * Normalised RSS / Atom item.
 *
 * Different feed formats spell fields differently:
 *   RSS 2.0:  <item><title/><link/><description/><pubDate/><author/><guid/>
 *   Atom:     <entry><title/><link href=/><summary/><published/><author><name>
 *
 * The parser (util/rss-parser.ts) normalises to this shape.
 */
export interface RssItem {
  /** Item / entry title, plain text. */
  readonly title: string;
  /** Canonical URL. */
  readonly link: string;
  /** HTML or plain-text body summary (may contain markup the renderer escapes). */
  readonly description: string;
  /** ISO-8601 publication timestamp. Empty string if absent or unparseable. */
  readonly pubDate: string;
  /** Author display name. Empty string if absent. */
  readonly author: string;
  /** Stable per-item identifier — `guid`/`id` element, falling back to `link`. */
  readonly guid: string;
}
