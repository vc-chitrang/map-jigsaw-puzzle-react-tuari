/**
 * Width-aware text truncation. Pure — no DOM, no React.
 *
 * **Why this exists instead of `text-overflow: ellipsis`.** That property makes the
 * FONT supply the truncation glyph (U+2026), and Conduit ITC's is wrong — it draws
 * as a stray mark rather than three dots. Appending three literal FULL STOP
 * characters uses a glyph the font definitely has (measured 0.57 em against 1.02 em
 * for its U+2026), so the result reads as "..." in the app's own typeface.
 *
 * The measurer is injected so the rule is testable without a canvas, and so the
 * caller can measure in whatever font the element actually resolved to.
 */

/** Default tail. Three FULL STOPs (U+002E), never U+2026. */
export const ELLIPSIS = '...';

/**
 * Longest prefix of `text` that fits `availablePx`, with `ellipsis` appended when
 * anything had to be dropped.
 *
 * Returns `text` untouched when it already fits, so a short title is never altered.
 * Trailing spaces and commas are trimmed before the dots, so a title cut after
 * "Sita," reads "Sita..." rather than "Sita ,...".
 */
export function truncateToWidth(
  text: string,
  measure: (candidate: string) => number,
  availablePx: number,
  ellipsis: string = ELLIPSIS,
): string {
  if (text === '') return '';
  // A non-positive budget means the element has not been laid out yet; changing the
  // text now would only cause a flash, so leave it alone.
  if (availablePx <= 0) return text;
  if (measure(text) <= availablePx) return text;

  const budget = availablePx - measure(ellipsis);
  // Not even the dots fit. Show them alone rather than a misleading part-word.
  if (budget <= 0) return ellipsis;

  // Binary search the longest prefix that fits the reduced budget.
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(text.slice(0, middle)) <= budget) low = middle;
    else high = middle - 1;
  }

  if (low === 0) return ellipsis;
  return text.slice(0, low).replace(/[\s,;:.\-–—]+$/u, '') + ellipsis;
}
