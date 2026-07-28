/*
 * The four scroll effects. See docs/UI-DESIGN.md §5.
 *
 * The mockup ran these against an inner scrolling <div>, so every measurement
 * was relative to that container's rect. Here the window scrolls, so the
 * "container" is the viewport: top 0, bottom innerHeight.
 *
 * Split into two passes, which is the whole performance story on a phone.
 *
 *   measure()  reads the DOM. Runs on load, resize, plate toggle, font load,
 *              and once after scrolling settles. Never during a scroll.
 *   paint()    writes the DOM. Runs every animation frame while scrolling and
 *              reads *nothing*.
 *
 * The first version interleaved the two: it called `getBoundingClientRect()` on
 * each of the eleven rail nodes inside the same loop that wrote their styles, so
 * every node forced a synchronous layout against the writes from the node
 * before it — eleven full layouts per frame, on the main thread, while iOS was
 * already busy compositing a momentum scroll. Node offsets along the rail do not
 * change when you scroll, only when the page reflows, so they are cached and the
 * scroll path became write-only.
 */

import { chargeDistance, chargeOf, clamp01, nodeLit } from '../lib/rail';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Sample the accent ramp. Lightness and chroma are locked; only hue moves,
 * which is the property that lets arbitrary sample points coexist. Mirrors the
 * `hueAt` in `src/lib/ramp.ts` and the formula in docs/UI-DESIGN.md §2.
 */
function hueAt(t: number): string {
  const u = clamp01(t);
  const h = u < 0.5 ? 66 + (200 - 66) * (u * 2) : 200 + (286 - 200) * ((u - 0.5) * 2);
  return `oklch(.80 .17 ${h.toFixed(1)})`;
}

interface RailNode {
  row: HTMLElement;
  dot: HTMLElement;
  off: HTMLElement | null;
  /** The node's offset along the rail, in rail-local px. Layout, not scroll. */
  nodeY: number;
  hue: string;
  /** Last written lit value, so an unchanged frame writes nothing. */
  lit: number;
}

interface RailScene {
  rail: HTMLElement;
  head: HTMLElement | null;
  terminal: HTMLElement | null;
  /** Document-relative top, so the viewport-relative top is a subtraction. */
  docTop: number;
  height: number;
  nodes: RailNode[];
  cg: number;
}

interface FxNode {
  el: HTMLElement;
  kind: string;
  docTop: number;
  /** Last written progress. `resolve` and `tilt` stop writing once settled. */
  last: number;
}

let rails: RailScene[] = [];
let fx: FxNode[] = [];

/* ------------------------------------------------------------------ measure */

function measure() {
  const scrollY = window.scrollY;

  rails = [];
  for (const scope of document.querySelectorAll<HTMLElement>('[data-rail-scope]')) {
    const rail = scope.querySelector<HTMLElement>('[data-fx="rail"]');
    if (!rail) continue;

    const railBox = rail.getBoundingClientRect();
    if (railBox.height < 8) continue;

    const nodes: RailNode[] = [];
    for (const row of scope.querySelectorAll<HTMLElement>('[data-row]')) {
      const dot = row.querySelector<HTMLElement>('[data-dot]');
      if (!dot) continue;

      /*
       * Safe to measure even though paint() writes `transform: scale()` here:
       * the default transform-origin is the centre, and this reads the centre.
       */
      const d = dot.getBoundingClientRect();
      const nodeY = d.top + d.height / 2 - railBox.top;
      const hue = hueAt(nodeY / railBox.height);

      // Hue is sampled at the node's measured height, so the colour can never
      // drift from the gradient behind it. It only changes on reflow.
      row.style.setProperty('--h', hue);
      dot.style.background = hue;

      const off = row.querySelector<HTMLElement>('[data-off]');
      if (off) off.style.background = `linear-gradient(90deg,${hue},transparent)`;

      nodes.push({ row, dot, off, nodeY, hue, lit: -1 });
    }

    rails.push({
      rail,
      head: scope.querySelector<HTMLElement>('[data-fx="head"]'),
      terminal: scope.querySelector<HTMLElement>('[data-fx="terminal"]'),
      docTop: railBox.top + scrollY,
      height: railBox.height,
      nodes,
      cg: -1,
    });
  }

  fx = [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-fx]')) {
    const kind = el.dataset.fx!;
    if (kind === 'rail' || kind === 'head' || kind === 'terminal') continue;

    // These are driven by scrollY alone and never read their own box.
    if (kind === 'haze' || kind === 'shaft' || kind === 'progress') {
      fx.push({ el, kind, docTop: 0, last: NaN });
      continue;
    }

    /*
     * The footer floor carries the transform this pass writes, and a rect is
     * reported *after* transforms — so measuring it while tilted would feed the
     * effect back into its own input. Clear, measure, and let paint() set it
     * again in the same frame; nothing is painted in between.
     */
    if (kind === 'tilt') el.style.transform = '';

    fx.push({ el, kind, docTop: el.getBoundingClientRect().top + scrollY, last: NaN });
  }
}

/* -------------------------------------------------------------------- paint */

function paint() {
  const vh = window.innerHeight;
  const scrollY = window.scrollY;

  for (const scene of rails) {
    const cg = chargeOf(scene.docTop - scrollY, scene.height, vh);

    if (Math.abs(cg - scene.cg) > 0.0004) {
      scene.cg = cg;
      scene.rail.style.setProperty('--cg', `${(cg * 100).toFixed(2)}%`);

      const chargeY = chargeDistance(cg, scene.height);

      if (scene.head) {
        // translate3d, not `top` — moving the head must not cost a layout.
        scene.head.style.transform = `translate3d(0,${chargeY.toFixed(1)}px,0)`;
        scene.head.style.opacity = cg > 0.004 && cg < 0.996 ? '1' : '0';
      }

      // The terminal cap lights only once the charge actually lands on it.
      scene.terminal?.style.setProperty('--lit', cg > 0.985 ? '1' : '0');

      for (const node of scene.nodes) {
        // Nodes are driven by the charge, not by their own viewport position:
        // an offshoot should light because the charge arrived. The two only
        // agree while the charge runs at exactly scroll speed, which it does not.
        const lit = nodeLit(chargeY, node.nodeY);
        if (Math.abs(lit - node.lit) < 0.004) continue;
        node.lit = lit;

        node.dot.style.opacity = (0.1 + lit * 0.9).toFixed(3);
        node.dot.style.transform = `scale(${(0.5 + lit * 0.5).toFixed(3)})`;
        node.dot.style.boxShadow = `0 0 ${(6 + lit * 12).toFixed(1)}px ${node.hue}`;
        if (node.off) node.off.style.opacity = (0.15 + lit * 0.85).toFixed(3);
      }
    }
  }

  for (const node of fx) {
    switch (node.kind) {
      // Near objects lag the scroll; the sky (fixed, in CSS) does not move.
      case 'haze':
        node.el.style.transform = `translate3d(0,${(-scrollY * 0.08).toFixed(1)}px,0)`;
        continue;

      case 'shaft':
        node.el.style.transform = `translate3d(0,${(-scrollY * 0.14).toFixed(1)}px,0)`;
        continue;

      case 'progress': {
        const max = document.documentElement.scrollHeight - vh;
        node.el.style.width = `${(max > 0 ? (scrollY / max) * 100 : 0).toFixed(2)}%`;
        continue;
      }
    }

    const p = clamp01((vh - (node.docTop - scrollY) - vh * 0.12) / (vh * 0.55));
    // A resolved heading is the common case on a long scroll. Writing
    // letter-spacing costs a layout, so a settled node writes nothing at all.
    if (Math.abs(p - node.last) < 0.002) continue;
    node.last = p;

    switch (node.kind) {
      // A lens finding focus, not a fade-up.
      case 'resolve':
        node.el.style.opacity = (0.12 + p * 0.88).toFixed(3);
        node.el.style.filter = `blur(${((1 - p) * 13).toFixed(2)}px)`;
        node.el.style.letterSpacing = `${(-0.045 + (1 - p) * 0.1).toFixed(3)}em`;
        break;

      case 'tilt':
        node.el.style.transform = `perspective(900px) rotateX(${(34 - p * 30).toFixed(2)}deg)`;
        break;
    }
  }
}

/** With motion reduced, resolve everything to its finished state. */
function settleStatic() {
  document.querySelectorAll<HTMLElement>('[data-fx="rail"]').forEach((rail) => {
    rail.style.setProperty('--cg', '100%');
  });
  document.querySelectorAll<HTMLElement>('[data-fx="head"]').forEach((head) => {
    head.style.opacity = '0';
  });
  document.querySelectorAll<HTMLElement>('[data-fx="terminal"]').forEach((t) => {
    t.style.setProperty('--lit', '1');
  });
  document.querySelectorAll<HTMLElement>('[data-row]').forEach((row) => {
    const dot = row.querySelector<HTMLElement>('[data-dot]');
    const off = row.querySelector<HTMLElement>('[data-off]');
    if (dot) {
      dot.style.opacity = '1';
      dot.style.transform = 'none';
    }
    if (off) off.style.opacity = '1';
  });
}

/* ------------------------------------------------------------------ driving */

let queued = 0;
let settleTimer = 0;

function onScroll() {
  if (!queued) {
    queued = requestAnimationFrame(() => {
      queued = 0;
      paint();
    });
  }

  /*
   * A guaranteed final frame once the scroll stops.
   *
   * This is what fixed the charge stopping short of the terminal on iOS. During
   * a momentum scroll Safari can drop the last rAF, so the last frame actually
   * painted belongs to a scroll position the page has already left — and since
   * `paint()` is the only thing that advances the charge, it simply stayed
   * behind. `scrollend` covers it where the engine reports it; the timer covers
   * the engines and gestures where it does not fire, and re-measures because a
   * collapsing iOS toolbar changes innerHeight without a useful resize.
   */
  clearTimeout(settleTimer);
  settleTimer = window.setTimeout(scheduleSettle, 140);
}

function settle() {
  measure();
  paint();
}

/*
 * Coalesced, and deferred to the next frame. `measure()` writes (node hues) and
 * `paint()` writes letter-spacing, so a settle triggered *by* the ResizeObserver
 * could in principle resize the thing being observed and settle again forever.
 * One per frame, at most.
 */
let settleQueued = 0;

function scheduleSettle() {
  if (settleQueued) return;
  settleQueued = requestAnimationFrame(() => {
    settleQueued = 0;
    settle();
  });
}

let listening = false;
let observer: ResizeObserver | undefined;

/**
 * Re-measure on layout change, not just on scroll.
 *
 * Expanding a plate reflows every row beneath it and changes the rail's height,
 * but fires no scroll event — so the charge, the head and the node hues all
 * stayed at their pre-expansion values until the next scroll nudged them. The
 * visible symptom was hues jumping to their new rows while the glow stayed put,
 * because the two are computed from different measurements and only one of them
 * was stale.
 */
function watchLayout() {
  observer?.disconnect();
  observer = new ResizeObserver(scheduleSettle);
  document
    .querySelectorAll('[data-rail-scope]')
    .forEach((scope) => observer!.observe(scope));
}

function start() {
  if (REDUCED.matches) {
    settleStatic();
    return;
  }

  settle();

  if (!listening) {
    addEventListener('scroll', onScroll, { passive: true });
    // Not in every lib.dom yet; harmless where the engine does not fire it.
    addEventListener('scrollend' as 'scroll', scheduleSettle, { passive: true });
    addEventListener('resize', scheduleSettle, { passive: true });
    // <details> does not bubble `toggle` in every engine, so capture it.
    document.addEventListener('toggle', scheduleSettle, true);
    listening = true;
  }

  watchLayout();

  // Web fonts land after first paint and reflow every plate, which moves every
  // node the rail hues were sampled from. Re-measure once they are ready.
  document.fonts?.ready.then(scheduleSettle);
}

start();

/*
 * With the view-transition router, a navigation swaps the document without
 * re-executing this module — so the new page's rail would never charge. Re-run
 * on every page load; the listener guard keeps it from stacking up.
 */
document.addEventListener('astro:page-load', start);

REDUCED.addEventListener('change', () => {
  if (REDUCED.matches) {
    removeEventListener('scroll', onScroll);
    listening = false;
    settleStatic();
  } else {
    start();
  }
});

export {};
