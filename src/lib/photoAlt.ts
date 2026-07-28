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
 * `alt=""` would be a claim that the image carries no information, which is
 * false: on this site the photographs *are* the content.
 *
 * **Caption beats title**, which is the opposite of what reads naturally and is
 * the whole reason the order is spelled out here. Alt text has to describe the
 * picture, not name it: "A bronze statue of three soldiers stands among autumn
 * foliage" tells a screen-reader user what is there, while "The Three Soldiers"
 * assumes they already know. The title is still a better fallback than a bare
 * date, so it sits between the two.
 *
 * Captions were backfilled for the whole library in M4 (`photos:describe`),
 * which is what moved this from theory to something that actually fires.
 */
export function photoAlt(
  photo: CollectionEntry<'photos'>,
  override?: string | null,
): string {
  const text = override ?? photo.data.caption;
  if (text) return text;
  if (photo.data.title) return photo.data.title;

  const takenAt = photo.data.takenAt;
  if (!takenAt) return 'Photograph';

  return `Photograph taken ${takenAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })}`;
}
