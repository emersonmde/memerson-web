/**
 * The accent ramp, sampled at build time.
 *
 * This is the same function as `hueAt` in `src/scripts/fx.ts`, and it exists
 * twice on purpose: this one produces the pre-JS colour baked into the markup,
 * so the plates are correctly tinted before (and without) any script running.
 * fx.ts then re-samples from *measured* positions once layout settles, which is
 * the only way the hue can be guaranteed to match the gradient behind it.
 *
 * Lightness and chroma stay locked; only hue moves. See docs/UI-DESIGN.md §2.
 */
export function hueAt(t: number): string {
  const u = Math.max(0, Math.min(1, t));
  const h = u < 0.5 ? 66 + (200 - 66) * (u * 2) : 200 + (286 - 200) * ((u - 0.5) * 2);
  return `oklch(.80 .17 ${h.toFixed(1)})`;
}

/** Evenly spaced sample for item `index` of `count`. */
export function hueForIndex(index: number, count: number): string {
  return hueAt(count <= 1 ? 0 : index / (count - 1));
}
