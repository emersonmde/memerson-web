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
 * Time constant, in ms, of the charge's approach to its geometric target.
 *
 * Why the charge needs a clock at all: a phone flick moves the page ~2,000px/s,
 * which is 30–70px per frame — the head crosses a node's entire 40px ramp
 * between two paints, so every intermediate state the ramp was designed to show
 * simply never gets a frame. Each painted value is *correct*; there is nothing
 * between them. Desktop wheels scroll in small smoothed steps, which is why the
 * jump only shows on touch.
 *
 * So the painted charge chases the geometric one with an exponential approach,
 * and the smoothing lives *here*, upstream of the fan-out — the mask, the head
 * and every node still read a single value and cannot disagree. This is the
 * same argument that removed the CSS transitions from the nodes (UI-DESIGN
 * §5.3, "the charge is the only clock"): smoothing applied per-consumer is a
 * second clock, smoothing applied to the clock is not.
 *
 * 90ms ≈ converged in a third of a second after the scroll stops — brisk
 * enough to read as electricity, slow enough that a flicked-past node visibly
 * kindles instead of popping.
 */
export const CHARGE_TAU = 90;

/**
 * One step of that approach: where the painted charge moves this frame, given
 * where it is, where the geometry says it should be, and how long the frame
 * was.
 *
 * Exponential rather than a fixed fraction so the roll is frame-rate
 * independent: two 8ms frames advance exactly as far as one 16ms frame.
 * Within 0.4px of the target it *snaps*, because an asymptote never actually
 * arrives and the terminal must light exactly when the geometry says cg = 1
 * — the guaranteed-final-frame rule (UI-DESIGN §5.3) depends on the last
 * paint landing on the target, not near it.
 *
 * A negative `current` means "no previous frame" and arrives immediately:
 * a page opened mid-document must render the rail as it should already look,
 * not roll into it.
 */
export function chaseCharge(
  current: number,
  target: number,
  dtMs: number,
  heightPx: number,
): number {
  if (current < 0) return target;
  const next = current + (target - current) * (1 - Math.exp(-dtMs / CHARGE_TAU));
  return Math.abs(target - next) * heightPx < 0.4 ? target : next;
}

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
