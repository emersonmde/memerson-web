import { expect, test, type Page } from '@playwright/test';
import { gotoSettled } from './helpers';

/*
 * Performance — docs/TESTING.md §3.4. The sneakiest refactor risk: a cleanup
 * of fx.ts reinterleaves reads and writes, every functional test stays green,
 * and iOS scrolling stutters.
 *
 * The strong invariant is the forced-reflow count. The read-then-write split
 * is the entire performance story of fx.ts (see its header comment): reads
 * happen before any style is written, so layout is never forced from script
 * mid-frame. Unlike a timing threshold, a count of zero cannot flake on a
 * slow machine — which is why it comes first and the timing bound second.
 *
 * Chromium-only by design (the trace format is Chrome's), and the config runs
 * this file in its own `perf` project, which `dependencies` on every other
 * project — so by the time a trace starts, no sibling worker is scrolling
 * another page on the same machine.
 */

/* One test at a time within the project, too: a timing measurement taken
   while another perf test traces and scrolls measures the contention, not
   the page. */
test.describe.configure({ mode: 'default' });

/* No Playwright trace here: its per-action DOM snapshots read layout from an
   injected script, which the forced-layout counter would count against the
   page — ~20 phantom forced layouts per run. */
test.use({ trace: 'off' });

interface TraceEvent {
  name: string;
  args?: { beginData?: { stackTrace?: unknown[] } };
}

async function forcedLayoutsDuring(
  page: Page,
  drive: () => Promise<void>,
): Promise<number> {
  /* Let the arrival transients land first — the fonts-ready re-measure and
     the entry reveals all schedule work just after load, and a trace that
     starts under them counts startup, not the scroll loop. A sleep is the
     honest tool here: the reveals are rAF-driven script (fx.ts writes styles
     per frame while a heading resolves), invisible to getAnimations() and to
     every load signal — fonts.ready is already awaited in gotoSettled. There
     is no event that says "startup work is done", only quiescence. */
  await page.waitForTimeout(400);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  const browser = page.context().browser()!;
  await browser.startTracing(page, {
    categories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.stack',
    ],
  });
  await drive();
  const buffer = await browser.stopTracing();
  const events: TraceEvent[] = JSON.parse(buffer.toString()).traceEvents ?? [];
  /*
   * A Layout event carrying a script stack is a layout the script *forced* —
   * the browser's own end-of-frame layout has none. Style recalcs are not
   * counted: measure() legitimately writes hues (paint-only properties)
   * between reads, which dirties style but never layout.
   */
  return events.filter(
    (e) => e.name === 'Layout' && (e.args?.beginData?.stackTrace?.length ?? 0) > 0,
  ).length;
}

/*
 * The scroll is driven with real wheel events, not from script: a scroll
 * synthesized by `scrollBy` inside the page needs up-to-date layout for its
 * own bounds clamping, so the *driver* forces layouts whenever another rAF
 * callback wrote styles first — an artifact that counts against the page.
 * Wheel input scrolls from outside the script world and carries no stack.
 *
 * The bound is one forced layout per wheel stop, not a literal zero, because
 * a stop's forced layout is by design: every `scrollend` (headless fires one
 * per wheel burst) runs settle(), whose re-measure *is* a deliberate read of
 * fresh layout — and on the gallery that read can share a frame with the
 * rail's aria-current width change. Those costs are O(scroll-stops). The
 * regression this test exists for — reads interleaved with writes inside the
 * paint loop — is O(frames): several forced layouts per wheel step, far
 * above the bound. (The suite already caught one for real: BackToTop once
 * read `scrollY` in its rAF after fx.ts had written letter-spacing — one
 * forced layout per frame for every frame a heading spent resolving.)
 */
const STEPS = 24;

async function wheelScroll(page: Page, steps: number, delta: number) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, delta);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
  }
  /* Let the last settle land inside the trace — that path is measured too.
     The concrete signal is the burst's final `scrollend`, plus two frames so
     settle()'s read runs before the trace stops. The timer is only a bounded
     fallback for the race where scrollend already fired before the listener
     attached (headless fires one per wheel burst, on its own schedule). */
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const done = () =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        const timer = setTimeout(done, 400);
        addEventListener(
          'scrollend',
          () => {
            clearTimeout(timer);
            done();
          },
          { once: true },
        );
      }),
  );
}

test('scrolling the home rail never interleaves reads with writes', async ({ page }) => {
  await gotoSettled(page, '/');
  const forced = await forcedLayoutsDuring(page, () => wheelScroll(page, STEPS, 300));
  expect(forced).toBeLessThanOrEqual(STEPS);
});

test('scrolling the gallery never interleaves reads with writes', async ({ page }) => {
  await gotoSettled(page, '/photos/');
  const forced = await forcedLayoutsDuring(page, () => wheelScroll(page, STEPS, 550));
  expect(forced).toBeLessThanOrEqual(STEPS);
});

test('no long frames during scroll and viewer open/close', async ({ page }) => {
  await gotoSettled(page, '/photos/');
  /*
   * Loose on purpose: tight timing assertions on shared hardware are flake
   * factories, and the §1 alarm-fatigue rule applies doubly to timing. A
   * long-animation-frame entry only exists at ≥50ms; what this asserts is
   * that no frame *blocks* meaningfully past the 50ms deadline.
   */
  await page.evaluate(() => {
    const w = window as never as { __loaf: number[]; __obs: PerformanceObserver };
    w.__loaf = [];
    w.__obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        w.__loaf.push(
          (entry as PerformanceEntry & { blockingDuration: number }).blockingDuration,
        );
      }
    });
    w.__obs.observe({ type: 'long-animation-frame', buffered: false });
  });

  await wheelScroll(page, 16, 600);
  await page.locator('[data-tile]:not([hidden])').first().click();
  const lb = page.locator('[data-lb]');
  await expect(lb).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  await expect(lb).toBeHidden();

  /* The close frame has ended once two more frames have run; any long frame
     it produced is then in the observer's queue, and takeRecords() drains
     entries queued but not yet delivered — the concrete signal that replaces
     "sleep and hope the callback ran". */
  const blocking = await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const w = window as never as { __loaf: number[]; __obs: PerformanceObserver };
    for (const entry of w.__obs.takeRecords()) {
      w.__loaf.push(
        (entry as PerformanceEntry & { blockingDuration: number }).blockingDuration,
      );
    }
    return w.__loaf;
  });
  const worst = Math.max(0, ...blocking);
  expect(
    worst,
    `worst frame blocked ${worst}ms past the 50ms deadline`,
  ).toBeLessThanOrEqual(100);
});
