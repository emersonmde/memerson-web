import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oklabHueChroma, liveAccent, GREY_FLOOR } from '../src/lib/ambient.ts';

/*
 * Reference hues for the sRGB primaries in OKLab, from the CSS Color 4
 * sample tables (red ≈ 29.2°, green ≈ 142.5°, blue ≈ 264.1°). Asserted as
 * neighbourhoods, not exact values — what matters is that the conversion is
 * in the right part of the wheel, not its fifth decimal.
 */
test('primaries land at their known OKLab hues', () => {
  const near = (x: number, target: number, tol = 3) => Math.abs(x - target) < tol;
  assert.ok(near(oklabHueChroma(1, 0, 0).hue, 29.2), 'red');
  assert.ok(near(oklabHueChroma(0, 1, 0).hue, 142.5), 'green');
  assert.ok(near(oklabHueChroma(0, 0, 1).hue, 264.1), 'blue');
});

test('greys have no hue to trust', () => {
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    assert.ok(oklabHueChroma(v, v, v).chroma < GREY_FLOOR);
    assert.equal(liveAccent(v, v, v), null);
  }
});

test('accent keeps the ramp contract: lightness and chroma locked, hue free', () => {
  const accent = liveAccent(0.9, 0.3, 0.5);
  assert.ok(accent);
  const m = accent.match(/^oklch\(\.80 \.17 (\d+(?:\.\d+)?)\)$/);
  assert.ok(m, `ramp-shaped accent, got ${accent}`);
  const hue = Number(m![1]);
  assert.ok(hue >= 0 && hue < 360);
});

test('hue is stable under exposure: scaling RGB moves lightness, not hue', () => {
  const bright = oklabHueChroma(0.8, 0.4, 0.2).hue;
  const dim = oklabHueChroma(0.4, 0.2, 0.1).hue;
  assert.ok(Math.abs(bright - dim) < 2);
});
