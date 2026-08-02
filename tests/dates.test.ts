import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dots, isoDay, dottedDay, yearSpan } from '../src/lib/dates.ts';

/*
 * The date voice (src/lib/dates.ts). The load-bearing property is that a
 * frame's calendar day is computed in UTC — the zone capture dates are stored
 * in — so the same photo never prints a different day on different pages (or
 * on a build machine in a different zone).
 *
 * Note: `monthDay` in src/pages/blog/index.astro is a separate helper (still
 * en-CA locale based) and is not exported from dates.ts, so it is covered by
 * the build-output tests rather than here.
 */

describe('dots', () => {
  test('swaps dashes for dots', () => {
    assert.equal(dots('2022-10-29'), '2022.10.29');
    assert.equal(dots(''), '');
  });
});

describe('isoDay', () => {
  test('formats the UTC calendar day as YYYY-MM-DD', () => {
    assert.equal(isoDay(new Date('2022-10-29T14:08:50Z')), '2022-10-29');
  });

  test('is empty for an absent date', () => {
    assert.equal(isoDay(null), '');
    assert.equal(isoDay(undefined), '');
  });

  test('never shifts a day across midnight or DST-adjacent instants', () => {
    /*
     * The instants a local-zone formatter gets wrong: just after UTC midnight
     * (still "yesterday" anywhere west of Greenwich) and just before it
     * (already "tomorrow" east of it), plus days inside US/EU DST transitions.
     * UTC is the storage zone, so the UTC day is always the right answer.
     */
    const cases: [string, string][] = [
      ['2022-10-29T00:00:00Z', '2022-10-29'], // UTC midnight exactly
      ['2022-10-29T23:59:59Z', '2022-10-29'], // last second of the UTC day
      ['2024-03-10T07:30:00Z', '2024-03-10'], // during the US spring-forward
      ['2024-11-03T06:30:00Z', '2024-11-03'], // during the US fall-back
      ['2024-02-29T12:00:00Z', '2024-02-29'], // leap day
      ['2024-01-01T00:00:01Z', '2024-01-01'], // year boundary
    ];
    for (const [instant, day] of cases) {
      assert.equal(isoDay(new Date(instant)), day, instant);
    }
  });

  test('pads month and day to two digits', () => {
    assert.equal(isoDay(new Date('2024-01-05T12:00:00Z')), '2024-01-05');
  });
});

describe('dottedDay', () => {
  test('is isoDay in the dotted voice', () => {
    assert.equal(dottedDay(new Date('2022-10-29T14:08:50Z')), '2022.10.29');
    assert.equal(dottedDay(null), '');
  });
});

describe('yearSpan', () => {
  test('is empty when nothing is dated', () => {
    assert.equal(yearSpan([]), '');
  });

  test('collapses a single-year library to a lone year', () => {
    assert.equal(yearSpan([2022]), '2022');
    assert.equal(yearSpan([2022, 2022, 2022]), '2022');
  });

  test('spans min to max regardless of input order', () => {
    assert.equal(yearSpan([2024, 2018, 2021]), '2018 — 2024');
  });
});
