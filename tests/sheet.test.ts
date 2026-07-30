import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { packColumns } from '../src/lib/sheet.ts';

/*
 * Invariants, not layouts. The library grows with every import, aspect ratios
 * are whatever the camera produced, and the column count changes with the
 * viewport — so nothing here asserts "item 7 lands in column 2". What has to
 * stay true at any size: every item gets a real column, order within a column
 * is the input order, a fresh row fills left to right, and no column runs away
 * from the others by more than one item.
 */

/** A spread of plausible tile heights: landscape, square, portrait. */
const heightsOf = (n: number) =>
  Array.from({ length: n }, (_, i) => [0.6, 0.67, 1, 1.5, 1.78][i % 5]!);

describe('packColumns', () => {
  test('assigns every item a column inside the range', () => {
    for (const cols of [1, 2, 3, 4]) {
      for (const n of [0, 1, 5, 118, 1300]) {
        const assign = packColumns(heightsOf(n), cols);
        assert.equal(assign.length, n);
        for (const c of assign) {
          assert.ok(Number.isInteger(c) && c >= 0 && c < cols, `column ${c}`);
        }
      }
    }
  });

  test('one column takes everything', () => {
    assert.deepEqual(packColumns(heightsOf(7), 1), [0, 0, 0, 0, 0, 0, 0]);
  });

  test('a fresh row fills left to right', () => {
    // Equal heights: ties must break leftmost, so the first row is 0,1,2,3.
    const assign = packColumns([1, 1, 1, 1, 1, 1, 1, 1], 4);
    assert.deepEqual(assign.slice(0, 4), [0, 1, 2, 3]);
    assert.deepEqual(assign.slice(4), [0, 1, 2, 3]);
  });

  test('columns stay balanced within one item height', () => {
    for (const cols of [2, 3, 4]) {
      const heights = heightsOf(237);
      const assign = packColumns(heights, cols);
      const tops = new Array(cols).fill(0);
      heights.forEach((h, i) => (tops[assign[i]!] += h));
      const spread = Math.max(...tops) - Math.min(...tops);
      // The greedy bound: no column exceeds another by more than the tallest
      // single item. This is what keeps reading order roughly temporal.
      assert.ok(spread <= Math.max(...heights) + 1e-9, `spread ${spread}`);
    }
  });

  test('vertical position tracks input order', () => {
    // The property the jump feature relies on: a later item never starts
    // above an earlier one by more than a row. Greedy places each item at
    // min(tops), and min(tops) never decreases — check exactly that.
    const heights = heightsOf(300);
    const cols = 4;
    const tops = new Array(cols).fill(0);
    let previousY = 0;
    const assign = packColumns(heights, cols);
    heights.forEach((h, i) => {
      const y = tops[assign[i]!];
      assert.ok(y >= previousY - 1e-9, `item ${i} placed above item ${i - 1}`);
      previousY = y;
      tops[assign[i]!] += h;
    });
  });

  test('degenerate inputs do not throw or leak NaN', () => {
    assert.deepEqual(packColumns([], 4), []);
    assert.deepEqual(packColumns([1, 1], 0), [0, 0]); // clamps to one column
    const assign = packColumns([0, -5, 2], 2);
    for (const c of assign) assert.ok(c === 0 || c === 1);
  });
});
