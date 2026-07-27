/*
 * The four scroll effects. See docs/UI-DESIGN.md §5.
 *
 * The mockup ran these against an inner scrolling <div>, so every measurement
 * was relative to that container's rect. Here the window scrolls, so the
 * "container" is the viewport: top 0, bottom innerHeight. The progress ratios
 * below are the mockup's, re-expressed against that.
 *
 * One rAF-throttled listener drives everything, and each element is measured
 * exactly once per frame.
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Sample the accent ramp. Lightness and chroma are locked; only hue moves,
 * which is the property that lets arbitrary sample points coexist. Mirrors the
 * `hueAt` in the mockup and the formula in docs/UI-DESIGN.md §2.
 */
function hueAt(t: number): string {
  const u = Math.max(0, Math.min(1, t));
  const h = u < 0.5 ? 66 + (200 - 66) * (u * 2) : 200 + (286 - 200) * ((u - 0.5) * 2);
  return `oklch(.80 .17 ${h.toFixed(1)})`;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * With motion reduced, the effects cannot simply be skipped: several of them
 * start from a hidden state (the rail is masked to 0%, nodes sit at 12%
 * opacity), so freezing would mean permanently invisible content. Resolve
 * everything to its finished state instead.
 */
function settleStatic() {
  document.querySelectorAll<HTMLElement>('[data-fx="rail"]').forEach((rail) => {
    rail.style.setProperty('--cg', '100%');
  });
  document.querySelectorAll<HTMLElement>('[data-fx="head"]').forEach((head) => {
    head.style.opacity = '0';
  });
  document.querySelectorAll<HTMLElement>('[data-fx="node"]').forEach((node) => {
    node.style.opacity = '1';
    node.style.transform = 'none';
  });
  paintRailHues();
}

/**
 * Each node samples the rail's colour at the node's own measured height, then
 * hands it to its offshoot line and its plate's brackets. Measuring rather than
 * pre-computing is what guarantees a node can never drift out of agreement with
 * the gradient behind it — the plates are variable height, so their positions
 * are not knowable until layout.
 */
function paintRailHues() {
  document.querySelectorAll<HTMLElement>('[data-rail-scope]').forEach((scope) => {
    const rail = scope.querySelector<HTMLElement>('[data-fx="rail"]');
    if (!rail) return;

    const railBox = rail.getBoundingClientRect();
    if (railBox.height < 8) return;

    scope.querySelectorAll<HTMLElement>('[data-row]').forEach((row) => {
      const dot = row.querySelector<HTMLElement>('[data-dot]');
      if (!dot) return;

      const d = dot.getBoundingClientRect();
      const hue = hueAt((d.top + d.height / 2 - railBox.top) / railBox.height);

      row.style.setProperty('--h', hue);
      dot.style.background = hue;
      dot.style.boxShadow = `0 0 14px ${hue}`;

      const off = row.querySelector<HTMLElement>('[data-off]');
      if (off) off.style.background = `linear-gradient(90deg,${hue},transparent)`;
    });
  });
}

function frame() {
  const vh = window.innerHeight;
  const scrollY = window.scrollY;

  // A single rail per scope; cached here so `head` can position against it.
  const railBoxes = new Map<HTMLElement, DOMRect>();
  document.querySelectorAll<HTMLElement>('[data-rail-scope]').forEach((scope) => {
    const rail = scope.querySelector<HTMLElement>('[data-fx="rail"]');
    if (rail) railBoxes.set(scope, rail.getBoundingClientRect());
  });

  document.querySelectorAll<HTMLElement>('[data-fx]').forEach((node) => {
    const b = node.getBoundingClientRect();
    const p = clamp01((vh - b.top - vh * 0.12) / (vh * 0.55));

    switch (node.dataset.fx) {
      // Near objects lag the scroll; the sky (fixed, in CSS) does not move at all.
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

      // One gradient, one mask — never per-segment. See docs/UI-DESIGN.md §5.3.
      case 'rail': {
        const cg = clamp01((vh - b.top - vh * 0.26) / b.height);
        node.style.setProperty('--cg', `${(cg * 100).toFixed(2)}%`);
        break;
      }

      case 'head': {
        const scope = node.closest<HTMLElement>('[data-rail-scope]');
        const railBox = scope ? railBoxes.get(scope) : undefined;
        if (!railBox || railBox.height < 8) {
          node.style.opacity = '0';
          break;
        }
        const cg = clamp01((vh - railBox.top - vh * 0.26) / railBox.height);
        node.style.top = `${(cg * railBox.height).toFixed(1)}px`;
        node.style.opacity = cg > 0.004 && cg < 0.994 ? '1' : '0';
        break;
      }

      case 'node': {
        const q = Math.min(1, p * 1.35);
        node.style.opacity = (0.1 + q * 0.9).toFixed(3);
        node.style.transform = `scale(${(0.45 + q * 0.55).toFixed(3)})`;
        break;
      }

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

  paintRailHues();
}

let queued = 0;

function onScroll() {
  if (queued) return;
  queued = requestAnimationFrame(() => {
    queued = 0;
    frame();
  });
}

function start() {
  if (REDUCED.matches) {
    settleStatic();
    return;
  }

  frame();
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });

  // Web fonts land after first paint and reflow every plate, which moves every
  // node the rail hues were sampled from. Re-measure once they are ready.
  document.fonts?.ready.then(frame);
}

// The script is deferred by default as a module, so layout is already available.
start();

// Honour a mid-session change rather than only the value at load.
REDUCED.addEventListener('change', () => {
  if (REDUCED.matches) {
    removeEventListener('scroll', onScroll);
    settleStatic();
  } else {
    start();
  }
});
