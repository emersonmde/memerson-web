/**
 * Describing one photograph — shared by `photos:describe` and by the metadata
 * pass at the end of `photos:import`, so there is exactly one prompt and one
 * set of rules about what may be written.
 *
 * **Only authored fields.** `title`, `caption` and `tags` are the three the
 * schema marks as hand-authored; nothing derived is ever touched here.
 */
import { askAboutImages, derivativeUrl } from './claude.mjs';

/**
 * Capture settings are free context and measurably steer the answer — 600mm at
 * 1/2000s is a different kind of photograph from 24mm at f/11, and a high ISO
 * after dark is worth knowing.
 *
 * The date is given as a **year only**. The exact day invites the model to
 * guess an occasion it cannot actually see, and a confident wrong occasion is
 * the failure mode this whole pipeline is trying to avoid.
 */
export function exifContext(entry) {
  const parts = [
    entry.camera,
    entry.lens,
    entry.focalLength,
    entry.aperture,
    entry.shutter,
    entry.iso ? `ISO ${entry.iso}` : null,
    entry.takenAt ? `taken ${entry.takenAt.slice(0, 4)}` : null,
  ].filter(Boolean);
  return parts.length ? `Capture settings: ${parts.join(', ')}.` : '';
}

export const buildDescribePrompt = (entry) => (names) =>
  `Read the image at ./${names[0]} and describe it for a personal photography gallery.
${exifContext(entry)}

Reply with ONLY a JSON object. No markdown fence, no prose:
{"tags": string[], "caption": string, "title": string|null}

tags — 3 to 8 short lowercase terms naming what is actually visible: subjects,
objects, setting. These carry search, so prefer the words someone would type.
No adjectives about mood, quality or composition.

caption — ONE factual sentence describing what is in the frame. It is also used
as the image's alt text, so describe the picture rather than commenting on it.
Never guess where it was taken, who anyone is, or why.

title — a short title ONLY when the subject is a specific, nameable thing you
can identify with confidence (a named monument, a recognisable landmark, an
identifiable species or aircraft). Otherwise null. A confidently wrong title is
worse than none, so prefer null.`;

/** Coerce whatever came back into the shapes the schema will accept. */
export function normaliseDescription(result) {
  const text = (value) =>
    typeof value === 'string' && value.trim() ? value.trim() : null;

  return {
    tags: Array.isArray(result.tags)
      ? result.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean)
      : [],
    caption: text(result.caption),
    title: text(result.title),
  };
}

export async function describeEntry(entry) {
  const result = await askAboutImages(
    [derivativeUrl(entry.id)],
    buildDescribePrompt(entry),
  );
  return normaliseDescription(result);
}

/**
 * A photo counts as described once it has a caption or any tags. That is what
 * makes every one of these commands idempotent — and it is why re-running never
 * re-reads the whole library, only whatever is genuinely missing.
 */
export function needsDescription(entry) {
  return !entry.caption && (entry.tags ?? []).length === 0;
}
