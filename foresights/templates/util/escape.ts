/**
 * HTML escaping — the only pure utility that runs in absolutely every render path.
 *
 * Status: Phase 3 will port the real impl + unit test.
 */

/** Escape an arbitrary value for safe HTML text-content insertion. */
export const escHtml = (s: unknown): string => {
  if (s == null) return '';
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] ?? c,
  );
};
