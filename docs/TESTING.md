# memerson-web — Testing

```bash
npm test        # build, then every test
npm run test:unit   # pure logic only, no build needed (~0.1s)
npm run check       # astro check — types and diagnostics, keep at 0
```

No test framework and no new dependencies: Node 24 runs TypeScript and ships
`node:test`. Note that `node --test` wants file paths or a glob, **not** a bare
directory — `node --test tests/` fails with "Cannot find module".

---

## What these are for

The site is going to keep changing: new projects lengthen the rail, new photos
lengthen the gallery, and the design is still being revised. These tests exist so
that core behaviour survives that, not to pin the current pixels.

That distinction drives how they are written. **Assert invariants, not values.**
A test that pinned "at scroll 800 the head is at 368px" would break the next time
a plate gained a line of text, and it would be right to break while telling you
nothing useful. What has to stay true is that the head is on screen for the whole
run — and that holds at any rail length.

---

## The layers

### 1. Pure logic — `rail`, `content`, `manifest`

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
derivative above the 2560px public cap, nothing upscaled past its original,
LQIPs small enough to inline, slugs unique and matching their own hash, and
**no location data anywhere in the file**.

### 2. Built output — `tests/build.test.ts`

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

### 3. Not automated — real-browser behaviour

Deliberately out of scope for now. Infinite scroll, the lightbox, the Redraw
transition and the actual motion need a real engine, which would mean Playwright
and a large dependency for a site with none.

These were verified manually over the Chrome DevTools Protocol, which is worth
recording because it is the technique to reach for again:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --remote-debugging-port=9222 \
  --window-size=1440,900 --user-data-dir=/tmp/cdp about:blank &
# then drive it: fetch http://127.0.0.1:9222/json/list, open the page's
# webSocketDebuggerUrl, and send Runtime.evaluate / Page.captureScreenshot.
```

`--screenshot` alone cannot click anything, and an iframe harness is unreliable
under `--virtual-time-budget`. CDP is what actually works for interaction.

What was verified this way, and would be the first candidates if this is ever
automated:

- Infinite scroll reaches exactly 118 tiles, with the paginator hidden.
- The lightbox pulls the next page in at a boundary: opening the last tile of
  page one and pressing Next goes `030 → 031` while the sheet grows `30 → 60`.
- The rail recomputes on card expansion — head position matches its computed
  target across a 1332px → 2831px rail.
- A shooting star's travel direction and tail agree to 0.00°.

---

## Adding tests

Put pure logic in `src/lib/` so it is importable, and prefer asserting a
property over a number. If a test would need updating because a plate got taller
or a project was added, it is testing the wrong thing.
