import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/*
 * Assertions against the built site rather than the source.
 *
 * Every bug this file guards against was one that type-checking and a green
 * build did not catch, because each was a *semantic* failure in correct-looking
 * markup. Checking source asks "did I write the thing?"; checking `dist` asks
 * "did the thing happen?" — and only the second survives templating.
 *
 * Run `npm run build` first. `npm test` does.
 */

const DIST = new URL('../dist/', import.meta.url);

async function htmlFiles(dir = DIST.pathname): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(full)));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

let pages: { file: string; html: string }[] = [];
const rel = (f: string) => path.relative(DIST.pathname, f);

before(async () => {
  try {
    await stat(DIST);
  } catch {
    throw new Error('dist/ is missing — run `npm run build` before the tests');
  }
  const files = await htmlFiles();
  pages = await Promise.all(
    files.map(async (file) => ({ file, html: await readFile(file, 'utf8') })),
  );
  assert.ok(pages.length > 0, 'no pages were built');
});

/** Strip inline scripts so their template strings are not mistaken for markup. */
const markup = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '');

describe('accessibility', () => {
  test('every image has non-empty alt text', () => {
    /*
     * Regression: 122 of 133 images once shipped with `alt=""`, because the
     * date fallback lived in Photo.astro while PhotoThumb had its own copy that
     * fell through to an empty string. Both now share src/lib/photoAlt.ts.
     */
    for (const { file, html } of pages) {
      for (const tag of markup(html).match(/<img[^>]*>/g) ?? []) {
        const alt = /alt="([^"]*)"/.exec(tag);
        assert.ok(
          alt && alt[1].trim().length > 0,
          `${rel(file)}: image without alt — ${tag.slice(0, 90)}`,
        );
      }
    }
  });

  test('every page has exactly one h1', () => {
    for (const { file, html } of pages) {
      const count = (markup(html).match(/<h1[\s>]/g) ?? []).length;
      assert.equal(count, 1, `${rel(file)} has ${count} h1 elements`);
    }
  });

  test('every page has a skip link and a main landmark', () => {
    for (const { file, html } of pages) {
      assert.match(html, /class="skip"/, `${rel(file)} has no skip link`);
      assert.match(html, /<main/, `${rel(file)} has no <main>`);
    }
  });

  test('breadcrumbs are real links, not inert text', () => {
    // Regression: these shipped as <div>s and were not clickable.
    const post = pages.find((p) => p.file.includes('blog/hello-gatsby'));
    assert.ok(post, 'expected a blog post in the build');
    assert.match(post!.html, /class="post-crumb"[^>]*>[\s\S]{0,200}<a href="\/blog"/);
  });
});

describe('design system integrity', () => {
  test('no mockup annotation leaked into site copy', () => {
    /*
     * A mockup explains itself to a reviewer. Those explanations are not the
     * site's words, and three of them shipped as if they were.
     */
    const annotations = [
      'TUBE FEEDS THE RAIL',
      'nothing samples a palette',
      'END OF RAIL',
      'REAL PHOTO GOES HERE',
      'SCROLL SLOWLY',
      'hint-placeholder',
    ];
    for (const { file, html } of pages) {
      for (const phrase of annotations) {
        assert.ok(
          !html.includes(phrase),
          `${rel(file)} contains mockup annotation: "${phrase}"`,
        );
      }
    }
  });

  test('resolve headings use the data-fx hook the script dispatches on', () => {
    /*
     * Regression: these carried `class="resolve"` while fx.ts switched on
     * `data-fx`, so the effect never ran and every section title sat blurred at
     * 15% opacity. One hook, so the two cannot drift.
     */
    for (const { file, html } of pages) {
      assert.ok(
        !/class="[^"]*\bresolve\b/.test(html),
        `${rel(file)} still keys resolve off a class`,
      );
    }
    const home = pages.find((p) => rel(p.file) === 'index.html')!;
    assert.match(home.html, /data-fx="resolve"/, 'home has no resolving heading');
  });

  test('the rail carries every hook fx.ts needs', () => {
    const home = pages.find((p) => rel(p.file) === 'index.html')!;
    for (const hook of [
      'data-rail-scope',
      'data-fx="rail"',
      'data-fx="head"',
      'data-fx="terminal"',
    ]) {
      assert.ok(home.html.includes(hook), `home page is missing ${hook}`);
    }
    // Every plate needs a row/dot/offshoot triple or the charge cannot light it.
    const rows = (home.html.match(/data-row/g) ?? []).length;
    const dots = (home.html.match(/data-dot/g) ?? []).length;
    const offs = (home.html.match(/data-off\b/g) ?? []).length;
    assert.ok(rows > 0, 'no rail rows');
    assert.equal(dots, rows, 'every row needs exactly one node');
    assert.equal(offs, rows, 'every row needs exactly one offshoot');
  });

  test('the glow is not applied to the masked element', () => {
    /*
     * Regression: box-shadow on the masked rail was clipped away by its own
     * mask, because a mask only paints within the element's box while a shadow
     * is drawn outside it. The filter must live on the wrapper.
     */
    const home = pages.find((p) => rel(p.file) === 'index.html')!;
    assert.match(home.html, /rail-glow/, 'the rail glow wrapper is gone');
  });
});

describe('gallery', () => {
  const sheetPage = () => pages.find((p) => rel(p.file) === 'photos/index.html')!;

  test('the sheet exposes what the infinite scroll needs', () => {
    const html = sheetPage().html;
    for (const attr of ['data-sheet', 'data-total=', 'data-next=', 'data-sentinel']) {
      assert.ok(html.includes(attr), `contact sheet is missing ${attr}`);
    }
  });

  test('paginated pages still exist as a no-JS path', () => {
    // Pagination is invisible to the reader but must remain real: crawlable,
    // and functional without JavaScript. ARCHITECTURE §6.
    const paginated = pages.filter((p) => /photos\/\d+\/index\.html$/.test(rel(p.file)));
    assert.ok(paginated.length > 0, 'no paginated photo pages were built');
    for (const { file, html } of paginated) {
      assert.ok(html.includes('data-sheet'), `${rel(file)} is not a usable sheet`);
    }
  });

  test('the last page does not advertise a next page', () => {
    const paginated = pages
      .filter((p) => /photos\/\d+\/index\.html$/.test(rel(p.file)))
      .sort((a, b) => a.file.localeCompare(b.file));
    const last = paginated[paginated.length - 1];
    assert.ok(
      !/data-next="[^"]+"/.test(last.html),
      `${rel(last.file)} claims a next page`,
    );
  });

  test('home previews link to the gallery, sheet tiles link to the image', () => {
    /*
     * Regression: home previews linked to the raw .webp, stranding visitors on
     * a bare image file. The sheet keeps the image href on purpose — the
     * lightbox intercepts it, and no-JS still gets the photograph.
     */
    const home = pages.find((p) => rel(p.file) === 'index.html')!;
    for (const tag of home.html.match(/<a class="tile"[^>]*>/g) ?? []) {
      assert.match(
        tag,
        /href="\/photos"/,
        `home tile points at a bare file: ${tag.slice(0, 80)}`,
      );
    }
    const first = /<a class="tile"[^>]*>/.exec(sheetPage().html)![0];
    assert.match(first, /href="https:\/\/photos\.memerson\.com/);
  });

  test('every tile carries the data the lightbox reads', () => {
    const tiles = sheetPage().html.match(/<a class="tile"[^>]*>/g) ?? [];
    assert.ok(tiles.length > 0, 'no tiles on the contact sheet');
    for (const tile of tiles) {
      for (const attr of ['data-tile', 'data-webp', 'data-bloom', 'data-alt']) {
        assert.ok(tile.includes(attr), `tile missing ${attr}`);
      }
    }
  });
});

describe('links and assets', () => {
  test('every internal link resolves to a built page or file', async () => {
    const built = new Set(
      (await htmlFiles()).map(
        (f) =>
          '/' +
          rel(f)
            .replace(/index\.html$/, '')
            .replace(/\/$/, ''),
      ),
    );

    for (const { file, html } of pages) {
      for (const [, href] of html.matchAll(/href="(\/[^"#?]*)"/g)) {
        const clean = href.replace(/\/$/, '');
        if (/\.[a-z0-9]+$/i.test(clean)) {
          // A file: assert it was emitted.
          await stat(new URL('.' + clean, DIST));
          continue;
        }
        assert.ok(
          built.has(clean) || built.has(clean + '/'),
          `${rel(file)} links to missing ${href}`,
        );
      }
    }
  });

  test('self-hosted fonts are emitted, and none are fetched from a third party', async () => {
    // The footer claims no trackers; a third-party font request would make that
    // quietly false. UI-DESIGN §3.
    for (const font of ['space-grotesk-var', 'jetbrains-mono-var', 'newsreader-var']) {
      await stat(new URL(`fonts/${font}.woff2`, DIST));
    }
    for (const { file, html } of pages) {
      assert.ok(
        !html.includes('fonts.googleapis.com'),
        `${rel(file)} loads Google Fonts`,
      );
      assert.ok(!html.includes('fonts.gstatic.com'), `${rel(file)} loads Google Fonts`);
    }
  });

  test('the 404 page was emitted for Cloudflare not_found_handling', async () => {
    await stat(new URL('404.html', DIST));
  });

  test('[hidden] beats author display rules', async () => {
    /*
     * Regression: the paginator was hidden with the `hidden` attribute while
     * .sheet-more set `display: flex`, which silently wins over the UA rule.
     */
    const css = (await readdir(new URL('_astro/', DIST))).filter((f) =>
      f.endsWith('.css'),
    );
    const all = (
      await Promise.all(css.map((f) => readFile(new URL(`_astro/${f}`, DIST), 'utf8')))
    ).join('');
    assert.match(all, /\[hidden\]\{display:none/, 'no global [hidden] override');
  });
});
