/**
 * Action-type registry — the `ACTION_TYPES` table (Phase 10.5).
 *
 * Each `ActionTypeSpec` describes how a flagged item's action is built and
 * presented. `claude-code` is the default; `summary` and `task` are fully
 * generic — one shared builder each, no per-product code.
 *
 * Additive guarantee: the brief panel (products/panel.ts) and the digest
 * (digest/markdown.ts) special-case `claude-code` to the verbatim
 * per-product `CC_PROMPT_BUILDERS` path. The `claude-code` entry below is
 * present for registry uniformity + metadata (actionLabel, copyFormats,
 * panelTitle, …); its `build`/`digestEmbed` are a generic fallback the
 * claude-code code path never reaches.
 */

import type { ActionTypeId, ActionTypeSpec, BuildActionArgs } from '../types';

/** Plain-prose summary of a brief — the `summary` action builder. */
const buildSummary = ({ brief }: BuildActionArgs): string => {
  const lines: string[] = [brief.why];
  if (brief.integrations.length > 0) {
    lines.push('', 'How it could fit:');
    for (const i of brief.integrations) lines.push(`- ${i.title} — ${i.detail}`);
  }
  return lines.join('\n');
};

/** Tracker-ready task item — the `task` action builder. */
const buildTask = ({ brief, meta }: BuildActionArgs): string => {
  const title = meta.title ?? meta.stableId;
  const lines: string[] = [title, '', `Why: ${brief.why}`];
  if (brief.integrations.length > 0) {
    lines.push('', 'Checklist:');
    for (const i of brief.integrations) lines.push(`- [ ] ${i.title} — ${i.detail}`);
  }
  if (meta.url) lines.push('', `Source: ${meta.url}`);
  return lines.join('\n');
};

/**
 * Generic claude-code fallback builder. NOT used on the real claude-code
 * path — the panel/digest dispatch to the per-product `CC_PROMPT_BUILDERS`.
 * Present so the registry is uniform and every spec has a working builder.
 */
const buildGenericCcPrompt = ({ brief, meta, mode }: BuildActionArgs): string => {
  const title = meta.title ?? meta.stableId;
  return `# ${title}\n\n${brief.why}\n\nMode: ${mode ?? 'plan'}.`;
};

const claudeCodeSpec: ActionTypeSpec = {
  id: 'claude-code',
  actionLabel: 'Generate Claude Code prompt',
  hideLabel: 'Hide prompt',
  panelTitle: 'Claude Code prompt',
  hasMode: true,
  usesRepoContext: true,
  copyFormats: ['prompt', 'task'],
  build: buildGenericCcPrompt,
  digestEmbed: buildGenericCcPrompt,
};

const summarySpec: ActionTypeSpec = {
  id: 'summary',
  actionLabel: 'Generate summary',
  hideLabel: 'Hide summary',
  panelTitle: 'Summary',
  hasMode: false,
  usesRepoContext: false,
  copyFormats: ['prompt'],
  build: buildSummary,
  digestEmbed: buildSummary,
};

const taskSpec: ActionTypeSpec = {
  id: 'task',
  actionLabel: 'Create task',
  hideLabel: 'Hide task',
  panelTitle: 'Task',
  hasMode: false,
  usesRepoContext: false,
  copyFormats: ['prompt'],
  build: buildTask,
  digestEmbed: buildTask,
};

/** The action-type registry — one spec per `ActionTypeId`. */
export const ACTION_TYPES: Readonly<Record<ActionTypeId, ActionTypeSpec>> = {
  'claude-code': claudeCodeSpec,
  summary: summarySpec,
  task: taskSpec,
};

/**
 * Coerce an arbitrary `actionType` value to a registered `ActionTypeId`,
 * defaulting to `'claude-code'`. Guards every `ACTION_TYPES[at]` lookup: the
 * value originates in the (untrusted) wizard config, so an absent OR invalid
 * `actionType` must fall back to the default rather than index to `undefined`
 * and crash the brief / digest render on `.build` / `.actionLabel`.
 */
export const coerceActionType = (raw: unknown): ActionTypeId =>
  typeof raw === 'string' && Object.hasOwn(ACTION_TYPES, raw)
    ? (raw as ActionTypeId)
    : 'claude-code';
