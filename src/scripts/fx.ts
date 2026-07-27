/*
 * The four scroll effects. See docs/UI-DESIGN.md §5.
 *
 * The mockup ran these against an inner scrolling <div>, so every measurement
 * was relative to that container's rect. Here the window scrolls, so the
 * "container" is the viewport: top 0, bottom innerHeight.
 *
 * One rAF-throttled listener drives everything, and each element is measured
 * exactly once per frame.
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

/**
 * Rail-scoped work: charge the rail, ride the head down it, and light each node
 * as the head reaches it.
 *
 * Nodes are driven by the **charge**, not by their own viewport position. That
 * is the whole point — an offshoot should light because the charge arrived, not
 * because it happens to be near the middle of the screen. The two only agree
 * when the charge runs at exactly scroll speed, which it no longer does.
 */
function runRails(vh: number) {
  document.querySelectorAll<HTMLElement>('[data-rail-scope]').forEach((scope) => {
    const rail = scope.querySelector<HTMLElement>('[data-fx="rail"]');
    if (!rail) return;

    const railBox = rail.getBoundingClientRect();
    if (railBox.height < 8) return;

    const cg = chargeOf(railBox.top, railBox.height, vh);
    rail.style.setProperty('--cg', `${(cg * 100).toFixed(2)}%`);

    // Distance the head has travelled along the rail, in rail-local px.
    const chargeY = chargeDistance(cg, railBox.height);

    const head = scope.querySelector<HTMLElement>('[data-fx="head"]');
    if (head) {
      head.style.top = `${chargeY.toFixed(1)}px`;
      head.style.opacity = cg > 0.004 && cg < 0.996 ? '1' : '0';
    }

    // The terminal cap lights only once the charge actually lands on it.
    const terminal = scope.querySelector<HTMLElement>('[data-fx="terminal"]');
    if (terminal) terminal.style.setProperty('--lit', cg > 0.985 ? '1' : '0');

    scope.querySelectorAll<HTMLElement>('[data-row]').forEach((row) => {
      const dot = row.querySelector<HTMLElement>('[data-dot]');
      if (!dot) return;

      const d = dot.getBoundingClientRect();
      const nodeY = d.top + d.height / 2 - railBox.top;

      // Sampled at the node's measured height so the colour can never drift
      // from the gradient behind it.
      const hue = hueAt(nodeY / railBox.height);
      row.style.setProperty('--h', hue);

      // A 40px ramp centred on the node, so it kindles as the head sweeps past
      // rather than snapping on.
      const lit = nodeLit(chargeY, nodeY);

      dot.style.background = hue;
      dot.style.opacity = (0.1 + lit * 0.9).toFixed(3);
      dot.style.transform = `scale(${(0.5 + lit * 0.5).toFixed(3)})`;
      dot.style.boxShadow = `0 0 ${(6 + lit * 12).toFixed(1)}px ${hue}`;

      const off = row.querySelector<HTMLElement>('[data-off]');
      if (off) {
        off.style.background = `linear-gradient(90deg,${hue},transparent)`;
        off.style.opacity = (0.15 + lit * 0.85).toFixed(3);
      }
    });
  });
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

function frame() {
  const vh = window.innerHeight;
  const scrollY = window.scrollY;

  runRails(vh);

  document.querySelectorAll<HTMLElement>('[data-fx]').forEach((node) => {
    const kind = node.dataset.fx;
    // Rail, head and terminal are driven by runRails().
    if (kind === 'rail' || kind === 'head' || kind === 'terminal') return;

    const b = node.getBoundingClientRect();
    const p = clamp01((vh - b.top - vh * 0.12) / (vh * 0.55));

    switch (kind) {
      // Near objects lag the scroll; the sky (fixed, in CSS) does not move.
      case 'haze':
        node.style.transform = `translate3d(0,${(-scrollY * 0.08).toFixed(1)}px,0)`;
        break;

      case 'shaft':
        node.style.transform = `translate3d(0,${(-scrollY * 0.14).toFixed(1)}px,0)`;
        break;

      // A lens finding focus, not a fade-up.
      case 'resolve':
        node.style.opacity = (0.12 + p * 0.88).toFixed(3);
        node.style.filter = `blur(${((1 - p) * 13).toFixed(2)}px)`;
        node.style.letterSpacing = `${(-0.045 + (1 - p) * 0.1).toFixed(3)}em`;
        break;

      case 'progress': {
        const max = document.documentElement.scrollHeight - vh;
        node.style.width = `${(max > 0 ? (scrollY / max) * 100 : 0).toFixed(2)}%`;
        break;
      }

      case 'tilt':
        node.style.transform = `perspective(900px) rotateX(${(34 - p * 30).toFixed(2)}deg)`;
        break;
    }
  });
}

let queued = 0;

function onScroll() {
  if (queued) return;
  queued = requestAnimationFrame(() => {
    queued = 0;
    frame();
  });
}

let listening = false;
let observer: ResizeObserver | undefined;

/**
 * Recompute on layout change, not just on scroll.
 *
 * Expanding a plate reflows every row beneath it and changes the rail's height,
 * but fires no scroll event — so the charge, the head and the node hues all
 * stayed at their pre-expansion values until the next scroll nudged them. The
 * visible symptom was hues jumping to their new rows while the glow stayed put,
 * because the two are computed from different measurements and only one of them
 * was stale.
 *
 * A ResizeObserver on the rail scope catches this, plus font loading, plus
 * anything else that moves the rows.
 */
function watchLayout() {
  observer?.disconnect();
  observer = new ResizeObserver(() => onScroll());
  document
    .querySelectorAll('[data-rail-scope]')
    .forEach((scope) => observer!.observe(scope));
}

function start() {
  if (REDUCED.matches) {
    settleStatic();
    return;
  }

  frame();

  if (!listening) {
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    // <details> does not bubble `toggle` in every engine, so capture it.
    document.addEventListener('toggle', onScroll, true);
    listening = true;
  }

  watchLayout();

  // Web fonts land after first paint and reflow every plate, which moves every
  // node the rail hues were sampled from. Re-measure once they are ready.
  document.fonts?.ready.then(frame);
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
