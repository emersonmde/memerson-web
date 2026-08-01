/*
 * Retire LQIP placeholders once the photograph above them has loaded.
 *
 * Every photo <img> carries its LQIP as an inline background-image data URI, so
 * something honest paints before the real file arrives (and with no JS at all).
 * But a background is not a poster frame: left in place it stays in the display
 * list forever, and the gallery paid for every tile twice on every paint — of
 * the 84,501 image display-items in the profiled session, ~39k were placeholders
 * sitting invisibly under already-loaded photographs (docs/PERFORMANCE.md §4.2).
 *
 * `load` never fires for a broken image, so a failed photo keeps its
 * placeholder — which is exactly the right fallback.
 */

function retire(img: HTMLImageElement) {
  if (img.complete && img.naturalWidth > 0) {
    img.style.backgroundImage = 'none';
  } else {
    img.addEventListener(
      'load',
      () => {
        img.style.backgroundImage = 'none';
      },
      { once: true },
    );
  }
}

function sweep() {
  // Matches only inline styles, which is the only place the LQIP ever lives.
  document
    .querySelectorAll<HTMLImageElement>('img[style*="background-image"]')
    .forEach(retire);
}

sweep();

/*
 * Astro fires `astro:page-load` on the first load too, so the immediate call
 * above plus this listener means a double sweep on arrival — harmless, because
 * a retired image just gets its `background-image: none` rewritten. What the
 * listener is really for is router swaps, which bring a new document without
 * re-executing this module.
 */
document.addEventListener('astro:page-load', sweep);

export {};
