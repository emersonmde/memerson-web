/**
 * Derivative generation. See docs/ARCHITECTURE.md §5.5.
 *
 * Everything here runs locally, once, at import time — never in CI. Astro's
 * image cache is local-only and Workers Builds starts cold, so re-encoding
 * ~1,200 derivatives from multi-megabyte sources would be paid on every push,
 * including typo fixes.
 */
import sharp from 'sharp';

/** Never upscale: a 1600px original yields 640/1024/1536 and nothing wider. */
export const WIDTHS = [640, 1024, 1536, 2048, 2560];

/** Hard cap, enforced here rather than by convention. Originals stay private. */
export const MAX_WIDTH = 2560;

/**
 * AVIF plus WebP, no JPEG fallback. AVIF is supported by every current browser
 * and WebP covers anything older; a third format is ~600 more objects and a
 * third more encode time for no reachable user.
 */
export const FORMATS = ['avif', 'webp'];

const ENCODERS = {
  avif: (image) => image.avif({ quality: 50, effort: 4 }),
  webp: (image) => image.webp({ quality: 80, effort: 4 }),
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

  // A source narrower than the smallest rung would otherwise produce nothing.
  if (variants.length === 0) variants.push(Math.min(width, WIDTHS[0]));

  const objects = [];
  for (const targetWidth of variants) {
    for (const format of FORMATS) {
      const resized = sharp(buffer, { failOn: 'error' })
        .rotate()
        .resize({ width: targetWidth, withoutEnlargement: true });

      const output = await ENCODERS[format](resized).toBuffer();
      await assertNoMetadata(output, `${slug}/${targetWidth}.${format}`);

      objects.push({
        key: `photos/${slug}/${targetWidth}.${format}`,
        body: output,
        contentType: CONTENT_TYPES[format],
        cacheControl: DERIVATIVE_CACHE_CONTROL,
      });
    }
  }

  // ~16px WebP inlined as a data URI: 300–500 bytes, so ~12 KB for a 30-photo
  // page, and it costs zero extra requests.
  const lqipBuffer = await sharp(buffer, { failOn: 'error' })
    .rotate()
    .resize({ width: 16 })
    .webp({ quality: 50, effort: 4 })
    .toBuffer();
  await assertNoMetadata(lqipBuffer, `${slug} lqip`);

  return {
    width,
    height,
    aspectRatio: Number((width / height).toFixed(4)),
    variants,
    formats: [...FORMATS],
    lqip: `data:image/webp;base64,${lqipBuffer.toString('base64')}`,
    objects,
  };
}
