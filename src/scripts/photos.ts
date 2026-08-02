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

import { packColumns } from '../lib/sheet';
import { initViewer, trapTab } from './photoViewer';
import { tileLqip, tileTitle } from './tileData';

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

  /*
   * The flat contact sheet. One element, reused; SHEET borrows the tiles.
   *
   * Not multicol. `column-count` fills column-by-column, which put the first
   * third of the library down column one — scroll position stopped meaning
   * anything about time, and "jump to a shoot" had nowhere to land. The script
   * packs tiles row-major into real column wrappers instead (see
   * `src/lib/sheet.ts`), so the sheet reads in the same time order as the
   * other views and a shoot's first frame is where the shoot starts.
   */
  const flat = document.createElement('div');
  flat.className = 'px-sheet px-flat';
  flat.hidden = true;
  sheet.appendChild(flat);
  let flatCols: HTMLElement[] = [];

  function packFlat() {
    const cols = Number(getComputedStyle(flat).getPropertyValue('--sheet-cols')) || 2;
    if (flatCols.length !== cols) {
      flat.replaceChildren();
      flatCols = Array.from({ length: cols }, () => {
        const col = document.createElement('div');
        col.className = 'px-flat-col';
        flat.appendChild(col);
        return col;
      });
    }
    /*
     * Heights estimated from the aspect ratio each tile already carries as
     * `--ar` — no layout read per tile. The +12 is the tile's margin; captions
     * below 900px add a little real height the estimate ignores, which only
     * costs a slightly ragged bottom edge, never a wrong order.
     */
    const shown = tiles.filter((t) => !t.hidden);
    const width = Math.max(1, (flat.clientWidth - (cols - 1) * 12) / cols);
    const heights = shown.map(
      (t) => width / (Number(t.style.getPropertyValue('--ar')) || 1.5) + 12,
    );
    const assign = packColumns(heights, cols);
    shown.forEach((tile, i) => flatCols[assign[i]].appendChild(tile));
    // Hidden tiles are parked in the first column so they keep a parent inside
    // the sheet. They only ever come back through applyLayout → packFlat —
    // every filter change repacks, which is what keeps the time order honest.
    for (const tile of tiles) if (tile.hidden) flatCols[0].appendChild(tile);
  }

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
        tileTitle(tile),
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
          text.innerHTML = `FILTER &nbsp;<b>${escapeHtml(query.toUpperCase())}</b>&nbsp; · ${shown} of ${tiles.length} frames`;
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
      for (const run of runs) run.el.hidden = true;
      flat.hidden = false; // before packing — a hidden sheet has no width
      packFlat();
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
    // Clicking the already-active view button must not re-run the reparent
    // pass — applyLayout moves every tile, and the scroll position with it.
    if (next === layout) return;
    layout = next;
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      '[data-seg] button',
    )) {
      button.setAttribute('aria-pressed', String(button.dataset.layout === next));
    }
    applyLayout();
    scrollTo({ top: 0 });
  }

  /*
   * Smoothness is for hops, not journeys. A smooth scroll spanning many
   * viewports reads as a blur while force-decoding every tile it crosses —
   * which on iOS was enough to get the page killed. Under four viewports the
   * animation still communicates "you moved"; past that, jump.
   */
  const toTop = () =>
    scrollTo({
      top: 0,
      behavior: scrollY < innerHeight * 4 ? 'smooth' : 'auto',
    });

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
    /*
     * Debounced: applyLayout() reparents every tile (and in SHEET repacks the
     * columns), so running it per keystroke is a full pass over the library per
     * character. 100ms is under the gap between keystrokes of even fast typing,
     * so a paused user still sees the filter land instantly.
     */
    let debounce: ReturnType<typeof setTimeout> | undefined;
    on(find, 'input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (life.signal.aborted) return;
        setQuery(find.value);
      }, 100);
    });
  }

  /*
   * The series marker filters to the series. It is the only way two Thunder Over
   * Dover shoots five years apart become reachable from each other — which is the
   * entire reason `series` exists in shoots.json rather than a second page.
   *
   * `button` matters: tiles also carry `data-series` (it feeds the filter
   * haystack), and a bare attribute selector bound this handler to every tile
   * in a series — so clicking one opened the viewer *and* silently rewrote the
   * filter to the series. Invisible while name-match and series membership
   * were the same set; the 2024 Air Show joining `air-shows` under a
   * different shoot name is what surfaced it.
   */
  for (const marker of document.querySelectorAll<HTMLElement>('button[data-series]')) {
    if (!marker.dataset.series) continue;
    on(marker, 'click', () => {
      setQuery(marker.dataset.series!);
      toTop();
    });
  }

  const qclear = $<HTMLElement>('[data-qclear]');
  if (qclear) {
    on(qclear, 'click', () => {
      setQuery('');
      toTop();
    });
  }

  /* ------------------------------------------------- entry resolve + rail */

  /*
   * Tiles resolve on entry with the same blur-to-sharp the page titles use,
   * staggered in small groups (index mod 4, 55ms apart) so a row arrives as a
   * ripple rather than a block — and so the last tile of a long run never waits
   * on the first.
   *
   * An IntersectionObserver rather than a per-scroll-frame sweep: the old
   * reveal() called getBoundingClientRect on every still-unrevealed tile per
   * scroll frame, a forced-layout read that grew with the library. The
   * rootMargin reproduces the old band — reveal when the tile's top crosses
   * 94% of the viewport (6% trimmed off the bottom). A hidden tile has no box,
   * so it never intersects; it simply stays observed until the filter releases
   * it. Observation tracks the element, not its parent, so it survives the
   * view switches' reparenting — tiles already revealed stay revealed and are
   * never re-registered.
   */
  const io = new IntersectionObserver(
    (entries) => {
      let i = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const tile = entry.target as HTMLAnchorElement;
        io.unobserve(tile);
        if (REDUCED.matches) tile.classList.add('is-in');
        else setTimeout(() => tile.classList.add('is-in'), (i++ % 4) * 55);
      }
    },
    { rootMargin: '0% 0% -6% 0%' },
  );

  function resetReveal() {
    if (REDUCED.matches) {
      for (const tile of tiles) tile.classList.add('is-in');
      io.disconnect();
      return;
    }
    // observe() on an already-observed target is a no-op, so re-running this
    // after every layout change costs nothing.
    for (const tile of tiles) {
      if (!tile.classList.contains('is-in')) io.observe(tile);
    }
  }

  /* A mid-session flip to reduced motion must resolve everything still pending. */
  on(REDUCED, 'change', resetReveal);

  /* ------------------------------------------------------- ambient light */

  /*
   * The page is lit by the shoot on screen. When the tracked run changes, the
   * incoming shoot's LQIP is painted onto the hidden ambient layer and the two
   * layers cross-fade — the same move the viewer makes with its bloom, scaled
   * to the room.
   *
   * The accent follows, and it is a *property of the shoot*, not of the scroll
   * position: every run's LQIP is averaged once at init and re-emitted as that
   * run's `--run` at the ramp's locked lightness and chroma. Everything that
   * names the shoot then agrees — its date, the tube beside it, the editorial
   * rule, its rail entry, its row in the shoots sheet, the viewer's tube — and
   * a row in the sheet cannot show one colour while the header shows another.
   * Which was the bug: the accent used to live on <html> as `--live`, so only
   * the run on screen had a hue and everything else fell back to cyan.
   *
   * The markup already ships each run's point on the accent ramp as `--run`
   * (see `runHue` in the page), so this only ever *replaces* an in-palette hue
   * with the photographs' own, and a rejected sample simply leaves the ramp's.
   */
  const ambLayers = Array.from(document.querySelectorAll<HTMLElement>('[data-amb]'));
  let ambFront = 0;
  let ambKey = '';

  const railFor = new Map(railItems.map((el) => [el.dataset.shoot ?? '', el]));
  const jumpFor = new Map(
    Array.from(document.querySelectorAll<HTMLElement>('[data-jump-row]')).map((el) => [
      el.dataset.shoot ?? '',
      el,
    ]),
  );
  /** The shoot hue per run key, once sampled. Read by the viewer. */
  const accents = new Map<string, string>();

  /*
   * Which run a tile belongs to. A Map rather than `tile.closest('[data-run]')`
   * because SHEET reparents every tile out of its run and into the flat sheet.
   */
  const runOf = new Map<HTMLAnchorElement, string>(
    runs.flatMap((run) => run.tiles.map((tile) => [tile, run.key] as const)),
  );

  function paintAccent(key: string, accent: string) {
    accents.set(key, accent);
    for (const el of [
      runs.find((r) => r.key === key)?.el,
      railFor.get(key),
      jumpFor.get(key),
    ]) {
      el?.style.setProperty('--run', accent);
    }
  }

  /* One 4×4 canvas for every sample — each drawImage fully repaints it. */
  let sampleCtx: CanvasRenderingContext2D | null = null;

  async function sampleAccent(lqip: string): Promise<string | null> {
    const { liveAccent } = await import('../lib/ambient');
    const img = new Image();
    img.src = lqip;
    try {
      await img.decode();
    } catch {
      return null;
    }
    if (!sampleCtx) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 4;
      sampleCtx = canvas.getContext('2d', { willReadFrequently: true });
    }
    const ctx = sampleCtx;
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 4, 4);
    const d = ctx.getImageData(0, 0, 4, 4).data;
    let r = 0;
    let g = 0;
    let b = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
    }
    return liveAccent(r / n / 255, g / n / 255, b / n / 255);
  }

  function setAmbient(key: string) {
    if (key === ambKey || ambLayers.length < 2) return;
    ambKey = key;
    const run = runs.find((r) => r.key === key);
    const tile = run?.tiles.find((t) => !t.hidden) ?? run?.tiles[0];
    const lqip = tile ? tileLqip(tile) : '';
    if (!lqip) {
      for (const layer of ambLayers) layer.classList.remove('is-on');
      return;
    }
    const back = ambLayers[1 - ambFront];
    back.style.backgroundImage = `url(${lqip})`;
    back.classList.add('is-on');
    ambLayers[ambFront].classList.remove('is-on');
    ambFront = 1 - ambFront;
  }

  /*
   * Every shoot's hue, sampled once. Serial rather than parallel: the whole set
   * is eleven 4×4 reads of an LQIP that is already inlined in the document, so
   * there is nothing to gain from flooding the decoder, and a stray run has no
   * outing to be the colour of. Deferred past first paint — the ramp hue in the
   * markup is already correct, this only improves it.
   */
  async function sampleAllAccents() {
    for (const run of runs) {
      // A quick navigation away aborts init; don't keep decoding LQIPs for a
      // page that is no longer on screen.
      if (life.signal.aborted) return;
      if (run.stray) continue;
      const lqip = run.tiles[0] ? tileLqip(run.tiles[0]) : '';
      if (!lqip) continue;
      const accent = await sampleAccent(lqip);
      if (accent) paintAccent(run.key, accent);
    }
  }

  if ('requestIdleCallback' in window) requestIdleCallback(() => void sampleAllAccents());
  else setTimeout(() => void sampleAllAccents(), 200);

  /** The indicator tracks the scroll: whichever run owns the middle of the screen. */
  function trackRail() {
    if (!railItems.length) return;
    const mid = innerHeight * 0.42;
    let best = '';
    let bestDistance = Infinity;

    for (const run of runs) {
      if (run.el.hidden && layout !== 'sheet') continue;
      /*
       * In SHEET the run wrapper is hidden, so the run's extent is measured
       * from its first to its last visible tile — first alone made "whichever
       * run owns the middle of the screen" mean "whose first frame is nearest",
       * which advanced the indicator a shoot early inside long runs.
       */
      let top: number;
      let height: number;
      if (layout === 'sheet') {
        const shown = run.tiles.filter((t) => !t.hidden);
        if (!shown.length) continue;
        const first = shown[0].getBoundingClientRect();
        const last = shown[shown.length - 1].getBoundingClientRect();
        top = first.top;
        height = Math.max(first.bottom, last.bottom) - top;
      } else {
        const box = run.el.getBoundingClientRect();
        top = box.top;
        height = box.height;
      }
      const distance = Math.abs(top + Math.min(height, innerHeight) / 2 - mid);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = run.key;
      }
    }

    for (const item of railItems) {
      item.setAttribute('aria-current', String(item.dataset.shoot === best));
    }
    for (const run of runs) {
      run.el.classList.toggle('is-live', run.key === best);
    }
    if (best) setAmbient(best);
  }

  let ticking = false;
  on(
    window,
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        trackRail();
        ticking = false;
      });
    },
    { passive: true },
  );

  /* ------------------------------------------------------------ the shoots sheet */

  const jump = $<HTMLElement>('[data-jump]');

  /*
   * The sheet is aria-modal, so it owes the keyboard the same three moves the
   * viewer makes: focus moves in on open, Tab cycles inside, and closing hands
   * focus back to the opener.
   */
  let jumpReturnFocus: HTMLElement | null = null;

  function openJump() {
    if (!jump) return;
    jumpReturnFocus = document.activeElement as HTMLElement;
    jump.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    jump.querySelector<HTMLElement>('[data-jump-close]')?.focus({ preventScroll: true });
  }

  function closeJump() {
    jump?.classList.remove('is-open');
    document.body.style.overflow = '';
    if (jumpReturnFocus?.isConnected) jumpReturnFocus.focus({ preventScroll: true });
    jumpReturnFocus = null;
  }

  /*
   * The rows and the rail are real anchors to `#<run.key>`, which is correct in
   * RUNS and EDITORIAL. In SHEET every run section is hidden, so the anchor has
   * no box and the browser scrolls nowhere — the jump lands on the shoot's
   * first visible tile instead, which row-major packing put exactly where the
   * shoot begins.
   */
  function jumpToShoot(event: Event, key: string | undefined) {
    if (layout !== 'sheet' || !key) return; // the anchor itself works
    const tile = runs.find((r) => r.key === key)?.tiles.find((t) => !t.hidden);
    if (!tile) return;
    event.preventDefault();
    tile.scrollIntoView({ block: 'start' });
  }

  for (const item of railItems) {
    on(item, 'click', (event: Event) => jumpToShoot(event, item.dataset.shoot));
  }

  if (jump) {
    const opener = $<HTMLElement>('[data-jump-open]');
    if (opener) on(opener, 'click', openJump);
    const closer = $<HTMLElement>('[data-jump-close]');
    if (closer) on(closer, 'click', closeJump);
    for (const row of jump.querySelectorAll<HTMLElement>('[data-jump-row]')) {
      on(row, 'click', (event: Event) => {
        // Unlock the body first — a window with `overflow: hidden` cannot
        // scroll, and both the anchor default and the sheet jump need it to.
        closeJump();
        jumpToShoot(event, row.dataset.shoot);
      });
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

  // rAF-coalesced like the scroll handler: iOS fires a stream of resize events
  // through toolbar collapse and rotation, and everything below reads layout.
  let resizing = false;
  on(window, 'resize', () => {
    if (resizing) return;
    resizing = true;
    requestAnimationFrame(() => {
      resizing = false;
      syncBar();
      // Repack only when the breakpoint actually changed the column count —
      // reparenting 1300 tiles on every resize frame would thrash layout.
      if (
        layout === 'sheet' &&
        flatCols.length !==
          (Number(getComputedStyle(flat).getPropertyValue('--sheet-cols')) || 2)
      ) {
        packFlat();
      }
      trackRail();
      viewer?.sizeFrame();
    });
  });

  /* ------------------------------------------------------------- viewer */

  const visible = () => tiles.filter((t) => !t.hidden);

  /*
   * Everything from the click onward — open/close/show, the bloom, the hash
   * discipline, the thumbs, the focus moves — lives in photoViewer.ts behind
   * this narrow interface. It also reparents the viewer to <body>; the shoots
   * sheet below gets the identical move for the identical stacking-context
   * reason (the full story is with the viewer's).
   */
  const viewer = initViewer({
    on,
    life,
    visible,
    setQuery,
    toTop,
    accents,
    runOf,
  });

  if (jump) document.body.appendChild(jump);

  // Delegated on the page, so a tile is still wired after it has been moved
  // into the flat sheet or into an editorial lead.
  on(document, 'click', (event: MouseEvent) => {
    const tile = (event.target as HTMLElement).closest<HTMLAnchorElement>('[data-tile]');
    if (!tile || !viewer) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    viewer.open(visible().indexOf(tile), tile);
  });

  /* ------------------------------------------------------------ keyboard */

  on(window, 'keydown', (event: KeyboardEvent) => {
    if (jump?.classList.contains('is-open')) {
      if (event.key === 'Escape') closeJump();
      // The sheet is aria-modal, so Tab must not walk out into the page
      // behind it — the same trap the viewer uses.
      else if (event.key === 'Tab') trapTab(jump, event);
      return;
    }

    // With the viewer open every key is its business, handled or not.
    if (viewer?.handleKey(event)) return;

    if (
      event.key === '/' &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      document.activeElement !== find
    ) {
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
    let id = '';
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch {
      // A malformed hash (bad percent-encoding) is nobody's frame — and a
      // throw here would escape init() before the swap cleanup registers.
      return;
    }
    if (!id.startsWith('f-')) return;
    if (!viewer || viewer.isOpen()) return;
    const target = tiles.find((t) => t.id === id);
    if (!target || target.hidden) {
      // The fragment names a frame that does not exist or that the active
      // filter is hiding, so the viewer will not open. Leaving it in the
      // address bar would name a frame the page refuses to show — strip it,
      // by replacement, the same discipline the viewer's own writes use.
      history.replaceState(history.state, '', location.pathname + location.search);
      return;
    }
    // After the browser's own scroll-to-fragment, so the close animation and
    // the restored focus both land on a tile that is actually in view.
    requestAnimationFrame(() => viewer.open(visible().indexOf(target), target));
  }

  openFromHash();
  on(window, 'hashchange', openFromHash);

  document.addEventListener(
    'astro:before-swap',
    () => {
      life.abort();
      io.disconnect();
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
