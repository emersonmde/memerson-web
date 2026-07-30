import { expect, test } from '@playwright/test';
import { gotoSettled } from './helpers';

/*
 * Router idempotency and the home page's interactive pieces —
 * docs/TESTING.md §3.2. The class of bug this file exists for: the
 * `astro:page-load` double-fire (two observers, two lightboxes) and the
 * dead-gallery-after-a-swap, both of which shipped once.
 */

test('the gallery survives repeated router swaps without doubling', async ({
  page,
  isMobile,
}) => {
  await gotoSettled(page, '/');
  for (let i = 0; i < 2; i++) {
    await page.click('.nav a[href="/photos"]');
    await expect(page.locator('h1.px-title')).toHaveText('Photographs');
    await page.click('.nav a[href="/"]');
    await expect(page.locator('h1.sign')).toBeVisible();
  }
  await page.click('.nav a[href="/photos"]');
  await expect(page.locator('h1.px-title')).toHaveText('Photographs');

  /* The gallery is alive after the swaps... */
  await page.click('[data-seg] button[data-layout="sheet"]');
  await expect(
    page.locator('[data-seg] button[data-layout="sheet"]'),
  ).toHaveAttribute('aria-pressed', 'true');

  /* ...and listeners have not stacked: one step moves exactly one frame. */
  await page.locator('[data-tile]:not([hidden])').first().click();
  const lb = page.locator('[data-lb]');
  await expect(lb).toBeVisible();
  if (isMobile) await lb.locator('.lb-step[data-lb-step="1"]').click();
  else await page.keyboard.press('ArrowRight');
  await expect(lb.locator('.lb-counter')).toContainText('002 /');
  await page.keyboard.press('Escape');
  await expect(lb).toBeHidden();
});

test('back leaves /photos, viewer open or not', async ({ page }) => {
  await gotoSettled(page, '/');
  await page.click('.nav a[href="/photos"]');
  await expect(page.locator('h1.px-title')).toBeVisible();

  /* The viewer owns the fragment by replacement only — no pushState — so the
     back gesture leaves the page rather than replaying viewer states. */
  await page.locator('[data-tile]:not([hidden])').first().click();
  await expect(page.locator('[data-lb]')).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toMatch(/^#f-/);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('h1.sign')).toBeVisible();
});

test('a plate expands in place and the rail recomputes to its new length', async ({
  page,
}) => {
  await gotoSettled(page, '/');
  const railHeight = () =>
    page.evaluate(
      () => document.querySelector('[data-fx="rail"]')!.getBoundingClientRect().height,
    );
  const before = await railHeight();

  /* Open every plate: the rail beneath them grows. */
  const plates = page.locator('.plate summary');
  const count = await plates.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) await plates.nth(i).click();
  await expect(page.locator('.plate[open]')).toHaveCount(count);
  await expect.poll(railHeight).toBeGreaterThan(before);

  /* The charge still lands: scroll the run out and the charge converges on
     the new geometry — which only holds if the ResizeObserver re-measured
     after the expansion reflow. Not asserted at exactly 100.00%: the paint
     loop skips writes smaller than 0.04% of the rail, so the last *painted*
     value on a long rail can sit a fraction under the converged one. */
  await page.evaluate(() =>
    scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
  );
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          parseFloat(
            document
              .querySelector<HTMLElement>('[data-fx="rail"]')!
              .style.getPropertyValue('--cg'),
          ),
        ),
      { timeout: 5000 },
    )
    .toBeGreaterThan(99.9);
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .querySelector<HTMLElement>('[data-fx="terminal"]')!
          .style.getPropertyValue('--lit'),
      ),
    )
    .toBe('1');

  /* Collapse one plate: the layout shrinks again without a scroll event. */
  const expanded = await railHeight();
  await plates.first().click();
  await expect.poll(railHeight).toBeLessThan(expanded);
});
