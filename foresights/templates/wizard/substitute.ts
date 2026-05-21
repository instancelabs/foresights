/**
 * Three-form sentinel substitution + `{{PLACEHOLDER}}` replacement for the
 * wizard build pipeline.
 *
 * The dashboard template carries two kinds of generation hooks:
 *
 *   1. **Sentinels** — paired comment markers wrapping a replaceable
 *      content block. Three opener/closer forms:
 *
 *        HTML : <!-- FORESIGHTS_START:NAME --> ... <!-- FORESIGHTS_END:NAME -->
 *        TS   : //   FORESIGHTS_START:NAME       ... //   FORESIGHTS_END:NAME
 *        CSS  : /*   FORESIGHTS_START:NAME *‍/    ... /*   FORESIGHTS_END:NAME *‍/
 *
 *      (TS sentinels are line-comments terminated by a newline; CSS sentinels
 *      are block-comments inside `<style>` or `.css`.)
 *
 *      Sentinels are NAMED — the closer must reference the same NAME as the
 *      opener. Sub-namespaces are allowed via colon, e.g.
 *      `FORESIGHTS_START:PRODUCTS_CONFIG:RULES`.
 *
 *      Substitution preserves the marker comments and replaces only the body
 *      between them. This makes the output debuggable (you can see at a
 *      glance which block came from which sentinel) and re-runnable (a second
 *      substitution pass on already-substituted output is a no-op when the
 *      content is unchanged).
 *
 *   2. **Placeholders** — `{{NAME}}` tokens. Simple find-and-replace. Names
 *      are conventionally UPPER_SNAKE_CASE.
 *
 *      Placeholders inside sentinel-replaced content ARE expanded — substitute
 *      sentinels FIRST, then placeholders.
 *
 * Both functions take a `strict` option; with `strict: true`, an unknown
 * sentinel/placeholder in the input throws. With `strict: false` (default),
 * unknowns pass through unchanged so the build pipeline can run partial
 * substitutions during iteration.
 */

const SENTINEL_NAME = '[A-Z_][A-Z0-9_:]*';
const PLACEHOLDER_NAME = '[A-Z_][A-Z0-9_]*';

/**
 * Master sentinel regex — matches any of the three opener/closer combos.
 *
 * Capture groups:
 *   1: opener      ('<!--' | '//' | '/*')
 *   2: name        ('SOME_NAME' or 'NAMESPACE:NAME')
 *   3: closer      ('-->' | '*‍/' | '\n')
 *   4: body        (the replaceable content; captured non-greedily)
 *   5: end opener  (mirrors group 1 — but not required to be the same form)
 *   6: end closer  (mirrors group 3)
 *
 * The end marker references the same NAME via a backref to group 2.
 */
const SENTINEL_REGEX = new RegExp(
  // Opener
  `(<!--|//|/\\*)\\s*FORESIGHTS_START:(${SENTINEL_NAME})\\s*(-->|\\*/|\\n)([\\s\\S]*?)(<!--|//|/\\*)\\s*FORESIGHTS_END:\\2\\s*(-->|\\*/|\\n)`,
  'g',
);

const PLACEHOLDER_REGEX = new RegExp(`\\{\\{(${PLACEHOLDER_NAME})\\}\\}`, 'g');

export interface SubstituteOpts {
  /**
   * When true: throw on any sentinel/placeholder present in the input
   * that's missing from the map. When false (default): leave unknowns
   * unchanged.
   */
  readonly strict?: boolean;
}

/**
 * Scan `input` for FORESIGHTS_START:NAME markers and return the list of
 * distinct names (in encounter order). Used for "what does this template
 * need?" introspection.
 */
export const findSentinels = (input: string): readonly string[] => {
  const names: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(SENTINEL_REGEX.source, 'g');
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex-exec loop.
  while ((m = re.exec(input)) !== null) {
    const name = m[2];
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
};

/**
 * Scan `input` for `{{NAME}}` placeholders and return the list of distinct
 * names (in encounter order).
 */
export const findPlaceholders = (input: string): readonly string[] => {
  const names: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(PLACEHOLDER_REGEX.source, 'g');
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex-exec loop.
  while ((m = re.exec(input)) !== null) {
    const name = m[1];
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
};

/**
 * Replace each `FORESIGHTS_START:NAME ... FORESIGHTS_END:NAME` block with
 * the matching value from `map`. Markers themselves are preserved (only
 * the body between them is replaced).
 *
 * Unknown sentinels:
 *   - strict: true  → throw `Error("Missing sentinel content for "<name>"")`
 *   - strict: false → leave the block unchanged
 */
export const substituteSentinels = (
  input: string,
  map: Readonly<Record<string, string>>,
  opts: SubstituteOpts = {},
): string => {
  // Reset lastIndex defensively — the constant SENTINEL_REGEX is shared.
  const re = new RegExp(SENTINEL_REGEX.source, 'g');
  return input.replace(
    re,
    (
      full,
      opener: string,
      name: string,
      closer: string,
      _body: string,
      endOpener: string,
      endCloser: string,
    ) => {
      if (!(name in map)) {
        if (opts.strict) {
          throw new Error(`substituteSentinels: missing content for "${name}"`);
        }
        return full;
      }
      const content = map[name] ?? '';
      // Preserve the marker style on both ends (caller may have written
      // a CSS-form start and a CSS-form end, etc.).
      return `${opener} FORESIGHTS_START:${name} ${closer}${content}${endOpener} FORESIGHTS_END:${name} ${endCloser}`;
    },
  );
};

/**
 * Replace each `{{NAME}}` token with `map[NAME]`.
 *
 * Unknown placeholders:
 *   - strict: true  → throw
 *   - strict: false → leave the token unchanged
 */
export const substitutePlaceholders = (
  input: string,
  map: Readonly<Record<string, string>>,
  opts: SubstituteOpts = {},
): string => {
  const re = new RegExp(PLACEHOLDER_REGEX.source, 'g');
  return input.replace(re, (full, name: string) => {
    if (!(name in map)) {
      if (opts.strict) {
        throw new Error(`substitutePlaceholders: missing value for "${name}"`);
      }
      return full;
    }
    return map[name] ?? '';
  });
};

/**
 * Apply sentinel substitution then placeholder substitution. The order
 * matters — placeholders inside sentinel-replaced content (e.g. a
 * SECTION_NAV block referencing `{{TOPIC}}`) get expanded.
 */
export const substituteAll = (
  input: string,
  sentinels: Readonly<Record<string, string>>,
  placeholders: Readonly<Record<string, string>>,
  opts: SubstituteOpts = {},
): string =>
  substitutePlaceholders(substituteSentinels(input, sentinels, opts), placeholders, opts);
