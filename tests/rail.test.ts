import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHARGE_START,
  chargeDistance,
  chargeOf,
  chargeOriginY,
  chaseCharge,
  headViewportY,
  nodeLit,
} from '../src/lib/rail.ts';

/*
 * The rail charge is the most content-sensitive thing on the site: every
 * project added makes the rail longer, and any style change to a plate moves
 * every node below it.
 *
 * These tests deliberately assert *invariants* rather than pixel values. A test
 * that pinned "at scroll 800 the head is at 368px" would fail the next time a
 * plate gained a line of text, and it would be right to fail while telling you
 * nothing. What actually has to stay true is that the head is on screen for the
 * whole run and the charge lands on the terminal exactly as the terminal
 * appears — and those hold at any rail length.
 */

/** A representative spread of viewport heights: laptop, desktop, tall monitor. */
const VIEWPORTS = [700, 800, 900, 1080, 1440];

/** Rail lengths from "3 projects" to "60 projects, all expanded". */
const HEIGHTS = [400, 800, 1332, 2000, 2831, 5000, 9000];

describe('chargeOf', () => {
  test('is 0 before the rail origin reaches the start line', () => {
    for (const vh of VIEWPORTS) {
      const origin = chargeOriginY(vh);
      assert.equal(chargeOf(origin + 1, 2000, vh), 0);
      assert.equal(chargeOf(vh, 2000, vh), 0, 'rail still below the fold');
    }
  });

  test('is exactly 0 at the origin and exactly 1 when the terminal enters view', () => {
    for (const vh of VIEWPORTS) {
      for (const height of HEIGHTS) {
        if (height <= vh - chargeOriginY(vh)) continue; // degenerate, covered below
        const origin = chargeOriginY(vh);

        assert.equal(chargeOf(origin, height, vh), 0, `origin, h=${height} vh=${vh}`);

        // The terminal enters view when top + height === vh.
        const topAtTerminal = vh - height;
        assert.equal(
          chargeOf(topAtTerminal, height, vh),
          1,
          `terminal visible, h=${height} vh=${vh}`,
        );
      }
    }
  });

  test('never decreases as the page scrolls down', () => {
    for (const vh of VIEWPORTS) {
      for (const height of HEIGHTS) {
        let previous = -1;
        for (let top = vh; top > -height; top -= 7) {
          const cg = chargeOf(top, height, vh);
          assert.ok(cg >= previous, `cg went backwards at top=${top}`);
          assert.ok(cg >= 0 && cg <= 1, `cg out of range: ${cg}`);
          previous = cg;
        }
      }
    }
  });

  test('a rail shorter than the viewport has no run to animate', () => {
    const vh = 900;
    const height = 200; // terminal is on screen before the charge could start
    assert.equal(chargeOf(vh, height, vh), 0, 'still below the fold');
    assert.equal(chargeOf(chargeOriginY(vh), height, vh), 1, 'reached the start line');
    assert.equal(chargeOf(-50, height, vh), 1, 'scrolled past');
  });
});

describe('the head stays on screen', () => {
  /*
   * This is the property the whole design depends on, and the reason the charge
   * is defined by anchors rather than a tuned speed multiplier. If it ever
   * fails, the light is racing off the top or lagging below the fold.
   */
  test('is within [origin, viewport bottom] for every charge value', () => {
    for (const vh of VIEWPORTS) {
      const origin = chargeOriginY(vh);
      for (let cg = 0; cg <= 1; cg += 0.01) {
        const y = headViewportY(cg, vh);
        assert.ok(y >= origin - 0.001, `head above origin: ${y} < ${origin}`);
        assert.ok(y <= vh + 0.001, `head below fold: ${y} > ${vh}`);
      }
    }
  });

  test('holds while scrolling any rail length through any viewport', () => {
    for (const vh of VIEWPORTS) {
      for (const height of HEIGHTS) {
        for (let top = vh; top > -height; top -= 11) {
          const cg = chargeOf(top, height, vh);
          if (cg <= 0 || cg >= 1) continue; // only the run itself is constrained

          // Where the head actually renders: rail top plus travel along the rail.
          const rendered = top + chargeDistance(cg, height);
          assert.ok(
            rendered >= -0.5 && rendered <= vh + 0.5,
            `head off screen at h=${height} vh=${vh} top=${top}: ${rendered}`,
          );

          // And it agrees with the closed form the design is stated in.
          assert.ok(
            Math.abs(rendered - headViewportY(cg, vh)) < 0.5,
            `rendered head disagrees with closed form at h=${height} vh=${vh}`,
          );
        }
      }
    }
  });

  test('outruns the scroll, and by more as the rail grows', () => {
    const vh = 900;
    const speed = (height: number) => {
      const span = height - vh + chargeOriginY(vh);
      return height / span;
    };
    assert.ok(speed(1332) > 1, 'charge must be faster than scroll');
    assert.ok(speed(5000) > 1);
    // Longer rails do not make the charge slower than scroll.
    assert.ok(speed(9000) > 1);
  });
});

describe('nodeLit', () => {
  test('is dark well before the head and lit well after', () => {
    assert.equal(nodeLit(0, 500), 0, 'head has not arrived');
    assert.equal(nodeLit(500, 0), 1, 'head long past');
  });

  test('is half lit exactly as the head reaches the node', () => {
    assert.equal(nodeLit(300, 300), 0.5);
  });

  test('never decreases as the charge advances', () => {
    let previous = -1;
    for (let chargeY = 0; chargeY <= 400; chargeY += 3) {
      const lit = nodeLit(chargeY, 200);
      assert.ok(lit >= previous, 'node un-lit itself');
      assert.ok(lit >= 0 && lit <= 1);
      previous = lit;
    }
  });

  test('nodes light in rail order, never out of sequence', () => {
    // Whatever the plate sizes, a node higher up the rail is never less lit
    // than one below it. This is what "the charge races down" means, and it
    // survives any change to plate height or spacing.
    const nodes = [0, 120, 260, 300, 780, 1500];
    for (let chargeY = 0; chargeY <= 1600; chargeY += 17) {
      const lits = nodes.map((y) => nodeLit(chargeY, y));
      for (let i = 1; i < lits.length; i++) {
        assert.ok(lits[i - 1] >= lits[i], `node ${i} lit before node ${i - 1}`);
      }
    }
  });
});

describe('chaseCharge', () => {
  /*
   * The chase exists because a phone flick moves the scroll further per frame
   * than a node's whole kindle ramp — the invariants here are about what the
   * roll may never do, not about its exact shape.
   */
  const HEIGHT = 2800;

  test('a first frame arrives instantly, without a roll-in', () => {
    assert.equal(chaseCharge(-1, 0.62, 16, HEIGHT), 0.62);
  });

  test('never overshoots, from either direction', () => {
    for (const [from, to] of [
      [0.1, 0.9],
      [0.9, 0.1],
    ]) {
      let cg = from;
      for (let i = 0; i < 200; i++) {
        const next = chaseCharge(cg, to, 16, HEIGHT);
        if (to > from) {
          assert.ok(next >= cg && next <= to, `overshot rising: ${next}`);
        } else {
          assert.ok(next <= cg && next >= to, `overshot falling: ${next}`);
        }
        cg = next;
      }
    }
  });

  test('converges exactly, not asymptotically', () => {
    let cg = 0;
    let frames = 0;
    while (cg !== 1 && frames < 300) {
      cg = chaseCharge(cg, 1, 16, HEIGHT);
      frames++;
    }
    assert.equal(cg, 1, 'never landed on the target');
    // ~5τ at 60fps ≈ 30 frames; 90 is "converges promptly", not a pixel value.
    assert.ok(frames < 90, `took ${frames} frames to land`);
  });

  test('is frame-rate independent: two half frames equal one whole one', () => {
    // Well away from the snap threshold so the pure exponential is compared.
    const whole = chaseCharge(0.2, 0.8, 16, HEIGHT);
    const halves = chaseCharge(chaseCharge(0.2, 0.8, 8, HEIGHT), 0.8, 8, HEIGHT);
    assert.ok(Math.abs(whole - halves) < 1e-9);
  });

  test('a flick that outruns the ramp still yields intermediate frames', () => {
    // Target teleports by the equivalent of 80px of rail per frame — more than
    // the 40px ramp. The painted value must visit strictly intermediate
    // charges, which is the whole point of the chase.
    let cg = 0.2;
    const target = 0.2 + 80 / HEIGHT;
    const next = chaseCharge(cg, target, 16, HEIGHT);
    assert.ok(next > cg, 'did not move');
    assert.ok(next < target, 'teleported with the scroll');
  });

  test('an arrived charge stays put', () => {
    assert.equal(chaseCharge(0.5, 0.5, 16, HEIGHT), 0.5);
  });
});

describe('constants', () => {
  test('the charge starts inside the viewport, not at its edge', () => {
    assert.ok(CHARGE_START > 0 && CHARGE_START < 0.5);
  });
});
