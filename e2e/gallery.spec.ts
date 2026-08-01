import { expect, test, type Page } from '@playwright/test';
import { gotoSettled, switchView, viewerImageDecoded } from './helpers';
import { PHOTO, PHOTO_TITLE, SHOOT_NAME } from './specimens';

/*
 * The functional gallery suite — docs/TESTING.md §3.2. Everything here was
 * previously verified by hand over CDP. Invariants, not values: no test in
 * this file may fail because a photo was imported or a shoot renamed. The one
 * named piece of content is the specimen (e2e/specimens.ts).
 */

const total = (page: Page) => page.locator('[data-tile]').count();
const shown = (page: Page) => page.locator('[data-tile]:not([hidden])').count();

test.beforeEach(async ({ page }) => {
  await gotoSettled(page, '/photos/');
});

test.describe('view switching', () => {
  test('tiles move between views; they are never rebuilt', async ({ page }) => {
    /*
     * Tag every tile and its <img> with an expando. Reparenting keeps the
     * object; re-rendering from data would produce a fresh element without
     * the tag. This mechanically pins the CLAUDE.md invariant.
     */
    const count = await page.evaluate(() => {
      const tiles = document.querySelectorAll<HTMLElement & { __t?: number }>(
        '[data-tile]',
      );
      tiles.forEach((tile, i) => {
        tile.__t = i;
        const img = tile.querySelector<HTMLImageElement & { __t?: number }>('img');
        if (img) img.__t = i;
      });
      return tiles.length;
    });

    /* Every image URL the document has already fetched. A view switch must
       never ask for any of these again — a re-request means a rebuilt <img>.
       (Freshly lazy-loaded frames scrolling into a new arrangement are fine.) */
    const loaded = new Set(
      await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLImageElement>('[data-tile] img'))
          .filter((img) => img.complete && img.naturalWidth > 0)
          .map((img) => img.currentSrc),
      ),
    );
    const refetched: string[] = [];
    page.on('request', (req) => {
      if (loaded.has(req.url())) refetched.push(req.url());
    });

    for (const layout of ['sheet', 'editorial', 'runs', 'sheet'] as const) {
      await switchView(page, layout);
      const kept = await page.evaluate(() => {
        const tiles = document.querySelectorAll<HTMLElement & { __t?: number }>(
          '[data-tile]',
        );
        let tagged = 0;
        for (const tile of tiles) {
          const img = tile.querySelector<HTMLImageElement & { __t?: number }>('img');
          if (tile.__t !== undefined && img?.__t === tile.__t) tagged++;
        }
        return { tiles: tiles.length, tagged };
      });
      expect(kept.tiles, `${layout}: no tile lost or duplicated`).toBe(count);
      expect(kept.tagged, `${layout}: every tile is the original element`).toBe(count);
    }
    expect(refetched, 'no already-loaded image was requested again').toEqual([]);
  });

  test('SHEET packs every visible tile into real columns', async ({ page }) => {
    await switchView(page, 'sheet');
    const flat = page.locator('.px-flat');
    await expect(flat).toBeVisible();
    /* Every run section is hidden; every visible tile lives inside a column. */
    await expect(page.locator('[data-run]:not([hidden])')).toHaveCount(0);
    const stranded = await page
      .locator('[data-tile]:not([hidden]):not(.px-flat-col *)')
      .count();
    expect(stranded).toBe(0);
    /* Every tile sits inside its column's horizontal band. */
    const outOfCell = await page.evaluate(() => {
      let bad = 0;
      for (const col of document.querySelectorAll('.px-flat-col')) {
        const cbox = col.getBoundingClientRect();
        for (const tile of col.querySelectorAll('[data-tile]:not([hidden])')) {
          const tbox = tile.getBoundingClientRect();
          if (tbox.left < cbox.left - 1 || tbox.right > cbox.right + 1) bad++;
        }
      }
      return bad;
    });
    expect(outOfCell).toBe(0);
  });

  test('EDITORIAL gives every named run a lead and strays none', async ({ page }) => {
    await switchView(page, 'editorial');
    const runs = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-run]:not([hidden])')).map(
        (run) => ({
          stray: !!run.querySelector('.px-run-head.is-stray'),
          hasLead: !!run.querySelector('.px-lead [data-tile]'),
          hasMeta: !!run.querySelector('.px-lead .px-lead-meta'),
        }),
      ),
    );
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      if (run.stray) {
        expect(run.hasLead, 'a stray stretch never gets a lead').toBe(false);
      } else {
        expect(run.hasLead && run.hasMeta, 'a named run leads with its title').toBe(true);
      }
    }
  });
});

test.describe('filter coherence', () => {
  test('the count, the query header and the viewer sequence agree', async ({ page }) => {
    const all = await total(page);
    await page.fill('[data-find]', SHOOT_NAME.toLowerCase());

    /* The input is debounced, so wait for the observable signal — the query
       header appearing — before taking any raw counts. */
    const qbar = page.locator('[data-qbar]');
    await expect(qbar).toBeVisible();

    const matching = await shown(page);
    expect(matching).toBeGreaterThan(0);
    expect(matching).toBeLessThan(all);

    /* The count is the matching count. */
    await expect(page.locator('[data-count]')).toContainText(String(matching));
    /* The query header names the filter and the coverage. */
    await expect(qbar).toContainText(SHOOT_NAME.toUpperCase());
    await expect(qbar).toContainText(`${matching} of ${all}`);

    /* The viewer's sequence is scoped to the same set. */
    await page.locator('[data-tile]:not([hidden])').first().click();
    await expect(page.locator('.lb-counter')).toHaveText(`001 / ${matching}`);
    await page.locator('.lb-close').click();

    /* Clearing restores all three. */
    await page.locator('[data-qclear]').click();
    await expect(qbar).toBeHidden();
    expect(await shown(page)).toBe(all);
    await expect(page.locator('[data-count]')).toContainText(String(all));
  });

  test('a query nothing matches says so, and recovers', async ({ page }) => {
    await page.fill('[data-find]', 'zzz-no-such-frame');
    await expect(page.locator('[data-empty]')).toBeVisible();
    expect(await shown(page)).toBe(0);
    await page.fill('[data-find]', '');
    await expect(page.locator('[data-empty]')).toBeHidden();
    expect(await shown(page)).toBe(await total(page));
  });

  test('filtering scopes the rail counts to matching frames', async ({ page }) => {
    await page.fill('[data-find]', SHOOT_NAME.toLowerCase());
    /* Debounced input — wait for the filter to have landed before counting. */
    await expect(page.locator('[data-qbar]')).toBeVisible();
    const matching = await shown(page);
    const railState = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-rail-item]')).map(
        (item) => ({
          hidden: item.hidden,
          n: Number(item.querySelector('.px-rail-n')?.textContent ?? '0'),
        }),
      ),
    );
    test.skip(railState.length === 0, 'no margin rail at this width');
    const visibleEntries = railState.filter((r) => !r.hidden);
    expect(visibleEntries.length).toBeGreaterThan(0);
    expect(visibleEntries.reduce((sum, r) => sum + r.n, 0)).toBe(matching);
  });
});

test.describe('the lightbox lifecycle', () => {
  test('open, step, escape; focus returns to the tile', async ({ page, isMobile }) => {
    const first = page.locator('[data-tile]:not([hidden])').first();
    /* Capture *which* tile before opening: "some element has data-tile" would
       pass even if focus landed on the wrong tile — or never moved at all. */
    const tileId = await first.getAttribute('id');
    expect(tileId).toBeTruthy();
    await first.click();
    const lb = page.locator('[data-lb]');
    await expect(lb).toBeVisible();
    await viewerImageDecoded(page);
    const count = await shown(page);
    await expect(lb.locator('.lb-counter')).toHaveText(`001 / ${count}`);

    /* Step forward with the controls this layout actually shows. */
    if (isMobile) await lb.locator('.lb-step[data-lb-step="1"]').click();
    else await page.keyboard.press('ArrowRight');
    await expect(lb.locator('.lb-counter')).toHaveText(`002 / ${count}`);

    if (isMobile) await lb.locator('.lb-step[data-lb-step="-1"]').click();
    else await page.keyboard.press('ArrowLeft');
    await expect(lb.locator('.lb-counter')).toHaveText(`001 / ${count}`);

    await page.keyboard.press('Escape');
    await expect(lb).toBeHidden();
    /* Focus lands back on the exact tile the viewer grew from. */
    expect(await page.evaluate(() => document.activeElement?.id)).toBe(tileId);
  });

  test('the capture-data panel toggles and closes', async ({ page, isMobile }) => {
    await page.locator('[data-tile]:not([hidden])').first().click();
    const lb = page.locator('[data-lb]');
    await expect(lb).toBeVisible();
    const exif = lb.locator('[data-lb-exif]');

    await lb.locator('.lb-info').click();
    await expect(exif).toHaveClass(/is-open/);
    await expect(lb.locator('.lb-info')).toHaveAttribute('aria-pressed', 'true');
    /* The table has rows: term/definition pairs from the tile's capture data. */
    expect(await exif.locator('dt').count()).toBeGreaterThan(0);

    if (isMobile) await exif.locator('[data-lb-exif-close]').click();
    else await page.keyboard.press('i');
    await expect(exif).not.toHaveClass(/is-open/);
  });

  test('deep-linking opens the specimen; closing cleans the hash', async ({ page }) => {
    await gotoSettled(page, `/photos/#f-${PHOTO}`);
    const lb = page.locator('[data-lb]');
    await expect(lb).toBeVisible();
    await viewerImageDecoded(page);
    await expect(lb.locator('.lb-title')).toHaveText(PHOTO_TITLE);
    /* The viewer writes the frame it shows back to the URL as you step. */
    await lb.locator('[data-lb-step="1"]:visible').first().click();
    expect(await page.evaluate(() => location.hash)).toMatch(/^#f-/);
    expect(await page.evaluate(() => location.hash)).not.toBe(`#f-${PHOTO}`);

    await lb.locator('.lb-close').click();
    await expect(lb).toBeHidden();
    expect(await page.evaluate(() => location.hash)).toBe('');
  });

  test('the full-res link serves the widest derivative of the open frame', async ({
    page,
  }) => {
    await gotoSettled(page, `/photos/#f-${PHOTO}`);
    const lb = page.locator('[data-lb]');
    await expect(lb).toBeVisible();
    /* Same URL as the tile's no-JS href: the widest rung, from the R2 domain. */
    const href = await lb.locator('.lb-full').getAttribute('href');
    expect(href).toMatch(/^https:\/\/photos\.memerson\.com\/photos\/.+\/\d+\.webp$/);
    const tileHref = await page.locator(`#f-${PHOTO}`).getAttribute('href');
    expect(href).toBe(tileHref);
    /* Steps move it with the frame. */
    await lb.locator('[data-lb-step="1"]:visible').first().click();
    expect(await lb.locator('.lb-full').getAttribute('href')).not.toBe(href);
  });

  test('the photograph never runs under the chrome, even in portrait', async ({
    page,
  }) => {
    /*
     * The failure this pins: on portrait phones the stage reserved a fixed
     * height for the metadata stack, the stack was routinely taller, and a
     * portrait frame sailed under the title, tags and thumbnails. The frame is
     * now sized against the stack's *measured* height, so the invariant is
     * simply that the image intersects neither the top bar nor the stack —
     * at every breakpoint, for the tallest aspect the library has.
     */
    const id = await page.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll<HTMLElement>('[data-tile]'));
      const tallest = tiles.reduce((best, t) => {
        const ar = Number(t.style.getPropertyValue('--ar')) || 1.5;
        const bestAr = Number(best.style.getPropertyValue('--ar')) || 1.5;
        return ar < bestAr ? t : best;
      });
      return tallest?.id ?? null;
    });
    test.skip(!id, 'the gallery has no tiles');

    const tile = page.locator(`#${id}`);
    await tile.scrollIntoViewIfNeeded();
    await tile.click();
    await expect(page.locator('[data-lb]')).toBeVisible();
    await viewerImageDecoded(page);

    /* Poll so the open animation has settled before rects are trusted. */
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const rect = (sel: string) =>
            document.querySelector(sel)?.getBoundingClientRect() ?? null;
          const img = rect('.lb-img');
          const foot = rect('.lb-foot-inner');
          const bar = rect('.lb-bar');
          if (!img || !foot) return 'missing';
          const swipe = document.querySelector<HTMLElement>('.lb-swipe');
          const swipeTop =
            swipe && getComputedStyle(swipe).display !== 'none'
              ? swipe.getBoundingClientRect().top
              : Infinity;
          const clearOfBar = !bar || img.top >= bar.bottom - 1;
          const clearOfFoot = img.bottom <= Math.min(foot.top, swipeTop) + 1;
          return clearOfBar && clearOfFoot;
        }),
      )
      .toBe(true);
  });

  test('a tag in the viewer becomes the filter', async ({ page }) => {
    await gotoSettled(page, `/photos/#f-${PHOTO}`);
    const lb = page.locator('[data-lb]');
    await expect(lb).toBeVisible();
    const tag = lb.locator('.lb-tag').first();
    const term = await tag.textContent();
    await tag.click();
    await expect(lb).toBeHidden();
    await expect(page.locator('[data-qbar]')).toBeVisible();
    await expect(page.locator('[data-find]')).toHaveValue(term!);
    expect(await shown(page)).toBeGreaterThan(0);
  });
});

test.describe('the shoots sheet and the jump rail', () => {
  test('jumping to a shoot lands on that shoot, in every view', async ({ page }) => {
    const useRail = await page.locator('[data-rail]').isVisible();

    const jumpTo = async (key: string) => {
      if (useRail) {
        await page.locator(`[data-rail-item][data-shoot="${key}"]`).click();
      } else {
        await page.locator('[data-jump-open]').click();
        await expect(page.locator('[data-jump]')).toHaveClass(/is-open/);
        await page.locator(`[data-jump-row][data-shoot="${key}"]`).click();
        await expect(page.locator('[data-jump]')).not.toHaveClass(/is-open/);
      }
    };

    /* Pick the third run so the jump actually has somewhere to travel. */
    const key = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll<HTMLElement>('[data-run]'))
          .map((el) => el.dataset.shoot)
          .filter(Boolean)[2],
    );
    test.skip(!key, 'fewer than three runs in the library');

    /* RUNS: the anchor itself works; the run header ends up at the top. */
    await jumpTo(key!);
    await expect
      .poll(async () =>
        page.evaluate(
          (k: string) =>
            document.getElementById(k)!.getBoundingClientRect().top < innerHeight * 0.5,
          key!,
        ),
      )
      .toBe(true);

    /* The shoot's own tiles, captured while the run wrapper still holds them.
       Not `id^="f-${key}"`: a shoot's key is its *earliest* date, and a
       multi-day shoot carries slugs from later days too — the prefix names a
       day, not the shoot. */
    const runTileIds = await page.evaluate(
      (k: string) =>
        Array.from(
          document.querySelectorAll(`[data-run][data-shoot="${k}"] [data-tile]`),
        ).map((el) => el.id),
      key!,
    );

    /* SHEET: every run wrapper is hidden, so the jump must land on the
       shoot's first visible tile instead. */
    await switchView(page, 'sheet');
    await jumpTo(key!);
    await expect
      .poll(async () =>
        page.evaluate((ids: string[]) => {
          for (const id of ids) {
            const tile = document.getElementById(id);
            if (!tile || tile.hidden) continue;
            const box = tile.getBoundingClientRect();
            if (box.top > -box.height && box.top < innerHeight) return true;
          }
          return false;
        }, runTileIds),
      )
      .toBe(true);
  });

  test('the rail tracks the scroll and lights exactly one entry', async ({ page }) => {
    test.skip(!(await page.locator('[data-rail]').isVisible()), 'rail hidden here');
    await page.evaluate(async () => {
      scrollTo({ top: document.documentElement.scrollHeight / 2 });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    await expect
      .poll(() => page.locator('[data-rail-item][aria-current="true"]').count())
      .toBe(1);
    /* The lit entry agrees with the run marked live on the page. */
    const agree = await page.evaluate(() => {
      const item = document.querySelector<HTMLElement>(
        '[data-rail-item][aria-current="true"]',
      );
      const live = document.querySelector<HTMLElement>('[data-run].is-live');
      return !!item && !!live && item.dataset.shoot === live.dataset.shoot;
    });
    expect(agree).toBe(true);
  });
});

test.describe('input shortcuts', () => {
  test('the "/" shortcut reaches the filter; Escape backs out of it', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'keyboard shortcuts are a pointer-profile concern');
    /* "/" focuses the filter from anywhere on the page — and must not also
       type a slash into it, which is why the handler preventDefaults. */
    await page.keyboard.press('/');
    const find = page.locator('[data-find]');
    await expect(find).toBeFocused();
    await expect(find).toHaveValue('');

    /* Escape while the filter is focused clears the query and restores the
       full library — the keyboard round-trip out of a filtered state. */
    await find.fill('zzz-no-such-frame');
    await expect(page.locator('[data-empty]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(find).toHaveValue('');
    await expect(page.locator('[data-empty]')).toBeHidden();
    expect(await shown(page)).toBe(await total(page));
  });

  test('swiping the open viewer steps the sequence', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'swipe replaces the arrows on touch only');
    await page.locator('[data-tile]:not([hidden])').first().click();
    const lb = page.locator('[data-lb]');
    await expect(lb).toBeVisible();
    await viewerImageDecoded(page);
    const count = await shown(page);
    await expect(lb.locator('.lb-counter')).toHaveText(`001 / ${count}`);

    /*
     * Real touch input through the browser's input pipeline (CDP), not a
     * synthetic TouchEvent dispatched at the handler — the point is that a
     * finger produces the gesture, not that the handler works when fed the
     * right object. The phone project is Chromium, so the session exists.
     * Geometry: the handler wants |dx| > 46 with |dx| dominating |dy|, inside
     * 700ms; a straight half-viewport horizontal drag clears all three.
     */
    const cdp = await page.context().newCDPSession(page);
    const { width, height } = page.viewportSize()!;
    const swipe = async (from: number, to: number) => {
      const y = height / 2;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: from, y }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: to, y }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };

    /* Left swipe advances… */
    await swipe(width * 0.75, width * 0.25);
    await expect(lb.locator('.lb-counter')).toHaveText(`002 / ${count}`);
    /* …right swipe returns. */
    await swipe(width * 0.25, width * 0.75);
    await expect(lb.locator('.lb-counter')).toHaveText(`001 / ${count}`);
  });
});
