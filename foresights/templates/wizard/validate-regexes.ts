/**
 * Wizard-time regex-DoS smoke check on user-supplied / Haiku-generated
 * product matcher rules.
 *
 * Closes finding M1 from the v0.9.2 security review. `compileProduct` and
 * `genProductsConst` both build the runtime matcher via
 * `new RegExp(r.source, r.flags ?? '')`, with no static or dynamic
 * complexity check. A pathological pattern like `(a+)+b` matched against
 * a 200-character release-bullet body will hang the dashboard's render
 * thread on open.
 *
 * The user is the same person who configured the rule, so the *direct*
 * threat is self-harm. The realistic vector is the wizard agent picking
 * up a catastrophic pattern from training data and silently emitting it.
 *
 * This module exercises every compiled regex against three representative
 * matchText bodies (the same shape `products/matcher` runs over) with a
 * wall-clock cutoff. A rule that takes longer than `SLOW_THRESHOLD_MS`
 * surfaces as a build warning; a rule that takes longer than
 * `CATASTROPHIC_THRESHOLD_MS` fails the build outright.
 *
 * Synchronous regex execution can't be interrupted in Node — the wall
 * clock measures elapsed time *after* the call completes. That makes
 * this a post-hoc check rather than a hard cap; a truly evil pattern can
 * still hang the wizard for tens of seconds before we'd see it. But:
 *
 *   1. The wizard is interactive — a 10-second pause is recoverable.
 *   2. The artifact's render thread is what we actually care about. Any
 *      pattern that crosses the threshold here will cross it at runtime
 *      too — we just trade "user hits ctrl-C in the wizard" for "user
 *      sees a dashboard with the affected section broken".
 *
 * For a hard guarantee against catastrophic backtracking we'd want
 * `safe-regex2` (npm) doing static analysis at build time. That's the
 * recommended v0.10 follow-up.
 */

/**
 * Anything slower than this against a 200-character body surfaces as a
 * warning (machine-parseable with the `slow-regex:` discriminator). The
 * threshold is generous — a healthy regex on this body shape takes
 * sub-millisecond.
 */
export const SLOW_THRESHOLD_MS = 100;

/**
 * Anything slower than this triggers a build failure. A regex that takes
 * 1 second against 200 characters will take exponentially longer against
 * the longer bodies the artifact actually matches against, so this is
 * the "stop the build" line.
 */
export const CATASTROPHIC_THRESHOLD_MS = 1000;

/**
 * Representative matchText bodies — chosen to exercise the patterns
 * Foresights actually sees: PR titles, release bullets, RSS snippets,
 * issue bodies. Length matters more than literal content for ReDoS
 * detection.
 */
const STRESS_CORPUS: readonly string[] = [
  // Short, realistic — a PR title.
  'feat(stack): bump @aws-cdk/aws-lambda to 2.150 — fixes ESM cold-start regression',
  // Medium, repetition-heavy — a release bullet referencing several APIs.
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', // 100 'a's — classic catastrophic-backtrack trigger
  // Long, prose-shape — a release notes paragraph.
  'Refactor the auth middleware to remove the legacy session-token storage path; ' +
    'introduce a new Cognito-backed flow; deprecate the old endpoint; update the ' +
    'docs; bump the minor version; coordinate with the mobile team for the cut-over; ' +
    'see #4421 for context. The new flow lands behind a `auth_v2` feature flag.',
];

/**
 * One rule's stress-test outcome — used by callers to format
 * warnings / build-failure messages.
 */
export interface RegexStressResult {
  readonly productId: string;
  readonly ruleIndex: number;
  readonly source: string;
  readonly flags: string;
  /** Worst-case ms across the stress corpus. */
  readonly worstMs: number;
}

/** Aggregate result for a whole config. */
export interface RegexStressReport {
  /** Build warnings — slow rules that didn't hit the catastrophic line. */
  readonly warnings: readonly string[];
  /** Build failures — rules that crossed `CATASTROPHIC_THRESHOLD_MS`. */
  readonly failures: readonly string[];
  /** Per-rule detail for callers that want to log structured output. */
  readonly results: readonly RegexStressResult[];
}

/** Minimal product / rule shape this module needs. */
export interface RegexStressInput {
  readonly products?: ReadonlyArray<{
    readonly id: string;
    readonly rules: ReadonlyArray<{
      readonly source: string;
      readonly flags?: string;
    }>;
  }>;
}

/**
 * Stress-test every compiled regex against the stress corpus. Returns a
 * report; the caller decides whether to log warnings vs. throw on
 * failures.
 *
 * Never throws — invalid regexes (bad `source`/`flags`) are caught and
 * surfaced as `failures` entries with the underlying message. The caller
 * (`build.ts`) walks `report.failures` and throws if non-empty.
 */
export const stressTestProductRegexes = (input: RegexStressInput): RegexStressReport => {
  const warnings: string[] = [];
  const failures: string[] = [];
  const results: RegexStressResult[] = [];
  const products = input.products ?? [];
  for (const p of products) {
    const rules = p.rules ?? [];
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      if (!r) continue;
      let re: RegExp;
      try {
        re = new RegExp(r.source, r.flags ?? '');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push(
          `invalid-regex: product "${p.id}" rule[${i}] (source=${JSON.stringify(r.source)}, flags=${JSON.stringify(r.flags ?? '')}) — ${msg}`,
        );
        continue;
      }
      let worstMs = 0;
      for (const body of STRESS_CORPUS) {
        const start = Date.now();
        try {
          re.test(body);
        } catch {
          // RegExp.test shouldn't throw; defensive only.
        }
        const elapsed = Date.now() - start;
        if (elapsed > worstMs) worstMs = elapsed;
      }
      results.push({
        productId: p.id,
        ruleIndex: i,
        source: r.source,
        flags: r.flags ?? '',
        worstMs,
      });
      if (worstMs >= CATASTROPHIC_THRESHOLD_MS) {
        failures.push(
          `slow-regex: product "${p.id}" rule[${i}] (source=${JSON.stringify(r.source)}) took ${worstMs}ms — catastrophic backtracking suspected, dashboard render thread will hang`,
        );
      } else if (worstMs >= SLOW_THRESHOLD_MS) {
        warnings.push(
          `slow-regex: product "${p.id}" rule[${i}] (source=${JSON.stringify(r.source)}) took ${worstMs}ms on the stress corpus — consider simplifying`,
        );
      }
    }
  }
  return { warnings, failures, results };
};
