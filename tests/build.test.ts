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
        // The viewer's own <img> is an empty slot until a tile is opened; its
        // alt is copied from that tile's, which this loop already checks.
        if (tag.includes('lb-img')) continue;
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
  const gallery = () => pages.find((p) => rel(p.file) === 'photos/index.html')!;

  test('the whole library is on one page', async () => {
    /*
     * The redesign's run headers, margin rail and stray-frame rule all need the
     * complete library to be truthful about coverage, so /photos is a single
     * static page and the old /photos/N routes are gone. ARCHITECTURE §6.
     */
    const manifest = JSON.parse(
      await readFile(new URL('../src/data/photos.json', import.meta.url), 'utf8'),
    ) as unknown[];

    const tiles = gallery().html.match(/<a class="px-tile"[^>]*>/g) ?? [];
    assert.equal(tiles.length, manifest.length, 'not every frame was rendered');

    const paginated = pages.filter((p) => /photos\/\d+\/index\.html$/.test(rel(p.file)));
    assert.equal(paginated.length, 0, 'a paginated photo page survived');
  });

  test('every tile carries the data the viewer reads', () => {
    const tiles = gallery().html.match(/<a class="px-tile"[^>]*>/g) ?? [];
    assert.ok(tiles.length > 0, 'no tiles in the gallery');
    for (const tile of tiles) {
      for (const attr of [
        'data-tile',
        'data-alt',
        'data-title',
        // The frame and the bloom both paint from this before a byte is
        // requested, which is what makes the viewer arrive in one piece.
        'data-lqip',
        '--ar:',
      ]) {
        assert.ok(tile.includes(attr), `tile missing ${attr}`);
      }
    }
  });

  test('the viewer reads srcsets off the tile rather than a second copy', () => {
    /*
     * At 118 tiles on one page, duplicating each srcset into data-avif /
     * data-webp was the single largest thing in the document. The viewer reads
     * the tile's own <source> elements instead.
     */
    const html = gallery().html;
    assert.ok(!html.includes('data-webp='), 'srcsets are duplicated onto the tile');
    assert.match(html, /<source type="image\/webp" srcset="[^"]*640\.webp 640w/);
  });

  test('home previews link to the gallery, gallery tiles link to the image', () => {
    /*
     * Regression: home previews linked to the raw .webp, stranding visitors on
     * a bare image file. The gallery keeps the image href on purpose — the
     * viewer intercepts it, and no-JS still gets the photograph.
     */
    const home = pages.find((p) => rel(p.file) === 'index.html')!;
    for (const tag of home.html.match(/<a class="tile"[^>]*>/g) ?? []) {
      assert.match(
        tag,
        /href="\/photos"/,
        `home tile points at a bare file: ${tag.slice(0, 80)}`,
      );
    }
    const first = /<a class="px-tile"[^>]*>/.exec(gallery().html)![0];
    assert.match(first, /href="https:\/\/photos\.memerson\.com/);
  });

  test('every run is headed, and the stray stretch is marked as not an outing', () => {
    const html = gallery().html;
    const runs = html.match(/class="px-run"/g) ?? [];
    const heads = html.match(/class="px-run-head[^"]*"/g) ?? [];
    assert.ok(runs.length > 1, 'the gallery has no runs');
    assert.equal(heads.length, runs.length, 'a run is missing its header');

    const stray = heads.filter((h) => h.includes('is-stray'));
    assert.equal(stray.length, 1, 'expected exactly one merged stray stretch');
    assert.match(html, /STRAY FRAMES/);
  });

  test('the rail and the shoots sheet are real anchors into the scroll', () => {
    /*
     * Navigation between shoots must survive with no JavaScript, so the rail
     * and the sheet are fragment links to the run they name rather than click
     * handlers. Every target has to exist.
     */
    const html = gallery().html;
    const ids = new Set(
      [...html.matchAll(/<section class="px-run" id="([^"]+)"/g)].map((m) => m[1]),
    );
    assert.ok(ids.size > 1, 'runs carry no ids to anchor to');

    const targets = [...html.matchAll(/class="px-rail-item[^"]*" href="#([^"]+)"/g)];
    assert.equal(targets.length, ids.size, 'the rail does not cover every run');
    for (const [, key] of targets) {
      assert.ok(ids.has(key), `rail points at a missing run: ${key}`);
    }
    for (const [, key] of html.matchAll(/class="px-jumprow[^"]*" href="#([^"]+)"/g)) {
      assert.ok(ids.has(key), `shoots sheet points at a missing run: ${key}`);
    }
  });

  test('the series marker is a control, not a label', () => {
    /*
     * `series` is the only thing joining two Air Show shoots three years apart.
     * Rendering it as inert text is the same mistake as an albums page that
     * cannot be opened — the thread exists in the data and nowhere in the UI.
     */
    const html = gallery().html;
    const markers = html.match(/<button[^>]*class="px-run-series"[^>]*>/g) ?? [];
    assert.ok(markers.length > 0, 'no series marker rendered');
    for (const marker of markers) {
      assert.match(marker, /data-series="[^"]+"/, 'series marker carries no query');
    }
    // …and the frames it would filter to have to be findable by that query.
    assert.match(html, /data-series="air-shows"[\s\S]*data-tile/);
  });

  test('the viewport opts into the safe areas', () => {
    // Without viewport-fit=cover the page stops at the notch and the viewer's
    // bloom ends in a black band. UI-DESIGN §9.
    for (const { file, html } of pages) {
      assert.match(
        html,
        /name="viewport"[^>]*viewport-fit=cover/,
        `${rel(file)} does not cover the safe areas`,
      );
    }
  });

  test('no design-notes copy shipped', () => {
    // The mockup carried its own rationale as on-page copy. It is documentation,
    // not website text. Same guard as the mockup-annotation test above.
    const html = gallery().html;
    for (const phrase of ['DESIGN NOTES', 'What changed, and why', 'px-notes']) {
      assert.ok(!html.includes(phrase), `design instruction leaked: ${phrase}`);
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
