# memerson-web — UI Design ("Neon District")

The visual identity, imported 2026-07-26 from the Claude Design project
**"Personal website design system"**, file `Neon District Mockups.dc.html`.

This is M3. Before it, the site was deliberately unstyled — see
[MILESTONES.md](./MILESTONES.md). Nothing here derives from the old
`errorsignal.dev` design; the reversal note in [CONTEXT.md](./CONTEXT.md) still stands.

**Responsive as of 2026-07-28.** The mockups now cover both: "Neon District Mockups" is
the desktop design, and the **Mobile Site** / **Photos on Mobile** boards are the small-screen
one. Desktop above 900px is unchanged by the mobile pass — §9 and §10 record what changes
below it, and why each change is a re-decision rather than a squeeze.

---

## The vision (read this first)

Everything below this section is codification — Claude's attempt to turn the owner's
vision into rules a change can be checked against. When a rule and the vision disagree,
the vision wins, and the rule should be rewritten. Recorded 2026-07-29, in the owner's
own terms:

The site serves two audiences: **a CV for recruiters and hiring managers, and a place to
share hobbies** — programming, photography, writing — with friends, family and coworkers.
The design should be **clean, professional, flashy, and drive a wow factor**.

The aesthetic it aims at: **Cyberpunk 2077's night city** — the colourful landscapes,
glowing neon, bright colours, reflections, diffusion, specular highlights and lighting
effects, _not_ the game's UI. **Tron** — bright electric lines, futuristic, digital.
**80s sci-fi, StarCraft, space: nebulae, galaxies.** Splashes of vivid colour and light
effects against the dark night.

What it must never become: **the RGB gaming-PC meme.** No rainbow everywhere, no cliché,
no flashing that distracts from content. The working test that separates the two:

> **Light is emitted by something in the scene, never painted on.**

The hero is lit by its own sign and rail; the viewer is lit by the photograph; the
gallery is lit by the shoot on screen. Colour that answers a question (where am I? what
can I touch? who is speaking?) reads as a city at night. Colour that answers nothing
reads as a gaming keyboard.

The benchmark pages, per the owner: **the home page nails it** (bloom as nebulae, starry
background, subtle shooting stars, the bright electric rail), and **the viewer nails it**
(clean and professional, the image itself becoming the background bloom). New work
should be held against those two, not against this document.

---

## 1. The one-sentence version

A dark observation deck: a star field that never moves, one continuous neon rail running
the length of the index, and light that travels along objects rather than objects that
move. Long-form reading becomes a serif page whose _prose_ carries no neon — since the
2026-07-29 light pass its structure (headings, quotes, rules, progress) is lit, but the
sentences never are.

---

## 2. Tokens

### Surfaces

| Token        | Value                   | Use                            |
| ------------ | ----------------------- | ------------------------------ |
| `--void`     | `#03040a`               | Page background                |
| `--ink`      | `#05070d`               | Recessed panels                |
| `--plate`    | `#080b13`               | Plate rest state               |
| `--lift`     | `#0b1120`               | Plate hover/open state         |
| `--hairline` | `rgba(142,180,255,.13)` | Every 1px border in the system |
| `--chrome`   | `#04060c`               | Nav bar                        |

### Text

| Token       | Value     | Use                                     |
| ----------- | --------- | --------------------------------------- |
| `--tx-hi`   | `#f4f7fd` | Display type, the sign                  |
| `--tx`      | `#dee5f3` | Primary text                            |
| `--tx-body` | `#c6d0e0` | Serif lede                              |
| `--tx-read` | `#a9b4c6` | Serif body                              |
| `--dim`     | `#8492a8` | Metadata, secondary copy                |
| `--faint`   | `#4d5869` | Labels, timestamps, the quietest chrome |

### The accent ramp

One ramp, three named points, in `oklch`:

```
--sodium: oklch(.82 .17 66)    the sign, the top of the rail
--cyan:   oklch(.80 .17 200)   the middle, and every interactive edge
--violet: oklch(.80 .17 286)   the end of a run
```

**Lightness and chroma are locked; only hue moves.** That is the whole reason nothing in
the palette screams over its neighbour, and it is why the ramp can be sampled at arbitrary
points without anything going muddy or blowing out. The sampling function is a piecewise
linear interpolation of hue only:

```
hueAt(t) = oklch(.80 .17 H)  where  H = 66 + (200-66)·2t        for t < 0.5
                                    H = 200 + (286-200)·(2t-1)  for t ≥ 0.5
```

Nodes on the rail call `hueAt()` with **their own measured height** after layout, so a
node, its offshoot line, and its plate brackets can never drift out of agreement with the
rail behind them. This is a runtime measurement, not a build-time constant — see §5.3.

### The light grammar (2026-07-29)

The three named points are not interchangeable accents. Each carries one fixed meaning,
sitewide, and every lit element must derive from the one that matches what it _is_:

| Light      | Meaning                | Where it appears                                                                                |
| ---------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `--sodium` | **Where you are**      | The home rail's charge, the reading-progress filament, section-marker ticks (about, post `h2`s) |
| `--cyan`   | **What you can touch** | Links, controls, hover glows                                                                    |
| `--violet` | **Another voice**      | Blockquotes' lit edge, the log's year signs and lit separators, series chips, `hr`              |

(Section-marker ticks moved from cyan to sodium on owner review: a section head tells
you where you are in the document, which is sodium's question, not cyan's.)

This is the structural defence against the RGB meme: hue is information, so many small
lights read as an organised city rather than decoration. A new effect does not pick a
colour it likes — it declares which of the three questions it answers. If it answers
none, it should not be lit. (The gallery's sampled shoot accent, `--run`, is the one
exception, and it obeys a stricter rule: see §12.)

---

## 3. Type

| Family             | Role                          | Sizes                   | Tracking     |
| ------------------ | ----------------------------- | ----------------------- | ------------ |
| **Space Grotesk**  | Display, 700                  | 26 / 34 / 54 / 116      | −3% to −5.5% |
| **JetBrains Mono** | UI, labels, metadata, 400/500 | 9 → 14                  | +10% to +30% |
| **Newsreader**     | Long-form body only, 300/400  | 19 / 1.68, 68ch measure | normal       |

**Newsreader never appears on an index.** It is the signal that you are reading rather
than scanning; using it anywhere else spends that signal for nothing.

Fonts are **self-hosted** as variable woff2 in `public/fonts/`. The mockup linked Google
Fonts, which was changed deliberately: the footer claims "no trackers, no analytics", and
a third-party font request is exactly the kind of thing that quietly makes that false. It
also removes a render-blocking external dependency from a site whose entire premise is
that it has no runtime dependencies.

---

## 4. The motion law

> **Energy travels, objects hold still.**

Light moves along things — down the rail, across a plate edge, through the sign. Boxes do
not slide, scale, or bounce. One light event per transition. Everything is 160–380ms
except ambient loops, which are 7s and slower.

Every animation is disabled under `prefers-reduced-motion: reduce`, including the scroll
effects in §5, which fall back to their resolved end state rather than their start state.

---

## 5. The scroll effects

Four, implemented in `src/scripts/fx.ts`. All driven by one `rAF`-throttled scroll
listener with a single `getBoundingClientRect()` pass per element.

### 5.1 Sky holds, nebula drifts

Stars are `position: fixed` — the sky is infinitely far away, so it does not move when you
walk. Three depth layers, brightest at the hero and never brighter than 40% below it. The
far layer drifts on a 90s loop; a shooting star crosses roughly every 20 seconds. The
nebula is _in_ the content and lags scroll by a parallax factor, because it is near.

**Since 2026-07-29 every page also carries the nebula proper** (`.neb` in BaseLayout):
two enormous blurred colour fields (violet leading, cyan seconding, a whisper of sodium)
at single-digit opacity. It began viewport-fixed inside the sky; owner review moved it
to the **top of the page**, scrolling away and tapering like the hero's haze, because a
bloom that followed the viewport read as disconnected (`min(150vh, 100%)`, masked — the
cap keeps a short page from gaining empty scroll range).

Two later rulings, same day. **It is static.** The fields originally drifted on
140s/180s transform loops, and Firefox flickered repainting the animated 70px blur;
the owner's rule is stricter and better: the background holds still — only the shooting
stars and the sign's occasional flicker move. **And each section gets its own weather**:
`data-page` (from the layout's `active` prop) keys a distinct field composition — home's
default, the log's high-right violet, about's warm sodium, photos' near-nothing (that
page is lit by the photographs). Same three lights, different geometry, so the sections
feel like districts of one city rather than copies of one backdrop.

### 5.2 Type resolves on entry

Headings arrive blurred with open tracking and resolve as they enter the viewport — a lens
finding focus, not a fade-up. Body copy never does this.

**Entry animations are a first-load effect. On a swap the page arrives finished.**
`src/scripts/redraw.ts` sets `data-swapped` on the incoming document, and
`html[data-swapped]` switches off both this and the gallery's tile reveal for the rest of
the session. Scroll-resolve still works afterwards — the gate is a plain declaration, so the
inline styles `paint()` writes still win.

This is §4 applied literally: the wipe is the light event, and a page resolving underneath it
is a second one. It is also a correctness fix. `::view-transition-new(root)` is captured when
the swap callback returns, which is before any script on the incoming page has run — so the
frozen image the wipe revealed was the page in its entry state: a blurred heading over a
gallery of `opacity: 0` tiles, held for the full 380ms and then brightening all at once when
the real DOM took over. Measured at the snapshot, navigating `/` → `/photos`: heading
`opacity 0.15, blur(13px)` and tiles `opacity 0` before, both fully resolved after.

**Only CSS can fix that snapshot.** On the first visit to a route the page's own module has
not executed when the capture happens — `runScripts()` is awaited after it — so no amount of
moving work between `astro:after-swap` and `astro:page-load` helps. The rule has to already
be in the document, which is also why the CSS is inlined (ARCHITECTURE §2).

> **2026-07-29:** the snapshot analysis above is now historical — the wipe no longer uses
> the View Transitions overlay at all. Real-device iOS composited the overlay on unreliable
> clocks (a held ~75% dim, then two different line/seam desyncs), reproducible on no
> simulator, so `redraw.ts` skips the transition and slides a single live panel — top edge
> is the scan line — from under the nav, at 300ms. `data-swapped` and everything in this
> section still applies unchanged: the page must arrive finished either way.

### 5.3 The rail charges

One gradient, one mask. A single uninterrupted `linear-gradient` runs the whole index; a
`mask-image` with a `--cg` (charge) custom property reveals it from the top as you scroll.

**The charge outruns the scroll.** It is defined by two anchors rather than a tuned speed,
in `src/lib/rail.ts`:

```
cg = 0  when the rail's origin reaches 20% down the viewport
cg = 1  when the rail's terminal enters the viewport
      span = height - viewportHeight + origin
      cg   = clamp01((origin - top) / span)
```

Substituting back, the head's viewport position is `origin + cg * (vh - origin)` — a linear
sweep from a fifth of the way down to the bottom of the screen, so **the head is on screen
for the whole run by construction**. The multiplier (`height / span`, ≈2.75× on the current
rail) falls out of the geometry and self-adjusts as projects are added, instead of being a
constant that silently decays. Covered by `tests/rail.test.ts` across rail lengths from
400px to 9000px.

**The mask lives on the wrapper, and the glow is painted, not filtered.** A mask paints only
within the element's box and a `box-shadow` is drawn outside it, so a shadow on the rail
itself was clipped to a 3px column and vanished past the charge front. The first fix was two
`drop-shadow()` filters on the wrapper — correct in principle, and wrong in practice: the
wrapper is the full height of the section, several thousand px on a phone, and `--cg`
changes on it every animation frame, so Safari re-rasterized a page-tall filter region per
frame. That was the stutter. It was also the ghosting, because iOS invalidates a filtered
layer in tiles and the tiles the charge had already left kept their old shadow — scrolling
back up left glow behind while the masked core underneath it correctly retreated.

So the mask moved up to `.rail-glow` and the filter is gone. `.rail-bloom` is a wider
sibling of the core carrying two pre-blurred gradient bands, standing in for the 5px and
16px shadows; both children sit under the wrapper's mask, so the glow still stops exactly
where the charge does. `.rail-head` keeps its `blur()` — it is 11×116px, not page-tall — but
carries `will-change: transform`, without which its own move smears for the same reason.

**Nodes light from the charge, not from their own scroll position.** An offshoot should
kindle because the charge arrived. The two only agree while the charge runs at exactly
scroll speed, which it no longer does.

**`.rail-live` must never be given a `bottom`.** It is `inset: 0` inside `.rail-glow`, so it
already inherits whatever height the glow has. Naming it alongside `.rail-track` and
`.rail-glow` in a rule that sets `bottom` re-applies that offset _relative to the glow_ and
silently shortens the lit rail by exactly that much. The base rule gets away with listing it
only because `inset: 0` comes later in source order; a media query does not, which is how
the mobile pass left the charge ending 70px above its terminal on a phone — at every scroll
position, which is why it looked like a scroll bug and was not one.

**Measure and paint are separate passes, and scrolling only paints.** This is the whole
performance story on a phone. `measure()` reads the DOM — rail box, node offsets, node hues
— and runs on load, resize, plate toggle, font load, and once after a scroll settles.
`paint()` runs every frame while scrolling and is strictly read-then-write: it takes a
handful of rects up front and does not read again once it has started writing.

**Cache offsets, never positions.** An intermediate version cached each element's
document-relative top and derived its viewport top as `docTop - scrollY`. That is only sound
while the two agree, and on iOS they do not — a collapsing toolbar moves the layout viewport,
so a `measure()` landing mid-transition stores an offset wrong by the height of the toolbar,
and every frame after it inherits the error. Positions are read live; only offsets _within
the rail_ are cached. The win survives, because the win was never the number of reads — it
was that they no longer interleave with writes.

The first version interleaved the two, calling `getBoundingClientRect()` on each of the
eleven nodes inside the same loop that wrote their styles — so every node forced a
synchronous layout against the writes from the node before it. Node offsets along the rail
do not change when you scroll, only when the page reflows, so caching them made the scroll
path cheap. Measured over a 90-frame flick down the home page at 6× CPU throttle,
main-thread script time fell from **46.8ms to ~9.5ms** and style recalcs from 447 to ~296.
Two smaller things came out of the same pass: the head moves by `transform` rather than
`top`, and a node or a heading whose value has not visibly changed is not written at all —
which matters most for `letter-spacing`, since writing it costs a layout.

**The charge is the only clock.** `nodeLit()` already kindles a node gradually, over a 40px
ramp of charge travel — so a CSS `transition` on the same properties is a _second_,
independent smoothing with its own timing. At reading speed the two are indistinguishable.
On a fast flick, and especially on reversing direction, the mask has no transition and snaps
to the new charge while the nodes ease toward it over 180ms, so the offshoots visibly trail
the line that is supposed to be lighting them. `.node` and `.offshoot` therefore carry no
transition on anything `fx.ts` drives.

**There is a guaranteed final frame.** iOS can drop the last `rAF` of a momentum scroll, and
since `paint()` is the only thing that advances the charge, the rail simply stayed wherever
the last frame it did run left it — the visible symptom was the charge stopping short of the
terminal at the bottom of the page. A `scrollend` listener covers engines that report it and
a 140ms timer covers those that do not; the timer also re-measures, because a collapsing iOS
toolbar changes `innerHeight` without a useful `resize`.

**Layout changes recompute.** Expanding a plate reflows every row and changes the rail's
height but fires no scroll event, so a `ResizeObserver` on the rail scope plus a captured
`toggle` listener drive the recalculation. Without them the hues jumped to their new rows
while the glow held its old position — the two are computed from different measurements and
only one was being refreshed.

**There are no per-segment gradients and no stops.** An earlier iteration had nine
separate segments and it kinked visibly at every seam — the charge is one mask sliding
down one gradient, so it physically cannot. A blurred "head" element rides the leading
edge of the mask.

### 5.4 Sticky section marker

The section number pins while its section passes, then hands off to the next. It is the
only chrome the log gets — no breadcrumb, no back-to-top.

**Partially reversed 2026-07-30 (owner request): there is now a site-wide return-to-top
button** (`src/components/BackToTop.astro`) — a 44px glass circle, fixed bottom-right,
holding a neon-tube chevron: 3px rounded cyan stroke with the tube's two-stage glow (§6),
no text. It appears only after ~2.5 viewports of scroll, so short pages — and the log,
most sessions — still never see it; the original "no chrome" intent survives as a
threshold rather than an absence. z-index 30: above the gallery's shoot rail, beneath its
overlays. The gallery forced the issue — one static page holding every frame is the
design (ARCHITECTURE §6), so the way back grows with the library.

---

## 6. Materials

- **Plate + brackets** — a hairline box with four corner L-brackets in the node's sampled
  hue. On hover, a charge runs the top edge and the plate lifts _in value, not position_.
- **Neon tube** — a 3px rounded bar with a two-stage glow (tight `box-shadow` plus a wide
  low-opacity one) and a specular highlight travelling along it.
- **Wet-floor echo** — display type mirrored below itself, blurred, masked to fade out.
- **Haze + shaft** — large blurred radial gradients and one angled light shaft, hero only.
  Strong here because it is the one place it can be without fighting text.
- **Page haze** (`.page-haze`, global) — the hero haze's quieter sibling: a pocket of
  nebula behind each interior page's header. Each page keys its own light via
  `--haze-a` / `--haze-b` on its container: the log stays violet (the archive), a post
  reads under cyan (the reading room), about sits in warm sodium (the desk lamp). Same
  physics everywhere, different rooms — which is what keeps one shared effect from
  reading as one repeated effect.
- **Neon title** (`.neon-h`, global) — the hero sign's treatment at interior strength:
  chromatic fringe plus two-stage glow, **without** the flicker or the wet-floor echo.
  Those two stay unique to the front door on purpose.
- **The lit edge** — a 2px border plus an offset negative-spread `box-shadow`, and only
  ever _one_ per element. Code blocks wear it in cyan; blockquotes wear it in violet
  (another voice — see the light grammar in §2).
- **Scanlines — removed 2026-07-29.** The 1px CRT texture was a different retro-future
  than the night-city direction and pulled against it; the sky nebula carries the ambient
  texture now. Its `z-index: 1` slot (above the sky, below `.page`) is where a page's
  ambient light lives — the gallery's is the first (§12).

---

## 7. Pages

| Route          | Mockup | Notes                                                        |
| -------------- | ------ | ------------------------------------------------------------ |
| `/`            | 6a     | Sign, rail, 11 project plates, photo + log previews, contact |
| `/photos`      | 6b, PR | Three views, run headers, shoot rail, viewer. See §10.       |
| `/blog`        | 6c     | Year-grouped, serif, sticky year                             |
| `/blog/[slug]` | 6d     | 68ch serif, lit code edge, reading progress                  |
| `/about`       | —      | Not in the mockup; extended from the language. See §8.       |
| `/404`         | —      | Not in the mockup; extended from the language.               |

**Nav labels differ from routes on purpose.** The design calls them SYSTEMS / PHOTOS /
LOG; the URLs stay `/`, `/photos`, `/blog` because blog slugs must survive the
`errorsignal.dev` redirect (M2). Labels are presentation; URLs are a contract.

---

## 8. Where the design and the data disagree

The mockup was built against invented content. Everything below is a place where the real
data is used instead, or where a designed element could not be honoured.

| Mockup                               | Reality                                     | Resolution                                              |
| ------------------------------------ | ------------------------------------------- | ------------------------------------------------------- |
| 214 photos, 5 albums                 | 118 photos, no album metadata at all        | Real count. **Album filter chips omitted** — see below. |
| Photo titles ("Playa Norte, 14:20")  | 24 of 118 have a `title`; all have captions | Two fallbacks, split on purpose. See §10.               |
| Photo meta ("35MM · f/8")            | Real EXIF exists                            | Built from real camera/aperture/shutter.                |
| Coloured gradient placeholders       | Real derivatives in R2                      | Real images; the manifest LQIP is the dim wash.         |
| 24 posts                             | 5 posts                                     | Real count everywhere.                                  |
| 9 systems                            | 11 projects in the collection               | All 11, ordered by the YAML `order` field.              |
| Reading time per post                | Not in frontmatter                          | Computed from word count at build.                      |
| `/systems/<name>` deep pages         | Do not exist                                | Plate links go to the real GitHub/docs/crate URLs.      |
| `matthew@memerson.com` in the footer | **Unverified** — not in the repo anywhere   | **Omitted.** See below.                                 |
| `SEATTLE · 47.6°N 122.3°W`           | **Unverified** — location asserted nowhere  | Replaced with an Easter egg. See below.                 |
| `EMERSON` on the hero sign           | The wordmark is `M.EMERSON`                 | Sign is now `M.EMERSON`, sized to the word.             |

### Mockup annotation is not site copy

A mockup explains itself to whoever is reviewing it. Several of those explanations were
carried into the build as if they were the site's own words, and shipped:

| Shipped as copy                                                     | What it actually was                    |
| ------------------------------------------------------------------- | --------------------------------------- |
| "TUBE FEEDS THE RAIL"                                               | Telling a reviewer what to watch        |
| "The wash behind a photo is the photo — nothing samples a palette." | Design rationale, from §6 of the mockup |
| "END OF RAIL"                                                       | A label for the rail component          |

Removed 2026-07-27. `SCROLL ↓` was kept — it is a real affordance rather than an
explanation. `END OF RAIL` became **`END OF LINE`**: still marks the end of the run, but
it is a Tron nod that sits well with the footer's light-cycle grid, and it reads as voice
rather than as a part label.

**The test when importing a mockup:** would this sentence make sense to a visitor who has
never seen the design document? "Nothing samples a palette" is an answer to a question only
a reviewer asked.

### The copy pass (2026-07-30)

A second sweep, on the owner's read of the live site. The first pass caught mockup
_annotation_; this one caught copy that was fluent, plausible and wrong about the site.

| Was                                                                    | Now                                                                | Why                                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Nav `SYSTEMS` → `/`                                                    | `HOME`                                                             | `/` carries projects, photographs and writing; SYSTEMS named only the first third |
| `01 — SYSTEMS`                                                         | `01 — PROJECTS`                                                    | They are projects. Only some are systems                                          |
| "11 systems below, written after hours"                                | "11 projects below, written after hours"                           | Same reason, and the count is live                                                |
| `MEMERSON.COM — DISTRICT 09 / PERSONAL`                                | `MEMERSON.COM · PROJECTS, PHOTOS, WRITING`                         | DISTRICT 09 was the mockup's placeholder, not a reference to anything             |
| 404 `SIGNAL LOST — DISTRICT 09`                                        | `SIGNAL LOST`                                                      | Same                                                                              |
| "Notes on things that broke, and what the profiler said afterwards."   | "Occasional write-ups from the projects above."                    | Described one post out of five, and ruled out most of what is worth writing next  |
| "Postmortems on my own code, mostly — the profiler is the antagonist." | "{n} posts, written alongside the projects."                       | Same, and the count stays live                                                    |
| "the outing is the only unit that has ever mattered"                   | "Every frame in the library, grouped by shoot, newest first."      | A grand claim about a private habit. The replacement is the fact it dressed up    |
| Footer "Say something"                                                 | "Elsewhere"                                                        | Three links that are not a way to say anything, over no published address         |
| View `RUNS` / stats `OUTINGS` / sheet `JUMP TO AN OUTING`              | `SHOOTS` throughout, and the control beside it becomes `JUMP TO ▾` | Three words for one unit. `shoot` is the one the data model uses                  |
| Home photos lede "{n} frames, {span}."                                 | "The full gallery, grouped by shoot."                              | Repeated the header's own count verbatim                                          |
| Viewer's EXIF footnote about who chose the exposure                    | Deleted                                                            | Nobody opening CAPTURE DATA asked; the caveat argued with the numbers above it    |

A rule that fell out of the second round: **a lede orients, it does not narrate.** The
first replacements still explained the author — "shot mostly for myself", "whatever phone
I had", "things I wanted to understand properly" — which reads as apology in a portfolio.
A lede states what the section is and how it is organised; the work carries the
personality.

Em dashes came out of every prose string in the same pass. They stay in numeric label
forms (`01 — SKILLS`, `2017 — 2022`), where they are punctuation rather than voice.

Two shoots were renamed to what they actually were: `Zoo Aquarium Visit` → **Aquarium**,
and both air shows → **Thunder Over Dover**, the show at Dover AFB. Two shoots now share
one name, so the rail — which has room for a name and a count but not a date — appends the
year when a name recurs.

### Pagination was removed, and why

`/photos/2`, `/photos/3` … used to be real pages, with infinite scroll layered over them.
The Photos Redesign made that untenable rather than merely awkward: run headers, the shoot
rail, the stray-frame rule and the tag filter all need the whole library to be _truthful_,
and a rail that only lists the shoots loaded so far is worse than no rail — it answers
"what else is here" with a lie that changes as you scroll.

So `/photos` is one static page carrying every frame. See ARCHITECTURE §6 for the weight
this actually costs and the point at which it stops being free.

Two things to know before touching the script. Astro fires `astro:page-load` on the
**first** load as well as on router swaps, so it must guard against initialising twice.
And a router swap does not re-execute a script the previous page already loaded, which is
why arriving at `/photos` from another page once left the gallery completely inert.

### Contact sheet: tiles are not dimmed by default

The mockup washes every tile to 60% black and lights one on hover. That reads well against
placeholder gradients and badly against photographs — a contact sheet exists to be
_browsed_, and a grid of uniformly murky images defeats its only job.

Inverted: an 18% wash keeps tiles seated against the near-black page rather than glaring
off it, and hover clears it entirely. The date label moved from always-on to hover, with
the rest of the metadata — it is chrome, not a caption, and permanently stamping it across
a photograph is exactly what a contact sheet should not do. Nothing is lost to a screen
reader: the date is in the image's `alt`.

"One tile lights" survives as a lift in contrast rather than as a penalty on the other
twenty-nine.

**Album chips.** There is no album field in the manifest schema and `tags` is empty for
every photo. Rather than invent five albums, the filter row is left out and the header
keeps its real stat block. Year is the obvious first real filter — the manifest has
`takenAt` for all 118 — but that needs filtered routes, which is M4's "tag and date
filtering". The design's chip styling is kept in `global.css` ready for it.

**The footer's two asserted facts** were the only places the mockup claimed something
about the world that the repo cannot corroborate.

The email address is still omitted — an unverified address invites bounced mail. It is a
one-line addition in `SiteFooter.astro` if wanted.

The location became an **Easter egg** instead of either a real city or nothing:

```
TYCHO · LUNA · 43.3°S 11.4°W
```

`43.3°S 11.4°W` is the real selenographic position of **Tycho crater** — the TMA-1
excavation site in _2001: A Space Odyssey_. The coordinates are genuine and check out;
they are simply not on this planet, and the line keeps the exact shape of an ordinary
location string so nothing gives it away at a glance.

It is also the choice that agrees with the design's own brief. The mockup's notes say
this world is **"vacuum, not street"** — which is why rain was cut and a star field kept.
A street-level reference (Chiba, Kowloon, the Bradbury Building were the alternatives)
would have contradicted that; a crater on the Moon does not.

**`NO TRACKERS, NO ANALYTICS` was dropped from the line in M2**, when analytics was
actually decided. The site still ships no analytics of any kind, so the claim was true —
but a footer that advertises the absence of something makes the absence a promise, and the
promise is the part that ages badly. The behaviour is now simply the behaviour: no beacon
script, no third-party requests, nothing to attest to. See
[MILESTONES M2](./MILESTONES.md) for the reasoning behind the decision itself.

---

## 9. Mobile

Done, 2026-07-28, from the **Mobile Site** and **Photos on Mobile** boards in Claude
Design. Desktop above 900px is untouched; everything below it is a re-decision for the
screen rather than a squeeze of the desktop layout. Nothing was removed to make the phone
easier — only the things that depend on a cursor or on horizontal room were re-housed.

### Where the rules live

`global.css` carries only what it already owns: the token steps, the nav, the footer and
the section headers. Everything else sits in its own component's `<style>` block, next to
the desktop rule it answers. This is not tidiness — **Astro scopes a component's styles
with an attribute selector**, which outranks a bare class in `global.css`, so a responsive
rule for `.tease` written in the global sheet would silently never apply.

### Breakpoints

| Width        | What changes                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ≤ 1240       | The shoot rail loses its margin and folds into the SHOOTS sheet                                                                                             |
| ≤ 1100       | Gutter 70 → 44; gallery masonry 4 → 3 columns                                                                                                               |
| ≤ 900        | Gutter 32, rail offset 44; sign scales on `vw`; tube goes flexible; tease 3 across with the card spanning two tracks; prose 18px; gallery head stacks       |
| ≤ 720        | Bio stacks; plate blurb drops to its own line; log rows go date/read over title; year column collapses; control bar wraps; viewer goes swipe + bottom sheet |
| ≤ 560        | Gutter 18, rail offset 26; nav tightens; prose 17.5px; code full-bleed; RUNS and EDITORIAL go single column; the control bar stops being sticky             |
| `hover:none` | Hover lift, glow, brackets and index numbers drop; press state replaces them; 44–56px minimum on every control                                              |

### The rail on a phone

The scroll effects are JavaScript, and a phone is where that shows. Everything above about
`measure()` / `paint()` in §5.3 is a mobile fix first. Two things are still true and worth
knowing before reaching for more:

- **Double-tap-to-zoom has to be opted out of.** iOS reserves a second tap within ~300ms on
  any element for zoom, and stepping through photographs is exactly the gesture that produces
  fast repeat taps — so the viewer's next button zoomed the page instead of advancing.
  `touch-action: manipulation` on buttons, links, summaries and labels opts those elements out
  while leaving pinch zoom and page-level zoom alone.

**Scroll-driven CSS animations would not help here.** They composite `transform` and
`opacity` off the main thread, and the rail's reveal is a `mask-image` gradient stop —
recomputed on the main thread whichever way it is driven. The nodes also need the
measured geometry that produces their hues. Safari 26 supports `animation-timeline`
(threaded in 26.4), so this is worth revisiting if the reveal is ever reformulated as a
transform, but it is not a drop-in replacement.

- **Some lag during momentum scrolling is inherent**, because Safari composites the scroll
  on another thread while the effect is computed on this one. The work above removes the
  jank we were causing; it cannot remove that. Two things were checked before concluding
  this, and both are worth re-checking before anyone assumes a regression: the head and the
  charge front agree to the pixel at every scroll position (they are computed from one `cg`
  in one block), and the settled state after a fast scroll down-then-up is identical to the
  same position reached slowly.
- **The hue shift along the rail is the ramp, not a seam.** Sodium at the top through cyan to
  violet at the end means any two adjacent plates differ slightly in hue, and a band of
  yellow-green above a band of cyan can read as a discontinuity when it is just the gradient
  passing through 120°.

### The decisions worth knowing

**The sign gets the width.** `M.EMERSON` is the whole first impression — flicker,
chromatic fringe, reflected echo. Shrinking it politely to fit would waste the one moment
the site is loudest, so it scales on **viewport width** rather than stepping at a
breakpoint, landing at 46–72px and still filling the column edge to edge. `.sign-echo`'s
height moved from a hard-coded `74px` to `0.64em` so the reflection follows it. The tube
below became `flex: 1 1 auto` instead of a fixed 518px so it still runs to `SCROLL ↓`.

**The rail survives, tightened.** Deleting the systems rail and stacking the plates flush
left buys 56px — 16% of a 390px screen. But the rail _is_ the section: it is what charges
as you scroll and what the nodes hang off. It stays at **26px instead of 56**, under 12%
of the width, with the charge, the travelling head and the terminal all behaving as they
do on desktop. `--gutter`, `--rail-offset`, the node's `left` and the offshoot's width are
one system and all four move together.

**Plates break, they don't shrink.** The blurb drops to its own line under the name rather
than the name shrinking to make room: 21px display type is the floor for something meant
to read as a title.

**Four frames and a card, without a ragged row.** Five across on a phone is 60px
thumbnails, which is a texture and not a photograph; three across leaves a hole, because
five items do not divide by three. The `+N` card takes the two remaining tracks on row two
and drops its 4:5 ratio.

**Prose at reading size, code at full bleed.** The post is the one page where a phone is
genuinely the better device. Serif drops to **17.5px at 1.62** — about a 38-character
measure. Code blocks break the gutter and run edge to edge with their cyan rule pinned to
the screen edge; long lines are the one thing a narrow column cannot serve, so they get
every pixel.

**Tables of two columns become stacks.** About's 130px label column eats a third of the
line for four characters of mono, so label sits above value with the arrow pinned right
across both rows. The log index loses its sticky 78px year column the same way — the year
becomes a marker above its group instead of a rail beside it.

### Safe areas — `viewport-fit=cover`

The page opts into the full screen, so the star field, the footer horizon and the viewer's
bloom reach the rounded corners instead of stopping at a black band under the Dynamic
Island and above the Safari toolbar. Content is held out of those regions by
`env(safe-area-inset-*)`, folded into two tokens rather than sprinkled at call sites:

- `--nav-h` is `calc(--nav-bar-h + env(safe-area-inset-top))`. It is both the nav's height
  _and_ the offset every sticky header in the site hangs from, so the section markers, the
  gallery control bar and the run headers all follow the notch without knowing it exists.
- `--gutter` is `max(--gutter-base, env(safe-area-inset-left), env(safe-area-inset-right))`,
  which is what keeps the nav off the notch in landscape. **Breakpoints set `--gutter-base`,
  never `--gutter`** — setting the latter throws the inset away.

The footer grows by the bottom inset (`--foot-h + env(...)`) so its grid floor runs off the
bottom of the screen rather than stopping short of the home indicator, and the viewer insets
its own bar, stage, footer and capture sheet from `--lb-t` / `--lb-b`.

**Write the inset into the `padding` shorthand, never as a `padding-top` above it.** The
shorthand resets all four sides, so a `padding-top: env(safe-area-inset-top)` written before
`padding: 0 30px` is silently discarded. Both the nav and the viewer's top bar had exactly
this pair, which is what put CLOSE under the Dynamic Island with its `×` clipped by the
status bar.

**The viewer's backdrop overruns its own box by `--lb-over` (220px).** `position: fixed` is
laid out against the _small_ viewport on iOS — the band between the status bar and the
floating tab bar — so a wash at `inset: 0` stops dead at both, and the strips behind Safari's
translucent chrome show the page underneath instead of the viewer. Nothing here sets
`overflow`, so running the layers past the box is all it takes. The vignette's gradient is
sized _back_ to the visible band with `background-size` and its terminal colour is repeated
as the element's `background-color`: stretching the radial with the box would push the
falloff off-screen and all but erase the vignette, and the two meet at the same colour, so
there is no seam.

### What deliberately did not change

The star field, the neon flicker, the rail charge and terminal, the sticky section
headers, the redraw wipe between pages, the accent ramp and the plate brackets are all
identical. (The scanlines were on this list until they were removed sitewide on
2026-07-29 — see §6.)

---

## 10. The gallery on small screens

Split out from §9 because the three views do different jobs and therefore narrow
differently. One rule — _fewer columns as the screen narrows_ — would be wrong here.

**The grid splits by intent, not by width.** RUNS goes to a **single column** below 560px:
on a phone the photograph should be the whole width, and RUNS is the view you land on, so
the default phone experience is a considered one-at-a-time read rather than a wall of
thumbnails. SHEET **stays two-up**, because that view exists for scanning an archive and
thumbnails are the point. EDITORIAL keeps its lead frame, but the title block moves above
the photograph instead of beside it.

**Hover metadata has to land somewhere else.** On desktop the caption is a hover overlay.
A phone has no hover and a tap is reserved for opening the viewer, so in the single-column
views the caption **steps out from under the photograph and becomes type**. In two-up
SHEET it disappears entirely rather than being crushed.

**Only one thing stays pinned.** Below 560px the control bar **scrolls away**: it is a
mode switch you touch once, and pinning it would cost 220px of an 844px screen on the very
view whose argument is that the photograph should own the width. The run header keeps its
sticky slot, because it is the one piece of chrome answering a question you have
continuously while scrolling. Pinned chrome drops to ~102px.

**The photograph arrives in one piece — from the copy already on screen.** The viewer used
to land in three events: an unsized image laying out wherever it fell, a jump as its
intrinsic size arrived, then the bloom appearing behind it.

The fix is that there is already a decoded copy of the photograph on the page: the tile you
tapped. `tileImg.currentSrc` is the exact URL the browser chose for it, so it is in cache,
needs no decode, and is _sharp_. The frame takes it, the bloom takes the same URL, and the
frame's size comes from the manifest aspect ratio before either — so the whole viewer is
formed within one frame of the tap.

Two earlier attempts were worse and are recorded so they are not retried. The raw 2560
derivative meant a visible wait. The **LQIP** removed the wait and replaced it with a
blur-to-sharp reveal, which turned a loading artefact into a _slower_ one even though it
matched the site's resolve motion. A larger derivative is requested only afterwards, by
handing the `<img>` a `srcset`: an image already displaying something swaps silently when
the new candidate is ready. The LQIP survives as a floor behind the frame, for the one case
the cache cannot cover — a tile whose own image has not loaded.

The viewer's `<picture>` was removed for this. A `<source>` would override the cached URL,
which is the whole point of the sequence.

**The FLIP is a pointer gesture.** The frame growing out of the tile you clicked is the one
flashy moment in the design, and on a phone it backfires: in a single-column scroll the tile
can be anywhere, so the frame flies up from the bottom of the screen and reads as the layout
settling late rather than as a connection between the two — it was in fact mistaken for
exactly that. Disabled below 720px and on `hover: none`; kept on a pointer device, where the
tile is small, near the cursor, and the move still says where to look when you close again.

**The home page deep-links into the viewer.** A preview tile there links to
`/photos#f-<slug>`, which is a real element id on the gallery tile: with the script running
it opens the viewer on that frame, and without it the browser still scrolls to the right
photograph. Answering "show me this one" with the top of a 118-frame page was the wrong
answer.

**And the open viewer writes that URL back — by replacement only.** The fragment was
readable and never written, so the one frame worth linking to — the one filling the screen
— was the one thing the address bar did not name. Opening, stepping and closing all
`replaceState` the current entry. There is no `pushState` and no `history.back()`, which
costs the back-gesture-closes-the-viewer behaviour and is deliberate.

**Never push a history entry behind `ClientRouter`'s back.** The first version of the above
pushed on open so that Back would close the viewer, and the symptom was a double flash on
close: the redraw wipe, then every entry animation on the page running again. `ClientRouter`
decides whether a popstate is an intra-page move with `samePage()`, which compares **pathname
and search and ignores the hash**, and it takes the `from` side of that comparison from an
`originalLocation` that only its own navigations update. A fragment pushed by anyone else
therefore pops as `/photos` → `/photos` with no hash on either side, misses the intra-page
early return, and falls through to a full fetch and swap of the page you are already on.
Measured over CDP: one `astro:before-swap` per viewer close before the fix, zero after.

**Pass `history.state` through, never overwrite it.** It carries the router's own
`{ index, scrollX, scrollY }`, and `onPopState` returns early on any entry whose state is
null — so replacing it with an object of your own means a later Back into this page changes
the URL without ever swapping the document in.

**The rail folds into a sheet.** Its job — _where am I, what else is here_ — moves into a
SHOOTS button that opens a full-screen list at 56px a row. The sticky run header still
answers "where am I"; the sheet answers "what else is here" on demand.

**The viewer trades its furniture, it does not lose it.** The mockup dropped the arrows and
the thumbnail strip on touch as mouse furniture, and that went too far: swipe is a faster
gesture, but a gesture with no visible affordance is a secret, and nothing on the screen
said there were 117 other photographs. So the side arrows go — over a phone-width
photograph they are in the way — and a **compact ← → pair plus `i`** takes the footer row
that was otherwise empty, with the **thumbnail strip** filling the rest of it. The keyboard
hint (`I CAPTURE DATA · ← → MOVE`) is removed there, because it describes keys that do not
exist on the device. Swipe still works and the page still says so once.

Tags become a horizontally scrollable row so eight of them do not wrap into four lines.
CAPTURE DATA becomes a **bottom sheet** rather than a side drawer: a 250px panel on a 390px
screen would cover the photograph. It is fully opaque, unlike the desktop drawer — it rises
straight over the metadata stack rather than pushing it aside, and at 95% the title
underneath read through it. **It carries its own close button**, because as a bottom sheet
it covers the `i` that opened it, which otherwise left no way out at all.

---

## 11. Iterating on the design

The design lives in Claude Design and will keep changing. `docs/design/` is not an archive
— **it is the diff base**, and that is the whole reason it exists.

### When the mockups are updated

1. Pull the current file from the Design project (`DesignSync` → `get_file`).
2. **Diff it against the copy in `docs/design/`.** This is the step that makes the update
   tractable: without a saved baseline, the only options are re-reading 85KB of mockup and
   guessing what moved, or re-implementing from scratch.
3. Translate the diff into implementation changes — the mapping from mockup section to
   source file is in §7.
4. **Check the change against §8 before applying it.** That table records where the
   implementation deliberately diverges from the mockup (real data instead of invented
   counts, omitted album chips, the footer omissions). A naive diff-apply would silently
   revert those decisions, which is the main way this workflow can go wrong.
5. Update the copy in `docs/design/` so the next diff has a clean baseline.

`docs/design/` is in `.prettierignore` and excluded from `tsconfig` precisely so it stays
byte-identical to what the Design project served. **Do not reformat it** — a reformatted
baseline makes every subsequent diff useless.

### Known changes coming

Flagged by Matthew, not yet designed:

- Lightbox revisions.
- Animation changes.
- The **mobile transformations** (§9), which are the largest outstanding piece.

### The ambient bloom, and why it needed no metadata

Worth recording, because the obvious assumption is wrong. The lightbox's glow behind the
photograph looks like it should require extracting a colour from the image. It does not —
Signal 4c settles it:

> _"ambient bloom is a blurred copy of the photo itself, so it works on real images"_

The glow **is** the photograph: the smallest derivative, blurred to 80px and saturated,
sitting behind itself. Nothing samples a palette, nothing is stored, and it works on any
image by construction.

This was missed on first implementation — the Neon District mockup shows the bloom driven
by `lb.grad`, which is a _placeholder gradient standing in for the photo_, and with no real
image behind it the layer read as decoration rather than as the photo. It was implemented
as a flat wash and corrected 2026-07-27.

It then went out a second time, invisibly, and the cause is worth keeping. The vignette
above it grew a `background-color` on 2026-07-28 so its falloff could stop at the visible
band while the strips behind iOS's chrome stayed filled. A colour paints the **whole** box,
including the band, so it sat behind the radial's transparent centre at 0.88 opacity and
dimmed the bloom into nothing on every browser. A transparent gradient stop over an opaque
`background-color` is not transparent. The overrun strips are now two flat gradient
_layers_, positioned top and bottom, and the centre is genuinely clear (2026-07-29).

### How large the photograph gets (2026-07-29)

The frame was capped at a flat 900px, which on a wide window meant the viewer showed a
_smaller_ photograph than the editorial lead behind it — opening a frame zoomed out. It now
takes the larger of what the window allows, from one budget stated once on `.lb`:

| Cap          | Value                        | Why                                                                            |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------ |
| `--lb-w-cap` | `min(1600px, 100vw - 188px)` | The stage's own width: 60px padding, two 40px arrows, two 24px gaps            |
| `--lb-h-cap` | `100vh - 240px - safe areas` | The 52px bar, the stage's 14px, 156px of metadata, ~18px so it is never wedged |

`sizeFrame()` writes `min(w-cap, h-cap × aspect)` onto the image, because the aspect ratio
is the one part the stylesheet cannot know and an `<img>` with `aspect-ratio` and no
intrinsic size yet lays out at zero — the frame must have its final size before the LQIP
paints. On a 1720×926 window a 3:2 frame goes 900×594 → 1029×686, which is 95% of the
vertical room there is; the width left over at the sides is the window's aspect, not slack.
The 1600px ceiling is where a 2× display would start upscaling the 2560 derivative.

The metadata stack follows the frame's width so the title and the thumbnail strip line up
with the photograph's edges — but only **outwards**, past a 900px floor. A portrait frame is
609px wide on that same window, and a footer that narrow wraps eight tags onto four rows,
which grows the stack up over the photograph's bottom edge.

Per-photo **accent** colour (brackets, counter, tile hover) is a separate question and is
**still open**. The five accents in the mockups are per-album, so it is coupled to whether
albums happen — and if they do, the accent can come straight from the album with no colour
extraction at all. Tracked in MILESTONES M4. (The gallery _page_ accent is no longer open —
`--run` in §12 answers it per shoot, not per photo. The **crop marks** are the part that
stays ramp-derived, and for a reason given there.)

---

## 12. The light pass (2026-07-29)

The interior pages had structure without illumination: hairlines and plates, one flat
cyan used as ink. This pass gave each page a light source, on the vision's rule that
light must be emitted by something in the scene. Everything here was prototyped against
screenshots and accepted by the owner before landing.

### The gallery is lit by the shoot on screen

The lightbox trick at room scale. `/photos` holds a two-layer backdrop (`.px-ambient`,
`z-index: -1` inside `.page`). When the rail's tracked run changes, the incoming shoot's
**LQIP** — already inlined in the markup, so zero network cost — is painted onto the
hidden layer at `blur(80px)` and the layers cross-fade. Scroll from stage lights into an
autumn outing and the room changes with you.

This layer is **viewport-fixed, and that is a ruling, not an accident**. It was briefly
top-anchored with the other blooms during the 2026-07-29 review and reverted the same
day: the nebula and page hazes are the _arrival's_ light and belong to the top of the
page, but the gallery bloom is the _room's_ light — it has to be wherever you are, or
the cross-fade between shoots means nothing. The two behaviours are both deliberate;
don't unify them in either direction without the owner.

The accent follows the light. The LQIP's average colour is taken in **OKLab**
(`src/lib/ambient.ts`, Ottosson's matrices, unit-tested in `tests/ambient.test.ts`), and
only its **hue** survives: it is re-emitted through the ramp's locked lightness and
chroma as `oklch(.80 .17 h)`. A sampled colour is therefore physically incapable of
breaking the palette — it can steer the ramp, never leave it. Below `GREY_FLOOR` chroma
(monochrome shoot, or hues that cancelled in the average) the sample is discarded rather
than inventing a hue from noise.

#### The accent belongs to the shoot, not to the scroll position (owner review 2026-07-29)

This started as `--live` on `<html>`: **one hue on screen at a time**, the shoot the
rail was tracking, everything else cyan. That invariant is **withdrawn**. It could not
survive the shoots sheet — a list of every outing at once, whose eleven dates were all
cyan while the header behind them was pink, so the sheet and the page disagreed about
what colour a shoot is. The owner's ruling: _"we already have a different hue for the
date, and I like those — we should aim to be consistent."_

So the accent is now a property of the shoot. Each run's LQIP is sampled **once**, at
init, and painted as `--run` on that run's section, its rail entry and its row in the
shoots sheet; the viewer takes the open frame's `--run` too. Everything that **names** a
shoot burns in that shoot's hue:

| Fitting                                      | Was                  |
| -------------------------------------------- | -------------------- |
| Run header date, and the tube beside it      | cyan date, grey tube |
| Editorial lead's rule                        | fixed `--sodium`     |
| Rail entry (active only — it marks position) | `--live`             |
| Shoots sheet row date                        | cyan                 |
| Viewer footer's tube                         | cyan                 |

The pre-JS value is the run's point on the **accent ramp** (`runHue` in the gallery
page), so the markup is already correct and in-palette without a script; sampling only
ever replaces one ramp hue with the photographs' own, and a rejected sample leaves the
ramp's in place. This is the same two-stage arrangement `src/lib/ramp.ts` documents for
the home rail. The rainbow the old ruling feared is bounded by the ramp: lightness and
chroma are locked, so many hues read as one lit system rather than as decoration.

**A tile's hover marks are the exception and stay ramp-derived** (`--bk`, per outing). A
mark that _touches_ the photograph must not be the photograph's own average colour, or it
reads as a colour cast on the image instead of a frame around it. They were cyan — the
site's interactive edge — which fought the warm third of the library.

**The viewer draws no crop marks at all** (2026-07-29). It had four, in the same `--bk`,
and they were the tile's marks carried inward. On the sheet that mark is doing work: it
says _this tile is the one you are pointing at_ among a hundred others. In the viewer
there is one photograph, nothing to disambiguate, and the bloom already draws the frame's
edge in the photograph's own light — so the brackets were a second, contradicting edge
drawn on top of it. `--bk` is now a tile-only property; the viewer sets only `--run`, for
the tube beside the shoot name.

The scripting lives in `src/scripts/photos.ts`: `setAmbient` still hooks `trackRail()`
for the LQIP cross-fade, and `sampleAllAccents` runs the eleven samples once on idle.

### Long pages: light the structure, never the prose

The reading column stays serif and unlit — that rule survives intact. What changed is
that a post's _skeleton_ now obeys the light grammar (§2):

- **Reading progress** is a sodium filament with a bright breathing head — the home
  charge's identity (sodium = where you are) applied to reading position. The head only
  moves when you do; the breathing is the sole ambient animation on the page.
- **`h2` headings** carry a lit sodium tick (150px — long enough to underline the first
  word or two, fixed so a long heading can't stretch it into a bar). Section-marker
  ticks are sodium everywhere: a section head tells you where you are in the document.
- **Blockquotes** wear the violet lit edge, mirroring code's cyan one (§6).
- **`hr`** is a thin violet light across the dark, not a pencil rule.
- **Links and log entries** glow cyan on hover: reaching for a touchable thing lights it.
- **The log's sticky year numeral** glows violet, a district sign that pins and travels.
- **The log's entry separators** carry a 250px violet-lit segment on the hairline — on
  `/blog` and on the home page's log preview alike, because those rows are pieces of
  the same log.
- **About's section markers** carry sodium ticks, echoing the home section headers.

### What was deliberately not done

No flicker outside the hero. No wet-floor echo outside the hero. No per-post or per-item
hue assignment. No colour anywhere that fails the grammar's three questions. The prose
face never takes a glow. And nothing ambient animates: the nebula holds still (§5.1),
and each page's field composition and haze key (§6) are the only per-page variation.
