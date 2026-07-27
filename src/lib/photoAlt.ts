import type { CollectionEntry } from 'astro:content';

/**
 * Alt text for a gallery photograph.
 *
 * Shared by `Photo.astro` and `PhotoThumb.astro` deliberately. This logic
 * previously lived only in `Photo.astro`; `PhotoThumb` had its own copy that
 * fell through to `''`, so every tile on the gallery and the home page shipped
 * with an empty alt — 122 of the site's 133 images, all marked decorative.
 * One function, so the two cannot drift apart again.
 *
 * No titles or captions exist yet (they get backfilled — see MILESTONES M4), so
 * in practice this returns the date for every photo today. `alt=""` would be a
 * claim that the image carries no information, which is false: on this site the
 * photographs *are* the content.
 */
export function photoAlt(
  photo: CollectionEntry<'photos'>,
  override?: string | null,
): string {
  const text = override ?? photo.data.caption;
  if (photo.data.title) return photo.data.title;
  if (text) return text;

  const takenAt = photo.data.takenAt;
  if (!takenAt) return 'Photograph';

  return `Photograph taken ${takenAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })}`;
}
