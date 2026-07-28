import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { groupIntoRuns, THIN_RUN } from '../src/lib/runs.ts';
import type { ShootRecord } from '../src/lib/runs.ts';

/*
 * The stray rule is the only interesting thing here, and it is interesting
 * because the obvious implementation — a global "Miscellaneous" bucket — is
 * wrong in a way that is invisible until the library has a few one-offs in it.
 * These assert the invariants, not a particular grouping of today's manifest:
 * coverage is total, order is chronology, and merging only ever happens between
 * neighbours.
 */

const photo = (shoot: string | null, id = shoot) => ({ shoot, id });

const SHOOTS: Record<string, ShootRecord> = {
  a: { name: 'Air Show', series: 'air-shows', cameras: ['Canon EOS R6'] },
  b: { name: 'Zoo Trip', cameras: ['Canon EOS R6'] },
  c: { name: 'Stuffed Lion Toy', cameras: ['Canon EOS R6'] },
  d: { name: 'A Clock', cameras: ['Apple iPhone 11 Pro Max'] },
};

/** Repeat a shoot key n times, as consecutive frames of one outing. */
const run = (key: string, n: number) =>
  Array.from({ length: n }, (_, i) => photo(key, `${key}${i}`));

describe('groupIntoRuns', () => {
  test('consecutive frames of one shoot become one run', () => {
    const runs = groupIntoRuns([...run('a', 5), ...run('b', 4)], SHOOTS);
    assert.equal(runs.length, 2);
    assert.deepEqual(
      runs.map((r) => [r.key, r.name, r.items.length]),
      [
        ['a', 'Air Show', 5],
        ['b', 'Zoo Trip', 4],
      ],
    );
  });

  test('the series hangs off the run, not off a page of its own', () => {
    const [air] = groupIntoRuns(run('a', 5), SHOOTS);
    assert.equal(air.series, 'air-shows');
  });

  test(`a run of ${THIN_RUN} frames or fewer is not an outing`, () => {
    const runs = groupIntoRuns([...run('a', 5), ...run('c', THIN_RUN)], SHOOTS);
    assert.equal(runs.length, 2);
    assert.equal(runs[1].stray, true);
    assert.equal(runs[1].name, null, 'a stray stretch has no outing name');
  });

  test('consecutive thin runs merge into one stretch, not one per shoot', () => {
    const runs = groupIntoRuns(
      [...run('a', 5), ...run('c', 1), ...run('d', 1), ...run('b', 4)],
      SHOOTS,
    );
    assert.deepEqual(
      runs.map((r) => [r.stray, r.items.length]),
      [
        [false, 5],
        [true, 2],
        [false, 4],
      ],
    );
  });

  test('a stray stretch never reaches across a real outing', () => {
    /*
     * This is the whole point of merging in place rather than into one bucket:
     * a 2018 walk must not end up filed next to a 2022 faire.
     */
    const runs = groupIntoRuns([...run('c', 1), ...run('a', 5), ...run('d', 1)], SHOOTS);
    assert.deepEqual(
      runs.map((r) => r.stray),
      [true, false, true],
    );
  });

  test('every frame lands in exactly one run, in the order it arrived', () => {
    const input = [...run('a', 3), ...run('c', 1), ...run('b', 4), ...run('d', 2)];
    const runs = groupIntoRuns(input, SHOOTS);
    assert.deepEqual(
      runs.flatMap((r) => r.items.map((p) => p.id)),
      input.map((p) => p.id),
    );
  });

  test('a photo with no shoot is grouped rather than dropped', () => {
    const runs = groupIntoRuns([...run('a', 5), photo(null, 'loose')], SHOOTS);
    assert.equal(runs.length, 2);
    assert.equal(runs[1].stray, true);
    assert.deepEqual(
      runs[1].items.map((p) => p.id),
      ['loose'],
    );
  });

  test('an unnamed shoot keeps its key rather than inventing a name', () => {
    const [only] = groupIntoRuns(run('unknown', 5), SHOOTS);
    assert.equal(only.key, 'unknown');
    assert.equal(only.name, null);
  });

  test('a merged stretch takes the union of the cameras it swallowed', () => {
    const runs = groupIntoRuns([...run('c', 1), ...run('d', 1)], SHOOTS);
    assert.deepEqual(runs[0].cameras.sort(), ['Apple iPhone 11 Pro Max', 'Canon EOS R6']);
  });

  test('an empty library produces no runs rather than an empty bucket', () => {
    assert.deepEqual(groupIntoRuns([], SHOOTS), []);
  });
});
