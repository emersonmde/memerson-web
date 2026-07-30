import { expect, test, type Page } from '@playwright/test';
import { gotoSettled } from './helpers';

/*
 * Motion — docs/TESTING.md §3.3. A screenshot pins one frame; these prove the
 * frames connect. Everything samples rendered geometry at chosen scroll
 * positions or seeks animations to chosen times: nothing here races a clock.
 *
 * The rail assertions close the loop that tests/rail.test.ts (pure maths)
 * cannot: that fx.ts feeds the maths the right inputs and writes the outputs
 * to the right elements.
 */

/** Scroll, then wait until the chase has converged: `--cg` stable across frames. */
async function scrollAndSettle(page: Page, top: number) {
  await page.evaluate((t) => scrollTo({ top: t, behavior: 'instant' }), top);
  await expect
    .poll(
      () =>
        page.evaluate(
          async () => {
            const rail = document.querySelector<HTMLElement>('[data-fx="rail"]')!;
            const a = rail.style.getPropertyValue('--cg');
            await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
            return a === rail.style.getPropertyValue('--cg') ? a : null;
          },
        ),
      { timeout: 5000 },
    )
    .not.toBeNull();
}

interface RailSample {
  cg: number;
  headY: number | null;
  headOpacity: string;
  headBottom: number;
  vh: number;
  railHeight: number;
  dotOpacities: number[];
}

async function sampleRail(page: Page): Promise<RailSample> {
  return page.evaluate(() => {
    const rail = document.querySelector<HTMLElement>('[data-fx="rail"]')!;
    const head = document.querySelector<HTMLElement>('[data-fx="head"]')!;
    const match = head.style.transform.match(/translate3d\(0px?,\s*(-?[\d.]+)px/);
    return {
      cg: parseFloat(rail.style.getPropertyValue('--cg')) / 100,
      headY: match ? parseFloat(match[1]) : null,
      headOpacity: head.style.opacity,
      headBottom: head.getBoundingClientRect().bottom,
      vh: innerHeight,
      railHeight: rail.getBoundingClientRect().height,
      dotOpacities: Array.from(
        document.querySelectorAll<HTMLElement>('[data-row] [data-dot]'),
      ).map((dot) => parseFloat(dot.style.opacity || '0.1')),
    };
  });
}

test('the rail charge, as rendered: on screen, monotonic, in rail order', async ({
  page,
}) => {
  await gotoSettled(page, '/');
  const max = await page.evaluate(
    () => document.documentElement.scrollHeight - innerHeight,
  );

  const samples: RailSample[] = [];
  for (const fraction of [0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1]) {
    await scrollAndSettle(page, max * fraction);
    samples.push(await sampleRail(page));
  }

  let prev = -Infinity;
  for (const s of samples) {
    /* Monotonic with scroll — the charge never runs backwards on the way down. */
    expect(s.cg).toBeGreaterThanOrEqual(prev - 0.0005);
    prev = Math.max(prev, s.cg);

    /* Mid-run the head is visible and inside the viewport — the property the
       anchored formula exists to provide, at any rail length. */
    if (s.cg > 0.01 && s.cg < 0.99) {
      expect(s.headOpacity).toBe('1');
      expect(s.headBottom).toBeGreaterThanOrEqual(-2);
      expect(s.headBottom).toBeLessThanOrEqual(s.vh + 2);
    }

    /* The rendered head position agrees with the closed form the design is
       stated in: translateY = cg × railHeight (chargeDistance). */
    if (s.headY !== null) {
      expect(Math.abs(s.headY - s.cg * s.railHeight)).toBeLessThanOrEqual(2);
    }

    /* Nodes light in rail order: a node higher up is never dimmer than one
       below it, whatever the plate sizes did to the spacing. */
    for (let i = 1; i < s.dotOpacities.length; i++) {
      expect(s.dotOpacities[i - 1]).toBeGreaterThanOrEqual(s.dotOpacities[i] - 0.01);
    }
  }

  /* End of the run: the charge landed and the terminal is lit. */
  expect(samples[samples.length - 1].cg).toBeGreaterThan(0.985);
  expect(
    await page.evaluate(() =>
      document
        .querySelector<HTMLElement>('[data-fx="terminal"]')!
        .style.getPropertyValue('--lit'),
    ),
  ).toBe('1');
});

test('the redraw wipe travels top to bottom within its duration', async ({ page }) => {
  await gotoSettled(page, '/');
  /*
   * Not raced: arm the panel by hand, then drive its animations to chosen
   * times with the Web Animations API and read where the seam is at each.
   */
  const seamAt = async (t: number) =>
    page.evaluate((time) => {
      const redraw = document.querySelector<HTMLElement>('.redraw')!;
      for (const a of document.getAnimations()) {
        const target = (a.effect as KeyframeEffect | null)?.target;
        if (target === redraw) {
          a.pause();
          a.currentTime = time;
        }
      }
      return redraw.getBoundingClientRect().top;
    }, t);

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--redraw-top', '64px');
    document.querySelector('.redraw')!.classList.add('is-running');
  });

  const start = await seamAt(0);
  const mid = await seamAt(150);
  const end = await seamAt(299);
  const vh = await page.evaluate(() => innerHeight);

  expect(Math.abs(start - 64)).toBeLessThanOrEqual(1); // starts at the nav's edge
  expect(mid).toBeGreaterThan(start); // travels down...
  expect(end).toBeGreaterThan(mid);
  expect(end).toBeGreaterThanOrEqual(vh); // ...and clears the screen

  await page.evaluate(() =>
    document.querySelector('.redraw')!.classList.remove('is-running'),
  );
});

test('the wipe runs on a real swap — and not at all under reduced motion', async ({
  page,
}) => {
  for (const reduce of [false, true]) {
    await page.emulateMedia({ reducedMotion: reduce ? 'reduce' : 'no-preference' });
    await gotoSettled(page, '/');
    /* The document object survives a ClientRouter swap, so a listener armed
       here can read the incoming page's panel the moment it goes live. */
    await page.evaluate(() => {
      (window as never as { __wipe: Promise<boolean> }).__wipe = new Promise(
        (resolve) =>
          document.addEventListener(
            'astro:page-load',
            () =>
              resolve(
                document.querySelector('.redraw')?.classList.contains('is-running') ??
                  false,
              ),
            { once: true },
          ),
      );
    });
    await page.click('.nav a[href="/photos"]');
    const ran = await page.evaluate(
      () => (window as never as { __wipe: Promise<boolean> }).__wipe,
    );
    expect(ran, reduce ? 'no wipe under reduced motion' : 'wipe on a swap').toBe(
      !reduce,
    );
  }
});

test('entry resolve: blurred before, crisp after, suppressed after a swap', async ({
  page,
}) => {
  await gotoSettled(page, '/');
  /* A below-the-fold heading arrives defocused… */
  const title = page.locator('.sec-title[data-fx="resolve"]').first();
  const blurred = await title.evaluate((el) => getComputedStyle(el).filter);
  expect(blurred).toContain('blur');

  /* …and actually resolves once scrolled into the resolve band. */
  await title.evaluate((el) =>
    scrollTo({
      top: el.getBoundingClientRect().top + scrollY - innerHeight * 0.25,
      behavior: 'instant',
    }),
  );
  await expect
    .poll(() => title.evaluate((el) => getComputedStyle(el).filter))
    .toBe('none');
  await expect
    .poll(() => title.evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');

  /* After a router swap the session is marked and the incoming page's
     visible headings are crisp from their first frame. */
  await page.click('.nav a[href="/photos"]');
  await expect(page.locator('h1.px-title')).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.hasAttribute('data-swapped')),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => getComputedStyle(document.querySelector('h1.px-title')!).filter,
    ),
  ).toBe('none');
});
