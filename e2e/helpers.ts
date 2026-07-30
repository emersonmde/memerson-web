import type { Page } from '@playwright/test';

/*
 * Shared plumbing for the real-browser suite. The rules these encode are
 * docs/TESTING.md §3.1 rule 7: kill nondeterminism at the source — fonts
 * loaded, entry animations either honoured or removed via the real
 * reduced-motion code path, scroll effects driven to a settled frame.
 */

/** Navigate and wait for fonts, so no shot or geometry read races a swap. */
export async function gotoSettled(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' });
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

/** Scroll to a fraction of the document and wait for the next painted frame. */
export async function scrollToFraction(page: Page, fraction: number) {
  await page.evaluate(async (f) => {
    const max = document.documentElement.scrollHeight - innerHeight;
    scrollTo({ top: max * f, behavior: 'instant' as ScrollBehavior });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, fraction);
}

/** Wait until the lightbox's main image has fully decoded. */
export async function viewerImageDecoded(page: Page) {
  await page.waitForFunction(() => {
    const img = document.querySelector<HTMLImageElement>('.lb-img');
    return !!img && img.complete && img.naturalWidth > 0;
  });
  await page.evaluate(() =>
    document.querySelector<HTMLImageElement>('.lb-img')!.decode().catch(() => {}),
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
    return !!at && (at === el || el.contains(at) || at.contains(el));
  }, selector);
}
