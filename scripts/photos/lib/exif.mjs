/**
 * EXIF extraction — an allowlist, never a denylist. See docs/ARCHITECTURE.md §5.6.
 *
 * A denylist is the wrong shape: it would have to enumerate GPS *and* camera and
 * lens serial numbers, owner/artist fields, and vendor `MakerNote` blobs whose
 * contents differ per manufacturer and grow with each new camera. Allowlisting
 * is the only version that stays correct as unknown fields appear.
 *
 * The allowlist is applied at the *read* layer via exifr's `pick`, so nothing
 * outside it is ever parsed into memory, let alone written to the manifest.
 */
import exifr from 'exifr';

/** The complete set of tags this project retains. Nothing else is read. */
const ALLOWED_TAGS = [
  'DateTimeOriginal',
  'CreateDate',
  'Make',
  'Model',
  'LensModel',
  'FocalLength',
  'FNumber',
  'ExposureTime',
  'ISO',
];

/**
 * EXIF timestamps carry no timezone — "2022:03:14 18:23:41" is whatever the
 * camera's clock read. Interpreting that in the *importing machine's* local zone
 * would make the slug depend on where the import was run, so the camera's wall
 * clock is stored as-is with a Z suffix. The displayed time then always matches
 * what the camera showed, and the slug is reproducible anywhere.
 */
function exifDateToIso(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  // Cameras with an unset clock write syntactically valid garbage —
  // "0000:00:00 00:00:00" is the classic. Treat it as missing, same as no tag.
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** "Canon" + "Canon EOS R6" reads as "Canon Canon EOS R6" if naively joined. */
function joinMakeModel(make, model) {
  const a = typeof make === 'string' ? make.trim() : '';
  const b = typeof model === 'string' ? model.trim() : '';
  if (!a) return b || null;
  if (!b) return a;
  return b.toLowerCase().startsWith(a.toLowerCase()) ? b : `${a} ${b}`;
}

function formatShutter(exposureTime) {
  if (typeof exposureTime !== 'number' || !(exposureTime > 0)) return null;
  if (exposureTime >= 1) return `${Number(exposureTime.toFixed(1))}s`;
  return `1/${Math.round(1 / exposureTime)}s`;
}

function formatAperture(fNumber) {
  if (typeof fNumber !== 'number' || !(fNumber > 0)) return null;
  return `f/${Number(fNumber.toFixed(1))}`;
}

function formatFocalLength(focalLength) {
  if (typeof focalLength !== 'number' || !(focalLength > 0)) return null;
  return `${Math.round(focalLength)}mm`;
}

/**
 * Read the allowlisted fields from an image buffer.
 *
 * Orientation is deliberately absent: derive.mjs reads it from sharp's own
 * metadata (which parses it even from formats exifr does not), and derivatives
 * are written already upright, so nothing downstream needs it from here.
 */
export async function readAllowedExif(buffer) {
  // reviveValues: false keeps dates as their raw strings so exifDateToIso can
  // apply a deterministic, machine-independent interpretation.
  const tags =
    (await exifr
      .parse(buffer, { pick: ALLOWED_TAGS, reviveValues: false })
      .catch(() => null)) ?? {};

  return {
    takenAt: exifDateToIso(tags.DateTimeOriginal) ?? exifDateToIso(tags.CreateDate),
    camera: joinMakeModel(tags.Make, tags.Model),
    lens: (typeof tags.LensModel === 'string' && tags.LensModel.trim()) || null,
    focalLength: formatFocalLength(tags.FocalLength),
    aperture: formatAperture(tags.FNumber),
    shutter: formatShutter(tags.ExposureTime),
    iso: Number.isFinite(tags.ISO) ? Math.round(tags.ISO) : null,
  };
}
