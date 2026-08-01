# Performance analysis — Firefox profile, 2026-07-31

A 37.8 s Firefox Profiler recording (1 ms interval, all threads, screenshots on) of a full
browse: home → scroll → /photos → scroll to bottom → jump to top → lightbox → next ×
several → /blog → scroll → post → scroll → /about → scroll. macOS, 120 Hz display,
Firefox 152. Source: `Firefox 2026-07-31 20.19 profile.json.gz` (Matthew's Downloads).

**Headline: initial load and responsiveness are good. The problem is steady-state burn.**
The page keeps the refresh driver, the main thread and WebRender busy at up to 120 fps
the entire time it is open — rebuilding the full display list on nearly every frame —
and re-downloads its fonts and icons on every client-router navigation. Nothing here is
jank the user sees today on a desktop; it is CPU, battery and network being spent for no
visual difference, and it is the same work that would become jank on a slower device.

## 1. Recording caveats (read before trusting any number)

- **DevTools was open.** The inspector's reflow/walker actors show up in the content
  process (~0.5 s of JS: `reflow.js`, `walker.js`, `event-emitter.js`) and its reflow
  tracking amplifies layout activity. Content-JS numbers below are upper bounds.
- **Profiler screenshots were on.** 4,532 `CompositorScreenshot` readbacks — one per
  composited frame — inflate the GPU-process Renderer numbers and force a render per
  vsync (`Render reason ASYNC_IMAGE` on all 4,533 frames). The *relative* per-phase
  comparison stands; the absolute Renderer total does not.
- **uBlock's content script** cost ~140 ms of the content JS.
- A second tab with an old `/photos` load (pid 12595) sat at ~92 MB and ~3 ms CPU —
  background-tab throttling works; it is not part of the story.

For a clean re-measure: fresh profile without DevTools, without screenshots, extensions
disabled, and let each page sit *idle* for 10 s — the idle segments are where the wins
below will show up.

## 2. The session, in numbers

Phases (from navigation markers in the content process, pid 45631):

| Phase | Wall | Main-thread CPU | Utilization |
| --- | --- | --- | --- |
| home | 7.7 s | 1,356 ms | 18 % |
| /photos + lightbox | 20.0 s | 4,232 ms | 21 % |
| /blog index | 1.5 s | 145 ms | 10 % |
| blog post | 3.2 s | 369 ms | 12 % |
| /about | 6.4 s | 390 ms | 6 % |

Content main thread total: 6.63 s CPU, of which ~2.5 s is idle/wait. The ~4.1 s of real
work splits: **Graphics 2.14 s** (display-list building), **Layout 1.04 s** (6,851 style
flushes = 709 ms; 1,110 sync reflows = 570 ms), JS 379 ms (≈ half of it DevTools +
extension), GC/CC 64 ms (negligible).

Other processes over the same window: GPU Renderer **21.0 s** CPU (inflated per §1, but
structurally busy: 4,533 frames rendered, picture cache invalidated on every one, avg
3.4 ms/frame), GPU compositor 0.9 s with **30,589 `SampleAnimation`** calls, parent
process 4.1 s + 3.1 s compositor.

The render-loop tell: **8,296 `SetDisplayList` transactions vs 162 empty transactions.**
Almost every frame that reached the compositor carried a freshly rebuilt scene — the
main thread was repainting, not just the compositor animating. `RefreshDriverTick` ran at
~119/s on home, photos and the blog post; it should be ~0 on an idle page.

Frame-level health is fine: max tick 46 ms, `CONTENT_FULL_PAINT_TIME` avg 1.9 ms, max
event delay 90 ms (never over 100), LCP ~190 ms, `DocumentLoad` 257 ms.

**Memory** (net allocations, malloc counter): content process ~65 MB on home → ~100 MB
with the gallery up → **peak 280 MB while stepping the lightbox** (2560 px AVIF decodes;
~180 MB spike) → settles back to ~95 MB. No leak — it all returns. GPU process 171–198 MB
(texture cache; 1,335 texture uploads). The lightbox spike is expected behaviour, just
worth a look (§4.7).

**Network**: 322 requests, 13.7 MB. Gallery scroll-to-bottom: 257 × 640 px = 6.0 MB
(~23 KB avg — the rung strategy works). Lightbox: 15 × 2560 px = 5.9 MB (~400 KB each).
And then the waste described in §4.1.

## 3. Root causes

Three structural facts produce nearly all of the burn:

**A. Infinite animations of main-thread paint properties.** Two keyframe animations
animate properties WebRender cannot run on the compositor, so every frame goes back
through style → display list → raster:

- `travel` — `background-position` on `.tube-spec` (home hero tube,
  `src/pages/index.astro:412`, keyframes `src/styles/global.css:850`), also used by
  `.plate:hover .plate-charge` (`global.css:801`). Ran ~14.5 s of the session. This alone
  explains home's 111 display lists/s *while nobody scrolls*.
- `headBreathe` — `box-shadow` on the blog-post progress head
  (`src/pages/blog/[...slug].astro:128`). Infinite, 2.8 s period, active the whole time a
  post is open.

**B. Per-frame style writes during scroll that hit layout or paint.** `src/scripts/fx.ts`
is already carefully staged (read-then-write, converging chase — the architecture is
right), but some of what it writes per frame is expensive by property choice:

- `.progress` bar `width` (`fx.ts:243`) — layout + paint, every scrolled frame, on every
  page.
- `resolve` headings write `filter: blur()` **and `letter-spacing`** per frame
  (`fx.ts:272–275`) — letter-spacing reflows the heading; blur re-rasterizes it. Bounded
  (stops when settled) but concentrated exactly where scroll frames are tightest.
- Rail dots write `box-shadow` per frame while lighting (`fx.ts:224`) — paint, bounded by
  the 0.004 threshold.

**C. The gallery double-paints every tile, forever.** Each `<img>` carries its LQIP as a
permanent inline `background-image` data-URI (`src/components/PhotoTile.astro:152`,
`PhotoThumb.astro:95`, `Photo.astro:60`). Once the real photo loads, the placeholder is
invisible — but it stays in the display list. Of **84,501** image display-items painted
in this session, ~39 k were data-URI placeholders sitting *under* already-loaded
photographs; one tile's sources were painted 1,811 times. Every display-list rebuild on
/photos pays for 232 images twice.

Also structural but compositor-side: the home hero runs five infinite compositor
animations (`twinkle` 9 s, `skyDrift` 90 s, `shoot` 24/37 s, `neonFlicker` 15 s,
`fogSlow` 40 s). They are correctly on the compositor — but they never stop, so the
compositor samples animations (30 k times) and renders at up to 120 fps even when the
page is idle or the hero is scrolled out of view.

## 4. The work, broken into tasks

Ordered by (impact ÷ effort). None change what the site looks like.

### 4.1 Cache-Control headers for static assets — network, every visit

Every asset served from `memerson.com` ships `cache-control: public, max-age=0,
must-revalidate` (the Workers Static Assets default). Consequence, measured: fonts
(23/32/132/148 KB), `favicon.svg` and `apple-touch-icon.png` were re-fetched **six times
each** in this one session — full 200 + body on every client-router navigation, ~210 KB+
per navigation. Meanwhile `photos.memerson.com` already serves
`max-age=31536000, immutable` (correct).

Fix: add `public/_headers` (Workers Static Assets supports `_headers`):

```
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/favicon.svg
  Cache-Control: public, max-age=86400
/apple-touch-icon.png
  Cache-Control: public, max-age=86400
```

`_astro/*` filenames are content-hashed and `fonts/*` are effectively versioned by
rarity of change; both are safe as immutable. HTML stays at the revalidate default,
which is what makes deploys land. Verify with `curl -sI` after deploy and by checking a
profile shows zero font requests after the first navigation.

### 4.2 Drop the LQIP once the photo has loaded — display-list cost on /photos

Halves the image items in the gallery's display list (§3C). Smallest change: in the
gallery/lightbox init (`src/scripts/photos.ts`), on each tile image's `load` (and for
already-complete images at init), clear the inline background:

```ts
if (img.complete) img.style.backgroundImage = 'none';
else img.addEventListener('load', () => { img.style.backgroundImage = 'none'; }, { once: true });
```

Keep the LQIP markup itself — it is what makes tiles honest before load and without JS.
Apply the same to `Photo.astro` images via a shared helper if convenient. Verify: a
profile scrolled over /photos shows `Image Paint` markers for `data:` URIs only before
loads, not after.

### 4.3 Pause the hero's infinite animations when they can't be seen — idle burn

The five compositor animations plus `travel` run whenever the home page exists, even
with the hero scrolled away or the tab hidden (browsers throttle hidden-tab rAF but
compositor animations keep the refresh driver warm). One IntersectionObserver on the
hero (or the `.sky` container) toggling a class:

```css
.hero.is-offscreen :is(.sky-mid, .sky-far, .shot, .sign, .haze-2, .tube-spec) {
  animation-play-state: paused;
}
```

This is the main fix for "the site is never idle": with the hero out of view, the home
page's refresh driver should go quiet between scrolls. Reduced-motion already disables
all of this (`global.css:1249`), so the observer only manages the animated case.

### 4.4 Make `travel` and `headBreathe` compositor-friendly — main-thread paint per frame

Same visuals, different property:

- `travel`: animate a child/pseudo-element with `transform: translateX(-145%→145%)`
  instead of `background-position` on the element. The gradient stripe becomes the
  moving element; `overflow: hidden` on the tube already clips it. Applies to both
  `.tube-spec` and `.plate-charge`.
- `headBreathe`: put the glow on a `::after` (same box-shadow, pre-rendered once) and
  animate its `opacity` between the two intensity states. Two shadows cross-fading reads
  identically to a shadow interpolating.

After 4.3 + 4.4, a profile idling on home or a blog post should show `SetDisplayList`
near zero. That is the acceptance test.

### 4.5 Progress bar: `transform: scaleX()` instead of `width` — layout per scrolled frame

`fx.ts:243` writes `width` every frame of every scroll on every page. Set
`transform-origin: left` in CSS and write `transform: scaleX(${p})` instead — no layout,
compositor-only, and the 1 px-tall bar is visually incapable of showing scaling
artifacts. Touches `fx.ts` and the `.progress` rule only.

### 4.6 Soften the `resolve` write set — reflow during heading entry

Bounded, so lower priority, but it lands during scroll frames. Options in increasing
order of ambition (pick 1; the others are recorded so we don't re-litigate):

1. Quantize `p` (e.g. to 1/24ths) so a resolving heading writes ~24 times instead of
   every frame at 120 Hz. Threshold already exists (`fx.ts:251`); this just coarsens it.
2. Drop the per-frame `letter-spacing` write (the reflowing one); keep blur + opacity.
   Letter-spacing then transitions via CSS once at settle.
3. Leave as is — it converges and never runs on a settled page.

Note the `redraw.ts` caveat: anything touching these effects still needs the manual
device pass (docs/TESTING.md §3.6).

### 4.7 Lightbox decode spike — memory, nice-to-have

Stepping the lightbox decoded ~180 MB above baseline (peak 280 MB net-alloc), fully
reclaimed afterwards. Not a leak, and desktop absorbs it — but iOS was the platform that
already killed this page once over decoded-bitmap pressure (see the comment at
`src/pages/photos/index.astro:713`). Worth: (a) confirming the viewer drops the
*previous* slide's `<img>` src / lets it leave the DOM rather than accumulating siblings,
and (b) using `img.decode()` before swap so decode happens off the click path. Measure on
device, not in this desktop profile.

### 4.8 Sticky section headers' `backdrop-filter` — GPU per scrolled frame

`.sec-head` is `rgba(3,4,10,0.94)` + `backdrop-filter: blur(10px)`
(`global.css:627–628`). A backdrop blur re-samples everything under it on every frame it
moves or content under it changes. At 94 % opacity the blurred contribution is nearly
invisible. Candidate: make it opaque and drop the filter — but this is a Neon District
design token call, so check docs/UI-DESIGN.md / the design boards before changing;
measure first with a targeted profile (scroll /blog with and without).

### 4.9 Re-profile clean, and once per release

After 4.1–4.5 land: record the same journey without DevTools/screenshots/extensions,
plus 10 s idle on home, /photos and a post. Compare: `SetDisplayList` count while idle
(target ≈ 0), `RefreshDriverTick`/s while idle (target ≈ 0), font requests after first
nav (target 0), image-paint count on /photos (target ≈ half of today), content-main CPU
per phase. The phase table in §2 is the baseline.

## 5. What was checked and is fine

Worth recording so nobody "fixes" it later:

- **fx.ts architecture** — measure/paint split, read-then-write, converging chase,
  settle timer. The remaining cost is property choice (§4.5/4.6), not structure.
- **Gallery images**: `loading="lazy"`, `decoding="async"`, `content-visibility: auto`
  on tiles, aspect-ratio boxes (no reflow on load), srcset rungs — a full scroll of 232
  frames cost 6.0 MB, ~23 KB per thumb. The photo pipeline is doing its job.
- **JS weight**: the site's own scripts are small (2.7–6.7 KB each) and its total JS CPU
  over 38 s of heavy use was under 400 ms including DevTools noise.
- **Initial load**: LCP ~190 ms, DocumentLoad 257 ms, fonts h3 + preloaded.
- **View-transition wipes** (`redrawWipe`/`redrawEdge`): 300 ms, compositor, done.
- **No unbounded growth**: memory returns to baseline after the lightbox; GC/CC totals
  are trivial; the tag-filter/view-switching reparenting design shows no re-render cost
  in the profile (tile moves, not rebuilds — as designed).
