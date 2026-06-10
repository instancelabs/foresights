/**
 * Per-product Claude Code prompt builders — the CC_BUILDERS sentinel.
 *
 * The wizard emits one `buildXxxCcPrompt` arrow fn per product between
 * the sentinels at build time.
 *
 * Status: Phase 6 ports the real impl.
 */

import type { BuildCcPromptArgs } from '../types';

export type CcPromptBuilder = (args: BuildCcPromptArgs) => string;

/**
 * Default rich prompt body shared by every product's generated CC builder
 * (products that don't override with `ccPromptBody`). Makes the pasted-into-
 * Claude-Code prompt self-contained: the source link, the reason Foresights
 * flagged the item, the Haiku "why", and the concrete integration ideas —
 * so Claude Code plans from the handoff instead of rediscovering it.
 *
 * `meta` is typed `FlagMeta` (title/url), but the brief panel passes the full
 * `Flag` at runtime, which also carries `reason`; we read it defensively.
 * The repo-context block (paths to open) is appended separately by the
 * caller via `appendRepoContext`.
 */
export const buildRichCcPrompt = (
  label: string,
  { brief, meta, mode }: BuildCcPromptArgs,
): string => {
  const title = meta.title ?? meta.stableId;
  const reason = (meta as { reason?: string }).reason;
  const lines: string[] = [`# ${label}: ${title}`, ''];
  if (meta.url) lines.push(`**Source:** ${meta.url}`);
  if (reason) lines.push(`**Why Foresights flagged this for ${label}:** ${reason}`);
  lines.push('', `## Why this matters to ${label}`, '', brief.why);
  if (brief.integrations.length > 0) {
    lines.push('', '## Suggested integrations', '');
    for (const i of brief.integrations) lines.push(`- **${i.title}** — ${i.detail}`);
  }
  const verb = mode === 'implement' ? 'changes' : 'plan';
  lines.push(
    '',
    `Mode: ${mode}. ${label} repo guidance follows. The repo context below lists the product's key files — open them in the repo to ground your ${verb} against the current source before proposing edits. (Claude Code auto-loads CLAUDE.md.)`,
  );
  return lines.join('\n');
};

// FORESIGHTS_START:PRODUCTS_CONFIG:CC_BUILDERS
export const CC_PROMPT_BUILDERS: Readonly<Record<string, CcPromptBuilder>> = {};
// FORESIGHTS_END:PRODUCTS_CONFIG:CC_BUILDERS
