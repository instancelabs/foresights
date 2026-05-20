/**
 * Render the triaged digest as 🟢 / 🟡 / 🔴 markdown.
 *
 * Ports v0.1's buildDigestMarkdown into a pure function. Each digest entry
 * pairs a flagged item (Flag + BriefItem + Brief) with its triage verdict;
 * the renderer groups by bucket, emits per-section detail blocks (green +
 * yellow get full detail with an embedded `<details>`-wrapped Claude Code
 * prompt; red is one-liners only).
 *
 * The output is canonical-markdown, suitable to drop into a repo's
 * `.claude/upgrade-digests/<date>-<slug>-upgrade-digest.md` file. The
 * cc-prompt is fence-wrapped (```) inside the `<details>` block.
 *
 * v0.1-bug-look-out: the reference defaulted missing triage entries to
 * `'yellow'` silently. v0.2 still does, but we also accept entries with no
 * triage at all (treating them as yellow) — the v0.1 path required a
 * triageById object, which made tests awkward. The v0.2 signature takes
 * an explicit `triaged: TriagedItem[]` array and joins by stableId.
 */

import type { BriefItem } from '../products/brief';
import type { CcPromptBuilder } from '../products/cc-prompts';
import { appendRepoContext } from '../products/repo-context';
import type { Brief, Flag, TriageBucket, TriagedItem } from '../types';

/**
 * One row in the digest: the flag + the brief item the user clicked + the
 * Haiku-generated brief. The triage verdict joins separately via stableId.
 */
export interface DigestEntry {
  readonly flag: Flag;
  readonly item: BriefItem;
  readonly brief: Brief;
}

export interface RenderDigestArgs {
  /** Display label, e.g. "CDK Insights". Shown in the header. */
  readonly productLabel: string;
  /** Kebab-case slug for the filename suggestion, e.g. "cdk-insights". */
  readonly productSlug: string;
  /** Today, YYYY-MM-DD. */
  readonly date: string;
  /** All flagged items considered. Order is preserved within each bucket. */
  readonly entries: readonly DigestEntry[];
  /** Triage verdicts — joined to entries by stableId. */
  readonly triaged: readonly TriagedItem[];
  /** Optional CC prompt builder for the per-item embedded prompt. */
  readonly ccBuilder?: CcPromptBuilder;
  /**
   * Optional refreshed repo-context block (see products/repo-context.ts).
   * When set, it's appended to every embedded Claude Code prompt so the
   * digest's prompts reflect the current repo structure. Empty / absent →
   * prompts are emitted exactly as the builder produced them.
   */
  readonly repoContext?: string;
}

interface BucketRow {
  readonly entry: DigestEntry;
  readonly triage: TriagedItem | undefined;
}

const HEADINGS: Record<TriageBucket, string> = {
  green: '🟢 Implement now',
  yellow: '🟡 Worth considering',
  red: '🔴 Skip',
};

const SECTION_INTRO: Record<TriageBucket, string> = {
  green: 'Genuinely high-impact, low-risk, well-scoped. Pick from this list first.',
  yellow: 'Useful but needs human judgment, has dependencies, or could wait for the right moment.',
  red: "One-liners only — these don't warrant action right now.",
};

/** Strip leading "**scope:**" and bracketed tag prefixes from the item text. */
const cleanTitle = (text: string): string =>
  text
    .replace(/\*\*[^*]+:\*\*/, '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .slice(0, 120)
    .trim();

/** Strip just the leading bracketed tag from the item text. */
const stripTagPrefix = (text: string): string => text.replace(/^\[[^\]]+\]\s*/, '');

/**
 * Pick a code fence longer than any backtick run inside `text`. CommonMark
 * requires the fence to exceed any inner run, otherwise an embedded ```
 * closes the block early — which happens routinely now that repo-context.ts
 * inlines real CLAUDE.md content (full of code fences) into the prompt.
 * Minimum 3 backticks.
 */
const fenceFor = (text: string): string => {
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return '`'.repeat(Math.max(3, longest + 1));
};

/** Render one green/yellow item — full detail + embedded cc-prompt. */
const renderDetailed = (
  lines: string[],
  rows: readonly BucketRow[],
  ccBuilder: CcPromptBuilder | undefined,
  repoContext: string | undefined,
): void => {
  rows.forEach(({ entry, triage }, idx) => {
    const titleText = cleanTitle(entry.item.text);
    lines.push(`### ${idx + 1}. ${titleText}`);
    lines.push('');

    if (entry.flag.url) lines.push(`**Source:** <${entry.flag.url}>`);
    if (entry.item.version) lines.push(`**Version:** ${entry.item.version}`);
    lines.push(`**Why it matters:** ${entry.brief.why}`);
    if (triage?.reasoning) lines.push(`**Triage rationale:** ${triage.reasoning}`);

    if (entry.brief.integrations.length > 0) {
      lines.push('');
      lines.push('**Integration plan:**');
      entry.brief.integrations.forEach((integration, ii) => {
        lines.push(`${ii + 1}. **${integration.title}** — ${integration.detail}`);
      });
    }

    if (ccBuilder) {
      const prompt = appendRepoContext(
        ccBuilder({ brief: entry.brief, meta: entry.flag, mode: 'plan' }),
        repoContext ?? '',
      );
      const fence = fenceFor(prompt);
      lines.push('');
      lines.push('<details>');
      lines.push('<summary>Claude Code prompt (click to expand)</summary>');
      lines.push('');
      lines.push(fence);
      lines.push(prompt);
      lines.push(fence);
      lines.push('</details>');
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  });
};

/** Render the red bucket as one-liners with the triage reason. */
const renderRedOneLiners = (
  lines: string[],
  rows: readonly BucketRow[],
  productLabel: string,
): void => {
  for (const { entry, triage } of rows) {
    // Use `||` so an empty reasoning falls through to the fallback (matches v0.1).
    const reason = triage?.reasoning || `Low impact for ${productLabel}.`;
    const text = stripTagPrefix(entry.item.text).slice(0, 90);
    lines.push(`- **${text}** — ${reason}`);
  }
  lines.push('');
};

/**
 * Render the triaged digest as canonical markdown.
 */
export const renderDigestMarkdown = (args: RenderDigestArgs): string => {
  const { productLabel, productSlug, date, entries, triaged, ccBuilder, repoContext } = args;
  const triageById = new Map<string, TriagedItem>(triaged.map((t) => [t.stableId, t]));

  const buckets: Record<TriageBucket, BucketRow[]> = { green: [], yellow: [], red: [] };
  for (const entry of entries) {
    const t = triageById.get(entry.flag.stableId);
    const bucket: TriageBucket = t ? t.bucket : 'yellow';
    buckets[bucket].push({ entry, triage: t });
  }

  const lines: string[] = [];
  lines.push(`# ${productLabel} upgrade digest — ${date}`);
  lines.push('');
  lines.push(`> Generated from the news dashboard. ${entries.length} flagged items considered.`);
  lines.push(
    `> ${HEADINGS.green}: ${buckets.green.length} · ${HEADINGS.yellow}: ${buckets.yellow.length} · ${HEADINGS.red}: ${buckets.red.length}.`,
  );
  lines.push('');

  for (const bucket of ['green', 'yellow'] as const) {
    if (buckets[bucket].length === 0) continue;
    lines.push(`## ${HEADINGS[bucket]} (${buckets[bucket].length})`);
    lines.push('');
    lines.push(SECTION_INTRO[bucket]);
    lines.push('');
    renderDetailed(lines, buckets[bucket], ccBuilder, repoContext);
  }

  if (buckets.red.length > 0) {
    lines.push(`## ${HEADINGS.red} (${buckets.red.length})`);
    lines.push('');
    lines.push(SECTION_INTRO.red);
    lines.push('');
    renderRedOneLiners(lines, buckets.red, productLabel);
  }

  lines.push('---');
  lines.push('');
  lines.push(
    `*Save to \`.claude/upgrade-digests/${date}-${productSlug}-upgrade-digest.md\` and run with Claude Code in the relevant repo.*`,
  );

  return lines.join('\n');
};
