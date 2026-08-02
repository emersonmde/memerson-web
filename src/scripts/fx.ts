/*
 * The four scroll effects. See docs/UI-DESIGN.md §5.
 *
 * The mockup ran these against an inner scrolling <div>, so every measurement
 * was relative to that container's rect. Here the window scrolls, so the
 * "container" is the viewport: top 0, bottom innerHeight.
 *
 * Split into two passes, which is the whole performance story on a phone.
 *
 *   measure()  caches what only changes on reflow: which elements exist, each
 *              node's offset *along the rail*, and the hue sampled there.
 *   paint()    runs every animation frame while scrolling, and is strictly
 *              read-then-write: it takes a handful of rects up front and does
 *              not read again once it has started writing.
 *
 * The first version interleaved the two: it called `getBoundingClientRect()` on
 * each of the eleven rail nodes inside the same loop that wrote their styles, so
 * every node forced a synchronous layout against the writes from the node
 * before it — eleven full layouts per frame, on the main thread, while iOS was
 * already busy compositing a momentum scroll.
 *
 * The second version went too far and cached *positions* too, deriving each
 * element's viewport top from a stored document offset minus `scrollY`. That is
 * only sound while the two agree, and on iOS they do not: a collapsing toolbar
 * moves the layout viewport, so a `measure()` that lands mid-transition stores
 * an offset that is wrong by the height of the toolbar — and every frame after
 * it inherits that error. The visible symptom was the rail charge freezing a
 * fixed distance short of its terminal and staying there.
 *
 * So positions are read live and only *offsets within the rail* are cached. The
 * win survives, because the win was never the number of reads — it was that
 * they no longer interleave with writes.
 */

import { chargeDistance, chargeOf, chaseCharge, clamp01, nodeLit } from '../lib/rail';
// hueAt is shared with the build-time colouring in Astro components: it is a
// pure function of its argument, so build and runtime sampling one source
// cannot drift apart. Only the *positions* fed to it differ (index-spaced at
// build, measured after layout here) — see the note in ramp.ts.
import { hueAt } from '../lib/ramp';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

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
  nodes: RailNode[];
  /** Filled by paint()'s read phase, consumed by its write phase. */
  top: number;
  height: number;
  /**
   * The painted charge — the clock every consumer reads. It *chases* the
   * geometric value (see `chaseCharge`), so on a fast flick it rolls through
   * the frames the scroll skipped instead of teleporting with it.
   */
  cg: number;
  /** Last cg actually written to the DOM, so an unchanged frame writes nothing. */
  drawn: number;
}

interface FxNode {
  el: HTMLElement;
  kind: string;
  /** Filled by paint()'s read phase; unused by the scroll-only kinds. */
  top: number;
  /** Last written progress. `resolve` and `tilt` stop writing once settled. */
  last: number;
}

let rails: RailScene[] = [];
let fx: FxNode[] = [];

/** The kinds paint() actually drives — everything else on [data-fx] is inert. */
const PAINTED_KINDS = new Set(['haze', 'shaft', 'progress', 'proghead', 'resolve', 'tilt']);

/* ------------------------------------------------------------------ measure */

function measure() {
  /*
   * The painted charge survives a re-measure. The 140ms settle timer fires
   * while the chase is still rolling (it converges in ~5τ ≈ 450ms), and
   * resetting cg here would snap the tail of that roll — scroll fast, stop,
   * and the head teleports the last stretch. Position and hue are re-derived;
   * the clock keeps its time.
   */
  const kept = new Map(rails.map((scene) => [scene.rail, scene.cg]));

  rails = [];
  for (const scope of document.querySelectorAll<HTMLElement>('[data-rail-scope]')) {
    const rail = scope.querySelector<HTMLElement>('[data-fx="rail"]');
    if (!rail) continue;

    const railBox = rail.getBoundingClientRect();
    if (railBox.height < 8) continue;

    /*
     * Read phase first, like paint(): every dot rect is taken before a single
     * style is written, so the writes below cannot force a layout per row.
     *
     * Safe to measure even though paint() writes `transform: scale()` on the
     * dot: the default transform-origin is the centre, and this reads the centre.
     */
    const measured = Array.from(scope.querySelectorAll<HTMLElement>('[data-row]'))
      .map((row) => {
        const dot = row.querySelector<HTMLElement>('[data-dot]');
        if (!dot) return null;
        const d = dot.getBoundingClientRect();
        return { row, dot, nodeY: d.top + d.height / 2 - railBox.top };
      })
      .filter((m) => m !== null);

    const nodes: RailNode[] = [];
    for (const { row, dot, nodeY } of measured) {
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
      nodes,
      top: railBox.top,
      height: railBox.height,
      cg: kept.get(rail) ?? -1,
      drawn: -1,
    });
  }

  fx = [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-fx]')) {
    const kind = el.dataset.fx!;
    if (kind === 'rail' || kind === 'head' || kind === 'terminal') continue;
    // Unknown kinds are dropped here rather than carried as per-frame dead work.
    if (!PAINTED_KINDS.has(kind)) continue;

    fx.push({ el, kind, top: 0, last: NaN });
  }
}

/* -------------------------------------------------------------------- paint */

/** When the previous frame painted, for the chase's dt. */
let lastPaintAt = 0;

function paint() {
  /*
   * A mid-session flip to reduced motion removes the scroll listener, but the
   * resize/scrollend/toggle listeners and the ResizeObserver stay live — and a
   * frame queued before the flip can still land. All of those funnel through
   * here, so this one check keeps every path from re-animating over
   * settleStatic()'s finished state.
   */
  if (REDUCED.matches) return;

  const vh = window.innerHeight;
  const scrollY = window.scrollY;
  /*
   * Document height and viewport width belong to the read phase like every
   * other measurement: the progress bar and its head need them, and reading
   * them down in the write loop would force layout against the writes above.
   */
  const docH = document.documentElement.scrollHeight;
  const vw = document.documentElement.clientWidth;

  /*
   * Frame time for the chase. Capped at 34ms so a long idle gap (or a dropped
   * frame) reads as one slow frame rather than as "infinite time passed, snap
   * to target" — an anchor jump should still roll in, briskly.
   */
  const now = performance.now();
  const dt = Math.min(now - lastPaintAt, 34);
  lastPaintAt = now;

  /*
   * Read phase. Every rect this frame needs, taken before a single style is
   * written — so the layout they force (if any) happens once, not once per
   * element. This is the whole trick; the count of reads barely matters.
   */
  for (const scene of rails) {
    const box = scene.rail.getBoundingClientRect();
    scene.top = box.top;
    scene.height = box.height;
  }
  for (const node of fx) {
    // The parallax layers and the progress bar are functions of scrollY alone.
    if (node.kind === 'resolve' || node.kind === 'tilt') {
      node.top = node.el.getBoundingClientRect().top;
    }
  }

  /* Write phase. Nothing below reads layout. */
  let chasing = false;
  for (const scene of rails) {
    const target = chargeOf(scene.top, scene.height, vh);
    const cg = chaseCharge(scene.cg, target, dt, scene.height);
    scene.cg = cg; // always advances, even when too small to be worth a write
    if (cg !== target) chasing = true;

    if (Math.abs(cg - scene.drawn) > 0.0004) {
      scene.drawn = cg;
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

      /*
       * The bar scales and the head translates — both compositor-only. The
       * first version wrote `width` here, which reflowed the page on every
       * scrolled frame of every post (docs/PERFORMANCE.md §4.5).
       */
      case 'progress': {
        const max = docH - vh;
        node.el.style.transform = `scaleX(${(max > 0 ? scrollY / max : 0).toFixed(4)})`;
        continue;
      }

      case 'proghead': {
        const max = docH - vh;
        const x = max > 0 ? (scrollY / max) * vw : 0;
        node.el.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
        continue;
      }
    }

    /*
     * Quantized to 24 steps across the entry band. Every write here is the
     * expensive kind — letter-spacing reflows the heading, blur re-rasterizes
     * it — so the write *count* is the cost, and at 120Hz an unquantized ramp
     * wrote every frame. Twenty-four steps over half a viewport of travel is
     * finer than the eye tracks mid-scroll, and a settled node still writes
     * nothing at all (docs/PERFORMANCE.md §4.6).
     */
    const p = Math.round(clamp01((vh - node.top - vh * 0.12) / (vh * 0.55)) * 24) / 24;
    if (p === node.last) continue;
    node.last = p;

    switch (node.kind) {
      // A lens finding focus, not a fade-up.
      case 'resolve':
        node.el.style.opacity = (0.12 + p * 0.88).toFixed(3);
        /*
         * At p = 1 the filter must come *off*, not settle at `blur(0px)`. Any
         * non-none filter forces the element into its own render surface, and
         * both Blink and WebKit clip `text-shadow` to that surface — which
         * beheaded the `.neon-h` titles' glow into a visible rectangle (and
         * its clipped halo read as a phantom nav drop shadow). `will-change`
         * is released with it so the settled heading drops its layer.
         */
        if (p >= 1) {
          // Explicit 'none': clearing the inline value would fall back to the
          // CSS entry state, which is blur(13px).
          node.el.style.filter = 'none';
          node.el.style.willChange = 'auto';
        } else {
          node.el.style.filter = `blur(${((1 - p) * 13).toFixed(2)}px)`;
          node.el.style.willChange = '';
        }
        node.el.style.letterSpacing = `${(-0.045 + (1 - p) * 0.1).toFixed(3)}em`;
        break;

      case 'tilt':
        node.el.style.transform = `perspective(900px) rotateX(${(34 - p * 30).toFixed(2)}deg)`;
        break;
    }
  }

  /*
   * The chase keeps its own heartbeat. Scroll events only *sample* the scroll;
   * once any rail is off its target the clock has to keep ticking until it
   * arrives, or the roll would freeze the moment the finger lifts. Shares the
   * `queued` guard with onScroll, so there is never more than one pending
   * frame; converged ⇒ chasing is false ⇒ the loop stops costing anything.
   */
  if (chasing && !queued) {
    queued = requestAnimationFrame(() => {
      queued = 0;
      paint();
    });
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
  if (REDUCED.matches) return;
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

/*
 * Between the swap (and its scroll restoration) and astro:page-load, these
 * arrays still reference the *previous* document's detached nodes — and a
 * frame queued before the swap can land in that window. Empty them so a stray
 * paint() finds nothing rather than writing into a dead tree; page-load's
 * start() re-measures against the live document.
 */
document.addEventListener('astro:before-swap', () => {
  rails = [];
  fx = [];
});

REDUCED.addEventListener('change', () => {
  if (REDUCED.matches) {
    // Mirror of start()'s add block — all four come off together, so a future
    // refactor cannot leave one behind to stack on the next start().
    removeEventListener('scroll', onScroll);
    removeEventListener('scrollend' as 'scroll', scheduleSettle);
    removeEventListener('resize', scheduleSettle);
    document.removeEventListener('toggle', scheduleSettle, true);
    listening = false;
    settleStatic();
  } else {
    start();
  }
});

export {};
