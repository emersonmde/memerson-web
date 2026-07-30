import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { gotoSettled } from './helpers';
import { PHOTO } from './specimens';

/*
 * Accessibility — docs/TESTING.md §3.5. build.test.ts already guards alt text
 * and heading structure; this layer adds what needs an engine: axe across
 * every page and the viewer-open state, keyboard-only operation of the
 * lightbox, and visible focus.
 *
 * `color-contrast` is excluded, deliberately and visibly: the only findings
 * are the design system's `--faint` chrome (the 9px mono asides, datelines,
 * END OF LINE), whose dimness is a locked Neon District decision — tokens in
 * global.css that nothing may change ad hoc (CLAUDE.md). Excluding the rule
 * keeps every *other* axe rule armed instead of drowning them in known noise.
 */

const audit = (page: Page) =>
  new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();

for (const path of ['/', '/photos/', '/blog/', '/about/', '/404.html']) {
  test(`axe finds nothing on ${path}`, async ({ page }) => {
    await gotoSettled(page, path);
    const { violations } = await audit(page);
    expect(violations).toEqual([]);
  });
}

test('axe finds nothing with the viewer open', async ({ page }) => {
  await gotoSettled(page, `/photos/#f-${PHOTO}`);
  await expect(page.locator('[data-lb]')).toBeVisible();
  const { violations } = await audit(page);
  expect(violations).toEqual([]);
});

test('the lightbox is keyboard-only operable, with visible focus', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'keyboard operation is a pointer-profile concern');
  await gotoSettled(page, '/photos/');

  /* Reach a tile by keyboard alone. The skip link is first in the order. */
  let onTile = false;
  for (let i = 0; i < 60 && !onTile; i++) {
    await page.keyboard.press('Tab');
    onTile = await page.evaluate(
      () => document.activeElement?.hasAttribute('data-tile') ?? false,
    );
  }
  expect(onTile, 'a tile is reachable by Tab').toBe(true);
  const tileId = await page.evaluate(() => document.activeElement!.id);

  /* Enter opens the viewer and focus moves into it. */
  await page.keyboard.press('Enter');
  const lb = page.locator('[data-lb]');
  await expect(lb).toBeVisible();
  await expect(page.locator('.lb-close')).toBeFocused();

  /* Arrows step; the counter follows. */
  await page.keyboard.press('ArrowRight');
  await expect(lb.locator('.lb-counter')).toContainText('002 /');
  await page.keyboard.press('ArrowLeft');
  await expect(lb.locator('.lb-counter')).toContainText('001 /');

  /* Tab is trapped: however far it walks, focus stays inside the dialog —
     the viewer is aria-modal, and walking out would put the user behind it. */
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() =>
        document.querySelector('[data-lb]')!.contains(document.activeElement),
      ),
    ).toBe(true);
  }

  /* Keyboard focus is visible: the focused control wears the site's ring. */
  const outline = await page.evaluate(
    () => getComputedStyle(document.activeElement!).outlineStyle,
  );
  expect(outline).not.toBe('none');

  /* Escape closes and focus returns to the tile the viewer grew from. */
  await page.keyboard.press('Escape');
  await expect(lb).toBeHidden();
  expect(await page.evaluate(() => document.activeElement!.id)).toBe(tileId);
});
