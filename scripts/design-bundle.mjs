#!/usr/bin/env node
/**
 * npm run design:bundle
 *
 * Builds a self-contained snapshot of the photo gallery **as it is actually
 * implemented today**, for pushing to a Claude Design design-system project.
 *
 * The point is to remove a translation step. The design source of record in
 * `docs/design/` is what was *designed*; the implementation has moved since
 * (see UI-DESIGN §8), and describing that drift in prose is both laborious and
 * lossy. These files are the drift, rendered.
 *
 * Why not just point Claude Design at the live site: a built Astro page carries
 * hashed bundle names and `data-astro-cid-*` scoped selectors, so the tokens —
 * the actual system — are unreadable in it. Here the stylesheet is inlined
 * whole and the token block is rendered as swatches.
 *
 * Reads ./dist, so run a build first.
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { PHOTOS_BASE_URL, REPO_ROOT, derivativeKey } from './photos/lib/r2.mjs';

const DIST = path.join(REPO_ROOT, 'dist');
const OUT = path.join(REPO_ROOT, '.design-bundle');
const SITE = 'https://memerson.com';

/** The lightbox sample. Titled, recognisable, and busy enough to judge the bloom. */
const LIGHTBOX_SLUG = '2021-11-27-2e180961';

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

/**
 * The stylesheets and inline styles belonging to **one specific page**.
 *
 * Per-page, not global, and that is not a detail: Astro emits a separate bundle
 * per route plus scoped styles in the head, so reusing one page's CSS for
 * another renders it as unstyled HTML. The first version of this file read the
 * photos page once and reused it everywhere, which produced a home page card
 * with no layout at all — caught by screenshotting the output, which is the
 * only reason to bother screenshotting the output.
 *
 * Fonts stay as absolute URLs rather than base64. They are public on
 * memerson.com, and inlining 325 KB into every file to save one request is a
 * bad trade when these are read in a browser.
 */
async function pageCss(relPath) {
  const page = await readFile(path.join(DIST, relPath), 'utf8');
  const head = page.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? page;

  let css = '';
  for (const [, href] of head.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)) {
    css += await readFile(path.join(DIST, href), 'utf8');
  }
  for (const [, block] of page.matchAll(/<style>([\s\S]*?)<\/style>/g)) css += block;

  return css.replace(/url\(\/fonts\//g, `url(${SITE}/fonts/`);
}

function shell({ title, card, group, subtitle, body, css, note }) {
  return `<!-- @dsCard group="${group}" -->
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="dc-card" content="${esc(card)}">
<meta name="dc-subtitle" content="${esc(subtitle)}">
<style>${css}</style>
<style>
  body { margin: 0; background: var(--void); color: var(--tx); }
  .dc-note {
    position: relative; z-index: 5;
    margin: 0; padding: 14px 70px;
    border-bottom: 1px solid var(--hairline);
    background: var(--chrome);
    font: 400 11px/1.7 var(--mono); color: var(--dim);
  }
  .dc-note b { color: var(--cyan); font-weight: 500; }

  /*
   * Cards carry no JavaScript, so anything the scroll effects reveal would sit
   * at its hidden resting state — page titles are opacity .15 under a 13px
   * blur, which reads as "the heading is missing" rather than "the heading
   * animates in". These three declarations are the site's own reduced-motion
   * state, copied verbatim from global.css rather than invented here.
   */
  [data-fx='resolve'] {
    opacity: 1 !important;
    filter: none !important;
    letter-spacing: -0.045em !important;
  }
  .shot, .redraw { display: none; }
</style>
</head>
<body>
${note ? `<p class="dc-note">${note}</p>` : ''}
${body}
</body>
</html>
`;
}

/** Strip the module scripts — they reference hashed bundles that aren't here. */
const stripScripts = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<link rel="modulepreload"[^>]*>/g, '');

/** A dist page's `<body>` contents, or a clear failure naming the page. */
function bodyOf(page, relPath) {
  const match = page.match(/<body[^>]*>([\s\S]*)<\/body>/);
  if (!match) throw new Error(`${relPath} has no <body> — is the build complete?`);
  return match[1];
}

async function buildSheet() {
  const page = await readFile(path.join(DIST, 'photos/index.html'), 'utf8');
  const body = stripScripts(bodyOf(page, 'photos/index.html'))
    .replace(/<link rel="stylesheet"[^>]*>/g, '')
    .replace(/<style>[\s\S]*?<\/style>/g, '');

  return shell({
    title: 'Contact sheet — current implementation',
    card: 'Contact sheet',
    group: 'Photos — current',
    subtitle: 'The live /photos page. Real photographs, real captions.',
    css: await pageCss('photos/index.html'),
    note:
      '<b>This is the live page, not a mockup.</b> Real photographs from R2 and real ' +
      'generated captions. Infinite scroll and the lightbox are JavaScript and are not ' +
      'active here — the lightbox is a separate card. Tiles fall back to their inlined ' +
      'LQIP if the remote images are blocked.',
    body,
  });
}

/**
 * The lightbox is built at runtime by `gallery.ts`, so saving the page never
 * captures it. This reproduces that subtree open, from the same markup, with
 * real photographs — and working prev/next, because a still frame cannot show
 * whether the bloom transition reads correctly.
 *
 * Three corrections were needed to make a card of something designed to own the
 * whole viewport, and all three were artefacts of this file rather than bugs in
 * the site:
 *
 *  1. `.lb` is `position: fixed; inset: 0`. Dropped into a sized card it
 *     escaped to the viewport and pushed the page into scrolling. Pinned to
 *     `absolute` inside a clipping wrapper instead.
 *  2. `<picture>` is an inline element, so its baseline gap made `.lb-frame`
 *     taller than the photograph and the bottom brackets sat off the image.
 *     On the real page the flex stage constrains the frame and it never shows.
 *  3. The nav buttons were inert. Now wired to a real slide list.
 *
 * The overrides live in one clearly-labelled block so nobody mistakes them for
 * part of the design.
 */
async function buildLightbox(css, manifest) {
  if (manifest.length === 0) {
    throw new Error(
      'src/data/photos.json is empty — the lightbox card needs at least one ' +
        'photo. Import photos before running design:bundle.',
    );
  }
  const photo = manifest.find((entry) => entry.id === LIGHTBOX_SLUG) ?? manifest[0];
  const index = manifest.indexOf(photo);
  const url = (slug, w, f = 'webp') => `${PHOTOS_BASE_URL}/${derivativeKey(slug, w, f)}`;

  // A run centred on the sample, so prev/next cross a shoot boundary and the
  // bloom visibly changes colour — which is the thing worth judging.
  const start = Math.max(0, index - 4);
  const slides = manifest.slice(start, start + 9).map((entry) => ({
    src: url(entry.id, 1536),
    bloom: url(entry.id, 640),
    alt: entry.caption ?? '',
    label: entry.takenAt ? entry.takenAt.slice(0, 10).replace(/-/g, '.') : 'UNDATED',
    meta: [entry.camera, entry.aperture, entry.shutter, entry.iso && `ISO ${entry.iso}`]
      .filter(Boolean)
      .join(' · ')
      .toUpperCase(),
    n: manifest.indexOf(entry) + 1,
  }));

  const body = `
<div class="dc-lb-stage">
<div class="lb" role="dialog" aria-modal="true" aria-label="Photo viewer">
  <div class="lb-wash"></div>
  <div class="lb-bloom"></div>
  <div class="lb-vignette"></div>
  <div class="lb-bar">
    <span class="lb-counter"></span>
    <button type="button" class="lb-close">CLOSE ESC ×</button>
  </div>
  <div class="lb-stage">
    <button type="button" class="lb-nav lb-prev" aria-label="Previous photo">←</button>
    <figure class="lb-frame">
      <picture><img class="lb-img" alt=""></picture>
      <span class="lb-bracket lb-tl"></span><span class="lb-bracket lb-tr"></span>
      <span class="lb-bracket lb-bl"></span><span class="lb-bracket lb-br"></span>
    </figure>
    <button type="button" class="lb-nav lb-next" aria-label="Next photo">→</button>
  </div>
  <div class="lb-foot">
    <div class="lb-foot-inner">
      <div>
        <div class="lb-title"></div>
        <div class="lb-meta"><span class="lb-dash"></span><span class="lb-meta-text"></span></div>
      </div>
      <div class="lb-thumbs"></div>
    </div>
  </div>
</div>
</div>

<!-- ==========================================================
     CARD-ONLY OVERRIDES. Not part of the design.
     The lightbox owns the whole viewport on the real site; these
     three rules make it sit inside a card without lying about it.
     ========================================================== -->
<style>
  .dc-lb-stage { position: relative; height: 780px; overflow: hidden; }
  /* (1) fixed would escape the card and scroll the page */
  .dc-lb-stage .lb { position: absolute; }
  /* (2) <picture> is inline; its baseline gap pushed the bottom brackets off */
  .dc-lb-stage .lb-frame picture { display: block; font-size: 0; }
  .dc-lb-stage .lb-img { max-height: 560px; }
</style>

<script>
  (() => {
    // "<" escaped at build time so a caption containing "</" + "script>"
    // cannot end this block early.
    const slides = ${JSON.stringify(slides).replace(/</g, '\\u003c')};
    const total = ${manifest.length};
    const root = document.querySelector('.lb');
    const q = (s) => root.querySelector(s);
    let i = ${index - start};

    function show(next) {
      i = (next + slides.length) % slides.length;
      const s = slides[i];
      q('.lb-img').src = s.src;
      q('.lb-img').alt = s.alt;
      q('.lb-bloom').style.backgroundImage = 'url("' + s.bloom + '")';
      q('.lb-counter').textContent = String(s.n).padStart(3, '0') + ' / ' + total;
      q('.lb-title').textContent = s.label;
      q('.lb-meta-text').textContent = s.meta;

      // Five-wide window around the current frame, as on the real site.
      const from = Math.max(0, Math.min(i - 2, slides.length - 5));
      q('.lb-thumbs').replaceChildren(...slides.slice(from, from + 5).map((t, k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'lb-thumb';
        b.style.backgroundImage = 'url("' + t.bloom + '")';
        if (from + k === i) b.setAttribute('aria-current', 'true');
        b.addEventListener('click', () => show(from + k));
        return b;
      }));
    }

    q('.lb-prev').addEventListener('click', () => show(i - 1));
    q('.lb-next').addEventListener('click', () => show(i + 1));
    addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') show(i - 1);
      if (e.key === 'ArrowRight') show(i + 1);
    });
    show(i);
  })();
</script>`;

  return shell({
    title: 'Lightbox — current implementation',
    card: 'Lightbox',
    group: 'Photos — current',
    subtitle: 'Live. Arrow keys or the buttons; the bloom is the photograph itself.',
    css,
    note:
      `<b>The design problem, in one card.</b> This photograph has the title ` +
      `"${esc(photo.title ?? '—')}", a caption, ${(photo.tags ?? []).length} tags and ` +
      `belongs to a named shoot — and the lightbox shows none of it. It shows the date ` +
      `and the camera settings. Everything new needs somewhere to live. ` +
      `Prev/next work here (${slides.length} frames) so the bloom transition can be judged.`,
    body,
  });
}

/** Any built page, inlined with its own stylesheets and de-scripted. */
async function buildPage(relPath, { card, group, subtitle, note }) {
  const page = await readFile(path.join(DIST, relPath), 'utf8');
  const body = stripScripts(bodyOf(page, relPath))
    .replace(/<link rel="stylesheet"[^>]*>/g, '')
    .replace(/<style>[\s\S]*?<\/style>/g, '');

  return shell({
    title: card,
    card,
    group,
    subtitle,
    css: await pageCss(relPath),
    note,
    body,
  });
}

async function buildTokens(css) {
  const source = await readFile(path.join(REPO_ROOT, 'src/styles/global.css'), 'utf8');
  // `\n\s*\}` rather than `\n\}`: the closing brace only has to start its own
  // line, so a formatter indenting it doesn't silently break token extraction.
  const root = source.match(/:root\s*\{([\s\S]*?)\n\s*\}/)?.[1];
  if (!root) throw new Error('src/styles/global.css has no :root block to render');

  const rows = [...root.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map(
    ([, name, value]) => {
      const isColour = /^(#|rgba?\(|oklch\()/.test(value.trim());
      const swatch = isColour
        ? `<span style="display:inline-block;width:52px;height:26px;border:1px solid var(--hairline);background:${value.trim()};vertical-align:middle"></span>`
        : '';
      return `<tr><td><code>${name}</code></td><td>${swatch}</td><td><code>${esc(value.trim())}</code></td></tr>`;
    },
  );

  const body = `
<div style="padding:48px 70px;max-width:900px">
  <h1 style="font:700 48px/1 var(--display);letter-spacing:-.04em;color:var(--tx-hi);margin:0 0 8px">Tokens</h1>
  <p style="font:400 12px/1.8 var(--mono);color:var(--dim);margin:0 0 32px">
    Verbatim from <code>src/styles/global.css</code>. Nothing outside this set is used
    anywhere on the site, and nothing new should be introduced ad hoc.
  </p>
  <p style="font:400 12px/1.8 var(--mono);color:var(--tx-body);margin:0 0 24px;padding:14px 18px;border-left:2px solid var(--cyan);background:var(--plate)">
    <b style="color:var(--cyan)">The accent ramp is a function, not a palette.</b>
    <code>hueAt(t)</code> in <code>src/lib/ramp.ts</code> moves hue 66 → 200 → 286 with
    lightness and chroma <em>locked</em> at .80 / .17. That lock is what stops sampled
    colours fighting each other. Any new accent must be a point on this ramp.
  </p>
  <div style="height:26px;margin:0 0 28px;background:linear-gradient(90deg,oklch(.82 .17 66),oklch(.8 .17 200),oklch(.8 .17 286))"></div>
  <table style="border-collapse:collapse;width:100%;font:400 12px/1.9 var(--mono);color:var(--tx-body)">
    ${rows.join('\n')}
  </table>
</div>
<style>
  td { padding: 3px 14px 3px 0; border-bottom: 1px solid var(--hairline-soft); }
  code { color: var(--tx); }
</style>`;

  return shell({
    title: 'Tokens',
    card: 'Tokens',
    group: 'Foundations',
    subtitle: 'Surfaces, text, the accent ramp, geometry.',
    css,
    body,
  });
}

async function buildMetadata(css, manifest, shoots) {
  const sample = manifest.find((e) => e.id === LIGHTBOX_SLUG) ?? manifest[0];
  const redacted = {
    ...sample,
    lqip: 'data:image/webp;base64,…',
    variants: sample.variants,
  };

  const shootRows = Object.entries(shoots)
    .map(
      ([id, s]) =>
        `<tr><td><code>${id}</code></td><td style="text-align:right">${s.count}</td><td>${esc(s.name ?? '—')}</td><td><code>${esc(s.series ?? '')}</code></td></tr>`,
    )
    .join('\n');

  const allTags = [...new Set(manifest.flatMap((e) => e.tags ?? []))];

  const body = `
<div style="padding:48px 70px;max-width:1000px">
  <h1 style="font:700 48px/1 var(--display);letter-spacing:-.04em;color:var(--tx-hi);margin:0 0 8px">The metadata</h1>
  <p style="font:400 12px/1.8 var(--mono);color:var(--dim);margin:0 0 32px">
    All of this exists and is populated. None of it is displayed anywhere yet — that is
    the thing to design.
  </p>

  <h2 style="font:700 22px var(--display);color:var(--tx-hi);margin:32px 0 10px">Three layers</h2>
  <table style="border-collapse:collapse;font:400 12px/1.9 var(--mono);color:var(--tx-body)">
    <tr><td><code>shoot</code></td><td>one per photo, automatic</td><td>the browsing unit — a single outing</td></tr>
    <tr><td><code>series</code></td><td>optional, spans shoots</td><td>joins recurring ones (two "Air Show" shoots)</td></tr>
    <tr><td><code>tags</code></td><td>3–8 per photo</td><td>${allTags.length} distinct across the library</td></tr>
  </table>
  <p style="font:400 12px/1.8 var(--mono);color:var(--tx-body);margin:20px 0;padding:14px 18px;border-left:2px solid var(--sodium);background:var(--plate)">
    <b style="color:var(--sodium)">Subsets are sparse.</b> Most photographs belong to no
    series and never will, and the miscellaneous fraction <em>grows</em> as more casual
    frames are imported. Any affordance implying these partition the library — a chip row
    across the top, tabs — is the wrong shape.
  </p>

  <h2 style="font:700 22px var(--display);color:var(--tx-hi);margin:36px 0 10px">Shoots, real</h2>
  <table style="border-collapse:collapse;width:100%;font:400 12px/1.9 var(--mono);color:var(--tx-body)">
    <tr style="color:var(--faint)"><td>id</td><td style="text-align:right">n</td><td>name</td><td>series</td></tr>
    ${shootRows}
  </table>

  <h2 style="font:700 22px var(--display);color:var(--tx-hi);margin:36px 0 10px">One photo, verbatim</h2>
  <pre style="font:400 11px/1.7 var(--mono);color:var(--tx-body);background:var(--plate);padding:18px;overflow-x:auto;border:1px solid var(--hairline)">${esc(JSON.stringify(redacted, null, 2))}</pre>
</div>
<style>
  td { padding: 3px 18px 3px 0; border-bottom: 1px solid var(--hairline-soft); vertical-align: top; }
  code { color: var(--tx); }
</style>`;

  return shell({
    title: 'Photo metadata',
    card: 'Metadata',
    group: 'Photos — current',
    subtitle: 'Shoots, series, tags, captions — populated, and displayed nowhere.',
    css,
    body,
  });
}

async function main() {
  const css = await pageCss('photos/index.html');
  const manifest = JSON.parse(
    await readFile(path.join(REPO_ROOT, 'src/data/photos.json'), 'utf8'),
  );
  // Tolerated when absent, same as readShoots — a library with no shoots yet
  // still deserves a bundle; the metadata card just renders an empty table.
  const shoots = await readFile(path.join(REPO_ROOT, 'src/data/shoots.json'), 'utf8')
    .then((raw) => JSON.parse(raw))
    .catch((error) => {
      if (error.code === 'ENOENT') return {};
      throw error;
    });

  await rm(OUT, { recursive: true, force: true });
  for (const dir of ['foundations', 'photos-current', 'pages-current']) {
    await mkdir(path.join(OUT, dir), { recursive: true });
  }

  /*
   * Every page, not just the photo ones. This is the design system for the
   * whole site, and a redesign of the gallery still has to sit inside the same
   * nav, footer, type scale and sky. Components Claude Design cannot see are
   * components it cannot keep you consistent with.
   */
  const pages = [
    ['index.html', 'Home', 'The rail, the plates, the star field.'],
    ['about/index.html', 'About', 'Long-form layout and the CV treatment.'],
    ['blog/index.html', 'Log index', 'The post list.'],
    [
      'blog/a-brave-neo-world/index.html',
      'Log post',
      'Prose: the serif, code blocks, headings.',
    ],
    ['404.html', 'Not found', ''],
  ];

  const files = {
    'foundations/tokens.html': await buildTokens(css),
    'photos-current/contact-sheet.html': await buildSheet(),
    'photos-current/lightbox.html': await buildLightbox(css, manifest),
    'photos-current/metadata.html': await buildMetadata(css, manifest, shoots),
  };

  for (const [rel, card, subtitle] of pages) {
    files[`pages-current/${card.toLowerCase().replace(/\s+/g, '-')}.html`] =
      await buildPage(rel, {
        card,
        group: 'Pages — current',
        subtitle,
        note:
          '<b>The live page as built.</b> Scroll-driven effects and page transitions ' +
          'are JavaScript and are inert here, so anything that animates in is shown ' +
          'in its resting state.',
      });
  }

  for (const [name, html] of Object.entries(files)) {
    await writeFile(path.join(OUT, name), html, 'utf8');
    console.log(`  ${name}  ${(html.length / 1024).toFixed(0)} KB`);
  }
  console.log(`\nWrote ${Object.keys(files).length} file(s) to .design-bundle/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
