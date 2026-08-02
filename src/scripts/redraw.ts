/*
 * The "Redraw" page transition. Mockup 6g: one scan line travels top to
 * bottom and the page draws in behind it. One light event, per the motion law
 * in docs/UI-DESIGN.md §4.
 *
 * Implemented entirely in the live document — the View Transitions overlay is
 * deliberately *skipped*, not driven. Three attempts to run the wipe on the
 * overlay's pseudo-elements all failed on real iPhones and only there: the
 * device compositor started overlay animations late (the incoming page held
 * composited at ~75% for up to a second — the "dim"), ran the erase and the
 * line on mutually inconsistent clocks (the line visibly clear of the seam, in
 * either direction), and mis-composited overlay opacity outright. None of it
 * reproduces in the iOS simulators, Chrome, WebKit trunk, or Firefox, and no
 * cascade or WAAPI channel could correct it from script. So the overlay is
 * torn down before it ever renders, and the same visual is built from what the
 * device demonstrably runs on time: CSS animations on live elements.
 *
 * The wipe: `.redraw` is an opaque, viewport-covering panel whose top edge
 * carries the neon line; `is-running` slides it from the nav's bottom edge
 * down past the bottom of the screen, revealing the already-swapped page
 * behind it. The seam and the line are the same element — the last two-surface
 * version (a `clip-path` reveal on `.page` plus a `transform` line) still
 * desynced on the device, because the two properties animate on different
 * threads there. One element, one `transform`; nothing left to lag.
 *
 * What is given up: the outgoing page vanishes at the swap instead of being
 * erased — below the line, the void panel shows instead of the old page. On
 * this design the two are nearly indistinguishable, and it is the trade that
 * makes the transition identical on every engine — including ones with no
 * View Transitions API at all. The nav, above `--redraw-top`, never wipes.
 *
 * This module also sets `data-swapped`, which is what switches every entry
 * animation off for the rest of the session — see `html[data-swapped]` in
 * global.css and the gallery's styles.
 */

const DURATION = 300;

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * The pending disarm timer. Module-scoped so a navigation can cancel the
 * previous page's timer: without this, navigating again inside the 350ms
 * window let page A's stale timer strip `is-running` from page B's wipe
 * mid-animation — the panel snapped to rest and the page popped in.
 */
let disarmTimer = 0;

document.addEventListener('astro:before-swap', (event) => {
  clearTimeout(disarmTimer);

  /*
   * Everything for the incoming page is written onto `newDocument`, not the
   * live root: the swap clears the live root's attributes and copies
   * `newDocument`'s over the top, so anything written to the live element is
   * discarded moments later.
   */
  const newDocument = (event as unknown as { newDocument: Document }).newDocument;
  newDocument.documentElement.dataset.swapped = '';

  /*
   * Tear the browser's transition down before it renders a frame. The swap
   * itself (Astro's DOM update) is unaffected — skipping only cancels the
   * overlay and its animations. `::view-transition { display: none }` in
   * global.css backstops the one capture frame some engines paint anyway.
   */
  (
    event as unknown as { viewTransition?: ViewTransition }
  ).viewTransition?.skipTransition();

  if (reduced.matches) return;

  /*
   * Where the wipe starts: the nav's live bottom edge. The bar is sticky and
   * always pinned, so its rect is its on-screen position at any scroll depth,
   * breakpoint, or safe-area inset — and `.page` begins exactly there at the
   * top of the incoming page, which is what keeps the reveal edge and the
   * line coincident.
   */
  const navBottom = document.querySelector('.nav')?.getBoundingClientRect().bottom ?? 0;
  newDocument.documentElement.style.setProperty(
    '--redraw-top',
    `${navBottom.toFixed(1)}px`,
  );

  // Arm the panel on the incoming document; its animation starts on the
  // incoming page's first rendered frame.
  newDocument.querySelector('.redraw')?.classList.add('is-running');
});

/*
 * Disarm after the run. The panel ends held off-screen by `fill: forwards`,
 * so the removal is invisible bookkeeping — it just returns the element to
 * its resting state for the next navigation. Fires on first load too, where
 * the class was never set and this is a no-op.
 */
document.addEventListener('astro:page-load', () => {
  clearTimeout(disarmTimer);
  disarmTimer = window.setTimeout(() => {
    document.querySelector('.redraw')?.classList.remove('is-running');
  }, DURATION + 50);
});

export {};
