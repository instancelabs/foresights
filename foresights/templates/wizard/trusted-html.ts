/**
 * Wizard-time allowlist check for "trusted HTML" fields.
 *
 * `WizardSpotlight.summary` / `.trick` / `.code` / `.why` and
 * `WizardTipCard.code` are documented as "trusted HTML — escape upstream":
 * they ship pre-rendered HTML so the spotlight syntax-highlighting (`<span
 * class="k">…</span>` for keywords, `<span class="s">` for strings, etc.)
 * survives intact. That trust used to be enforced only by "the wizard
 * agent should know not to emit weird tags". Closes finding H2 from the
 * v0.9.2 security review: if a prompt-injected RSS item or PR title
 * persuaded the wizard agent to emit an `onerror=` payload into one of
 * these fields, the payload would `innerHTML`-execute on dashboard open.
 *
 * This module fails the build before any of that data reaches the
 * artifact. Allowlist:
 *
 *   - `<code>`, `</code>`               — inline code
 *   - `<strong>`, `</strong>`           — bold
 *   - `<em>`, `</em>`                   — emphasis
 *   - `<br>`, `<br/>`, `<br />`         — line break (void)
 *   - `<span class="X">`, `</span>`     — syntax highlight, where X is one
 *                                          of the documented token classes
 *                                          (`k`, `s`, `t`, `n`, `c`).
 *
 * The class-name allowlist intentionally matches the documented spotlight
 * highlighter palette (see `wizard/build-config.ts` comments on
 * `WizardTipCard.code` and the spotlight CSS in `dashboard.html`). New
 * highlighter colours need an explicit grant here.
 *
 * Everything else — `<script>`, `<iframe>`, `<img onerror=...>`, any
 * `<span onclick=...>`, etc. — fails the build with a clear, field-named
 * error message.
 *
 * The check runs character-by-character: every `<` opens a tag whose
 * `<...>` slice has to match the allowlist exactly. False negatives are
 * possible against esoteric inputs (HTML comments, CDATA), but the
 * payload surface — "what runs in the browser" — is fully covered by the
 * tag-allowlist contract: the browser's HTML parser will treat any
 * surviving `<` as a tag-open, and every tag that passes through has been
 * matched against the allowlist.
 */

/** Tag-name allowlist for non-void elements. */
const ALLOWED_TAGS: ReadonlySet<string> = new Set(['code', 'strong', 'em', 'span']);

/** Tag-name allowlist for void / self-closing elements. */
const VOID_TAGS: ReadonlySet<string> = new Set(['br']);

/** Class-name allowlist for `<span class="...">`. */
const ALLOWED_SPAN_CLASSES: ReadonlySet<string> = new Set(['k', 's', 't', 'n', 'c']);

/** Match exactly one tag — captures the slice between `<` and `>`. */
const TAG_RE = /<([^>]*)>/g;

/** Pre-compiled inner-shape regexes for each allowlisted shape. */
const RE_VOID_BR = /^br\s*\/?\s*$/i;
const RE_SIMPLE_CLOSE = /^\/(code|strong|em|span)$/i;
const RE_SIMPLE_OPEN = /^(code|strong|em)\s*$/i;
const RE_SPAN_OPEN = /^span\s+class\s*=\s*"([a-z]+)"\s*$/i;
const RE_SPAN_OPEN_SQUOTE = /^span\s+class\s*=\s*'([a-z]+)'\s*$/i;

/**
 * Validate a single `<...>` slice (the `inner` is everything between the
 * angle brackets, e.g. `span class="k"` or `/code`). Returns `null` if
 * allowed, or a human-readable rejection reason otherwise.
 */
const validateTag = (inner: string): string | null => {
  if (inner.length === 0) return 'empty tag';
  // Closing tag for a non-void element.
  if (RE_SIMPLE_CLOSE.test(inner)) return null;
  // Self-closing void element.
  if (RE_VOID_BR.test(inner)) return null;
  // Opening tag for a simple (no-attribute) element.
  if (RE_SIMPLE_OPEN.test(inner)) return null;
  // Opening `<span class="X">` — validate the class is in the allowlist.
  const spanMatch = inner.match(RE_SPAN_OPEN) ?? inner.match(RE_SPAN_OPEN_SQUOTE);
  if (spanMatch) {
    const cls = spanMatch[1] ?? '';
    if (ALLOWED_SPAN_CLASSES.has(cls)) return null;
    return `span class "${cls}" not in allowlist {${Array.from(ALLOWED_SPAN_CLASSES).join(', ')}}`;
  }
  // Anything else — extract the tag name for a friendlier error.
  const nameMatch = inner.match(/^\/?\s*([a-z][a-z0-9-]*)/i);
  const name = nameMatch?.[1] ? nameMatch[1].toLowerCase() : '(unknown)';
  if (!ALLOWED_TAGS.has(name) && !VOID_TAGS.has(name)) {
    return `tag <${name}> not in allowlist {code, strong, em, span, br}`;
  }
  // Tag name is allowlisted but shape is unexpected (attributes other
  // than the documented `<span class>`, etc.).
  return `<${name}> has unsupported attributes / shape: ${JSON.stringify(inner)}`;
};

/**
 * Validate a single trusted-HTML field value. Throws on the first
 * violation with a message that names the field and the offending tag.
 *
 * Empty / undefined / null values are accepted — they pass through to
 * the build untouched and the renderer treats them as "no code block",
 * "no summary", etc.
 */
export const validateTrustedHtml = (fieldName: string, value: unknown): void => {
  if (value == null) return;
  if (typeof value !== 'string') {
    throw new Error(`validateTrustedHtml: ${fieldName} must be a string (got ${typeof value})`);
  }
  if (value.length === 0) return;
  // Walk the string, scanning every `<...>` slice. The TAG_RE pattern
  // greedily matches up to the first `>` — a value like `<span class="k"`
  // (unterminated) yields no match here, so its `<` survives into the
  // emitted HTML and the browser parser will see it as text. That's safe
  // by the same logic as `escHtml` text-content: a stray `<` without a
  // matching `>` is not a tag.
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  m = TAG_RE.exec(value);
  while (m !== null) {
    const reason = validateTag(m[1] ?? '');
    if (reason) {
      throw new Error(
        `validateTrustedHtml: field "${fieldName}" failed allowlist — ${reason}. Offending fragment: ${JSON.stringify(m[0])}. Trusted-HTML fields accept only {<code>, <strong>, <em>, <br>, <span class="k|s|t|n|c">}; everything else should be plain text or routed through escHtml() upstream.`,
      );
    }
    m = TAG_RE.exec(value);
  }
};

/**
 * Validate every trusted-HTML field in a `WizardConfig`. Called from
 * `wizard/build.ts` before any rendering happens, so a violation fails
 * the build fast with a clear, field-named error — preventing a
 * prompt-injected wizard agent from shipping an XSS payload into the
 * artifact.
 *
 * Typed against a minimal shape so this module can be imported from
 * tests without pulling in the full `WizardConfig` type.
 */
export interface TrustedHtmlConfigShape {
  readonly spotlights?: ReadonlyArray<{
    readonly tag?: string;
    readonly summary?: string;
    readonly trick?: string;
    readonly code?: string;
    readonly why?: string;
  }>;
  readonly tips?: ReadonlyArray<{
    readonly code?: string;
  }>;
}

export const validateAllTrustedHtml = (config: TrustedHtmlConfigShape): void => {
  const spotlights = config.spotlights ?? [];
  for (let i = 0; i < spotlights.length; i++) {
    const sp = spotlights[i];
    if (!sp) continue;
    validateTrustedHtml(`spotlights[${i}].summary`, sp.summary);
    validateTrustedHtml(`spotlights[${i}].trick`, sp.trick);
    validateTrustedHtml(`spotlights[${i}].code`, sp.code);
    validateTrustedHtml(`spotlights[${i}].why`, sp.why);
  }
  const tips = config.tips ?? [];
  for (let i = 0; i < tips.length; i++) {
    const t = tips[i];
    if (!t) continue;
    validateTrustedHtml(`tips[${i}].code`, t.code);
  }
};
