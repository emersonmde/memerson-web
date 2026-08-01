/*
 * Specimen content, pinned on purpose. See docs/TESTING.md §3.1 rule 5.
 *
 * The suite deep-links to these, which makes their rendering deterministic:
 * the lightbox opened at `/photos#f-<PHOTO>` shows the same photograph every
 * run, so even the image itself can be asserted rather than masked. Adding
 * content never touches a specimen. Deleting one is a deliberate act — pick a
 * replacement and regenerate its baselines in the same commit.
 */

/** One photo slug: titled ("USAF Thunderbirds"), inside a named shoot.
 * Re-pinned 2026-07-31: the same photograph, re-imported from the higher
 * quality Lightroom re-export, which gave it a new content-hash slug. */
export const PHOTO = '2017-08-27-bc2eb60a';

/** The shoot that photo belongs to — also a run anchor id on /photos. */
export const SHOOT = '2017-08-27';

/*
 * The specimen's display strings, content-coupled by design (rule 5): the
 * suite types the shoot name into the filter and asserts the photo title in
 * the viewer, so renaming either in the data is the same deliberate act as
 * deleting the specimen — update these constants and any baselines in the
 * same commit. Named here so the coupling has exactly one home.
 */
export const SHOOT_NAME = 'Thunder Over Dover';
export const PHOTO_TITLE = 'USAF Thunderbirds';

/** One blog post id, used for the post-page checks. */
export const POST = '1-billion-row-challenge-part-1';
