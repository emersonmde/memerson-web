/*
 * The "Redraw" page transition. Mockup 6g.
 *
 * One scan line travels top to bottom; the outgoing page is erased above it and
 * the incoming page is already sitting underneath. Nothing scales, nothing
 * flashes twice — one light event, per the motion law in docs/UI-DESIGN.md §4.
 *
 * The erase itself is a view transition (CSS, in global.css). This module only
 * drives the line, because the View Transitions API gives no way to inject an
 * element into the transition and the line is not a snapshot of either page —
 * it is the thing doing the cutting.
 *
 * It also sets the flag that makes "nothing flashes twice" true. The incoming
 * page's entry animations — the resolving headings, the gallery's tiles — are
 * first-load effects, and on a swap they were a second light event on top of
 * the wipe. Worse than untidy: `::view-transition-new(root)` is captured when
 * the swap callback returns, which is before any script on the new page has
 * run, so the frozen image the wipe reveals was the page in its *entry* state —
 * a blurred heading over a gallery of `opacity: 0` tiles — held for the full
 * 380ms and then brightening all at once when the real DOM took over. That is
 * the "whole page loads dimly then brightens". No script can beat that
 * snapshot, because on the first visit to a route the page's own module has not
 * executed yet; only CSS that is already in the document can, which is what
 * `html[data-swapped]` is.
 */

const DURATION = 380;

const line = document.querySelector<HTMLElement>('.redraw');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

document.addEventListener('astro:before-swap', (event) => {
  /*
   * Mark the incoming page as arriving by swap rather than by load, which is
   * what switches every entry animation off for the rest of the session. See
   * `html[data-swapped]` in global.css and in the gallery's styles.
   *
   * It has to be set here, on `newDocument`, and not on the live root: the swap
   * clears the root's attributes and copies `newDocument`'s over the top, so
   * anything written to the live element is discarded moments later. Doing it
   * before `event.swap()` also means the attribute is in place for the layout
   * the view transition snapshots — which is the entire point, and is why this
   * runs whether or not the wipe below does.
   */
  (
    event as unknown as { newDocument: Document }
  ).newDocument.documentElement.dataset.swapped = '';

  if (!line || reduced.matches) return;

  // Restart the animation even if a previous run has not been cleaned up:
  // removing the class and forcing a reflow resets the keyframe clock.
  line.classList.remove('is-running');
  void line.offsetWidth;
  line.classList.add('is-running');

  setTimeout(() => line.classList.remove('is-running'), DURATION);
});

export {};
