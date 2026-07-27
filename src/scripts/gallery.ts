/*
 * The contact sheet and its lightbox.
 *
 * Pagination is a build-time and crawler concern, not a reading experience.
 * `/photos/2`, `/photos/3` … are real pages — they exist without JS, they are
 * linked, and they keep the initial HTML small (docs/ARCHITECTURE.md §6). With
 * JS, they become invisible: the sheet grows as you scroll and the lightbox
 * runs straight through the whole library.
 *
 * The two are one module because the lightbox has to be able to *cause* a page
 * load — pressing Next on the last loaded photo should pull the next page in
 * rather than stop.
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

interface Slide {
  href: string;
  avif?: string;
  webp?: string;
  alt: string;
  label: string;
  meta: string;
  bloom?: string;
}

function slideOf(tile: HTMLAnchorElement): Slide {
  return {
    href: tile.href,
    avif: tile.dataset.avif,
    webp: tile.dataset.webp,
    alt: tile.dataset.alt || '',
    label: tile.dataset.label || '',
    meta: tile.dataset.meta || '',
    bloom: tile.dataset.bloom,
  };
}

function init() {
  const sheet = document.querySelector<HTMLElement>('[data-sheet]');
  if (!sheet) return;

  /*
   * Astro fires `astro:page-load` on the *first* load as well as on router
   * swaps, so this module would otherwise initialise twice on arrival: two
   * IntersectionObservers both pulling pages (206 tiles instead of 118) and two
   * lightbox roots stacked on top of each other (ten thumbnails instead of
   * five). A swap brings in a fresh sheet element without the flag, so
   * navigation still re-initialises correctly.
   */
  if (sheet.dataset.galleryReady) return;
  sheet.dataset.galleryReady = '1';

  const grid = sheet;

  /* ---------------------------------------------------------------- loading */

  let nextUrl = sheet.dataset.next || null;
  let loading = false;

  const total = Number(sheet.dataset.total || '0');
  const status = document.querySelector<HTMLElement>('[data-sheet-status]');
  const pager = document.querySelector<HTMLElement>('[data-pager]');

  // The paginated nav is the no-JS path. Once this module is running it would
  // only be a second, worse way to do what scrolling already does.
  pager?.setAttribute('hidden', '');

  const tiles = () =>
    Array.from(grid.querySelectorAll<HTMLAnchorElement>('a[data-tile]'));

  function report() {
    if (!status) return;
    const n = tiles().length;
    status.textContent = nextUrl ? `${n} OF ${total}` : `ALL ${total} FRAMES`;
  }

  async function loadNext(): Promise<boolean> {
    if (!nextUrl || loading) return false;
    loading = true;
    status?.setAttribute('data-loading', '');

    try {
      const res = await fetch(nextUrl);
      if (!res.ok) throw new Error(`${res.status}`);

      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const incoming = doc.querySelector('[data-sheet]');
      if (!incoming) throw new Error('no sheet in response');

      // Adopt rather than move: the parsed document is inert, and importNode
      // brings the nodes into this document with their scoped-style attributes
      // intact (same component, so the same hash).
      for (const tile of Array.from(incoming.querySelectorAll('a[data-tile]'))) {
        grid.appendChild(document.importNode(tile, true));
      }

      nextUrl = (incoming as HTMLElement).dataset.next || null;
      return true;
    } catch {
      // Leave the pager visible again so there is still a way forward.
      pager?.removeAttribute('hidden');
      nextUrl = null;
      return false;
    } finally {
      loading = false;
      status?.removeAttribute('data-loading');
      report();
    }
  }

  const sentinel = document.querySelector<HTMLElement>('[data-sentinel]');
  if (sentinel) {
    // rootMargin pulls the next page in before the sentinel is actually reached,
    // so the wall of images does not visibly stutter at a page boundary.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadNext();
      },
      { rootMargin: '1200px 0px' },
    );
    io.observe(sentinel);
  }

  report();

  /* --------------------------------------------------------------- lightbox */

  let index = 0;
  let lastFocused: HTMLElement | null = null;

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

  /** Five-wide window around the current photo; all 118 would be unreadable. */
  const THUMB_WINDOW = 5;

  function renderThumbs(all: Slide[]) {
    const half = Math.floor(THUMB_WINDOW / 2);
    const count = Math.min(THUMB_WINDOW, all.length);
    const start = Math.max(0, Math.min(index - half, all.length - count));

    els.thumbs.replaceChildren(
      ...Array.from({ length: count }, (_, k) => {
        const i = start + k;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'lb-thumb';
        button.setAttribute('aria-label', `Photo ${i + 1}`);
        if (i === index) button.setAttribute('aria-current', 'true');
        if (all[i].bloom) button.style.backgroundImage = `url("${all[i].bloom}")`;
        button.addEventListener('click', () => show(i));
        return button;
      }),
    );
  }

  function show(i: number) {
    // Re-read every time: tiles are appended as you scroll, so a snapshot taken
    // at open would silently stop at whatever had loaded then.
    const all = tiles().map(slideOf);
    if (all.length === 0) return;

    index = (i + all.length) % all.length;
    const slide = all[index];

    if (slide.avif) els.avif.srcset = slide.avif;
    else els.avif.removeAttribute('srcset');
    if (slide.webp) els.webp.srcset = slide.webp;
    else els.webp.removeAttribute('srcset');

    els.bloom.style.backgroundImage = slide.bloom ? `url("${slide.bloom}")` : '';
    els.img.src = slide.href;
    els.img.alt = slide.alt;
    els.counter.textContent = `${String(index + 1).padStart(3, '0')} / ${total || all.length}`;
    els.title.textContent = slide.label;
    els.meta.textContent = slide.meta;

    renderThumbs(all);
  }

  /**
   * Stepping forward off the end pulls the next page in rather than wrapping,
   * so the viewer never sees a boundary that the reader was not meant to know
   * about. Only wraps once everything really is loaded.
   */
  async function step(delta: number) {
    const before = tiles().length;

    if (delta > 0 && index + 1 >= before && nextUrl) {
      const grew = await loadNext();
      if (grew) {
        show(index + 1);
        return;
      }
    }

    show(index + delta);
  }

  function open(i: number) {
    lastFocused = document.activeElement as HTMLElement;
    show(i);
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    els.close.focus();
  }

  function close() {
    root.hidden = true;
    document.body.style.overflow = '';
    lastFocused?.focus();
  }

  // Delegated, so tiles appended later are covered without re-binding.
  grid.addEventListener('click', (event) => {
    const tile = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-tile]');
    if (!tile) return;
    const mouse = event as MouseEvent;
    if (mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey) return;
    event.preventDefault();
    open(tiles().indexOf(tile));
  });

  els.prev.addEventListener('click', () => void step(-1));
  els.next.addEventListener('click', () => void step(1));
  root
    .querySelectorAll('[data-close]')
    .forEach((el) => el.addEventListener('click', close));

  const onKey = (event: KeyboardEvent) => {
    if (root.hidden) return;
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowRight') void step(1);
    else if (event.key === 'ArrowLeft') void step(-1);
    else if (event.key === 'Tab') {
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
  };

  addEventListener('keydown', onKey);

  // The router replaces <body>, so this overlay and its key handler have to go
  // with the page that created them or they leak across navigations.
  document.addEventListener(
    'astro:before-swap',
    () => {
      removeEventListener('keydown', onKey);
      root.remove();
      document.body.style.overflow = '';
    },
    { once: true },
  );

  if (REDUCED.matches) root.style.animation = 'none';
}

init();

/*
 * A router swap does not re-execute a script the previous page already loaded,
 * so navigating from /photos to /photos/2 left the sheet inert — clicking a
 * tile just followed its href to the bare image. Re-initialise per page.
 */
document.addEventListener('astro:page-load', init);

export {};
