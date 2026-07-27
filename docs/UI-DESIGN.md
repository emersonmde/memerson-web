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
| `/photos/[page]` | 6b     | Masonry contact sheet, lightbox                              |
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
TYCHO · LUNA · 43.3°S 11.4°W · NO TRACKERS, NO ANALYTICS
```

`43.3°S 11.4°W` is the real selenographic position of **Tycho crater** — the TMA-1
excavation site in _2001: A Space Odyssey_. The coordinates are genuine and check out;
they are simply not on this planet, and the line keeps the exact shape of an ordinary
location string so nothing gives it away at a glance.

It is also the choice that agrees with the design's own brief. The mockup's notes say
this world is **"vacuum, not street"** — which is why rain was cut and a star field kept.
A street-level reference (Chiba, Kowloon, the Bradbury Building were the alternatives)
would have contradicted that; a crater on the Moon does not.

---

## 9. Mobile

Not done. Desktop-only was a deliberate choice, not an oversight — the mockups specify
desktop layouts and the mobile design is its own piece of work.

### The governing constraint: fluid, not snapping

The requirement is that the site **transitions smoothly at any window size**, not that it
has a phone layout and a desktop layout with a jump between them. That rules out a
breakpoint-first approach and argues for:

- `clamp()` on anything whose value is arbitrary rather than meaningful — the gutter, the
  sign size, section padding.
- **Container queries** over viewport media queries where a component's layout depends on
  its own width rather than the page's.
- Breakpoints reserved for genuine **reflows** — where an arrangement stops making sense,
  not where a number needs to shrink.

The tokens already support this: every dimension that matters is a custom property in
`:root`, so the fluid pass is largely a matter of giving those properties `clamp()` values
rather than touching component CSS.

### Two phases, deliberately separate

**Phase 1 — responsive-ready groundwork.** Mechanical, low-risk, and it survives whatever
mobile mockup arrives, because it invents no visual design:

- Fluid `--gutter` and `--rail-offset` (they must scale _together_, see below).
- Fluid hero sign size; the reflection's hard-coded `74px` height has to follow it.
- Guarantee no horizontal overflow and no overlapping text at any width.
- Sensible `column-count` reduction on the contact sheet.

**Phase 2 — the actual mobile design**, from a mockup. Everything with a real visual
decision in it: what the nav becomes, how the rail reads on a narrow screen, whether the
lightbox stays a lightbox on touch, what happens to the footer floor.

Doing phase 2 before there is a mockup means inventing a design that then gets thrown
away. Doing phase 1 early is free.

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
- **A lightbox background glow keyed to the photograph's own colours** — this needs new
  manifest metadata, and is tracked in MILESTONES M4 rather than here, because the design
  cannot be implemented until the data exists.
