/**
 * HTML escaping + URL-scheme validation — the only pure utilities that run
 * in absolutely every render path. Lives at the foundation of the
 * defence-in-depth story:
 *
 *  - `escHtml` neutralises HTML metacharacters for text-content insertion
 *    and double-quoted attribute values.
 *  - `safeUrl` whitelists URL schemes and returns the sanitised URL string
 *    (or '#'). Use this for DOM property assignments like
 *    `anchor.href = ...` where what matters is the URL itself, not its
 *    HTML escaping.
 *  - `safeHref` is `safeUrl` + `escHtml` — use this for template-literal
 *    `<a href="...">` emission, which is the common case.
 *
 * Every `href="${...}"` emission in the codebase routes through `safeHref`
 * (or `safeUrl` for DOM assignments) rather than raw `escHtml`. This stops
 * `javascript:` / `data:` / `vbscript:` payloads becoming clickable links
 * even when the URL value originates from prompt-injected Haiku output,
 * a compromised RSS feed, or a release-author-controlled markdown bullet.
 *
 * v0.9.3 — added backtick to `escHtml` (defence-in-depth — backtick is not
 * required for `"`-quoted attribute safety but tightens the contract for
 * any future template-literal-context consumer) and introduced
 * `safeUrl`/`safeHref` (closes finding H1 + M2 from the v0.9.2 security
 * review).
 */

/** Escape an arbitrary value for safe HTML text-content insertion. */
export const escHtml = (s: unknown): string => {
  if (s == null) return '';
  return String(s).replace(
    /[&<>"'`]/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '`': '&#96;',
      })[c] ?? c,
  );
};

/**
 * Return the input URL string if it uses a whitelisted scheme, or '#'
 * otherwise. Whitelisted schemes:
 *
 *   - `http://` / `https://` — primary case (external links).
 *   - `mailto:` — `Contact ↗` style anchors.
 *   - `#anchor` — same-page anchors.
 *   - `/relative` — same-origin paths.
 *
 * Anything else (`javascript:`, `data:`, `vbscript:`, `file:`, etc.) is
 * neutralised to `'#'`. The scheme check is case-insensitive and tolerates
 * leading whitespace (the URL parser would also strip leading whitespace,
 * so a `   javascript:...` URL is still dangerous if we let it through).
 *
 * Use this for DOM property assignments — `anchor.href = safeUrl(u)`.
 * For `<a href="...">` HTML emission, use `safeHref` (which also
 * HTML-escapes the result).
 */
export const safeUrl = (u: unknown): string => {
  if (typeof u !== 'string' || u.length === 0) return '#';
  const trimmed = u.trim();
  if (trimmed.length === 0) return '#';
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:')) {
    return trimmed;
  }
  return '#';
};

/**
 * `safeUrl` + `escHtml` — validate URL scheme, then HTML-escape for safe
 * insertion into an `<a href="...">` attribute. The common case across
 * every renderer.
 */
export const safeHref = (u: unknown): string => escHtml(safeUrl(u));
