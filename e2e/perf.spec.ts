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
 * this file in the desktop project alone.
 */

/* One worker, one test at a time: a timing measurement taken while two other
   tests trace and scroll on the same machine measures the contention, not the
   page. */
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
     starts under them counts startup, not the scroll loop. */
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
  /* Let the last settle land inside the trace — that path is measured too. */
  await page.waitForTimeout(400);
}

test('scrolling the home rail never interleaves reads with writes', async ({
  page,
}) => {
  await gotoSettled(page, '/');
  const forced = await forcedLayoutsDuring(page, () => wheelScroll(page, STEPS, 300));
  expect(forced).toBeLessThanOrEqual(STEPS);
});

test('scrolling the gallery never interleaves reads with writes', async ({
  page,
}) => {
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
    const w = window as never as { __loaf: number[] };
    w.__loaf = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        w.__loaf.push(
          (entry as PerformanceEntry & { blockingDuration: number }).blockingDuration,
        );
      }
    }).observe({ type: 'long-animation-frame', buffered: false });
  });

  await wheelScroll(page, 16, 600);
  await page.locator('[data-tile]:not([hidden])').first().click();
  await expect(page.locator('[data-lb]')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  const blocking = await page.evaluate(
    () => (window as never as { __loaf: number[] }).__loaf,
  );
  const worst = Math.max(0, ...blocking);
  expect(
    worst,
    `worst frame blocked ${worst}ms past the 50ms deadline`,
  ).toBeLessThanOrEqual(100);
});
