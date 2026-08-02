import { expect, type Page } from '@playwright/test';

/*
 * Shared plumbing for the real-browser suite. The rules these encode are
 * docs/TESTING.md §3.1 rule 7: kill nondeterminism at the source — fonts
 * loaded, entry animations either honoured or removed via the real
 * reduced-motion code path, scroll effects driven to a settled frame.
 */

/** Navigate and wait for fonts, so no shot or geometry read races a swap.
 * `load`, not `networkidle`: networkidle waits for 500ms of network silence,
 * which lazy-loaded gallery images can defer indefinitely on a long page —
 * and Playwright's own docs deprecate it. Fonts are the thing geometry and
 * screenshots actually race, and they get their own explicit wait. */
export async function gotoSettled(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
}

/**
 * The reduced-motion variant, for settled-state screenshots: the scripts
 * honour the media query, so this exercises a real code path while removing
 * every entry animation, the charge chase, and the sky's motion.
 */
export async function gotoReduced(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoSettled(page, path);
}

/** Switch the gallery view and wait for the control to confirm it — shared
 * because reimplementing the click-then-wait pair invites a version that
 * forgets the wait and races the reparenting. */
export async function switchView(page: Page, layout: 'sheet' | 'runs' | 'editorial') {
  await page.click(`[data-seg] button[data-layout="${layout}"]`);
  await expect(
    page.locator(`[data-seg] button[data-layout="${layout}"]`),
  ).toHaveAttribute('aria-pressed', 'true');
}

/** Fill the gallery filter and wait for the debounce to land — the query
 * header appearing is the observable signal that the filter has applied.
 * Shared for the same reason as switchView: reimplementing the fill-then-wait
 * pair invites a version that forgets the wait and races the debounce. */
export async function applyFilter(page: Page, term: string) {
  await page.fill('[data-find]', term);
  await expect(page.locator('[data-qbar]')).toBeVisible();
}

/** The lightbox's main image — one home for the selector. */
const LB_IMG = '.lb-img';

/** Wait until the lightbox's main image has fully decoded. The
 * waitForFunction is the real gate (element present, bitmap loaded); the
 * decode() call then proves the bitmap is actually decodable — a rejection
 * here is a broken image and must fail the test, not be swallowed. */
export async function viewerImageDecoded(page: Page) {
  await page.waitForFunction((sel) => {
    const img = document.querySelector<HTMLImageElement>(sel);
    return !!img && img.complete && img.naturalWidth > 0;
  }, LB_IMG);
  await page.evaluate(
    (sel) => document.querySelector<HTMLImageElement>(sel)!.decode(),
    LB_IMG,
  );
}

/**
 * True hit-testing: the element under the centre of `selector` is `selector`
 * itself (or a descendant of it). This is the assertion that would have caught
 * the stacking-context bug — the DOM said the close button was on top; the
 * rendered result had the nav painted over it.
 */
export async function hits(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    const at = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    /* Target or a descendant of it — never an ancestor: an ancestor under
       the point is exactly the case where the target itself can't take the
       click. */
    return !!at && (at === el || el.contains(at));
  }, selector);
}
