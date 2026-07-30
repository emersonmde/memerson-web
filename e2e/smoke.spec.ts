import { expect, test } from '@playwright/test';
import { gotoSettled } from './helpers';

/*
 * The T1 gate: the scaffold works in every breakpoint project. Deliberately
 * trivial — one navigation, one structural fact per page — so a failure here
 * means the harness, not the site.
 */

test('every page serves and carries its chrome', async ({ page }) => {
  await gotoSettled(page, '/');
  await expect(page.locator('.nav')).toBeVisible();
  await expect(page.locator('h1.sign')).toHaveText('M.EMERSON');

  await gotoSettled(page, '/photos/');
  await expect(page.locator('h1.px-title')).toHaveText('Photographs');
  expect(await page.locator('[data-tile]').count()).toBeGreaterThan(0);

  await gotoSettled(page, '/blog/');
  await expect(page.locator('h1')).toHaveCount(1);

  await gotoSettled(page, '/about/');
  await expect(page.locator('h1')).toHaveCount(1);
});
