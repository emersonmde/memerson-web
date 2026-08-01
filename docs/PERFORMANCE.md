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
  vsync (`Render reason ASYNC_IMAGE` on all 4,533 frames). The _relative_ per-phase
  comparison stands; the absolute Renderer total does not.
- **uBlock's content script** cost ~140 ms of the content JS.
- A second tab with an old `/photos` load (pid 12595) sat at ~92 MB and ~3 ms CPU —
  background-tab throttling works; it is not part of the story.

For a clean re-measure: fresh profile without DevTools, without screenshots, extensions
disabled, and let each page sit _idle_ for 10 s — the idle segments are where the wins
below will show up.

## 2. The session, in numbers

Phases (from navigation markers in the content process, pid 45631):

| Phase              | Wall   | Main-thread CPU | Utilization |
| ------------------ | ------ | --------------- | ----------- |
| home               | 7.7 s  | 1,356 ms        | 18 %        |
| /photos + lightbox | 20.0 s | 4,232 ms        | 21 %        |
| /blog index        | 1.5 s  | 145 ms          | 10 %        |
| blog post          | 3.2 s  | 369 ms          | 12 %        |
| /about             | 6.4 s  | 390 ms          | 6 %         |

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

The two places long tasks actually clustered: the **view-transition swap into /photos**
(~200 ms of main thread across 150 ms wall: 55 ms style/layout flush in the update
callback, 53 ms module evaluation, 62 ms input-move flush — the 232-tile DOM landing at
once; this is the moment behind the 90 ms max event delay, and the number to watch
against the frame-count threshold in docs/ARCHITECTURE.md §6), and **lightbox stepping**
(20–45 ms synchronous image paints, §4.7).

One number that looks like a cause but is a symptom: 2.1 s total of "Coalesced input
move flusher" (966 flushes, 574 of them on /photos). Gecko flushes pending style/layout
before dispatching mouse moves — no site script listens to pointermove at all — so this
is the per-frame animation/scroll writes from §3 being paid _again_ at input time. It
shrinks to nothing when §4.3–4.5 land; it is not separate work to fix.

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
  explains home's 111 display lists/s _while nobody scrolls_.
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
in this session, ~39 k were data-URI placeholders sitting _under_ already-loaded
photographs; one tile's sources were painted 1,811 times. Every display-list rebuild on
/photos pays for 232 images twice.

Also structural but compositor-side: the home hero runs five infinite compositor
animations (`twinkle` 9 s, `skyDrift` 90 s, `shoot` 24/37 s, `neonFlicker` 15 s,
`fogSlow` 40 s). They are correctly on the compositor — but they never stop, so the
compositor samples animations (30 k times) and renders at up to 120 fps even when the
page is idle or the hero is scrolled out of view.

## 4. The work, broken into tasks

Ordered by (impact ÷ effort). None change what the site looks like.

**Status (2026-07-31): 4.1–4.8 are implemented.** What each landed as: 4.1
`public/_headers`; 4.2 `src/scripts/placeholders.ts` (loaded from BaseLayout); 4.3 an
IntersectionObserver in `index.astro` parking the hero's animations off screen — scoped
to the hero only, because the star field is viewport-fixed and visible at every scroll
position, so `twinkle`/`skyDrift` are the design's deliberate always-on floor and were
left running; 4.4 `travel` became a translated `::after` stripe (`chargeTravel` /
`tubeTravel`) and `headBreathe` became an opacity cross-fade of a second glow; 4.5 the
progress bar scales and its head (now a sibling, formerly `::after`) translates; 4.6
option 1, quantized to 24 steps; 4.7 pre-decode via a detached `Image` before the srcset
swap; 4.8 the bloom now sources `dataset.lqip`. 4.9 is deliberately **not** done — it is
a design-token call that wants its own measurement first. 4.10 (the clean re-profile) is
the outstanding verification, and 4.3–4.6 touch compositor-adjacent CSS and fx.ts, so
they also owe the manual device pass from docs/TESTING.md §3.6.

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
else
  img.addEventListener(
    'load',
    () => {
      img.style.backgroundImage = 'none';
    },
    { once: true },
  );
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

### 4.7 Lightbox stepping: decode before swap — dropped frames + memory spike

Two measured costs, one fix. Every "next" through the lightbox produced a synchronous
main-thread `Image Paint` of the incoming 2560 px AVIF, **20–45 ms each** (19 steps over
15 ms in this session; the worst, 44.8 ms, blew a 45.8 ms refresh tick — 3–5 dropped
frames per step at 120 Hz). The same stepping run drove the content process's ~180 MB
decode spike (peak 280 MB net-alloc, fully reclaimed afterwards — not a leak).

The srcset-swap design in `show()` (`src/scripts/photos.ts:844–850`) is right; what's
missing is forcing the decode off the paint path. Pre-decode the chosen large derivative
in a detached image, then hand the already-decoded bytes to the visible `<img>`:

```ts
const pre = new Image();
pre.sizes = VIEWER_SIZES;
pre.srcset = set;
pre.decode().then(() => {
  if (token !== epoch) return;
  lbImg.sizes = VIEWER_SIZES;
  lbImg.srcset = set;
});
```

(Keep the epoch guard; a stale decode must not clobber a newer slide.) Optionally warm
the next/prev tiles' 640s on open. Desktop absorbs the memory spike, but iOS was the
platform that already killed this page once over decoded-bitmap pressure (see the
comment at `src/pages/photos/index.astro:713`) — verify there per docs/TESTING.md §3.6.

### 4.8 Stale bloom between lightbox opens — drive the bloom from the LQIP

Observed in use: open a photo, close, open another — the _previous_ photo's bloom stays
up until the new background arrives. Mechanism, from the code: `show()` swaps
`.lb-bloom`'s `background-image` to the new tile's `currentSrc`
(`src/scripts/photos.ts:830–831`), and when that URL isn't decoded yet Gecko keeps
painting the old background (the `transition: background-image 0.45s` at
`src/pages/photos/index.astro:1344` doesn't help — Gecko treats background-image as
discretely animatable). The fallback is worse: a tile whose image never loaded falls back
to `tile.href` — the **widest** derivative — as both slide and bloom source
(`photos.ts:801`).

Fix: source the bloom from `tile.dataset.lqip` instead of the derivative. It is a data
URI already in the DOM (zero latency — staleness becomes impossible), and under
`blur(70px) saturate(2.2)` (`index.astro:1341`) it is visually indistinguishable from
blurring the 640 px file — the same argument the bloom's own comment makes for using the
smallest rung. It also makes the blur(70px) re-raster cheaper (tiny source bitmap) and
drops the bloom's dependency on image cache state entirely. The shoots sheet buttons
(`photos.ts:957–958`) make their own use of `data-bloom` — leave that path alone, or
give it the same treatment separately.

**Follow-up (owner-observed after the first fix): the LQIP source was necessary but not
sufficient.** The bloom still lingered on close-and-reopen because the _transition_ held
it there: `transition: background-image 0.45s` cross-fades old→new in Blink/WebKit
(450 ms of the previous photo, by definition) and in Gecko — where background-image is
discretely animatable — just delays the flip to the 225 ms midpoint. The fix is
structural: `.lb-bloom` is now two layers that alternate, incoming image fading in by
_opacity_ over the outgoing — correct light from the first frame, the same softness in
every engine, and the blur now sits per-layer so a swap rasterizes one surface once
instead of re-blurring every frame of the fade. A fresh open (viewer was closed) skips
the fade entirely; there is nothing on screen worth fading from. Verified in a real
browser: on reopen the visible layer carries the new tile's LQIP at full opacity on the
first frame.

### 4.9 Sticky section headers' `backdrop-filter` — GPU per scrolled frame

`.sec-head` is `rgba(3,4,10,0.94)` + `backdrop-filter: blur(10px)`
(`global.css:627–628`). A backdrop blur re-samples everything under it on every frame it
moves or content under it changes. At 94 % opacity the blurred contribution is nearly
invisible. Candidate: make it opaque and drop the filter — but this is a Neon District
design token call, so check docs/UI-DESIGN.md / the design boards before changing;
measure first with a targeted profile (scroll /blog with and without).

### 4.10 Re-profile clean, and once per release

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
- **GC pressure**: 3 major GCs in 38 s (worst 61 ms, sliced; minor slices ≤ 6 ms),
  53 nursery collections totalling 16 ms. Timer churn is trivial (374 setTimeout
  callbacks, 34 ms total). Nothing allocation-shaped to fix.
- **Event handling**: no pointermove/mousemove listeners in site code; the legacy
  wheel/scroll event trio dispatches ~10 k times but costs ~15 ms total. Scroll and
  scrollend handlers (fx.ts) total ~300 ms across 3,130 scroll events — thin.
- **No unbounded growth**: memory returns to baseline after the lightbox; the
  tag-filter/view-switching reparenting design shows no re-render cost in the profile
  (tile moves, not rebuilds — as designed).

One blind spot to carry into any future reading of this profile: Firefox decodes images
on `ImgDecoder` worker threads, and none were captured in this recording — the decode
cost of 278 photo loads is invisible here except where it leaks onto the main thread
(the §4.7 paints). A future profile wanting decode truth needs those threads included.

## 6. How the analysis and the fixes were done

Recorded so the method is repeatable, because the interesting part was not the tooling —
it was which numbers turned out to mean something.

**Reading the profile.** The recording is a 245 MB processed-format JSON (51 MB gzipped),
far past what the profiler UI or a text editor handles comfortably, so the analysis was
Node scripts against the raw tables: markers (name/start/end/phase/payload), samples
(stack index + `threadCPUDelta` per 1 ms tick), the shared stack/frame/func tables, and
the per-process `malloc` counters. Three format details cost time and are worth writing
down: newer profiles share one string/stack/frame table across all 53 threads
(`profile.shared`, with `prefixOffset` delta-encoding for stack parents); marker
durations are only real when `phase == 1` — treating interval-_start_ markers as
intervals manufactures phantom 160-second tasks, which briefly polluted the first pass;
and sample `timeDeltas` accumulate to absolute timestamps, not profile-relative ones.

**Finding the story.** The session was segmented into per-page phases using the
document `Load` network markers (the client router makes the whole journey one process),
and every metric was bucketed per phase. The single most diagnostic ratio was
`SetDisplayList` vs `EmptyTransaction` on the GPU-process compositor thread — 8,296 full
scene rebuilds against 162 empty transactions is the difference between "the compositor
is animating" and "the main thread is repainting". From there, Gecko's per-animation CSS
markers (`CSSAnimation`/`CSSTransition` payloads carry the property, the target element
and an `oncompositor` flag) named the exact selectors responsible, and the `Image Paint`
markers' payloads exposed the LQIP double-painting — half the 84 k paints were `data:`
URIs. Every finding was then confirmed in source before it went in this document; two
"findings" died that way (the sky is viewport-fixed and visible everywhere, so pausing
it would be a regression, and the input-move flusher turned out to be a symptom).

**Separating signal from instrument.** Three contaminants had to be identified and
discounted before the numbers were trustworthy: DevTools' reflow/walker actors (~0.5 s
of apparent site JS), the profiler's own per-frame screenshot readbacks (4,532 of them,
inflating the GPU renderer total and forcing a render every vsync), and an ad-blocker
content script. The report quotes upper bounds where those overlap.

**The fixes.** Each change replaces a mechanism, not a look: same pixels at rest,
different cost while moving. The pattern behind nearly all of them is the same one —
move work from the main-thread paint pipeline to the compositor, or from steady-state
to once:

| Change                     | Was                                   | Is now                            |
| -------------------------- | ------------------------------------- | --------------------------------- |
| Fonts/icons per navigation | max-age=0, six re-downloads each      | immutable, cached                 |
| LQIP after image load      | painted under every tile forever      | cleared on `load`                 |
| Tube pulse, plate charge   | `background-position` (paint, ∞)      | translated `::after` (compositor) |
| Progress head breathe      | `box-shadow` interpolating (paint, ∞) | glow overlay opacity (compositor) |
| Progress bar advance       | `width` (reflow per scrolled frame)   | `scaleX()` (compositor)           |
| Heading resolve ramp       | write per 120 Hz frame                | 24 quantized writes total         |
| Lightbox step              | sync 2560 px decode on paint path     | detached `Image.decode()` first   |
| Lightbox bloom             | derivative URL (can arrive late)      | LQIP data URI (cannot)            |
| Hero animations off screen | running forever                       | `animation-play-state: paused`    |

Verification so far is the desktop gates (astro check clean, 101 unit tests, 150
Playwright tests across seven breakpoints — including the pixel baselines for the hero
sign/tube and chrome, which is what certifies "same pixels at rest"), plus live header
checks after deploy. Still owed: the §4.10 clean re-profile and the docs/TESTING.md §3.6
device pass for the compositor-adjacent changes.

## 7. An engineering opinion: why this site is fast, and where it spends

An honest assessment of the architecture, written after taking it apart frame by frame.
Short version: the site is fast because its expensive problems were solved at build time
or by decree, and the profile's findings were all in the one place where work happens at
runtime — the ornament layer. That is the right failure distribution.

**The static-by-decree hosting is the foundation everything else stands on.** No SSR, no
adapter, no runtime data fetching — every page is a file, served from the edge, and the
measured result is a 190 ms LCP and a 257 ms DocumentLoad on a page carrying a full
design system. The architecture doc frames this as an operational decision (the old
site's runtime API dependency is what has kept AWS alive); the profile shows it is also
the performance decision. There is nothing to optimize in a request path that does not
exist.

**The JavaScript posture is the rarest thing here: a styled, animated, interactive site
whose own scripts total ~16 KB and under 400 ms of CPU across 38 s of hard use.** No
framework runtime, no hydration, no component re-rendering — Astro ships the site's
five hand-written vanilla modules and nothing else. The gallery's core trick
(server-render every tile once, then _reparent_ the same DOM nodes between views instead
of re-rendering them) is why switching views costs nothing and why the page carries no
second copy of the manifest. Most sites this visual carry two orders of magnitude more
script. The discipline that keeps it this way is architectural, not stylistic: content
is data at build time (three collections), so no client code ever has to know how to
construct the page.

**The image pipeline is the strongest technical work in the repo.** The decisions
compound:

- **Pre-generated derivatives, never CI, never runtime.** Seven rungs
  (640/1024/1536/2048/2560/3840/5120, never upscaled), encoded once at import on the
  machine that has the originals. The build never touches an image, so a photo import
  cannot slow a deploy, and there is no image CDN bill and no cold-cache re-encode risk.
- **AVIF first, WebP as the universal floor.** `<picture>` offers AVIF then WebP, and
  the bare `<img src>` is WebP — a deliberate choice that the no-JS/no-`<picture>` path
  is still a modern codec, since everything that can render this site's CSS can decode
  WebP. JPEG is correctly absent. Measured payoff: **~23 KB per 640 px thumbnail**; a
  full scroll of all 232 frames costs 6.0 MB, which is one hero image on a lot of
  portfolio sites.
- **Two quality tiers split by audience.** Rungs ≤ 1536 encode at AVIF q50/WebP q80 —
  artifacts are invisible at tile size; rungs ≥ 2048 go q62/q88 because only the
  lightbox ever selects them and there a compression artifact reads as a flaw in the
  photograph. Spending bytes exactly where eyes will be is the whole game with `srcset`,
  and most pipelines use one number everywhere.
- **The layout never learns anything from an image.** Aspect ratios ship in the
  manifest and become CSS `aspect-ratio` boxes, so zero layout shift is structural, not
  hoped for. LQIP data URIs paint inside those boxes before the network answers (and,
  since §4.2, leave when the photograph arrives).
- **`content-visibility: auto` on tiles** is the reason a 232-frame single page is
  viable at all — offscreen tiles cost no rendering and no decoded bitmap, which is
  what stopped iOS from killing the page. The un-paginated gallery is a real trade
  (the ~200 ms swap in §2 is its price, and ARCHITECTURE §6 records the frame count
  where it stops being defensible), but the profile supports it at today's size.
- **R2 behind a plain custom domain with immutable caching**, not proxied through the
  Worker. The photo request path is DNS → edge cache → done; there is no code in it.

**The effects layer is where all the findings were, and even there the architecture was
right — the properties were wrong.** fx.ts is built the way scroll effects should be
and almost never are: one read phase, one write phase, a converging charge that stops
scheduling frames when it lands, caches invalidated by ResizeObserver rather than
polling. Every §4 fix in that layer kept the structure and changed only _what_ gets
written (transform instead of width, opacity instead of box-shadow, 24 steps instead of
120 Hz). The lesson worth keeping: **on the modern web, which property you animate
matters more than how much you animate it.** A 2 px progress bar animated by `width`
cost more per frame than the entire star field, because one ran layout on the main
thread and the other interpolates a matrix on the compositor.

**What the site deliberately pays for, with eyes open.** The viewport-fixed star field
animates forever on every page — that is the design's ambient floor, it is
compositor-only, and after §4.3 it is the _only_ thing left running on an idle page.
The big blurs (70 px nebulas, 46 px haze, the 10 px backdrop-filter under sticky
headers) are GPU spend for atmosphere; WebRender caches them well as long as nothing
invalidates every frame, which is exactly what the §4 fixes stopped. `prefers-reduced-
motion` zeroes all of it. This is the correct shape for ornament cost: bounded,
compositor-side, opt-out-able, and paid only while the page is actually being looked at.

**Weaknesses, so this section is an assessment and not a brochure:** steady-state
efficiency regressed invisibly precisely because the site _feels_ fast — nothing here
janked; the waste was only visible in a profiler, and it took a deliberate recording to
find fonts being re-downloaded on every navigation. The single-page gallery has a real
scaling ceiling and now carries the largest one-time task in the profile. The lightbox
still allocates ~180 MB stepping through 2560 px decodes (better after §4.7, unmeasured
on the platform that actually enforces memory limits). And the whole analysis is one
desktop browser on one machine — the real-device pass is not optional, it is where two
of this repo's past bugs lived.

Overall: this is what a performant content site looks like in 2026 — not because any
single trick is exotic, but because the expensive decisions (hosting, images, JS budget)
were made once, structurally, and the cheap decisions (which CSS property carries an
animation) were the only ones that ever needed fixing.
