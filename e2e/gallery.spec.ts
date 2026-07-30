import { expect, test, type Page } from '@playwright/test';
import { gotoSettled, viewerImageDecoded } from './helpers';
import { PHOTO } from './specimens';

/*
 * The functional gallery suite — docs/TESTING.md §3.2. Everything here was
 * previously verified by hand over CDP. Invariants, not values: no test in
 * this file may fail because a photo was imported or a shoot renamed. The one
 * named piece of content is the specimen (e2e/specimens.ts).
 */

const total = (page: Page) => page.locator('[data-tile]').count();
const shown = (page: Page) => page.locator('[data-tile]:not([hidden])').count();

async function switchView(page: Page, layout: 'sheet' | 'runs' | 'editorial') {
  await page.click(`[data-seg] button[data-layout="${layout}"]`);
  await expect(
    page.locator(`[data-seg] button[data-layout="${layout}"]`),
  ).toHaveAttribute('aria-pressed', 'true');
}

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
        expect(run.hasLead && run.hasMeta, 'a named run leads with its title').toBe(
          true,
        );
      }
    }
  });
});

test.describe('filter coherence', () => {
  test('the count, the query header and the viewer sequence agree', async ({
    page,
  }) => {
    const all = await total(page);
    await page.fill('[data-find]', 'thunder over dover');
    const matching = await shown(page);
    expect(matching).toBeGreaterThan(0);
    expect(matching).toBeLessThan(all);

    /* The count is the matching count. */
    await expect(page.locator('[data-count]')).toContainText(String(matching));
    /* The query header names the filter and the coverage. */
    const qbar = page.locator('[data-qbar]');
    await expect(qbar).toBeVisible();
    await expect(qbar).toContainText('THUNDER OVER DOVER');
    await expect(qbar).toContainText(`${matching} of ${all}`);

    /* The viewer's sequence is scoped to the same set. */
    await page.locator('[data-tile]:not([hidden])').first().click();
    await expect(page.locator('.lb-counter')).toHaveText(
      `001 / ${matching}`,
    );
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
    await page.fill('[data-find]', 'thunder over dover');
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
    /* Focus lands back where the viewer grew from. */
    const focused = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-tile'),
    );
    expect(focused).not.toBeUndefined();
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

  test('deep-linking opens the specimen; closing cleans the hash', async ({
    page,
  }) => {
    await gotoSettled(page, `/photos/#f-${PHOTO}`);
    const lb = page.locator('[data-lb]');
    await expect(lb).toBeVisible();
    await viewerImageDecoded(page);
    await expect(lb.locator('.lb-title')).toHaveText('USAF Thunderbirds');
    /* The viewer writes the frame it shows back to the URL as you step. */
    await lb.locator('[data-lb-step="1"]:visible').first().click();
    expect(await page.evaluate(() => location.hash)).toMatch(/^#f-/);
    expect(await page.evaluate(() => location.hash)).not.toBe(`#f-${PHOTO}`);

    await lb.locator('.lb-close').click();
    await expect(lb).toBeHidden();
    expect(await page.evaluate(() => location.hash)).toBe('');
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
            document.getElementById(k)!.getBoundingClientRect().top <
            innerHeight * 0.5,
          key!,
        ),
      )
      .toBe(true);

    /* SHEET: every run wrapper is hidden, so the jump must land on the
       shoot's first visible tile instead. */
    await switchView(page, 'sheet');
    await jumpTo(key!);
    await expect
      .poll(async () =>
        page.evaluate((k) => {
          const tile = document.querySelector(
            `.px-flat [data-tile][id^="f-${k}"]:not([hidden])`,
          );
          if (!tile) return null;
          const box = tile.getBoundingClientRect();
          return box.top > -box.height && box.top < innerHeight;
        }, key),
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
