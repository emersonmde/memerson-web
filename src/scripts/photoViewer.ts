/*
 * The photo viewer (lightbox), extracted from the gallery script.
 *
 * Behaviorally this is the same closure it always was — the epoch token, the
 * replaceState-only hash discipline, the body reparenting and the bloom
 * cross-fade all survive intact — it just lives behind a narrow interface now
 * instead of inside a 1,300-line init(). `photos.ts` owns the tiles, the
 * filter and the layouts; this module owns everything that happens after a
 * tile is clicked. The markup it drives is `PhotoViewer.astro`.
 */

import { tileAlt, tileLqip, tileTitle } from './tileData';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');

const pad = (n: number) => String(n).padStart(3, '0');

/** What the viewer needs from the gallery script, and nothing more. */
export interface ViewerHost {
  /** Page-lifetime listener registration; everything drops on router swap. */
  on: (
    target: EventTarget,
    type: string,
    fn: (event: never) => void,
    opts?: AddEventListenerOptions,
  ) => void;
  /** The page's lifetime — read for `.signal.aborted` in deferred work. */
  life: AbortController;
  /** The tiles the active filter is showing, in time order. */
  visible: () => HTMLAnchorElement[];
  /** Sets the gallery filter (a tag click, the shoot chip). */
  setQuery: (value: string) => void;
  /** Scrolls the gallery back to the top after a filter lands. */
  toTop: () => void;
  /** The sampled shoot hue per run key (see `sampleAllAccents`). */
  accents: Map<string, string>;
  /** Which run a tile belongs to — survives the views' reparenting. */
  runOf: Map<HTMLAnchorElement, string>;
}

export interface Viewer {
  open(i: number, from: HTMLAnchorElement): void;
  isOpen(): boolean;
  /** Re-fit the frame after a viewport change; no-op while closed. */
  sizeFrame(): void;
  /**
   * The viewer's share of the page keydown handler. Returns true when the
   * viewer is open — every key is consumed then, handled or not, so the page
   * shortcuts behind the modal never fire.
   */
  handleKey(event: KeyboardEvent): boolean;
}

/**
 * Keep Tab inside an aria-modal container. Shared by the viewer and the
 * shoots sheet — the call sites keep their own open-state guards.
 */
export function trapTab(container: HTMLElement, event: KeyboardEvent) {
  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>('button:not([hidden]), a[href]'),
  ).filter((el) => el.offsetParent !== null);
  if (!focusable.length) return;
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

export function initViewer(host: ViewerHost): Viewer | null {
  const { on, life, visible, setQuery, toTop, accents, runOf } = host;

  /*
   * Re-bound after the guard because TypeScript will not carry a narrowing
   * into the hoisted function declarations below, all of which close over it.
   */
  const found = document.querySelector<HTMLElement>('[data-lb]');
  if (!found) return null;
  const lb: HTMLElement = found;
  const q = <T extends Element>(sel: string) => lb.querySelector<T>(sel);

  /*
   * The viewer is authored inside <main> so it exists without JavaScript, but
   * `.page` sets `z-index: 2`, which makes it a stacking context — and a
   * descendant cannot escape one however high its own z-index goes. Left where
   * it is, the nav (a sibling of `.page` at z-index 9) paints straight over
   * the close button and counter. Reparenting to <body> puts it in the same
   * context as the nav, where its z-index means what it says. (The shoots
   * sheet gets the same move in photos.ts.)
   */
  document.body.appendChild(lb);

  const lbImg = q<HTMLImageElement>('.lb-img');
  const lbExif = q<HTMLElement>('[data-lb-exif]');

  /**
   * What the frame can occupy, for the upgrade pass's source selection. A
   * deliberate over-estimate of `--lb-w-cap`: `sizes` may not name a custom
   * property, and asking for one derivative too large is a slower first paint of
   * a *sharp* frame, while asking for one too small is a soft one.
   */
  const VIEWER_SIZES = '(max-width: 720px) 96vw, (max-width: 2300px) 88vw, 2048px';

  let cursor = -1;
  let exifOpen = false;
  let lastFocused: HTMLElement | null = null;
  /* Bumped per show(), so a slow decode cannot reveal a frame you swiped past. */
  let epoch = 0;

  function sizeFrame() {
    if (!lbImg || lb.hidden) return;
    const tile = visible()[cursor];
    const ar = tile ? Number(tile.style.getPropertyValue('--ar')) || 1.5 : 1.5;
    /*
     * Wide screens budget the frame against both caps — the vertical one so the
     * metadata stack is never pushed off, the horizontal one so a panorama stops
     * short of the arrows; narrow screens hand sizing to the stage box, which
     * already reserves room for it.
     *
     * The aspect ratio is the only part the stylesheet cannot know, which is the
     * whole reason this runs in script: an <img> with `aspect-ratio` and no
     * intrinsic size yet lays out at zero, and the frame has to have its final
     * size before the LQIP paints or the viewer arrives in two jumps.
     *
     * The footer follows the same expression so the title, the tags and the
     * thumbnail strip line up with the photograph's edges rather than with a
     * width of their own — but only ever *outwards*, past a 900px floor. A
     * portrait frame is 609px wide on a 1720px window, and a footer that narrow
     * wraps eight tags onto four rows, which grows the stack up over the
     * photograph's bottom edge. So the metadata widens to meet a landscape frame
     * and holds its own width under a tall one.
     */
    /*
     * Portrait phones size the frame against the metadata stack as it actually
     * is, not as a constant guesses it. The stack's height moves with content —
     * a title wraps, tags appear, the swipe hint shows on touch — and a fixed
     * reserve was the bug: portrait frames ran under the footer and the title,
     * tags and thumbnails printed on top of the photograph. So the stack is
     * measured, the stage's bottom inset follows it (`--lb-foot-h`), and the
     * frame gets the room that is honestly left. The swipe hint hangs *above*
     * the footer box (see `.lb-swipe`), so it is added on top of the measure.
     */
    const portraitPhone = innerWidth <= 720 && innerHeight > innerWidth;
    const stage = q<HTMLElement>('.lb-stage');
    const footBox = q<HTMLElement>('.lb-foot');

    if (portraitPhone && stage && footBox) {
      const swipe = q<HTMLElement>('.lb-swipe');
      const hint =
        swipe && getComputedStyle(swipe).display !== 'none' ? swipe.offsetHeight + 14 : 0;
      lb.style.setProperty('--lb-foot-h', `${footBox.offsetHeight + hint}px`);

      /* Reading the stage after setting the property forces the reflow on
         purpose: the inset must move before the free room is measured. */
      const cs = getComputedStyle(stage);
      const availW =
        stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const availH =
        stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      lbImg.style.width = `${Math.min(availW, availH * ar)}px`;
    } else {
      lb.style.removeProperty('--lb-foot-h');
      const frameWidth = `min(var(--lb-w-cap), calc(var(--lb-h-cap) * ${ar}))`;
      lbImg.style.width = innerWidth <= 720 ? '' : frameWidth;
    }

    /* Below 900 the metadata stack is vertical and owns the full width; matching
       it to the frame there would only crowd the tags and the thumbnails. */
    const foot = q<HTMLElement>('.lb-foot-inner');
    if (foot)
      foot.style.width =
        innerWidth > 900
          ? `max(900px, min(var(--lb-w-cap), calc(var(--lb-h-cap) * ${ar})))`
          : '';
  }

  /*
   * The open viewer is a URL — by replacement only, never by pushing.
   *
   * `/photos#f-<slug>` already *opened* the viewer, but nothing ever wrote it,
   * so the one frame worth linking to — the one filling the screen — was the
   * one thing the address bar did not name.
   *
   * The obvious version of this pushes an entry, so that the back gesture
   * closes the viewer. That version is wrong, and the reason is worth keeping.
   * `ClientRouter` compares pathname and search to decide whether a popstate is
   * an intra-page move (`samePage()` in astro/dist/transitions/router.js) and
   * takes its `from` from an `originalLocation` that only its own navigations
   * update. Pushing a fragment behind its back therefore produces a pop it
   * reads as `/photos` → `/photos`, same page, neither side carrying a hash it
   * knows about — which falls past the intra-page early-return into a full
   * fetch and swap of the page you are already on. Visibly: the redraw wipe,
   * and every entry animation on the page running a second time.
   *
   * So there is no `pushState` and no `history.back()` anywhere in here. The
   * viewer owns the fragment on the current entry and nothing else, which
   * costs the back-to-close gesture — back leaves `/photos`, as it did before
   * any of this — and buys a viewer that cannot desynchronise the router.
   *
   * `history.state` is passed through rather than replaced. It carries the
   * router's own `{ index, scrollX, scrollY }`, and an entry whose state is
   * null is one `onPopState` returns early on: overwrite it and a later Back
   * into this page changes the URL without ever swapping the document in.
   */
  const replaceUrl = (url: string) => {
    try {
      history.replaceState(history.state, '', url);
    } catch {
      /*
       * Safari rate-limits history writes (SecurityError past ~100 calls per
       * 30s). A dropped write costs a stale fragment in the address bar and
       * nothing else — it must never take the cursor/counter update with it.
       */
    }
  };

  /*
   * Debounced to the settled frame. Holding ArrowRight steps ~30 frames a
   * second, and only the frame you *stop* on is worth a URL — writing every
   * intermediate one is what tripped Safari's rate limit in the first place.
   */
  let hashTimer: ReturnType<typeof setTimeout> | undefined;

  function syncHash(tile: HTMLAnchorElement) {
    if (!tile.id) return;
    const id = tile.id;
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      hashTimer = undefined;
      if (life.signal.aborted || location.hash === `#${id}`) return;
      replaceUrl(`${location.pathname}${location.search}#${id}`);
    }, 180);
  }

  /*
   * The bloom sources the LQIP, not a derivative. Under blur(70px) the two are
   * indistinguishable — the same argument that once picked the smallest rung
   * over the 2560 — but the LQIP is a data URI already in the DOM, so the
   * room's light can never arrive after the photograph. Sourcing a URL was
   * what left the previous photograph's glow hanging between opens.
   *
   * Two layers alternate: the incoming one gets the image and fades in while
   * the outgoing fades out — correct light from the first frame, the same
   * 450ms softness the old background-image transition only delivered in
   * Blink/WebKit. A fresh open skips the fade entirely: there is nothing on
   * screen worth fading *from*, and the wipe-in already covers the entrance.
   */
  let bloomFlip = false;
  let freshOpen = false;

  function setBloom(image: string, instant: boolean) {
    const layers = lb.querySelectorAll<HTMLElement>('[data-bloom-layer]');
    if (layers.length < 2) return;
    const incoming = layers[bloomFlip ? 1 : 0];
    const outgoing = layers[bloomFlip ? 0 : 1];
    bloomFlip = !bloomFlip;

    if (instant) {
      incoming.style.transition = 'none';
      outgoing.style.transition = 'none';
      /*
       * Commit the no-transition state before the opacity flip below. This
       * used to work only because an unrelated `.lb-close.focus()` later in
       * the open path forced a layout; the read makes the reflow explicit so
       * the instant path cannot regress when the caller changes.
       */
      void incoming.offsetWidth;
      requestAnimationFrame(() => {
        incoming.style.transition = '';
        outgoing.style.transition = '';
      });
    }

    incoming.style.backgroundImage = `url("${image}")`;
    incoming.style.opacity = '1';
    outgoing.style.opacity = '0';
  }

  function show(i: number, from?: HTMLAnchorElement) {
    const list = visible();
    if (!list.length || !lbImg) return;

    cursor = (i + list.length) % list.length;
    const tile = list[cursor];
    const token = ++epoch;

    if (!lb.hidden) syncHash(tile);

    /*
     * The whole viewer paints in the frame the tile was tapped in.
     *
     * The trick is that there is already a decoded copy of this photograph on
     * screen — the tile itself. `currentSrc` is the exact URL the browser chose
     * for it, so it is in cache and needs no decode; assigning it is the one
     * thing that is genuinely instant *and* sharp. Two earlier attempts were
     * worse: the raw 2560 derivative meant a visible wait, and the LQIP meant a
     * blur-to-sharp reveal, which turned a loading artefact into a slower
     * loading artefact.
     *
     * The bloom takes the same URL rather than a second file, so the background
     * can never arrive after the photograph.
     *
     * The frame's size comes from the manifest aspect ratio, set before any of
     * this, so nothing moves once it is on screen.
     */
    const tileImg = tile.querySelector('img');
    const cached = tileImg?.currentSrc || tileImg?.src || tile.href;
    const frame = q<HTMLElement>('.lb-frame');
    const lqip = tileLqip(tile);
    const title = tileTitle(tile);

    lbImg.alt = tileAlt(tile);
    lbImg.style.aspectRatio = tile.style.getPropertyValue('--ar');
    lbImg.removeAttribute('srcset');
    lbImg.src = cached;
    sizeFrame();

    if (frame) {
      // A floor under the image for the one case the cache cannot cover: a tile
      // whose own image has not loaded yet.
      frame.style.backgroundImage = lqip ? `url("${lqip}")` : '';
    }

    /*
     * The frame's hue, on the viewer root so the footer inherits it: `--run`
     * lights the tube beside the shoot name — that shoot's own light, the same
     * one its header wears on the page. A stray frame has none, and nothing is
     * drawn on the photograph itself (see the crop-marks note in the styles).
     */
    const runKey = runOf.get(tile);
    lb.style.setProperty(
      '--run',
      (runKey && accents.get(runKey)) || tile.dataset.accent || 'var(--cyan)',
    );

    setBloom(lqip || cached, freshOpen);
    freshOpen = false;

    /*
     * Only then, and only if the frame can show more than the tile did, ask for
     * a larger derivative. Handing `srcset` to an <img> that is already
     * displaying something swaps it silently when the new one is ready — there
     * is no blank frame and nothing moves, because the aspect ratio is fixed.
     */
    const chosen = cached.endsWith('.avif') ? 'image/avif' : 'image/webp';
    const set = Array.from(tile.querySelectorAll<HTMLSourceElement>('source')).find(
      (el) => el.type === chosen,
    )?.srcset;

    if (set) {
      /*
       * Decode the big derivative *before* the visible <img> ever sees it.
       * Handing srcset straight to the on-screen image made the swap frame
       * decode 2560px of AVIF on the paint path — 20–45ms per lightbox step in
       * the profile, three to five dropped frames each at 120Hz. A detached
       * image decodes off-thread; by the time srcset lands on the real one the
       * bytes are already pixels. decode() can reject (a GC'd image, a codec
       * hiccup) and the swap must still happen — the old behaviour, sync
       * decode and all, is the fallback rather than a lost upgrade.
       */
      const pre = new Image();
      pre.sizes = VIEWER_SIZES;
      pre.srcset = set;
      const swap = () => {
        if (token !== epoch) return;
        lbImg.sizes = VIEWER_SIZES;
        lbImg.srcset = set;
      };
      pre.decode().then(swap, swap);
    }

    setText('.lb-counter', `${pad(cursor + 1)} / ${list.length}`);
    setText('.lb-title', title);

    /* The tile's href is already the widest derivative (the no-JS path). */
    const fullLink = q<HTMLAnchorElement>('.lb-full');
    if (fullLink) fullLink.href = tile.href;

    /*
     * Most frames have no authored title, so the tile falls back to the shoot
     * name. Printing the chip under it as well would stutter — hide it exactly
     * when it would repeat the line above, the same rule the tile caption uses.
     */
    const shoot = tile.dataset.shootName;
    const shootButton = q<HTMLButtonElement>('.lb-shoot');
    if (shootButton) {
      shootButton.textContent = shoot ? shoot.toUpperCase() : 'STRAY FRAME';
      shootButton.hidden = !shoot || shoot === title;
    }
    setText('.lb-meta-text', tile.dataset.date || '');

    const tagWrap = q<HTMLElement>('.lb-tags');
    if (tagWrap) {
      tagWrap.replaceChildren(
        ...(tile.dataset.tags || '')
          .split('|')
          .filter(Boolean)
          .map((tag) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'lb-tag';
            button.textContent = tag;
            // Deliberately not on(): these buttons die with the next frame's
            // replaceChildren, and the page-lifetime signal would retain them.
            button.addEventListener('click', () => {
              close();
              setQuery(tag);
              toTop();
            });
            return button;
          }),
      );
    }

    drawCapture(tile);
    drawThumbs(list);
    /* Again, now that the title, tags and thumbs are real: on portrait phones
       the frame is sized against the metadata stack's measured height, and the
       first call ran before this frame's stack existed. Same synchronous frame,
       so nothing visibly moves. */
    sizeFrame();
    if (from) flip(from);
  }

  const setText = (sel: string, value: string) => {
    const el = q<HTMLElement>(sel);
    if (el) el.textContent = value;
  };

  function drawCapture(tile: HTMLAnchorElement) {
    const dl = lbExif?.querySelector('dl');
    if (!dl) return;

    let rows: [string, string][] = [];
    try {
      rows = JSON.parse(tile.dataset.capture || '[]');
    } catch {
      rows = [];
    }

    dl.replaceChildren(
      ...rows.flatMap(([key, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = key;
        const dd = document.createElement('dd');
        dd.textContent = value;
        return [dt, dd];
      }),
    );

    /*
     * There is no prose under the table. It used to carry a line about whether
     * the exposure was chosen or metered, which nobody opening a panel labelled
     * CAPTURE DATA asked for: the body, the lens and the six numbers are the
     * answer, and a caveat about the phone's autoexposure only argued with them.
     */
  }

  /** Five-wide window around the current frame; all 118 would be unreadable. */
  const THUMB_WINDOW = 5;

  function drawThumbs(list: HTMLAnchorElement[]) {
    const wrap = q<HTMLElement>('.lb-thumbs');
    if (!wrap) return;
    const count = Math.min(THUMB_WINDOW, list.length);
    const start = Math.max(
      0,
      Math.min(cursor - Math.floor(count / 2), list.length - count),
    );

    wrap.replaceChildren(
      ...Array.from({ length: count }, (_, k) => {
        const i = start + k;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'lb-thumb';
        button.setAttribute('aria-label', tileTitle(list[i]) || `Photo ${i + 1}`);
        if (i === cursor) button.setAttribute('aria-current', 'true');
        if (list[i].dataset.bloom) {
          button.style.backgroundImage = `url("${list[i].dataset.bloom}")`;
        }
        // Deliberately not on(): replaced wholesale every frame step, and the
        // page-lifetime signal would retain each dead batch until navigation.
        button.addEventListener('click', () => show(i));
        return button;
      }),
    );
  }

  /*
   * The viewer grows out of the tile you clicked instead of cross-fading over
   * it. It is the one flashy moment on the page and the one that carries
   * meaning: it tells you where to look when you close it again.
   */
  function flip(from: HTMLAnchorElement) {
    if (REDUCED.matches) return;
    /*
     * Desktop only. On a phone the tile you tapped can be anywhere on a
     * single-column scroll, so the frame flies in from the bottom of the screen
     * and reads as the layout settling late rather than as a connection between
     * the two — which is exactly the "it loads at the bottom then shifts up"
     * this was mistaken for. The pointer case keeps it: there the tile is small,
     * near the cursor, and the move says where to look when you close again.
     */
    if (matchMedia('(hover: none), (max-width: 720px)').matches) return;
    const frame = q<HTMLElement>('.lb-frame');
    if (!frame?.animate) return;
    requestAnimationFrame(() => {
      const a = from.getBoundingClientRect();
      const b = frame.getBoundingClientRect();
      if (!b.width || !b.height) return;
      frame.animate(
        [
          {
            transform: `translate(${a.left - b.left}px,${a.top - b.top}px) scale(${a.width / b.width},${a.height / b.height})`,
            opacity: 0.55,
          },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 420, easing: 'cubic-bezier(.2,.85,.2,1)' },
      );
    });
  }

  function toggleExif(force?: boolean) {
    exifOpen = force ?? !exifOpen;
    lbExif?.classList.toggle('is-open', exifOpen);
    lb.classList.toggle('exif-open', exifOpen);
    q<HTMLElement>('.lb-info')?.setAttribute('aria-pressed', String(exifOpen));
  }

  function open(i: number, from: HTMLAnchorElement) {
    lastFocused = document.activeElement as HTMLElement;
    // A reopened viewer must not fade from the previous visit's bloom.
    freshOpen = true;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    show(i, from);
    q<HTMLButtonElement>('.lb-close')?.focus({ preventScroll: true });
  }

  function close() {
    lb.hidden = true;
    toggleExif(false);
    document.body.style.overflow = '';
    // A settled-frame hash write may still be pending; it must not land after
    // the viewer is gone and resurrect the fragment the next line strips.
    clearTimeout(hashTimer);
    hashTimer = undefined;
    // Drop the fragment, or Back into this page reopens the viewer. Same
    // replacement, same reasons, as `syncHash` — including the state.
    if (location.hash.startsWith('#f-')) {
      replaceUrl(location.pathname + location.search);
    }
    if (lastFocused?.isConnected) lastFocused.focus({ preventScroll: true });
  }

  for (const el of lb.querySelectorAll('[data-lb-close]')) on(el, 'click', close);

  /*
   * Two sets of step controls — the arrows flanking the frame on a pointer
   * device, and a pair in the footer cluster on touch, where arrows over the
   * photograph would be in the way. Only one set is ever visible, and binding
   * on the attribute means neither needs to know the other exists.
   */
  for (const el of lb.querySelectorAll<HTMLElement>('[data-lb-step]')) {
    on(el, 'click', () => show(cursor + Number(el.dataset.lbStep)));
  }

  const info = q<HTMLElement>('.lb-info');
  if (info) on(info, 'click', () => toggleExif());
  const exifClose = q<HTMLElement>('[data-lb-exif-close]');
  if (exifClose) on(exifClose, 'click', () => toggleExif(false));

  const shootButton = q<HTMLButtonElement>('.lb-shoot');
  if (shootButton) {
    on(shootButton, 'click', () => {
      const name = visible()[cursor]?.dataset.shootName;
      close();
      if (name) {
        setQuery(name);
        toTop();
      }
    });
  }

  /* Swipe replaces the arrows and the thumbnail strip on touch. */
  let sx = 0;
  let sy = 0;
  let st = 0;
  on(
    lb,
    'touchstart',
    (event: TouchEvent) => {
      sx = event.touches[0].clientX;
      sy = event.touches[0].clientY;
      st = performance.now();
    },
    { passive: true },
  );
  on(
    lb,
    'touchend',
    (event: TouchEvent) => {
      if (performance.now() - st > 700) return;
      const dx = event.changedTouches[0].clientX - sx;
      const dy = event.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        show(cursor + (dx < 0 ? 1 : -1));
      } else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.4) {
        close();
      }
    },
    { passive: true },
  );

  function handleKey(event: KeyboardEvent): boolean {
    if (lb.hidden) return false;
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowLeft') show(cursor - 1);
    else if (event.key === 'ArrowRight') show(cursor + 1);
    else if (event.key === 'i' || event.key === 'I') toggleExif();
    else if (event.key === 'Tab') {
      // The viewer is aria-modal, so Tab must not walk out into the page
      // behind it. Arrows hidden on touch drop out of the cycle on their own.
      trapTab(lb, event);
    }
    return true;
  }

  return {
    open,
    isOpen: () => !lb.hidden,
    sizeFrame,
    handleKey,
  };
}
