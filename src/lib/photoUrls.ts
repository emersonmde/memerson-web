import { PHOTOS_BASE_URL } from '../consts';

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

/** The widest derivative — the no-JS link target and the `<img>` fallback. */
export const widestUrl = (id: string, variants: number[]): string =>
  derivativeUrl(id, Math.max(...variants));

/**
 * The smallest derivative — the right source for the viewer's ambient bloom,
 * which blurs it past recognition anyway and already has it in cache from the
 * tile itself.
 */
export const smallestUrl = (id: string, variants: number[]): string =>
  derivativeUrl(id, Math.min(...variants));
