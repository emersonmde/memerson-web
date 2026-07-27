/*
 * Contact-sheet lightbox. Mockup 6b.
 *
 * Progressive by construction: every tile is already an <a> pointing at the
 * full-size derivative, so with no JS a click just opens the image. This only
 * intercepts that click.
 *
 * All state comes from the tiles themselves — the manifest is not serialised a
 * second time into the page.
 */

interface Slide {
  href: string;
  avif?: string;
  webp?: string;
  alt: string;
  label: string;
  meta: string;
  bloom?: string;
}

const tiles = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[data-tile]'));
if (tiles.length > 0) initLightbox(tiles);

function initLightbox(tiles: HTMLAnchorElement[]) {
  const slides: Slide[] = tiles.map((tile) => ({
    href: tile.href,
    avif: tile.dataset.avif,
    webp: tile.dataset.webp,
    alt: tile.dataset.alt || '',
    label: tile.dataset.label || '',
    meta: tile.dataset.meta || '',
    bloom: tile.dataset.bloom,
  }));

  let index = 0;
  let lastFocused: HTMLElement | null = null;

  // Built once, reused. Kept out of the document until first open.
  const root = document.createElement('div');
  root.className = 'lb';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Photo viewer');

  root.innerHTML = `
    <div class="lb-wash" data-close></div>
    <div class="lb-bloom"></div>
    <div class="lb-vignette"></div>
    <div class="lb-bar">
      <span class="lb-counter"></span>
      <button type="button" class="lb-close" data-close>CLOSE ESC ×</button>
    </div>
    <div class="lb-stage">
      <button type="button" class="lb-nav lb-prev" aria-label="Previous photo">←</button>
      <figure class="lb-frame">
        <picture>
          <source class="lb-avif" type="image/avif" sizes="(max-width: 1100px) 92vw, 820px">
          <source class="lb-webp" type="image/webp" sizes="(max-width: 1100px) 92vw, 820px">
          <img class="lb-img" alt="">
        </picture>
        <span class="lb-bracket lb-tl"></span>
        <span class="lb-bracket lb-tr"></span>
        <span class="lb-bracket lb-bl"></span>
        <span class="lb-bracket lb-br"></span>
      </figure>
      <button type="button" class="lb-nav lb-next" aria-label="Next photo">→</button>
    </div>
    <div class="lb-foot">
      <div class="lb-foot-inner">
        <div>
          <div class="lb-title"></div>
          <div class="lb-meta"><span class="lb-dash"></span><span class="lb-meta-text"></span></div>
        </div>
        <div class="lb-thumbs"></div>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  const q = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;

  const els = {
    bloom: q<HTMLElement>('.lb-bloom'),
    counter: q<HTMLElement>('.lb-counter'),
    avif: q<HTMLSourceElement>('.lb-avif'),
    webp: q<HTMLSourceElement>('.lb-webp'),
    img: q<HTMLImageElement>('.lb-img'),
    title: q<HTMLElement>('.lb-title'),
    meta: q<HTMLElement>('.lb-meta-text'),
    thumbs: q<HTMLElement>('.lb-thumbs'),
    close: q<HTMLButtonElement>('.lb-close'),
    prev: q<HTMLButtonElement>('.lb-prev'),
    next: q<HTMLButtonElement>('.lb-next'),
  };

  /*
   * A window of neighbours around the current photo, not the whole page. With
   * 30 tiles per page a full strip would be unreadable at 64px each; the mockup
   * shows five. Clamped at both ends so the strip stays a constant width rather
   * than shrinking near the start or finish of the set.
   */
  const THUMB_WINDOW = 5;

  function thumbWindow(centre: number): number[] {
    const half = Math.floor(THUMB_WINDOW / 2);
    const total = Math.min(THUMB_WINDOW, slides.length);
    let start = centre - half;
    start = Math.max(0, Math.min(start, slides.length - total));
    return Array.from({ length: total }, (_, k) => start + k);
  }

  function renderThumbs() {
    els.thumbs.replaceChildren(
      ...thumbWindow(index).map((i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'lb-thumb';
        button.setAttribute('aria-label', `Photo ${i + 1}`);
        if (i === index) button.setAttribute('aria-current', 'true');
        if (slides[i].bloom) button.style.backgroundImage = `url("${slides[i].bloom}")`;
        button.addEventListener('click', () => show(i));
        return button;
      }),
    );
  }

  function show(i: number) {
    index = (i + slides.length) % slides.length;
    const slide = slides[index];

    if (slide.avif) els.avif.srcset = slide.avif;
    else els.avif.removeAttribute('srcset');
    if (slide.webp) els.webp.srcset = slide.webp;
    else els.webp.removeAttribute('srcset');

    // Ambient bloom: the photograph itself, blurred. Nothing samples a palette,
    // so it works on any image without extracting or storing a single colour.
    els.bloom.style.backgroundImage = slide.bloom ? `url("${slide.bloom}")` : '';

    els.img.src = slide.href;
    els.img.alt = slide.alt;
    els.counter.textContent = `${String(index + 1).padStart(3, '0')} / ${slides.length}`;
    els.title.textContent = slide.label;
    els.meta.textContent = slide.meta;
    renderThumbs();
  }

  function open(i: number) {
    lastFocused = document.activeElement as HTMLElement;
    show(i);
    root.hidden = false;
    // Scroll is locked while the overlay is up; the sheet behind must not move.
    document.body.style.overflow = 'hidden';
    els.close.focus();
  }

  function close() {
    root.hidden = true;
    document.body.style.overflow = '';
    lastFocused?.focus();
  }

  tiles.forEach((tile, i) => {
    tile.addEventListener('click', (event) => {
      // Leave modified clicks alone so "open in new tab" still works.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      open(i);
    });
  });

  els.prev.addEventListener('click', () => show(index - 1));
  els.next.addEventListener('click', () => show(index + 1));

  root
    .querySelectorAll('[data-close]')
    .forEach((el) => el.addEventListener('click', close));

  addEventListener('keydown', (event) => {
    if (root.hidden) return;
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowRight') show(index + 1);
    else if (event.key === 'ArrowLeft') show(index - 1);
    else if (event.key === 'Tab') {
      // Minimal focus containment — there are only three focusable controls.
      const focusable = [els.close, els.prev, els.next];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
}
