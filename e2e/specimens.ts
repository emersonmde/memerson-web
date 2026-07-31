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

/** One blog post id, used for the post-page checks. */
export const POST = '1-billion-row-challenge-part-1';
