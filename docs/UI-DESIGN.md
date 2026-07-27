# memerson-web — UI Design ("Neon District")

The visual identity, imported 2026-07-26 from the Claude Design project
**"Personal website design system"**, file `Neon District Mockups.dc.html`.

This is M3. Before it, the site was deliberately unstyled — see
[MILESTONES.md](./MILESTONES.md). Nothing here derives from the old
`errorsignal.dev` design; the reversal note in [CONTEXT.md](./CONTEXT.md) still stands.

**Desktop only, deliberately.** The mockup specifies desktop layouts and the mobile
pass is a separate future piece of work. §9 records what that will have to deal with.

---

## 1. The one-sentence version

A dark observation deck: a star field that never moves, one continuous neon rail running
the length of the index, and light that travels along objects rather than objects that
move. Long-form reading drops the neon entirely and becomes a serif page.

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

### 5.2 Type resolves on entry

Headings arrive blurred with open tracking and resolve as they enter the viewport — a lens
finding focus, not a fade-up. Body copy never does this.

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

**The glow lives on a wrapper, not on the masked rail.** A mask paints only within the
element's box and a `box-shadow` is drawn outside it, so the shadow was clipped to a 3px
column and vanished past the charge front. A filter on the parent applies to the
already-masked child, so the glow follows the charge and stops where it stops.

**Nodes light from the charge, not from their own scroll position.** An offshoot should
kindle because the charge arrived. The two only agree while the charge runs at exactly
scroll speed, which it no longer does.

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

---

## 6. Materials

- **Plate + brackets** — a hairline box with four corner L-brackets in the node's sampled
  hue. On hover, a charge runs the top edge and the plate lifts _in value, not position_.
- **Neon tube** — a 3px rounded bar with a two-stage glow (tight `box-shadow` plus a wide
  low-opacity one) and a specular highlight travelling along it.
- **Wet-floor echo** — display type mirrored below itself, blurred, masked to fade out.
- **Haze + shaft** — large blurred radial gradients and one angled light shaft, hero only.
  Strong here because it is the one place it can be without fighting text.
- **Scanlines** — a 1px repeating gradient at 4.5% opacity over everything.

---

## 7. Pages

| Route            | Mockup | Notes                                                        |
| ---------------- | ------ | ------------------------------------------------------------ |
| `/`              | 6a     | Sign, rail, 11 project plates, photo + log previews, contact |
| `/photos/[page]` | 6b     | Contact sheet, lightbox, infinite scroll                     |
| `/blog`          | 6c     | Year-grouped, serif, sticky year                             |
| `/blog/[slug]`   | 6d     | 68ch serif, lit code edge, reading progress                  |
| `/about`         | —      | Not in the mockup; extended from the language. See §8.       |
| `/404`           | —      | Not in the mockup; extended from the language.               |

**Nav labels differ from routes on purpose.** The design calls them SYSTEMS / PHOTOS /
LOG; the URLs stay `/`, `/photos`, `/blog` because blog slugs must survive the
`errorsignal.dev` redirect (M2). Labels are presentation; URLs are a contract.

---

## 8. Where the design and the data disagree

The mockup was built against invented content. Everything below is a place where the real
data is used instead, or where a designed element could not be honoured.

| Mockup                               | Reality                                    | Resolution                                              |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------------------- |
| 214 photos, 5 albums                 | 118 photos, no album metadata at all       | Real count. **Album filter chips omitted** — see below. |
| Photo titles ("Playa Norte, 14:20")  | All `title`/`caption` are `null`           | Falls back to the date, as `Photo.astro` already did.   |
| Photo meta ("35MM · f/8")            | Real EXIF exists                           | Built from real camera/aperture/shutter.                |
| Coloured gradient placeholders       | Real derivatives in R2                     | Real images; the manifest LQIP is the dim wash.         |
| 24 posts                             | 5 posts                                    | Real count everywhere.                                  |
| 9 systems                            | 11 projects in the collection              | All 11, ordered by the YAML `order` field.              |
| Reading time per post                | Not in frontmatter                         | Computed from word count at build.                      |
| `/systems/<name>` deep pages         | Do not exist                               | Plate links go to the real GitHub/docs/crate URLs.      |
| `matthew@memerson.com` in the footer | **Unverified** — not in the repo anywhere  | **Omitted.** See below.                                 |
| `SEATTLE · 47.6°N 122.3°W`           | **Unverified** — location asserted nowhere | Replaced with an Easter egg. See below.                 |
| `EMERSON` on the hero sign           | The wordmark is `M.EMERSON`                | Sign is now `M.EMERSON`, sized to the word.             |

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
a reviewer asked. `MEMERSON.COM — DISTRICT 09 / PERSONAL` passes — it is the design's
fiction, not an instruction, and the 404's `SIGNAL LOST — DISTRICT 09` is the same voice.

### Pagination is invisible to the reader

`/photos/2`, `/photos/3` … are real pages — they work without JS, they are crawlable, and
they keep the initial HTML small. With JS they disappear: the sheet grows as you scroll and
the lightbox runs through the whole library, pulling the next page in when you step off the
end rather than stopping or wrapping. The paginated nav is the no-JS path and is hidden once
`src/scripts/gallery.ts` is running.

Two things to know before touching it. Astro fires `astro:page-load` on the **first** load
as well as on router swaps, so the module must guard against initialising twice — otherwise
you get two observers pulling pages and two stacked lightboxes. And a router swap does not
re-execute a script the previous page already loaded, which is why navigating between
paginated pages once left the sheet completely inert.

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

Not done. Desktop-only was a deliberate choice, not an oversight — the mockups specify
desktop layouts and the mobile design is its own piece of work.

### The governing constraint: elements morph, they don't just shrink

**This is stronger than "responsive".** The requirement is not that the desktop layout
scales down and reflows — it is that the design's _elements themselves_ transform
continuously as the window narrows, arriving at the mobile design by a smooth path rather
than a jump.

The worked example, from Matthew:

> The electric bar next to projects could smoothly shrink until it's just a left border of
> the projects container, removing the whitespace.

Read that carefully, because it sets the standard. The rail does not get thinner and keep
its 56px of empty offset. It **becomes a different thing** — a glowing left edge on the
plate itself — and the whitespace it used to need goes away with it. Same element, same
meaning ("this run of projects is one connected thing"), continuously re-expressed at a
width where a detached spine no longer earns its space.

This is the same idea as the motion law in §4, applied across width instead of time:
**energy travels, objects hold still.** A rail collapsing into a border is the object
holding still while the light re-forms around it. A rail that abruptly disappears at
`768px` and is replaced by a border is a cut, and cuts are what this design does not do.

Implications for how it gets built:

- `clamp()` and calculated values over discrete breakpoints, so intermediate widths are
  _designed states_, not accidents between two designed states.
- **Container queries** where a component's shape depends on its own width rather than the
  page's — the plates are the obvious case.
- Where a genuine reflow is unavoidable, it should still be reached by interpolation
  (a gap going to zero, an offset going to zero, an opacity crossing) rather than a
  `display` swap.
- Breakpoints are a last resort, and each one is a place where the smoothness promise is
  being broken — so each needs a reason.

The tokens support this: every dimension that matters is a custom property in `:root`, so
much of the work is giving those properties fluid values. But the rail example shows that
**token interpolation alone is not sufficient** — `--rail-offset → 0` has to be
accompanied by the rail's own geometry changing from a detached 3px bar to a border on the
plate. That is per-element design work, not a global find-and-replace.

### Two phases, deliberately separate

**Phase 1 — responsive-ready groundwork.** Mechanical, low-risk, and it survives whatever
mobile mockup arrives, because it invents no visual design:

- Fluid `--gutter` and `--rail-offset` (they must scale _together_, see below).
- Fluid hero sign size; the reflection's hard-coded `74px` height has to follow it.
- Guarantee no horizontal overflow and no overlapping text at any width.
- Sensible `column-count` reduction on the contact sheet.

**Phase 2 — the transformations**, from a mockup. Each is a decision about what an element
_becomes_, and none can be guessed:

- The rail → a glowing left border on the plates (the one example we have).
- The nav → ?
- The lightbox on touch → ?
- The footer's tilted floor → ?
- The hero sign and its reflection → ?

Doing phase 2 before there is a mockup means inventing transformations that get thrown
away — and unlike ordinary responsive work, a wrong guess here is not "slightly off
spacing", it is the wrong element becoming the wrong thing. Phase 1 is free; phase 2 waits.

### The specific things that will fight back

- **The hero sign** is `116px` on a `fit-content` wrap, and `.sign-echo` has a hard-coded
  `74px` height chosen to match that size. Change one without the other and the wet-floor
  reflection detaches from the type.
- **The gutter and the rail offset are coupled.** `--gutter: 70px` positions the rail;
  `--rail-offset: 56px` positions the plates relative to it; the node sits at `left: -59px`
  and the offshoot spans `-50px` to `+1px`. These four numbers are one system. Collapse the
  gutter without collapsing the offset and the offshoots visibly detach from their nodes.
- **The contact sheet** is `column-count: 4`. It reduces cleanly, but `fx.ts` re-samples
  rail hues from measured positions on resize, so verify the resize path still fires.
- **The lightbox assumes a pointer and a keyboard** — no swipe, and the prev/next controls
  are 40px, below the ~44px touch target guideline.
- **The nav** is a single non-wrapping row of five items.
- **The footer floor** is a `perspective(900px) rotateX()` plane sized in viewport
  percentages and distorts badly below ~700px.

Nothing in the markup blocks any of this — the layout is flex/grid throughout and the
tokens are all custom properties — but none of it has been exercised below 1160px.

---

## 10. Iterating on the design

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

Per-photo **accent** colour (brackets, counter, tile hover) is a separate question and is
**still open**. The five accents in the mockups are per-album, so it is coupled to whether
albums happen — and if they do, the accent can come straight from the album with no colour
extraction at all. Tracked in MILESTONES M4.
