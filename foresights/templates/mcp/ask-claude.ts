/**
 * Haiku adapter with batch-chunk-size enforcement.
 *
 * The Cowork IPC bridge starts failing on payloads past ~8KB. This module
 * exposes three primitives:
 *   - askClaude — single call, compact JSON
 *   - askClaudeBatched — chunks the data array into ASK_CLAUDE_BATCH_SIZE
 *     slices and issues one call per chunk (sequential, not concurrent —
 *     IPC isn't bottlenecked by latency, only by payload size)
 *   - parseJsonResponse — strips markdown code fences and parses JSON
 *
 * Consumers in spotlight/refresh, products/brief, and digest/triage compose
 * these primitives. Nothing in this file knows about specific prompts.
 */

import type { Deps } from '../types';

/** Maximum items per batched askClaude call (IPC payload safety). */
export const ASK_CLAUDE_BATCH_SIZE = 10;

/**
 * Single Haiku call. `data` is passed through verbatim; the caller is
 * responsible for trimming field names and using compact JSON if the
 * payload approaches the 8KB IPC ceiling.
 */
export const askClaude = (
  deps: Pick<Deps, 'askClaude'>,
  prompt: string,
  data?: readonly unknown[],
): Promise<string> => {
  return deps.askClaude(prompt, data ? Array.from(data) : undefined);
};

/**
 * Batched Haiku call. `items` is split into ≤batchSize chunks; one call
 * per chunk; the prompt is reused unchanged. Returns one response per
 * chunk in order.
 *
 * Sequential (not concurrent) on purpose — concurrent IPC calls don't
 * speed up Haiku inference and they make per-chunk error attribution
 * harder if any single chunk fails.
 */
export const askClaudeBatched = async <T>(
  deps: Pick<Deps, 'askClaude'>,
  prompt: string,
  items: readonly T[],
  batchSize: number = ASK_CLAUDE_BATCH_SIZE,
): Promise<readonly string[]> => {
  if (batchSize <= 0) {
    throw new Error(`askClaudeBatched: batchSize must be positive, got ${batchSize}`);
  }
  const responses: string[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    // Sequential by design: per-chunk error attribution; concurrency would
    // not speed up Haiku inference at the IPC boundary.
    const response = await deps.askClaude(prompt, Array.from(chunk));
    responses.push(response);
  }
  return responses;
};

/**
 * Strip markdown code fences and parse the response as JSON. Haiku
 * sometimes wraps JSON output in ```json ... ``` despite explicit
 * "no markdown fences" instructions in the prompt. This is the canonical
 * forgiving parser.
 *
 * @throws SyntaxError if the response (after fence stripping) isn't valid JSON.
 */
export const parseJsonResponse = <T>(response: string): T => {
  const trimmed = response
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(trimmed) as T;
};
