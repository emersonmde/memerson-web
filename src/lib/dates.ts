/**
 * The site's date voice, in one place so it cannot drift between pages.
 *
 * Dates print as `2022.10.29` — an ISO day with the dashes swapped for dots —
 * everywhere but prose. UTC matches how capture dates are stored, so the same
 * frame never shifts a day between pages.
 */

/** "2022-10-29" → "2022.10.29". */
export const dots = (iso: string) => iso.replace(/-/g, '.');

/**
 * A Date → its ISO calendar day ("2022-10-29") in UTC, or '' when absent.
 *
 * `toISOString()` is specified (ECMA-262) to emit `YYYY-MM-DD…` in UTC, so
 * slicing the day off is locale-independent. The previous en-CA
 * `toLocaleDateString` produced the same string, but only because that
 * locale's ICU data happens to be ISO-ordered — an implementation detail,
 * not a guarantee.
 */
export const isoDay = (d: Date | null | undefined): string =>
  d ? d.toISOString().slice(0, 10) : '';

/** A Date → the dotted voice ("2022.10.29"), or '' when absent. */
export const dottedDay = (d: Date | null | undefined): string => dots(isoDay(d));

/**
 * "2018 — 2024", a lone year for a single-year library (never "2022 — 2022"),
 * or '' when nothing is dated.
 */
export const yearSpan = (years: number[]): string => {
  if (years.length === 0) return '';
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? String(min) : `${min} — ${max}`;
};
