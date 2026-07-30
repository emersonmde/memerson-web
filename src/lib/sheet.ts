/**
 * Column assignment for the flat contact sheet.
 *
 * The sheet used to be CSS multicol, which fills column-by-column: with 1300
 * frames in four columns, frames 1–325 ran down column one and a shoot 40%
 * through the library started at the *top* of column two. Scroll position and
 * time had nothing to do with each other, so "jump to a shoot" had nowhere
 * meaningful to land and the rail's scroll tracking pointed at the wrong run.
 *
 * This packs the same frames row-major instead: items are taken in time order
 * and each goes to the currently shortest column (ties break leftmost, so a
 * fresh row fills left to right). That keeps vertical position monotonic-ish
 * with time — a shoot's first frame is where the shoot begins on the page —
 * while still packing tightly like a masonry.
 *
 * Pure on purpose: heights in, column indices out, so it can be tested without
 * a DOM. The caller estimates heights from each tile's aspect ratio; the
 * estimate only has to be *proportionally* right for the packing to balance.
 */
export function packColumns(heights: number[], cols: number): number[] {
  const n = Math.max(1, Math.floor(cols));
  const tops = new Array<number>(n).fill(0);
  return heights.map((height) => {
    let best = 0;
    for (let c = 1; c < n; c++) {
      if (tops[c] < tops[best]) best = c;
    }
    tops[best] += Math.max(0, height);
    return best;
  });
}
