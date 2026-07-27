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
 */

const DURATION = 380;

const line = document.querySelector<HTMLElement>('.redraw');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

if (line) {
  document.addEventListener('astro:before-swap', () => {
    if (reduced.matches) return;

    // Restart the animation even if a previous run has not been cleaned up:
    // removing the class and forcing a reflow resets the keyframe clock.
    line.classList.remove('is-running');
    void line.offsetWidth;
    line.classList.add('is-running');

    setTimeout(() => line.classList.remove('is-running'), DURATION);
  });
}

export {};
