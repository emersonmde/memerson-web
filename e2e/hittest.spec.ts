import { expect, test } from '@playwright/test';
import { gotoSettled, hits } from './helpers';
import { PHOTO } from './specimens';

/*
 * Hit-testing over reading — docs/TESTING.md §3.1 rule 6 and §3.2. Runs in
 * every breakpoint project, because the failure it exists for is per-layout:
 * the DOM and every z-index read as correct while the rendered result had the
 * nav painted over the viewer's close button. `elementFromPoint` sees what
 * actually paints on top.
 */

test('every visible viewer control really is on top', async ({ page }) => {
  await gotoSettled(page, `/photos/#f-${PHOTO}`);
  await expect(page.locator('[data-lb]')).toBeVisible();

  /* The close button: inside the viewport, and the thing at its own centre. */
  const close = page.locator('.lb-close');
  await expect(close).toBeInViewport();
  expect(await hits(page, '.lb-close'), 'close button is hit-testable').toBe(true);

  /* Whichever pair of step controls this layout shows — the stage arrows on a
     pointer device, the footer pair on touch — both must be reachable. */
  for (const sel of ['.lb-nav', '.lb-step'] as const) {
    const controls = page.locator(sel);
    for (let i = 0; i < (await controls.count()); i++) {
      const control = controls.nth(i);
      if (!(await control.isVisible())) continue;
      await expect(control).toBeInViewport();
      const step = await control.getAttribute('data-lb-step');
      expect(
        await hits(page, `${sel}[data-lb-step="${step}"]`),
        `${sel} step ${step} is hit-testable`,
      ).toBe(true);
    }
  }

  /* The info toggle, and — once open — the capture panel's own way out. */
  expect(await hits(page, '.lb-info')).toBe(true);
  await page.locator('.lb-info').click();
  await expect(page.locator('[data-lb-exif]')).toHaveClass(/is-open/);
  const exifClose = page.locator('[data-lb-exif-close]');
  if (await exifClose.isVisible()) {
    /* The bottom-sheet variant slides in over 220ms; poll past the ride. */
    await expect.poll(() => hits(page, '[data-lb-exif-close]')).toBe(true);
  }
});

test('the capture panel never covers the photograph on a pointer layout', async ({
  page,
  viewport,
}) => {
  test.skip((viewport?.width ?? 0) <= 900, 'below 900 the panel is a bottom sheet');
  await gotoSettled(page, `/photos/#f-${PHOTO}`);
  await page.locator('.lb-info').click();
  await expect(page.locator('[data-lb-exif]')).toHaveClass(/is-open/);
  /* The drawer pushes the stage; wait for the push to settle, then the two
     boxes must not intersect. */
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const exif = document.querySelector('.lb-exif')!.getBoundingClientRect();
        const img = document.querySelector('.lb-img')!.getBoundingClientRect();
        return exif.left >= img.right || exif.right <= img.left;
      }),
    )
    .toBe(true);
});

test('the shoots sheet opens on top and closes', async ({ page }) => {
  await gotoSettled(page, '/photos/');
  const opener = page.locator('[data-jump-open]');
  test.skip(!(await opener.isVisible()), 'the margin rail is shown at this width');

  await opener.click();
  await expect(page.locator('[data-jump]')).toHaveClass(/is-open/);
  expect(await hits(page, '[data-jump-close]')).toBe(true);
  expect(await hits(page, '[data-jump-row]:first-child')).toBe(true);
  await page.locator('[data-jump-close]').click();
  await expect(page.locator('[data-jump]')).not.toHaveClass(/is-open/);
});

test('the margin rail clears the tile columns', async ({ page }) => {
  await gotoSettled(page, '/photos/');
  const rail = page.locator('[data-rail]');
  test.skip(!(await rail.isVisible()), 'rail folds into the sheet at this width');
  const clear = await page.evaluate(() => {
    const railBox = document.querySelector('[data-rail]')!.getBoundingClientRect();
    let rightmost = 0;
    for (const tile of document.querySelectorAll('[data-tile]:not([hidden])')) {
      rightmost = Math.max(rightmost, tile.getBoundingClientRect().right);
    }
    return railBox.left >= rightmost;
  });
  expect(clear, 'no tile prints under the rail').toBe(true);
});

test('the nav stays clickable over page content', async ({ page }) => {
  await gotoSettled(page, '/photos/');
  expect(await hits(page, '.nav a[href="/"]')).toBe(true);
  expect(await hits(page, '.nav a[href="/photos"]')).toBe(true);
});
