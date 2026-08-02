/**
 * Derivative generation. See docs/ARCHITECTURE.md §5.5.
 *
 * Everything here runs locally, once, at import time — never in CI. Astro's
 * image cache is local-only and Workers Builds starts cold, so re-encoding
 * ~1,200 derivatives from multi-megabyte sources would be paid on every push,
 * including typo fixes.
 */
import sharp from 'sharp';

import { derivativeKey } from './r2.mjs';

/** Never upscale: a 1600px original yields 640/1024/1536 and nothing wider. */
export const WIDTHS = [640, 1024, 1536, 2048, 2560, 3840, 5120];

/**
 * The cap is sized to the display end, not to secrecy: 5120 fills a 5K screen
 * and is the most a 5472px R6 frame can honestly supply. The site exists to
 * show these photographs, so the decision (2026-07-31, reversing the original
 * 2560 cap) is that anyone with the screen for it gets the full rendering.
 * Originals still stay in the private archive — EXIF privacy is unchanged.
 */
export const MAX_WIDTH = 5120;

/**
 * AVIF plus WebP, no JPEG fallback. AVIF is supported by every current browser
 * and WebP covers anything older; a third format is ~600 more objects and a
 * third more encode time for no reachable user.
 */
export const FORMATS = ['avif', 'webp'];

/**
 * Two quality tiers, split where the audience changes. Rungs up to 1536 are
 * what the grid fetches (`sizes` tops out around 24vw × 2dpr), where q50 AVIF
 * is invisible at tile size; 2048 and up are only ever selected by the open
 * viewer on a large screen, where the photograph *is* the page and encoder
 * artefacts — smeared texture, ringing on feather and branch edges — are the
 * thing on display. The large tier costs roughly 2× the bytes per rung, paid
 * only when someone on a big screen opens the lightbox.
 */
const VIEWER_TIER_MIN_WIDTH = 2048;

const ENCODERS = {
  avif: (image, width) =>
    image.avif({ quality: width >= VIEWER_TIER_MIN_WIDTH ? 62 : 50, effort: 4 }),
  webp: (image, width) =>
    image.webp({ quality: width >= VIEWER_TIER_MIN_WIDTH ? 88 : 80, effort: 4 }),
};

export const CONTENT_TYPES = { avif: 'image/avif', webp: 'image/webp' };

/** Keys embed the content hash via the slug, so derivatives are immutable. */
export const DERIVATIVE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * sharp drops all metadata unless `.withMetadata()` is called. We rely on that
 * *and* assert it — a default is not a guarantee, and the cost of being wrong
 * is publishing GPS coordinates. Checked on every derivative, not a sample.
 */
async function assertNoMetadata(buffer, label) {
  const { exif, icc, iptc, xmp, tifftagPhotoshop } = await sharp(buffer).metadata();
  const present = Object.entries({ exif, icc, iptc, xmp, tifftagPhotoshop })
    .filter(([, value]) => value !== undefined)
    .map(([name]) => name);

  if (present.length > 0) {
    throw new Error(
      `${label} still carries metadata (${present.join(', ')}) — refusing to upload`,
    );
  }
}

/**
 * Intrinsic dimensions as displayed, i.e. after EXIF rotation is applied.
 * Orientations 5–8 are the transposed ones.
 */
export function orientedSize({ width, height }, orientation) {
  return orientation >= 5 && orientation <= 8
    ? { width: height, height: width }
    : { width, height };
}

/**
 * Generate every derivative plus the LQIP for one original.
 *
 * Returns the manifest-shaped geometry fields and a list of objects ready to
 * upload. `.rotate()` with no argument bakes in the EXIF orientation, which
 * matters because the output carries no EXIF to describe it.
 */
export async function deriveAll(slug, buffer) {
  const source = sharp(buffer, { failOn: 'error' });
  const metadata = await source.metadata();
  const { width, height } = orientedSize(metadata, metadata.orientation ?? 1);

  if (!width || !height) throw new Error(`${slug}: could not read image dimensions`);

  const variants = WIDTHS.filter((w) => w <= Math.min(width, MAX_WIDTH));

  /*
   * Top out at the photo's own width, not at the nearest standard rung below
   * it. The standard ladder is width-based because srcset is width-based, but
   * a width cap reads differently per orientation: 5120 is a landscape's long
   * edge and a portrait's *short* edge, so portraits (3648 wide, 5472 tall)
   * were topping out at 2560×3840 — half the pixels an equivalent landscape
   * shipped. Professional galleries (SmugMug, Flickr) size by long edge for
   * exactly this reason; adding the native width as a final rung is the same
   * correction expressed in srcset's vocabulary.
   *
   * Only when it clears the rung below by >10%, though: 5472 over a 5120 rung
   * measured 1.2dB at display size — bytes nobody can see. The portrait's 42%
   * jump is the case this exists for (measured ~4dB at display size).
   */
  // This also covers a source narrower than the smallest standard rung: the
  // ladder is empty, `top` is 0, and the native width becomes the only rung.
  const nativeCap = Math.min(width, MAX_WIDTH);
  const top = variants.at(-1) ?? 0;
  if (nativeCap > top * 1.1) variants.push(nativeCap);

  /*
   * Decode once, encode many. Each of the ~17 derivatives per photo used to
   * start a fresh sharp(buffer) pipeline, paying a full decode of the
   * multi-megabyte source every time; decoding once to a raw pixel buffer
   * (with `.rotate()` baking in the EXIF orientation, as before) and feeding
   * that to every encoder removes the redundant decodes.
   *
   * Colour was verified equivalent, not assumed: sharp 0.35.3 does not apply
   * an embedded ICC transform in either path (measured on a P3-tagged source
   * — identical output pixels with and without the raw hop), and the outputs
   * never carried a profile anyway; assertNoMetadata proves that per object.
   * Depth: raw output defaults to 8-bit, which would quantise 16-bit
   * TIFF/PNG sources *before* resampling, so those carry 'ushort' through
   * the hop. Sources in a colourspace a bare raw buffer cannot represent
   * faithfully (CMYK and friends) keep the old decode-per-derivative path.
   */
  const RAW_SAFE_SPACES = new Set(['srgb', 'rgb', 'rgb16', 'b-w', 'grey16']);
  let openImage;
  if (RAW_SAFE_SPACES.has(metadata.space)) {
    const depth = metadata.depth === 'uchar' ? 'uchar' : 'ushort';
    const { data: pixels, info: rawInfo } = await sharp(buffer, { failOn: 'error' })
      .rotate()
      .raw({ depth })
      .toBuffer({ resolveWithObject: true });
    const rawInput = {
      width: rawInfo.width,
      height: rawInfo.height,
      channels: rawInfo.channels,
      ...(depth === 'ushort' ? { depth } : {}),
    };
    openImage = () => sharp(pixels, { raw: rawInput, failOn: 'error' });
  } else {
    openImage = () => sharp(buffer, { failOn: 'error' }).rotate();
  }

  const objects = [];
  for (const targetWidth of variants) {
    for (const format of FORMATS) {
      const resized = openImage().resize({
        width: targetWidth,
        withoutEnlargement: true,
      });

      const output = await ENCODERS[format](resized, targetWidth).toBuffer();
      await assertNoMetadata(output, `${slug}/${targetWidth}.${format}`);

      objects.push({
        key: derivativeKey(slug, targetWidth, format),
        body: output,
        contentType: CONTENT_TYPES[format],
        cacheControl: DERIVATIVE_CACHE_CONTROL,
      });
    }
  }

  // ~16px WebP inlined as a data URI: 300–500 bytes, so ~12 KB for a 30-photo
  // page, and it costs zero extra requests.
  const lqipBuffer = await openImage()
    .resize({ width: 16 })
    .webp({ quality: 50, effort: 4 })
    .toBuffer();
  await assertNoMetadata(lqipBuffer, `${slug} lqip`);

  return {
    width,
    height,
    aspectRatio: Number((width / height).toFixed(4)),
    // The source format, already parsed above — returned so the caller can
    // name the archived original without a second metadata pass.
    format: metadata.format,
    variants,
    formats: [...FORMATS],
    lqip: `data:image/webp;base64,${lqipBuffer.toString('base64')}`,
    objects,
  };
}
