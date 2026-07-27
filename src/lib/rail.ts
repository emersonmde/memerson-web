/**
 * The rail charge geometry.
 *
 * Extracted from `src/scripts/fx.ts` so it can be tested without a browser.
 * These are the numbers that decide where the light sits, and they are the part
 * most exposed to content change — every project added makes the rail longer,
 * and every style change to a plate changes where the nodes land. Pure
 * functions here, DOM reading there.
 *
 * See docs/UI-DESIGN.md §5.3.
 */

/**
 * Where the charge originates, as a fraction of viewport height.
 *
 * Starting at the nav meant the run only began once the rail's origin had
 * already scrolled under the header — the start of the line was gone before the
 * charge left it. A fifth of the way down keeps origin, charge and the first
 * plates in frame together.
 */
export const CHARGE_START = 0.2;

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Viewport y at which the charge originates. */
export const chargeOriginY = (viewportHeight: number) => viewportHeight * CHARGE_START;

/**
 * How far the charge has run, 0–1.
 *
 * Two anchors define it and everything else follows:
 *
 *   cg = 0  when the rail's origin reaches `chargeOriginY`
 *   cg = 1  when the rail's terminal enters the viewport
 *
 * so `span = height - viewportHeight + origin` and `cg = (origin - top) / span`.
 *
 * The consequence worth protecting: substituting back, the head's viewport
 * position is `origin + cg * (viewportHeight - origin)` — a linear sweep from
 * the origin to the bottom of the screen, so the head is on screen for the whole
 * run *by construction*. The speed multiplier (`height / span`) falls out of the
 * geometry and self-adjusts as the rail grows, rather than being a constant that
 * silently decays as projects are added.
 *
 * @param top    rail's top edge in viewport coordinates (negative once scrolled past)
 * @param height rail's full height in px
 */
export function chargeOf(top: number, height: number, viewportHeight: number): number {
  const origin = chargeOriginY(viewportHeight);
  const span = height - viewportHeight + origin;

  // A rail shorter than the visible area has its terminal on screen before the
  // charge would start, so there is no run to animate.
  if (span <= 0) return top <= origin ? 1 : 0;

  return clamp01((origin - top) / span);
}

/** Where the head sits in viewport coordinates, given a charge. */
export function headViewportY(charge: number, viewportHeight: number): number {
  const origin = chargeOriginY(viewportHeight);
  return origin + clamp01(charge) * (viewportHeight - origin);
}

/** Distance the head has travelled along the rail, in rail-local px. */
export const chargeDistance = (charge: number, height: number) =>
  clamp01(charge) * height;

/** Ramp width, in px, over which a node kindles as the head sweeps past it. */
export const NODE_RAMP = 40;

/**
 * How lit a node is, 0–1, from the charge rather than from its own scroll
 * position. A node should light because the charge arrived — the two only
 * agree while the charge runs at exactly scroll speed, which it does not.
 *
 * @param chargeY how far the head has travelled along the rail
 * @param nodeY   the node's own offset along the rail
 */
export function nodeLit(chargeY: number, nodeY: number): number {
  return clamp01((chargeY - nodeY + NODE_RAMP / 2) / NODE_RAMP);
}
