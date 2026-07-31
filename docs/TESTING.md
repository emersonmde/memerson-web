# memerson-web — Testing

```bash
npm test            # build, then every node:test suite
npm run test:unit   # pure logic only, no build needed (~0.1s)
npm run check       # astro check — types and diagnostics, keep at 0
npm run test:e2e    # real-browser suite (Playwright); builds + previews dist itself
```

Layers 1 and 2 use no test framework and no dependencies: Node 24 runs TypeScript
and ships `node:test`. Note that `node --test` wants file paths or a glob, **not**
a bare directory — `node --test tests/` fails with "Cannot find module".

Layer 3 (real browser) uses **Playwright** as its one devDependency (plus
`@axe-core/playwright` for §3.5). §3 records why that reverses an earlier
decision, and §4 is the build-out plan — **completed 2026-07-30**, T1–T6, each
gate verified including T3's churn-immunity check. The specs live in `e2e/`,
the baselines in `e2e/__screenshots__/`.

---

## 1. What these are for

The site is going to keep changing in two different ways, and the test strategy
has to distinguish them:

- **Content churn** — new photos, new posts, new projects. This happens
  constantly and must require **zero test updates**. A suite that cries wolf on
  every import stops being an alarm.
- **Code change** — refactoring, optimization, redesign. This is what the suite
  exists to police: any change to the look, feel, or behaviour of the site must
  be a **deliberate** one, visible as a failing test that a human then updates
  on purpose.

That distinction drives how everything is written. For logic and structure:
**assert invariants, not values.** A test that pinned "at scroll 800 the head is
at 368px" would break the next time a plate gained a line of text, and it would
be right to break while telling you nothing useful. What has to stay true is
that the head is on screen for the whole run — and that holds at any rail
length.

For rendering, the rule refines into a doctrine (§3.1): **pixel-pin the pattern
once, invariant-test the repetition.** Pixels are values, and pinning them is
the point of visual regression testing — but only ever pin pixels that content
churn cannot touch.

---

## 2. The existing layers

### 2.1 Pure logic — `rail`, `runs`, `content`, `manifest`, `shoots`, `ambient`, `sheet`

Fast, no browser, no build. The interesting one is **`tests/rail.test.ts`**,
which covers the charge geometry that decides where the light sits.

`src/lib/rail.ts` exists so that maths is reachable from a test. It used to be
inline in `src/scripts/fx.ts`, tangled up with DOM reads, where nothing could
get at it. Pure functions there, DOM reading in `fx.ts`.

What it guards:

- **The head is on screen for the entire run.** Swept across five viewport
  heights and seven rail lengths (400px to 9000px), scrolling each combination
  end to end. This is the property the anchored formula exists to provide, and
  the reason there is no tuned speed multiplier to drift.
- The charge is 0 at the origin, exactly 1 as the terminal enters view, and
  never runs backwards while scrolling down.
- The rendered head position agrees with the closed form the design is stated
  in, so the doc and the code cannot quietly diverge.
- The charge always outruns the scroll, at any rail length.
- **Nodes light in rail order.** Whatever the plate sizes, a node higher up is
  never less lit than one below it — which is what "the charge races down"
  means, and it survives any change to plate height or spacing.
- A rail shorter than the viewport degenerates cleanly.

`tests/content.test.ts` covers the accent ramp — that lightness and chroma stay
locked at every sample point, that hue never reverses, and that any project
count still spreads across the whole ramp — plus reading-time estimation.

`tests/manifest.test.ts` covers slugs and hashing, and asserts things about the
committed `photos.json` itself: geometry present and self-consistent, no
derivative above the 5120px cap, nothing upscaled past its original,
LQIPs small enough to inline, slugs unique and matching their own hash, and
**no location data anywhere in the file**.

`tests/shoots.test.ts` covers the shoot clustering, and it is the clearest case
in the suite of testing invariants over values. It never asserts "14 shoots" —
that number changes with every import. It asserts the properties that must hold
at any library size:

- A split happens exactly where the gap exceeds the threshold, and nowhere else.
- Raising the threshold can only **merge** clusters, never produce more.
- Every photo lands in exactly one cluster, whatever order they arrive in.
- Undated photos are reported, never guessed into a group.
- A shoot id is the earliest date in its group, so it never renumbers.

Three of them guard the rule that protects hand-written names, and they are the
reason to have this file at all: an existing `shoot` is never reassigned, a new
photo **extends** a shoot rather than starting a rival one, and a photo landing
between two already-named shoots **must not merge them**. That last one is the
failure that would silently reattach a name to the wrong photographs, and it is
untestable by inspection — it only shows up on an import months later.

`mergeShoots` is tested directly rather than through `writeShoots`, which is why
the merge logic is a separate pure function. An earlier version mocked
`node:fs/promises`; ESM namespace objects cannot be redefined, so the test
failed with `Cannot redefine property` — a good prompt to move the logic rather
than fight the mock.

### 2.2 Built output — `tests/build.test.ts`

Assertions against `dist/`, which is why `npm test` builds first.

Every bug this file guards against was one that type-checking and a green build
did not catch, because each was a _semantic_ failure in correct-looking markup.
Checking source asks "did I write the thing?"; checking `dist` asks "did the
thing happen?" — and only the second survives templating.

The regressions it locks down, all of which actually shipped:

| Guard                                       | The bug it caught                                                            |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| Every image has non-empty `alt`             | 122 of 133 images shipped `alt=""` — two components, two copies of the logic |
| No mockup annotation in copy                | "TUBE FEEDS THE RAIL", "nothing samples a palette" shipped as site text      |
| `resolve` keys off `data-fx`, never a class | Headings sat permanently blurred because CSS and JS used different hooks     |
| The glow lives on a wrapper                 | `box-shadow` on the masked rail was clipped away by its own mask             |
| Home tiles link to `/photos`                | Previews linked to a bare `.webp`, stranding the visitor                     |
| `[hidden]` overrides author `display`       | The paginator stayed visible because `.sheet-more` sets `display: flex`      |
| One `h1` per page                           | Blog posts shipped five, from migrated markdown using `#` for sections       |
| Every internal link resolves                | —                                                                            |
| No third-party font requests                | The footer claims "no trackers"                                              |

Also asserts the rail's DOM hooks are present and that every row has exactly one
node and one offshoot, since a missing pair silently breaks the lighting.

**A cheap addition that belongs in this layer, not the browser: byte budgets.**
Per-page HTML size, total client JS, total CSS, all asserted against `dist/`
with generous ceilings. A refactor that balloons the bundle should fail loudly,
and this needs no browser at all.

---

## 3. The real-browser layer

### 3.0 Why Playwright now

An earlier version of this doc rejected Playwright as "a large dependency for a
site with none," and verified browser behaviour by hand over the Chrome DevTools
Protocol. That was defensible for steady-state maintenance. It is not defensible
going into a sustained refactoring campaign, where the whole point is that any
change to rendering or behaviour must be _detected_, not noticed. The
alternative — hand-rolled CDP drivers plus a pixel differ plus baseline
management plus trace parsing — is more code to own than the dependency avoided,
with none of Playwright's trace viewer, auto-waiting, device profiles, or
second engine. It is a devDependency; nothing ships.

Three bugs from this project's own history are the argument for testing _what
renders_, not what the DOM says: the stacking-context bug (the nav painted over
the viewer's close button while every z-index looked correct), the
`[hidden]`-vs-author-`display` bug, and the scoped-style specificity rule (a
`@media` rule in the wrong file silently never applies). In all three the DOM
and the stylesheets read as correct. Only the rendered result was wrong.

The suite runs against **`astro preview` serving `dist/`** — the same artifact
that deploys — via Playwright's `webServer`. Breakpoints map to Playwright
projects: **1440 (desktop), 1100, 900, 834, 720, 560, 390 (iPhone profile with
touch and `hover: none`)**. Functional tests run at 1440 and 390 at minimum,
since `photos.ts` branches on `(hover: none), (max-width: 720px)`; visual
baselines run wherever the layout genuinely differs.

### 3.1 The anti-flake doctrine for visual tests

Content churn is the enemy of pixel testing here: a new photo import changes
the gallery sheet, the LQIP blooms behind the ambient layers, the home-page
tiles, and the lightbox contents — and a new project lengthens the rail. The
doctrine, in order of preference:

**1. Pixel-pin the unit cell; invariant-test the repetition.** Repeating,
growing structures — rail rows, gallery tiles, blog list entries, project
plates — never get a whole-structure screenshot. One representative element
gets a close-up element screenshot ("this is what a node, a plate, a tile
frame looks like"), and the repetition is covered by as-rendered invariant
assertions: rows evenly ordered, every tile inside its grid cell, hues
advancing monotonically down the rail, offshoots present on every row. The
rail with twelve projects must pass the same tests it passes with eight —
longer, more boxes, same pattern, same gradient traversal.

**2. Prefer stable-by-construction over masking.** Screenshot regions that
contain no content by design: the nav, the footer, the gallery view bar
(`.px-bar`), the lightbox chrome (`.lb-bar`, `.lb-nav`, `.lb-foot`), section
headers (`.sec-head`), the hero sign and tube. An element screenshot of the
lightbox close button does not care which photograph is open. Full-page
screenshots are reserved for pages whose entire content is fixed: `404`, and
the `about` page if its copy is treated as design.

**3. Masks are holes in the alarm.** Every masked pixel is a pixel the suite
can never again catch a regression in. Masks are for pixels that are
_genuinely dynamic_ — the photograph in `.lb-img`, the LQIP blooms
(`.lb-bloom`, `.px-amb`, `data-amb`), tile images, the sky's stars — and never
for silencing a flake whose real cause is removable nondeterminism (an
animation not settled, a font not loaded). A mask added to make a test pass is
a bug in the test.

**4. Masking does not survive reflow.** A mask covers a rectangle where the
element sits _now_. If added content moves everything below it, the whole page
diffs regardless of masks. Therefore: **never full-page-screenshot a page that
grows.** Growing pages get viewport-clipped shots of layout-stable regions
(the gallery header area above the tiles; the hero) and element shots of their
chrome, not `fullPage: true`.

**5. Specimen content, pinned on purpose.** A small fixtures file
(`e2e/specimens.ts`) names one photo slug, one blog post, and one shoot that
the suite deep-links to. Their rendering is then fully deterministic — the
lightbox opened at `/photos#<specimen>` shows the same image every run, so
even the image itself can be verified rather than masked where that's
valuable. Adding content never touches a specimen. Deleting one is a
deliberate act: pick a replacement, regenerate its baselines, in one commit.
(Specimen-adjacent surfaces that _do_ churn — the prev/next thumbnails, the
frame counter "n / total" — are masked or asserted structurally instead.)

**6. Geometry relations, not geometry snapshots.** Where position matters but
coordinates churn, assert the relation: the close button is inside the
viewport at every breakpoint; `document.elementFromPoint()` at its centre
returns _it_ (real hit-testing — the assertion that would have caught the
stacking-context bug); the shoot rail clears the last tile column; the capture
panel does not overlap the title block. Never "the button is at (1361, 24)".

**7. Kill nondeterminism at the source before screenshotting.**

- `await page.evaluate(() => document.fonts.ready)` and wait for specimen
  images to decode before any shot.
- Settled-state shots run with `page.emulateMedia({ reducedMotion: 'reduce' })`
  — the scripts already honour it, so this exercises a real code path while
  removing every entry animation and the sky's stars.
- Mid-animation shots don't race the clock: seek explicitly via
  `document.getAnimations().forEach(a => a.currentTime = t)` and screenshot a
  chosen frame.
- Scroll-dependent effects are functions of scroll position (`fx.ts` is
  strictly so): scroll to a fraction of the rail, wait for the next frame,
  shoot. Deterministic by construction.
- One baseline platform. Font rasterization differs across OSes, so baselines
  are generated and compared on macOS (where the suite runs today). If a CI
  stage is ever added, it regenerates its own baselines inside Playwright's
  Docker image rather than sharing the Mac's.

The success criterion for the whole doctrine: **a photo import or a new blog
post causes zero visual-test failures.** If one ever does, the fix is to
restructure that test under rules 1–6, not to update its baseline.

### 3.2 Functional tests — `e2e/gallery.spec.ts` and friends

The 1,100 lines of `photos.ts` are the largest untested surface in the project.
What to assert, drawn from what was previously verified by hand:

- **Tiles move, never rebuild.** Tag the tile elements with a property before
  switching views; after switching, the same objects are present and **zero
  image requests fired** (`page.on('request')`). This mechanically pins the
  CLAUDE.md invariant that view switching reparents `.px-tile` elements.
- **Filter coherence.** Filtering scopes the count (`data-count`), the query
  header, and the lightbox sequence together; clearing restores all three.
- **The lightbox lifecycle.** Open from a tile, arrow through, `ESC` closes,
  focus returns; the EXIF panel toggles; `/photos#<specimen>` deep-links open
  the right frame; closing cleans the hash; browser back behaves.
- **Hit-testing over reading.** With the viewer open, `elementFromPoint` at
  the close button and at each nav arrow returns those controls — at every
  breakpoint project. Same for the nav never painting over the wipe.
- **Router idempotency.** Navigate home → photos → home → photos; the gallery
  still responds and listeners have not doubled (the `astro:page-load`
  double-fire and the dead-gallery-on-page-2 class of bug).
- **The shoots sheet and jump rail**, the card expansion on the home page (and
  that the rail recomputes — head lands on its computed target after a
  1332px → 2831px rail change, previously verified by hand once).
- Everything runs in the desktop project and the 390px touch project; the
  bottom-sheet capture layout and permanent captions are phone-project
  assertions.

### 3.3 Motion tests — `e2e/motion.spec.ts`

A screenshot pins one frame; these prove the frames connect. Sample
`getBoundingClientRect()` of the moving element at a series of scroll
positions or animation times and assert the trajectory's invariants:

- The rail charge head is on screen across the whole run, monotonic with
  scroll, and nodes light in rail order — **as rendered**, closing the loop
  that `rail.test.ts` (pure maths) cannot: that `fx.ts` feeds the maths the
  right inputs and writes the outputs to the right elements.
- The Redraw wipe's seam travels top → bottom within its duration, and with
  reduced motion there is no wipe at all.
- Entry animations (`data-fx="resolve"`) actually resolve: blurred before,
  crisp after, and `html[data-swapped]` suppresses them after a router swap.

### 3.4 Performance tests — `e2e/perf.spec.ts`

The sneakiest refactor risk: a cleanup of `fx.ts` reinterleaves reads and
writes, every functional test stays green, and iOS scrolling stutters. Three
measures, chosen to be robust to machine speed:

- **Forced-reflow count as an invariant — the strongest one.** Capture a
  Chrome trace during a synthesized scroll and assert the forced-layout count
  stays **O(scroll-stops), never O(frames)** — in practice, at most one per
  wheel stop. Not literally zero, for a reason worth keeping: a stop's
  `scrollend` runs `settle()`, whose re-read of fresh layout *is* the
  re-measure, by design. The regression under test — reads interleaved with
  writes inside the paint loop — costs several forced layouts per *frame*,
  far above the bound. The read-then-write split is the entire performance
  story of `fx.ts` (see its header comment); this pins the design property
  itself, and unlike a timing threshold it cannot flake on a slow machine.
  (It caught a real one on arrival: BackToTop read `scrollY` in its rAF after
  `fx.ts` had written letter-spacing — one forced layout per frame for as
  long as any heading was resolving. It now reads the offset in the event.)
- **Long-frame detection.** A `PerformanceObserver` on `long-animation-frame`
  during scripted scroll and lightbox open/close; assert no frame beyond a
  _generous_ bound (~50ms). Loose on purpose — tight timing assertions on
  shared hardware are flake factories, and the alarm-fatigue rule from §1
  applies doubly to timing.
- **Byte budgets** live in layer 2 (§2.2), not here — they need no browser.

### 3.5 Accessibility — `e2e/a11y.spec.ts`

`build.test.ts` guards alt text and heading structure; this layer adds what
needs an engine: `@axe-core/playwright` across every page and the
viewer-open state, plus keyboard-only operation of the lightbox (open,
arrow, `ESC`) and visible focus.

### 3.6 The real-device gap — named honestly

The compositor bugs that shaped `redraw.ts` reproduce on **real iPhones only**
— not the iOS Simulator, not Playwright's WebKit, not WebKit trunk. No
automated layer here closes that. Playwright's WebKit project covers the
_engine_; the device compositor remains a **manual device pass**, required for
any change touching `src/scripts/redraw.ts`, the `.redraw` styles, or
compositor-adjacent CSS (transforms, view-transition rules, fixed/sticky
layering). The recipe (simctl + safaridriver, and the CDP fallback below) is
recorded so it is a checklist item, not tribal knowledge.

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --remote-debugging-port=9222 \
  --window-size=1440,900 --user-data-dir=/tmp/cdp about:blank &
# then drive it: fetch http://127.0.0.1:9222/json/list, open the page's
# webSocketDebuggerUrl, and send Runtime.evaluate / Page.captureScreenshot.
```

---

## 4. Build-out plan

Ordered so that each milestone leaves the suite green and useful on its own.
The baselines must exist **before** the refactoring sessions start — the
baseline set _is_ the look-and-feel contract those refactors must preserve.

1. **T1 — Scaffold.** Add `@playwright/test`, `playwright.config.ts`
   (`webServer: astro preview`, breakpoint projects, single-platform snapshot
   policy), `npm run test:e2e`, `e2e/specimens.ts`. Gate: one trivial spec
   passes in every project.
2. **T2 — Functional gallery + navigation** (§3.2). The highest-value,
   zero-baseline milestone: no screenshots yet, so nothing to churn while the
   patterns settle. Gate: green twice in a row from a clean checkout.
3. **T3 — Visual baselines** (§3.1). Chrome shots, unit-cell shots,
   specimen deep-link shots, fixed-page shots, at the breakpoints where each
   layout differs. Gate: the suite passes, then **still passes after adding a
   dummy photo and post locally** — the churn-immunity criterion — then the
   dummies are reverted.
4. **T4 — Motion** (§3.3) and **byte budgets** (§2.2 addition).
5. **T5 — Performance** (§3.4): the reflow-count trace test first, long-frame
   bounds second.
6. **T6 — Accessibility** (§3.5), and update CLAUDE.md's verification gates to
   include `test:e2e`.

Total new dependencies at the end: `@playwright/test`, `@axe-core/playwright`.

---

## 5. Adding tests

Put pure logic in `src/lib/` so it is importable, and prefer asserting a
property over a number. If a test would need updating because a plate got
taller, a photo was imported, or a post was published, it is testing the wrong
thing — restructure it under §3.1 rather than updating its baseline. Pixel
baselines change for one reason only: a deliberate design change, updated in
the same commit that makes it.
