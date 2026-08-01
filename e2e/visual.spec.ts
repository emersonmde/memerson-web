import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoReduced, viewerImageDecoded } from './helpers';
import { PHOTO, POST, SHOOT } from './specimens';

/*
 * The visual layer — docs/TESTING.md §3.1, applied in order of preference:
 *
 *   1. unit cells, never whole growing structures;
 *   2. stable-by-construction chrome;
 *   3. masks only for genuinely dynamic pixels (counts, thumbnail strips);
 *   4. no full-page shot of any page that grows — 404 and about only;
 *   5. specimens for everything that needs a photograph or a post;
 *   6. geometry relations live in hittest.spec.ts, not here;
 *   7. reduced motion + disabled animations kill nondeterminism at the source.
 *
 * The success criterion: a photo import or a new blog post causes zero
 * failures in this file. If one ever does, restructure the test — do not
 * update its baseline.
 */

const SHOT = { animations: 'disabled' } as const;

async function shot(locator: Locator, name: string, mask: Locator[] = []) {
  /*
   * Snap the element to a whole pixel first. Rows above a specimen have
   * fractional heights, so content added above it shifts its position by a
   * fraction of a pixel — which changes both how the element crop rounds
   * (a churn-shaped ±1px in the shot's own size) and the antialiasing phase
   * of every glyph in it. Scrolling cannot correct this (scroll positions
   * quantize to device pixels), so the element itself is nudged onto the
   * pixel grid with a temporary relative offset, and restored after.
   */
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((el: HTMLElement) => {
    const box = el.getBoundingClientRect();
    const dy = box.top - Math.round(box.top);
    const dx = box.left - Math.round(box.left);
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
      el.style.position = 'relative';
      el.style.top = `${-dy}px`;
      el.style.left = `${-dx}px`;
    }
  });
  try {
    await expect(locator).toHaveScreenshot(`${name}.png`, { ...SHOT, mask });
  } finally {
    /* Restore even when the shot fails: a later shot() in the same test must
       not inherit a stale offset and diff for the wrong reason. */
    await locator.evaluate((el: HTMLElement) => {
      el.style.position = '';
      el.style.top = '';
      el.style.left = '';
    });
  }
}

/** Fonts + every image inside the element decoded, so no shot races a load. */
async function imagesDecoded(page: Page, selector: string) {
  await page.waitForFunction((sel) => {
    const scope = document.querySelector(sel);
    if (!scope) return false;
    return Array.from(scope.querySelectorAll('img')).every(
      (img) => img.complete && img.naturalWidth > 0,
    );
  }, selector);
}

test.describe('site chrome', () => {
  test('nav and footer', async ({ page }) => {
    await gotoReduced(page, '/');
    await shot(page.locator('.nav'), 'nav');
    await page.locator('.foot').scrollIntoViewIfNeeded();
    await shot(page.locator('.foot'), 'footer');
  });

  test('hero: sign, tube, bio', async ({ page }) => {
    await gotoReduced(page, '/');
    /* The sign's flicker and the tube's travelling spec are animations, so
       `animations: 'disabled'` freezes both at their authored resting state. */
    await shot(page.locator('.hero'), 'hero');
  });

  test('section header and one plate — the unit cell, not the rail', async ({ page }) => {
    await gotoReduced(page, '/');
    await shot(page.locator('.sec-head').first(), 'sec-head');
    /* One row: node, offshoot, collapsed plate. The repetition is covered by
       invariants (fx/motion specs); the rail never gets a whole-structure shot. */
    await shot(page.locator('.row').first(), 'plate-collapsed');
    await page.locator('.row').first().locator('summary').click();
    await shot(page.locator('.row').first(), 'plate-open');
  });
});

test.describe('the gallery', () => {
  test('header and control bar', async ({ page }) => {
    await gotoReduced(page, '/photos/');
    /* The stats block counts frames and shoots — genuinely dynamic. */
    await shot(page.locator('.px-head'), 'px-head', [page.locator('.px-stats')]);
    const bar = page.locator('[data-bar]');
    await bar.scrollIntoViewIfNeeded();
    await shot(bar, 'px-bar', [page.locator('[data-count]')]);
  });

  test('the specimen tile and its run header', async ({ page }) => {
    await gotoReduced(page, `/photos/#${SHOOT}`);
    const tile = page.locator(`#f-${PHOTO}`);
    await tile.scrollIntoViewIfNeeded();
    await imagesDecoded(page, `#f-${PHOTO}`);
    await shot(tile, 'tile');
    /* The sticky run header for the specimen shoot: date, tube, name, series
       chip. The aside counts frames, which an import into an old shoot could
       change — masked as specimen-adjacent churn (§3.1 rule 5). Attribute
       selector, not `#${SHOOT}`: an id starting with a digit is not a valid
       CSS id selector. */
    const run = `[data-run][data-shoot="${SHOOT}"]`;
    await shot(page.locator(`${run} .px-run-head`), 'run-head', [
      page.locator(`${run} .px-run-aside`),
    ]);
  });

  test('the viewer at the specimen frame', async ({ page }) => {
    await gotoReduced(page, `/photos/#f-${PHOTO}`);
    await expect(page.locator('[data-lb]')).toBeVisible();
    await viewerImageDecoded(page);
    /* The photograph itself — deterministic because it is the specimen. */
    await shot(page.locator('.lb-frame'), 'lb-frame');
    /* Viewer chrome: the counter places the specimen in a growing sequence
       and the thumbnails window onto neighbouring frames — both churn. */
    await shot(page.locator('.lb-bar'), 'lb-bar', [page.locator('.lb-counter')]);
    await shot(page.locator('.lb-foot-inner'), 'lb-foot', [page.locator('.lb-thumbs')]);
  });
});

test.describe('the log', () => {
  test('the specimen entry and its post header', async ({ page }) => {
    await gotoReduced(page, '/blog/');
    /* Found by href, never by position: new posts land above it. */
    await shot(page.locator(`a.entry[href="/blog/${POST}"]`), 'log-entry');
    await gotoReduced(page, `/blog/${POST}/`);
    await shot(page.locator('h1').first(), 'post-title');
  });
});

test.describe('fixed pages', () => {
  test('404, in full', async ({ page }) => {
    await gotoReduced(page, '/404.html');
    await expect(page).toHaveScreenshot('404.png', { ...SHOT, fullPage: true });
  });

  test('about, in full — its copy is treated as design', async ({ page }) => {
    await gotoReduced(page, '/about/');
    await expect(page).toHaveScreenshot('about.png', { ...SHOT, fullPage: true });
  });
});
