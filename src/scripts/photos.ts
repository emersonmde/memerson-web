/*
 * The gallery: three views, a filter, the shoot rail, and the viewer.
 *
 * The page ships every frame already rendered, in RUNS order, as real markup.
 * Nothing here fetches, and nothing here builds a tile — switching views
 * *moves* the existing elements, which is why changing view never re-downloads
 * an image and why the page needs no second copy of the manifest.
 *
 * Everything in this file is enhancement. With the script absent the gallery is
 * still complete and readable: RUNS is the served layout, every tile is a link
 * to its photograph, and the rail and the shoots sheet are plain fragment
 * anchors.
 */

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');

type Layout = 'sheet' | 'runs' | 'editorial';

interface RunView {
  el: HTMLElement;
  key: string;
  stray: boolean;
  grid: HTMLElement;
  leadMeta: HTMLElement | null;
  tiles: HTMLAnchorElement[];
  lead: HTMLElement | null;
}

const pad = (n: number) => String(n).padStart(3, '0');

function init() {
  /*
   * The `!` is not a claim that the element exists — the very next line handles
   * its absence. It is there because TypeScript will not carry a narrowing into
   * a hoisted function declaration, and every layout function below closes over
   * this.
   */
  const sheet = document.querySelector<HTMLElement>('[data-sheet]')!;
  if (!sheet) return;

  /*
   * Astro fires `astro:page-load` on the first load as well as on router
   * swaps, so without this the page would initialise twice — two scroll
   * observers and two sets of click handlers. A swap brings in a fresh sheet
   * without the flag, so navigation still re-initialises correctly.
   */
  if (sheet.dataset.ready) return;
  sheet.dataset.ready = '1';

  /* All listeners hang off this so a router swap can drop them in one call. */
  const life = new AbortController();
  const on = <K extends keyof WindowEventMap>(
    target: EventTarget,
    type: K | string,
    fn: (event: never) => void,
    opts: AddEventListenerOptions = {},
  ) =>
    target.addEventListener(type, fn as EventListener, {
      ...opts,
      signal: life.signal,
    });

  const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel);

  const runs: RunView[] = Array.from(
    sheet.querySelectorAll<HTMLElement>('[data-run]'),
  ).map((el) => ({
    el,
    key: el.dataset.shoot || '',
    stray: el.querySelector('.px-run-head')?.classList.contains('is-stray') ?? false,
    grid: el.querySelector<HTMLElement>('[data-grid]')!,
    leadMeta: el.querySelector<HTMLElement>('[data-lead-meta]'),
    tiles: Array.from(el.querySelectorAll<HTMLAnchorElement>('[data-tile]')),
    lead: null,
  }));

  const tiles = runs.flatMap((r) => r.tiles);
  if (!tiles.length) return;

  /* The flat contact sheet. One element, reused; SHEET borrows the tiles. */
  const flat = document.createElement('div');
  flat.className = 'px-sheet';
  flat.hidden = true;
  sheet.appendChild(flat);

  const countEl = $<HTMLElement>('[data-count]');
  const qbar = $<HTMLElement>('[data-qbar]');
  const emptyEl = $<HTMLElement>('[data-empty]');
  const find = $<HTMLInputElement>('[data-find]');
  const rail = $<HTMLElement>('[data-rail]');
  const railItems = rail
    ? Array.from(rail.querySelectorAll<HTMLElement>('[data-rail-item]'))
    : [];

  let layout: Layout = 'runs';
  let query = '';

  /* --------------------------------------------------------------- filter */

  /*
   * Built once per tile and cached on the element. A tag click sets the input,
   * so this is the same code path whether the query came from the keyboard or
   * from the viewer.
   */
  const haystack = (tile: HTMLAnchorElement) => {
    if (!tile.dataset.q) {
      tile.dataset.q = [
        tile.dataset.title,
        tile.dataset.shootName,
        tile.dataset.series,
        tile.dataset.camera,
        tile.dataset.date,
        (tile.dataset.tags || '').replace(/\|/g, ' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    }
    return tile.dataset.q;
  };

  function applyFilter() {
    const needle = query.trim().toLowerCase();
    let shown = 0;

    for (const tile of tiles) {
      const match = !needle || haystack(tile)!.includes(needle);
      tile.hidden = !match;
      if (match) {
        const idx = tile.querySelector('.px-idx');
        if (idx) idx.textContent = pad(++shown);
      }
    }

    if (countEl) {
      countEl.innerHTML = `<b>${shown}</b> ${shown === 1 ? 'FRAME' : 'FRAMES'}`;
    }

    if (qbar) {
      const text = qbar.querySelector('.px-q-text');
      if (needle) {
        qbar.hidden = false;
        if (text) {
          text.innerHTML = `FILTER &nbsp;<b>${escapeHtml(query.toUpperCase())}</b>&nbsp; — ${shown} of ${tiles.length} frames`;
        }
      } else {
        qbar.hidden = true;
      }
    }

    if (emptyEl) {
      emptyEl.hidden = shown > 0;
      if (!shown) {
        emptyEl.innerHTML = `No frames match <b>${escapeHtml(query)}</b>. Try a tag, a camera, a year, or a shoot name.`;
      }
    }
  }

  const escapeHtml = (s: string) =>
    s.replace(
      /[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
    );

  /* --------------------------------------------------------------- layout */

  /** Put every element back where the server rendered it. */
  function restore() {
    for (const run of runs) {
      if (run.leadMeta && run.leadMeta.nextElementSibling !== run.grid) {
        run.el.insertBefore(run.leadMeta, run.grid);
      }
      for (const tile of run.tiles) {
        // Undo the editorial lead's crop widening, if this tile carried it.
        if (tile.dataset.ar0) {
          tile.style.setProperty('--ar', tile.dataset.ar0);
          delete tile.dataset.ar0;
        }
        run.grid.appendChild(tile);
      }
      run.lead?.remove();
      run.lead = null;
    }
    flat.hidden = true;
  }

  function applyLayout() {
    restore();
    sheet.dataset.layout = layout;

    if (layout === 'sheet') {
      for (const tile of tiles) flat.appendChild(tile);
      flat.hidden = false;
      for (const run of runs) run.el.hidden = true;
    } else {
      for (const run of runs) run.el.hidden = run.tiles.every((t) => t.hidden);
    }

    if (layout === 'editorial') {
      for (const run of runs) {
        // A headline over one photograph from a random Tuesday is a lie about
        // its importance, so a stray stretch never gets a lead frame.
        if (run.stray || !run.leadMeta || run.el.hidden) continue;
        const first = run.tiles.find((t) => !t.hidden);
        if (!first) continue;

        const lead = document.createElement('div');
        lead.className = 'px-lead';
        lead.append(first, run.leadMeta);
        run.el.insertBefore(lead, run.grid);
        run.lead = lead;

        // The lead frame is a headline; a tall portrait crop reads as an error.
        const ar = Number(first.style.getPropertyValue('--ar')) || 1.5;
        if (ar < 1.2) {
          first.dataset.ar0 = String(ar);
          first.style.setProperty('--ar', '1.2');
        }
      }
    }

    // Keyed off the frames, not off the run element: SHEET hides every run
    // wrapper, and the rail still has to work there. The count is the *matching*
    // count, not the run's total — a rail that says 32 next to six visible
    // frames is the same lie about coverage the whole design exists to avoid.
    for (const item of railItems) {
      const run = runs.find((r) => r.key === item.dataset.shoot);
      const shown = run ? run.tiles.filter((t) => !t.hidden).length : 0;
      item.hidden = shown === 0;
      const n = item.querySelector('.px-rail-n');
      if (n) n.textContent = String(shown);
    }

    resetReveal();
    trackRail();
  }

  function setLayout(next: Layout) {
    layout = next;
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      '[data-seg] button',
    )) {
      button.setAttribute('aria-pressed', String(button.dataset.layout === next));
    }
    applyLayout();
    scrollTo({ top: 0 });
  }

  function setQuery(value: string) {
    query = value;
    if (find) find.value = value;
    applyFilter();
    applyLayout();
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '[data-seg] button',
  )) {
    on(button, 'click', () => setLayout(button.dataset.layout as Layout));
  }

  if (find) {
    on(find, 'input', () => {
      query = find.value;
      applyFilter();
      applyLayout();
    });
  }

  /*
   * The series marker filters to the series. It is the only way two Air Show
   * shoots three years apart become reachable from each other — which is the
   * entire reason `series` exists in shoots.json rather than a second page.
   */
  for (const marker of document.querySelectorAll<HTMLElement>('[data-series]')) {
    if (!marker.dataset.series) continue;
    on(marker, 'click', () => {
      setQuery(marker.dataset.series!);
      scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  const qclear = $<HTMLElement>('[data-qclear]');
  if (qclear) {
    on(qclear, 'click', () => {
      setQuery('');
      scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ------------------------------------------------- entry resolve + rail */

  /*
   * Tiles resolve on entry with the same blur-to-sharp the page titles use,
   * staggered across the row so a long scroll feels developed rather than
   * dumped. The stagger is by column, not by index, or the last tile of a run
   * would wait on the first.
   */
  let pending: HTMLAnchorElement[] = [];

  function resetReveal() {
    if (REDUCED.matches) {
      for (const tile of tiles) tile.classList.add('is-in');
      pending = [];
      return;
    }
    pending = tiles.filter((t) => !t.classList.contains('is-in'));
    reveal();
  }

  function reveal() {
    if (!pending.length) return;
    const limit = innerHeight * 0.94;
    const still: HTMLAnchorElement[] = [];
    pending.forEach((tile, i) => {
      if (tile.hidden) {
        still.push(tile);
      } else if (tile.getBoundingClientRect().top < limit) {
        setTimeout(() => tile.classList.add('is-in'), (i % 4) * 55);
      } else {
        still.push(tile);
      }
    });
    pending = still;
  }

  /** The indicator tracks the scroll: whichever run owns the middle of the screen. */
  function trackRail() {
    if (!railItems.length) return;
    const mid = innerHeight * 0.42;
    let best = '';
    let bestDistance = Infinity;

    for (const run of runs) {
      if (run.el.hidden && layout !== 'sheet') continue;
      const target = layout === 'sheet' ? run.tiles.find((t) => !t.hidden) : run.el;
      if (!target) continue;
      const box = target.getBoundingClientRect();
      const distance = Math.abs(box.top + Math.min(box.height, innerHeight) / 2 - mid);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = run.key;
      }
    }

    for (const item of railItems) {
      item.setAttribute('aria-current', String(item.dataset.shoot === best));
    }
  }

  let ticking = false;
  on(
    window,
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        reveal();
        trackRail();
        ticking = false;
      });
    },
    { passive: true },
  );

  /* ------------------------------------------------------------ the shoots sheet */

  const jump = $<HTMLElement>('[data-jump]');

  function closeJump() {
    jump?.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  if (jump) {
    const opener = $<HTMLElement>('[data-jump-open]');
    if (opener) {
      on(opener, 'click', () => {
        jump.classList.add('is-open');
        document.body.style.overflow = 'hidden';
      });
    }
    const closer = $<HTMLElement>('[data-jump-close]');
    if (closer) on(closer, 'click', closeJump);
    for (const row of jump.querySelectorAll<HTMLElement>('[data-jump-row]')) {
      // The row is a real anchor, so closing is all this has to do.
      on(row, 'click', closeJump);
    }
  }

  /* ----------------------------------------------------------------- bar */

  const bar = $<HTMLElement>('[data-bar]');

  /*
   * The control bar wraps to two rows on narrow screens and stops being sticky
   * below 560px. The sticky run headers sit directly under it, so they have to
   * follow both — hence a measured custom property rather than a constant.
   */
  function syncBar() {
    if (!bar) return;
    const stuck = getComputedStyle(bar).position === 'sticky';
    document.documentElement.style.setProperty(
      '--bar-h',
      `${stuck ? bar.offsetHeight : 0}px`,
    );
  }

  on(window, 'resize', () => {
    syncBar();
    reveal();
    trackRail();
    sizeFrame();
  });

  /* ------------------------------------------------------------- lightbox */

  const lb = $<HTMLElement>('[data-lb]');
  const q = <T extends Element>(sel: string) => lb?.querySelector<T>(sel) ?? null;

  /*
   * Both overlays are authored inside <main> so they exist without JavaScript,
   * but `.page` sets `z-index: 2`, which makes it a stacking context — and a
   * descendant cannot escape one however high its own z-index goes. Left where
   * they are, the nav (a sibling of `.page` at z-index 9) paints straight over
   * the viewer's close button and counter. Reparenting to <body> puts them in
   * the same context as the nav, where their z-index means what it says.
   */
  for (const overlay of [lb, jump]) {
    if (overlay) document.body.appendChild(overlay);
  }

  const lbImg = q<HTMLImageElement>('.lb-img');
  const lbExif = q<HTMLElement>('[data-lb-exif]');

  /** What the frame can occupy, for the upgrade pass's source selection. */
  const VIEWER_SIZES = '(max-width: 720px) 96vw, 900px';

  let cursor = -1;
  let exifOpen = false;
  let lastFocused: HTMLElement | null = null;
  /* Bumped per show(), so a slow decode cannot reveal a frame you swiped past. */
  let epoch = 0;

  const visible = () => tiles.filter((t) => !t.hidden);

  function sizeFrame() {
    if (!lbImg || !lb || lb.hidden) return;
    const tile = visible()[cursor];
    const ar = tile ? Number(tile.style.getPropertyValue('--ar')) || 1.5 : 1.5;
    /*
     * Wide screens budget the frame against the vertical chrome so the metadata
     * stack is never pushed off; narrow screens hand sizing to the stage box,
     * which already reserves room for it.
     */
    lbImg.style.width =
      innerWidth <= 720 ? '' : `min(900px, calc((100vh - 250px) * ${ar}))`;
  }

  /*
   * The open viewer is a URL.
   *
   * `/photos#f-<slug>` already *opened* the viewer, but nothing ever wrote it,
   * so the one frame worth linking to — the one filling the screen — was the
   * one thing the address bar did not name. Opening pushes an entry, so the
   * back gesture closes the viewer rather than leaving the page; stepping
   * between frames replaces it, because 118 frames of history is not a trail
   * anybody wants to walk back out of.
   */
  let pushedHash = false;
  let opening = false;

  function syncHash(tile: HTMLAnchorElement) {
    if (!tile.id || location.hash === `#${tile.id}`) return;
    const url = `${location.pathname}${location.search}#${tile.id}`;
    if (opening) {
      history.pushState({ lb: tile.id }, '', url);
      pushedHash = true;
    } else {
      history.replaceState({ lb: tile.id }, '', url);
    }
  }

  function show(i: number, from?: HTMLAnchorElement) {
    const list = visible();
    if (!list.length || !lb || !lbImg) return;

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

    lbImg.alt = tile.dataset.alt || '';
    lbImg.style.aspectRatio = tile.style.getPropertyValue('--ar');
    lbImg.removeAttribute('srcset');
    lbImg.src = cached;
    sizeFrame();

    if (frame) {
      // A floor under the image for the one case the cache cannot cover: a tile
      // whose own image has not loaded yet.
      frame.style.backgroundImage = tile.dataset.lqip
        ? `url("${tile.dataset.lqip}")`
        : '';
      frame.style.setProperty('--bk', tile.dataset.accent || 'var(--cyan)');
    }

    const bloom = q<HTMLElement>('.lb-bloom');
    if (bloom) bloom.style.backgroundImage = `url("${cached}")`;

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
      requestAnimationFrame(() => {
        if (token !== epoch) return;
        lbImg.sizes = VIEWER_SIZES;
        lbImg.srcset = set;
      });
    }

    setText('.lb-counter', `${pad(cursor + 1)} / ${list.length}`);
    setText('.lb-title', tile.dataset.title || '');

    /*
     * Most frames have no authored title, so the tile falls back to the shoot
     * name. Printing the chip under it as well would stutter — hide it exactly
     * when it would repeat the line above, the same rule the tile caption uses.
     */
    const shoot = tile.dataset.shootName;
    const shootButton = q<HTMLButtonElement>('.lb-shoot');
    if (shootButton) {
      shootButton.textContent = shoot ? shoot.toUpperCase() : 'STRAY FRAME';
      shootButton.hidden = !shoot || shoot === tile.dataset.title;
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
            button.addEventListener('click', () => {
              close();
              setQuery(tag);
              scrollTo({ top: 0, behavior: 'smooth' });
            });
            return button;
          }),
      );
    }

    drawCapture(tile);
    drawThumbs(list);
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
     * Half the library is a phone, where the exposure was not an authored
     * decision. Saying so is more honest than presenting an auto-exposure as
     * craft — which is also why this panel is never open by default.
     */
    const note = lbExif?.querySelector<HTMLElement>('.lb-exif-note');
    const camera = tile.dataset.camera || '';
    if (note) {
      note.textContent = !camera
        ? ''
        : /apple|iphone|pixel|samsung/i.test(camera)
          ? 'Phone capture — the settings were chosen by the phone, not by me.'
          : `Shot on the ${camera}. Settings chosen at the frame.`;
    }
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
        button.setAttribute('aria-label', list[i].dataset.title || `Photo ${i + 1}`);
        if (i === cursor) button.setAttribute('aria-current', 'true');
        if (list[i].dataset.bloom) {
          button.style.backgroundImage = `url("${list[i].dataset.bloom}")`;
        }
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
    lb?.classList.toggle('exif-open', exifOpen);
    q<HTMLElement>('.lb-info')?.setAttribute('aria-pressed', String(exifOpen));
  }

  function open(i: number, from: HTMLAnchorElement) {
    if (!lb) return;
    lastFocused = document.activeElement as HTMLElement;
    pushedHash = false;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    opening = true;
    show(i, from);
    opening = false;
    q<HTMLButtonElement>('.lb-close')?.focus({ preventScroll: true });
  }

  function close() {
    if (!lb) return;
    lb.hidden = true;
    toggleExif(false);
    document.body.style.overflow = '';
    /*
     * Unwind the address bar. If opening the viewer pushed an entry, Back is
     * what removes it — which also means the two ways out of the viewer, the
     * close button and the system back gesture, land on the same history state
     * instead of one of them leaving a dead entry behind. Arriving *on* a
     * deep link pushes nothing, so there the fragment is simply dropped: it
     * has to go, or Back into this page reopens the viewer.
     */
    if (pushedHash) {
      pushedHash = false;
      history.back();
    } else if (location.hash.startsWith('#f-')) {
      history.replaceState(null, '', location.pathname + location.search);
    }
    if (lastFocused?.isConnected) lastFocused.focus({ preventScroll: true });
  }

  // Delegated on the page, so a tile is still wired after it has been moved
  // into the flat sheet or into an editorial lead.
  on(document, 'click', (event: MouseEvent) => {
    const tile = (event.target as HTMLElement).closest<HTMLAnchorElement>('[data-tile]');
    if (!tile || !lb) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    open(visible().indexOf(tile), tile);
  });

  if (lb) {
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

    on(q<HTMLElement>('.lb-info')!, 'click', () => toggleExif());
    const exifClose = q<HTMLElement>('[data-lb-exif-close]');
    if (exifClose) on(exifClose, 'click', () => toggleExif(false));

    const shootButton = q<HTMLButtonElement>('.lb-shoot');
    if (shootButton) {
      on(shootButton, 'click', () => {
        const name = visible()[cursor]?.dataset.shootName;
        close();
        if (name) {
          setQuery(name);
          scrollTo({ top: 0, behavior: 'smooth' });
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
  }

  /* ------------------------------------------------------------ keyboard */

  on(window, 'keydown', (event: KeyboardEvent) => {
    if (jump?.classList.contains('is-open')) {
      if (event.key === 'Escape') closeJump();
      return;
    }

    if (lb && !lb.hidden) {
      if (event.key === 'Escape') close();
      else if (event.key === 'ArrowLeft') show(cursor - 1);
      else if (event.key === 'ArrowRight') show(cursor + 1);
      else if (event.key === 'i' || event.key === 'I') toggleExif();
      else if (event.key === 'Tab') {
        // The viewer is aria-modal, so Tab must not walk out into the page
        // behind it. Arrows hidden on touch drop out of the cycle on their own.
        const focusable = Array.from(
          lb.querySelectorAll<HTMLElement>('button:not([hidden]), a[href]'),
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
      return;
    }

    if (event.key === '/' && document.activeElement !== find) {
      event.preventDefault();
      find?.focus();
    } else if (event.key === 'Escape' && document.activeElement === find) {
      setQuery('');
    }
  });

  /* --------------------------------------------------------------- start */

  syncBar();
  applyFilter();
  applyLayout();

  /*
   * `/photos#f-<slug>` opens the viewer on that frame. This is what the home
   * page's preview strip links to: tapping a photograph there should land you
   * on that photograph, not on the top of a 118-frame page with no idea which
   * one you asked for. The fragment is a real element id, so with no script the
   * browser still scrolls to it.
   */
  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id.startsWith('f-')) return;
    if (lb && !lb.hidden) return;
    const target = tiles.find((t) => t.id === id);
    if (!target || target.hidden) return;
    // After the browser's own scroll-to-fragment, so the close animation and
    // the restored focus both land on a tile that is actually in view.
    requestAnimationFrame(() => open(visible().indexOf(target), target));
  }

  openFromHash();
  on(window, 'hashchange', openFromHash);

  /*
   * `pushState` fires no `hashchange`, so the back gesture out of the viewer
   * arrives here instead. The entry being popped is the one `open` pushed, so
   * it is already gone — `close` must not try to pop it a second time.
   */
  on(window, 'popstate', () => {
    if (!lb) return;
    if (!lb.hidden && !location.hash.startsWith('#f-')) {
      pushedHash = false;
      close();
    } else if (lb.hidden) {
      openFromHash();
    }
  });

  document.addEventListener(
    'astro:before-swap',
    () => {
      life.abort();
      document.body.style.overflow = '';
      document.documentElement.style.removeProperty('--bar-h');
    },
    { once: true },
  );
}

init();

/*
 * A router swap does not re-execute a script the previous page already loaded,
 * so arriving at /photos from anywhere else would otherwise leave it inert.
 */
document.addEventListener('astro:page-load', init);

export {};
