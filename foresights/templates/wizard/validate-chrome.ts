/**
 * Build-time validation for dashboard "chrome" — the config-authored fields
 * that the wizard splices into HTML / CSS contexts that `escHtml` can't make
 * safe, or that ship as pre-rendered HTML.
 *
 * The data path (RSS / GitHub items, briefs) is already hardened: every value
 * routes through `escHtml` / `safeHref` at render time. But several chrome
 * fields land in contexts where HTML-escaping is either wrong or insufficient:
 *
 *   - `product.id` / `product.cssMod` — interpolated into HTML `id=`/`class=`
 *     attributes AND into `<style>` selectors (`.insights-tag.<cssMod>`) AND
 *     used as object keys. A `"`-bearing id breaks out of an attribute; a
 *     `</style>`-bearing cssMod breaks out of the style element. One charset
 *     allowlist covers every context.
 *   - `product.badgeColor*` / `config.accent*` — interpolated raw into a
 *     `<style>` block (`background: <hex>;` / `--accent: <hex>;`). `escHtml`
 *     does nothing useful in CSS context; a value like
 *     `red} body{display:none` rewrites the page, and `</style><script>…`
 *     breaks out into script execution. A strict colour grammar is the guard.
 *   - `config.headerSourcesLinks` — pre-rendered anchor HTML dropped raw into a
 *     `<div>`. Unlike the spotlight / tip "trusted HTML" fields (gated by
 *     `validateAllTrustedHtml`) this had no allowlist at all. We gate it to
 *     plain text + safe `<a>` links here.
 *
 * Every check throws a field-named error on violation, so a prompt-injected
 * wizard agent (or a careless config) fails the build fast rather than shipping
 * an injection into the artifact. Mirrors the `trusted-html.ts` /
 * `url-guard.ts` / `validate-regexes.ts` build-preflight model.
 */

/** `id` — attribute / selector / object-key safe. Non-empty. */
const ID_RE = /^[A-Za-z0-9_-]+$/;
/** `cssMod` — selector-safe. Empty string is allowed (the documented default). */
const CSSMOD_RE = /^[A-Za-z0-9_-]*$/;
/**
 * Safe CSS colour: a hex literal, a plain named colour, or an
 * `rgb()/rgba()/hsl()/hsla()` functional form whose body is digits, dots,
 * commas, percent, slash and whitespace only. None of these can contain `}`,
 * `;`, `<`, or `"` — so none can break out of the `name: <colour>;` rule or the
 * surrounding `<style>` element.
 */
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\))$/;

/** Tag scanner — captures the slice between `<` and the next `>`. */
const TAG_RE = /<([^>]*)>/g;
/**
 * A safe `<a …>` open tag: tag name `a` followed by zero or more
 * `name="value"` / `name='value'` attributes drawn from a tiny allowlist
 * (`href`/`target`/`rel`/`class`/`title`). No `on*` handlers, no `style`, no
 * unquoted values, and no `<`/`>` inside a value.
 */
const SAFE_ANCHOR_OPEN_RE =
  /^a(?:\s+(?:href|target|rel|class|title)\s*=\s*(?:"[^"<>]*"|'[^'<>]*'))*\s*$/i;
/** Pull the href value out of a (already shape-validated) anchor open tag. */
const HREF_VALUE_RE = /\bhref\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')/i;

/**
 * True only when `href` carries an explicit scheme that isn't http/https/
 * mailto. Relative URLs (`x`, `page.html`, `/path`, `./a`, `#frag`,
 * `//host/x`) have no scheme and are safe — only `javascript:` / `data:` /
 * `vbscript:` / `file:` etc. are rejected. ASCII whitespace + control chars
 * are stripped first, mirroring how browsers normalise a URL before reading
 * its scheme (defeats a `java\tscript:` smuggle).
 */
const hasDangerousScheme = (href: string): boolean => {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — strip C0 controls + space like a browser does.
  const t = href.replace(/[\u0000-\u0020]/g, '').toLowerCase();
  const colon = t.indexOf(':');
  if (colon === -1) return false; // no scheme → relative → safe
  // A colon only forms a scheme when it precedes the first '/', '?' or '#'.
  for (const sep of [t.indexOf('/'), t.indexOf('?'), t.indexOf('#')]) {
    if (sep !== -1 && sep < colon) return false; // colon sits inside a path → relative
  }
  const scheme = t.slice(0, colon);
  if (!/^[a-z][a-z0-9+.-]*$/.test(scheme)) return false; // not a valid scheme token
  return scheme !== 'http' && scheme !== 'https' && scheme !== 'mailto';
};

export interface ChromeConfigShape {
  readonly accent?: string;
  readonly accentSoft?: string;
  readonly headerSourcesLinks?: string;
  readonly products?: ReadonlyArray<{
    readonly id?: string;
    readonly cssMod?: string;
    readonly badgeColor?: string;
    readonly badgeColorSoft?: string;
    readonly badgeBorderColor?: string;
  }>;
}

const checkColor = (field: string, value: string | undefined): void => {
  if (value == null || value.length === 0) return;
  if (!COLOR_RE.test(value)) {
    throw new Error(
      `validateChrome: field "${field}" = ${JSON.stringify(value)} is not a safe CSS colour. Allowed: hex (#rgb…#rrggbbaa), a plain named colour, or rgb()/rgba()/hsl()/hsla(). This value is spliced raw into a <style> block, so anything else could break out of the CSS context.`,
    );
  }
};

/**
 * Validate the per-product chrome fields + the top-level accent colours.
 * Throws on the first violation.
 */
export const validateProductChrome = (config: ChromeConfigShape): void => {
  checkColor('accent', config.accent);
  checkColor('accentSoft', config.accentSoft);
  const products = config.products ?? [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (!p) continue;
    if (p.id != null && !ID_RE.test(p.id)) {
      throw new Error(
        `validateChrome: products[${i}].id = ${JSON.stringify(p.id)} must match ${ID_RE} (it is spliced into HTML id=/class= attributes, <style> selectors, and used as an object key).`,
      );
    }
    if (p.cssMod != null && !CSSMOD_RE.test(p.cssMod)) {
      throw new Error(
        `validateChrome: products[${i}].cssMod = ${JSON.stringify(p.cssMod)} must match ${CSSMOD_RE} (it is spliced into a <style> selector — \`.insights-tag.<cssMod>\`).`,
      );
    }
    checkColor(`products[${i}].badgeColor`, p.badgeColor);
    checkColor(`products[${i}].badgeColorSoft`, p.badgeColorSoft);
    checkColor(`products[${i}].badgeBorderColor`, p.badgeBorderColor);
  }
};

/**
 * Validate a single `<...>` slice from `headerSourcesLinks`. Returns null if
 * allowed, or a human-readable rejection reason. Only `</a>` and safe `<a …>`
 * open tags pass; everything else (`<script>`, `<img onerror>`, an `<a>` with
 * an `onclick`/`style`/`javascript:` href, …) is rejected.
 */
const validateHeaderTag = (inner: string): string | null => {
  if (inner.length === 0) return 'empty tag';
  if (/^\/a$/i.test(inner)) return null; // closing </a>
  if (SAFE_ANCHOR_OPEN_RE.test(inner)) {
    const m = inner.match(HREF_VALUE_RE);
    // href is optional; if present, it must not carry a dangerous scheme.
    if (m) {
      const href = (m[1] ?? m[2] ?? '').trim();
      if (hasDangerousScheme(href)) {
        return `anchor href ${JSON.stringify(href)} uses a disallowed scheme (only http/https/mailto + relative/anchor URLs allowed)`;
      }
    }
    return null;
  }
  const nameMatch = inner.match(/^\/?\s*([a-z][a-z0-9-]*)/i);
  const name = nameMatch?.[1] ? nameMatch[1].toLowerCase() : '(unknown)';
  if (name !== 'a')
    return `tag <${name}> not allowed — headerSourcesLinks accepts plain text and safe <a> links only`;
  return `<a> tag has an unsupported attribute / shape: ${JSON.stringify(inner)}`;
};

/**
 * Validate `config.headerSourcesLinks` — the pre-rendered anchor list dropped
 * raw into the hero `<div>`. Allows plain text and safe `<a>` links; throws on
 * any other tag, event handler, or dangerous href scheme.
 */
export const validateHeaderSourcesLinks = (value: unknown): void => {
  if (value == null) return;
  if (typeof value !== 'string') {
    throw new Error(`validateChrome: headerSourcesLinks must be a string (got ${typeof value})`);
  }
  if (value.length === 0) return;
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  m = TAG_RE.exec(value);
  while (m !== null) {
    const reason = validateHeaderTag(m[1] ?? '');
    if (reason) {
      throw new Error(
        `validateChrome: headerSourcesLinks failed allowlist — ${reason}. Offending fragment: ${JSON.stringify(m[0])}.`,
      );
    }
    m = TAG_RE.exec(value);
  }
  // Reject an unterminated `<` (no matching `>` after it). TAG_RE only matches
  // a complete `<...>`, so a trailing `<img src=x onerror=…//` yields no match
  // above. headerSourcesLinks is spliced raw into the hero `<div>…</div>`, so
  // the closing `</div>` would supply the `>` and complete the attacker's tag.
  // Same blind spot as trusted-html.ts — see the note there.
  if (value.lastIndexOf('<') > value.lastIndexOf('>')) {
    throw new Error(
      `validateChrome: headerSourcesLinks contains an unterminated "<" (no matching ">"). Spliced into the hero markup this completes into a tag against downstream HTML. Encode a literal "<" as "&lt;".`,
    );
  }
};

/** Run every chrome validation. Called from `wizard/build.ts` preflight. */
export const validateChrome = (config: ChromeConfigShape): void => {
  validateProductChrome(config);
  validateHeaderSourcesLinks(config.headerSourcesLinks);
};
