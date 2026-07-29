/**
 * The gallery's ambient light.
 *
 * /photos is lit by whichever shoot is on screen: a blurred LQIP becomes the
 * room's light, and the page accent takes that light's *hue*. The hue is
 * extracted here in OKLab, the same space the accent ramp is defined in, and
 * re-emitted at the ramp's locked lightness and chroma (`oklch(.80 .17 h)`) —
 * so a sampled colour can never fight the design system, only steer it.
 *
 * Pure maths, no DOM: `src/scripts/photos.ts` owns the canvas that produces
 * the averaged RGB fed in here.
 */

/**
 * sRGB → OKLab. Matrices from Björn Ottosson, "A perceptual color space for
 * image processing" (https://bottosson.github.io/posts/oklab/), the reference
 * the CSS Color 4 oklch() definition points at.
 */
function srgbToOklab(r: number, g: number, b: number): { a: number; b: number } {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lr = lin(r);
  const lg = lin(g);
  const lb = lin(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return {
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** Hue angle (degrees, [0, 360)) and chroma of an sRGB colour, in OKLab. */
export function oklabHueChroma(
  r: number,
  g: number,
  b: number,
): { hue: number; chroma: number } {
  const { a, b: bb } = srgbToOklab(r, g, b);
  const hue = (Math.atan2(bb, a) * 180) / Math.PI;
  return { hue: (hue + 360) % 360, chroma: Math.hypot(a, bb) };
}

/**
 * Below this chroma the sampled average is effectively grey — a monochrome
 * shoot, or a colourful one whose hues cancelled out. Either way the sample
 * carries no honest hue, so the caller falls back to the site's cyan.
 */
export const GREY_FLOOR = 0.02;

/**
 * The accent for a sampled colour: the ramp's locked lightness and chroma at
 * the sample's hue, or null when the sample is too grey to trust.
 */
export function liveAccent(r: number, g: number, b: number): string | null {
  const { hue, chroma } = oklabHueChroma(r, g, b);
  if (chroma < GREY_FLOOR) return null;
  return `oklch(.80 .17 ${hue.toFixed(1)})`;
}
