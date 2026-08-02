import { getCollection } from 'astro:content';

/**
 * The two collection queries every page spells the same way, in one place so
 * a future change (say, a scheduled-post filter) can't miss a call site —
 * drafts leaking into the RSS feed is exactly the drift this prevents.
 */

/** Published posts, newest first. */
export async function publishedPosts() {
  return (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );
}

/** The photo library, newest capture first; undated frames sink to the end. */
export async function photosNewestFirst() {
  return (await getCollection('photos')).sort(
    (a, b) => (b.data.takenAt?.valueOf() ?? 0) - (a.data.takenAt?.valueOf() ?? 0),
  );
}
