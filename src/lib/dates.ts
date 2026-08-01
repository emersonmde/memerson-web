/**
 * The site's date voice, in one place so it cannot drift between pages.
 *
 * Dates print as `2022.10.29` — an ISO day with the dashes swapped for dots —
 * everywhere but prose. en-CA is the one locale whose short date is already
 * ISO-ordered, and UTC matches how capture dates are stored, so the same frame
 * never shifts a day between pages.
 */

/** "2022-10-29" → "2022.10.29". */
export const dots = (iso: string) => iso.replace(/-/g, '.');

/** A Date → its ISO calendar day ("2022-10-29") in UTC, or '' when absent. */
export const isoDay = (d: Date | null | undefined): string =>
  d ? d.toLocaleDateString('en-CA', { timeZone: 'UTC' }) : '';

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
