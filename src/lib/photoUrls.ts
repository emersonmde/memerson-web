// Explicit .ts extension so Node's type-stripping test runner can resolve
// this module too (tests/photoUrls.test.ts); Vite and tsc both accept it
// (`allowImportingTsExtensions` is on in astro/tsconfigs/base).
import { PHOTOS_BASE_URL } from '../consts.ts';

/**
 * Derivative URLs, in one place so the three photo components cannot drift.
 *
 * Every public image lives at `photos/<slug>/<width>.<format>` on the R2
 * custom domain; `variants` in the manifest lists the widths that actually
 * exist for a frame. Nothing here invents a rung — a URL is only ever built
 * from a width the import script generated.
 */

export const derivativeUrl = (id: string, width: number, format = 'webp'): string =>
  `${PHOTOS_BASE_URL}/photos/${id}/${width}.${format}`;

/** The `srcset` for one format: every rung the manifest says exists. */
export const srcSetFor = (id: string, variants: number[], format: string): string =>
  variants.map((w) => `${derivativeUrl(id, w, format)} ${w}w`).join(', ');

/**
 * An empty ladder is a broken manifest, and `Math.max()` of nothing is
 * `-Infinity` — which would silently ship `/-Infinity.webp` as a 404 image.
 * Fail the build and name the photo instead, the same philosophy as
 * Photo.astro throwing on an unknown slug.
 */
const requireVariants = (id: string, variants: number[]): void => {
  if (variants.length === 0) {
    throw new Error(`photo "${id}" has no derivative variants — broken manifest?`);
  }
};

/** The widest derivative — the no-JS link target and the `<img>` fallback. */
export const widestUrl = (id: string, variants: number[]): string => {
  requireVariants(id, variants);
  return derivativeUrl(id, Math.max(...variants));
};

/**
 * The smallest derivative — the right source for the viewer's ambient bloom,
 * which blurs it past recognition anyway and already has it in cache from the
 * tile itself.
 */
export const smallestUrl = (id: string, variants: number[]): string => {
  requireVariants(id, variants);
  return derivativeUrl(id, Math.min(...variants));
};
