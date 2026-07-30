# memerson-web — Milestones

Few, large milestones. Each is a **real stopping point** — the site works and nothing is
half-finished, even if later milestones never happen. M1 is by far the largest.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the technical design and
[CONTEXT.md](./CONTEXT.md) for current-state facts.

---

## M1 — Functional site live on memerson.com

The bulk of the work: everything functional, nothing visually designed. **Complete** —
`memerson.com` went live 2026-07-27.

M1 was **deliberately unstyled**: semantic, minimal markup with no visual identity, no
colour system and no committed layout language, so that M3 could restyle without
restructuring. That bet paid off — M3 added `src/styles/global.css` and per-page scoped
styles on top of this markup and needed almost no structural change to it.

- [x] Astro scaffold (Astro 7, Node 24 pinned in `.nvmrc`), `output: 'static'`, `site` set
- [x] `wrangler.jsonc` with assets config + `custom_domain: true` on `memerson.com`
- [x] Content collections: `blog`, `projects`, `photos`
- [x] Routes exist and build: landing, about, blog index, blog post, photos, 404, RSS
- [x] `<Photo>` component for blog-post photo references
- [x] `wrangler login` (OAuth, `emersonmde@protonmail.com`)
- [x] R2 enabled on the Cloudflare account (dashboard)
- [ ] Workers Builds connected; push to `main` deploys. **Half done as of 2026-07-27:** the
      repo is now public at `github.com/emersonmde/memerson-web` and `main` is pushed, which
      was the blocker. What is left is authorizing Cloudflare's GitHub app and picking the
      repo, and that is dashboard-only — no wrangler command or API token reaches it.
      `wrangler deployments list` still reports `Source: Unknown (deployment)` for every
      deployment, which is what a CLI deploy looks like; a Workers Builds deploy would name
      the commit.
- [x] First deploy to `memerson.com` — **live 2026-07-27.** All 13 routes 200, 404 returns
      404, fonts/icons/manifest serve, photos load from R2.
- [x] Blog posts migrated from `emersonmde.github.io` (slugs preserved exactly)
- [x] Projects migrated from YAML
- [x] About/CV written (carried over from the old site's copy)
- [x] Favicons / site manifest (real icons; Astro's default `favicon.svg` removed)
- [x] R2 buckets created; `photos.memerson.com` custom domain attached
- [x] Photo import CLI (`photos:import`, `photos:verify`, `photos:rebuild`)
- [x] All 118 photos migrated S3 → R2, manifest committed
- [x] Gallery verified with real photos: `srcset`/`sizes`, LQIP, no CLS — 118 figures over
      4 pages, real `w` descriptors, intrinsic dimensions on every `<img>`, LQIP inlined
      (22 KB across the whole manifest). Pagination — and with it the `paginate([])` guard —
      was removed on 2026-07-28; see M4.

**One item left:** **Workers Builds**. The GitHub remote it was waiting on now exists;
only the dashboard authorization remains. `npm run deploy` covers deployment until then, so
nothing depends on it.

**Exit criteria:** `memerson.com` serves the real site with all content and all photos. The
API Gateway photo dependency is gone. Ugly, but complete and honest. — **Met.**

**Why photos were in M1:** the photo _data migration_ is what unblocks the AWS teardown, so
it could not be deferred. Only the _fancy gallery presentation_ (M4) could.

### What the first deploy cost, for the record

Two things went wrong that are worth not rediscovering:

1. **A proxied CNAME at the apex blocked `custom_domain`** (`code 100117 — hostname already
has externally managed DNS records`). It was invisible to `dig`, because Cloudflare
   flattens an apex CNAME into synthetic A/AAAA answers — so the resolver reports address
   records while the dashboard holds a CNAME. **Never infer the stored record type at an
   apex from what resolves.** No wrangler OAuth scope grants DNS write, so clearing it is
   always a dashboard step.
2. **The binding and its DNS record are provisioned separately, and the first deploy only
   did the first half.** `wrangler deploy` reported success and the API showed
   `enabled: true` with an issued cert, but no address record appeared for 15+ minutes. A
   second, byte-identical `wrangler deploy` created it in seconds. If the custom domain
   exists but the name does not resolve, just deploy again.

---

## M2 — Cutover: redirects and retiring the old site

> **AWS teardown is not tracked here.** Matthew owns it and is doing it independently. The
> inventory that was done for it — deployed stacks, the four photo buckets, the orphaned
> Minecraft EBS volume and Elastic IP, current spend — is kept as reference in
> [CONTEXT.md](./CONTEXT.md#aws-teardown-scope--inventoried-2026-07-26). Nothing below
> depends on it except where noted.

What remains here is Cloudflare- and GitHub-side: pointing the old URLs at the new site
and closing down `errorsignal.dev`.

**The redirect goes in the old Astro repo, not on the domain.** `errorsignal.dev` is a
shared host — several separate repos publish to it through GitHub Pages (the `coppermind`
WASM demo, Rust docs, other static assets) and they keep working from it. Putting the
redirect in `emersonmde.github.io` means the other repos are untouched _by construction_,
with no domain-level rule that a future project could accidentally match. Caveat: GitHub
Pages cannot emit a 301, so these are meta-refresh redirects. Full reasoning and scope in
[ARCHITECTURE §8](./ARCHITECTURE.md).

- [x] Confirm the S3 photo buckets hold nothing unmigrated — all four inventoried, every
      photo sha256-matched against the committed manifest. Clears the way for the teardown.
- [x] **Decide analytics** — **no analytics.** Decided 2026-07-27; reasoning below.
- [x] **Add self-redirects to `emersonmde.github.io`** for `/`, `/about`, `/blog`,
      `/blog/<slug>`, `/photos`, `/rss.xml` — **live 2026-07-27** (commit `e5f8e05`, Pages
      workflow green).
- [x] Verify old blog URLs land correctly — 1:1 as expected. All nine redirect pages were
      fetched from live `errorsignal.dev`: each returns 200, carries a 0-second refresh, a
      matching `rel="canonical"`, and no `noindex`; every target returns 200 on
      `memerson.com`. Bare paths (`/about`) still 301 to the trailing-slash form first,
      which is Pages' own behaviour and lands on the redirect page either way. The one shape
      change was `/photos` → paginated `/photos/2..4`, with the old single `/photos` mapping
      to the first page. Pagination was removed again on 2026-07-28, so `/photos` is once
      more a single URL and the old redirect target is exact.
- [x] Verify the **fall-through** still works after the redirect lands. **Confirmed
      2026-07-27**, and wider than the single check this line asked for: three project sites
      publish to the domain and all three still serve their own content —
      `/coppermind/` (the WASM demo), `/daedalus/` (the Rust docs) and `/vilya/`. `/rss.xml`
      is valid XML served as `application/xml`, and an unknown path returns a real 404 with
      the moved notice rather than a redirect.
- [ ] Archive `emersonmde.github.io`. The precondition — redirect confirmed — is met, but
      **deliberately deferred 2026-07-27**: leaving the repo active keeps the option of
      pushing a fix to the redirects without an unarchive round-trip, and the redirects have
      only had one day of real traffic. Archiving does not affect the other repos publishing
      to the same domain and does not take the deployed Pages site down; it only stops the
      Actions workflow. Nothing depends on doing it.

**Exit criteria:** old URLs resolve to their new equivalents and `errorsignal.dev` is
retired. — **Met 2026-07-27.** The repo's archive flag is bookkeeping, not function: the
domain already serves nothing but redirects.

### Analytics: none — decided 2026-07-27

The bar set for adopting Cloudflare Web Analytics was that it report **unique users**, be
free, and be trivial to run. It fails the first, and by design rather than by omission:
Cloudflare's beacon is deliberately cookieless and does not fingerprint by IP or User
Agent, so it has no way to recognise a returning person. What it reports is **page views**
and **visits**, where a visit is a page view whose HTTP referer is a different hostname.
That is a fine metric; it just is not the one that was being asked for, and it is not worth
a script on every page to get it.

Cloudflare's dashboard already gives per-route request counts for `memerson.com` with no
client script at all, which covers the practical question ("is anyone reading this?")
without shipping anything.

So the site ships no analytics. The footer's `NO TRACKERS, NO ANALYTICS` was **removed
anyway** — the claim was true, but advertising an absence turns it into a promise, and the
promise is the part that ages badly. See [UI-DESIGN §8](./UI-DESIGN.md).

### How the redirects were built, and one deviation

Not via Astro's `redirects:` config, which was the plan of record. That config emits the
right meta refresh but also stamps `<meta name="robots" content="noindex">` on every
redirect page — and noindex blocks the old URL from Search outright instead of passing its
signals to the new one, which is the opposite of a site move. Google's canonicalization
guidance says not to use noindex for this. The pages are hand-written instead, via
`src/layouts/Moved.astro` in the old repo: instant (0-second) meta refresh, which
[Google documents as a permanent redirect](https://developers.google.com/search/docs/crawling-indexing/301-redirects),
plus `rel="canonical"` at the new URL, and no robots directive.

**`/rss.xml` is the exception.** A meta refresh cannot work there: GitHub Pages serves
`.xml` as XML, so an HTML redirect document at that path arrives as a parse error rather
than a redirect. It stays a valid feed — channel link pointing at `memerson.com`, one item
announcing the move — which is both readable in an aggregator and a plain link for a
crawler. There are no known subscribers, so nothing is being disrupted either way.

**`/404` deliberately does not redirect.** Every real old URL has its own redirect page, so
anything reaching the 404 is a path that never existed; funnelling those to a homepage
reads as a soft 404. It is also the 404 for the project sites sharing the domain.

The old repo's TUI implementation — React components, the tmux shell, the Sonokai
stylesheet — was deleted in the same change, along with the React integration and font
dependencies. A redirect-only site should build as one. It is all still in git history, and
`src/content/` was left intact since it remains the source of record for the migration.

---

## M3 — UI design

The visual identity, from scratch. **Nothing carried over from the old site.** Designed
separately in Claude Design as **"Neon District"**; the mockups it was built from are kept
in [`design/`](./design/) and the system is documented in [UI-DESIGN.md](./UI-DESIGN.md).

- [x] Design direction: typography, colour, spacing, layout language — **"Neon District"**,
      designed separately in Claude Design and imported 2026-07-26
- [x] `docs/UI-DESIGN.md` written
- [x] Implement across all pages — home, contact sheet, log index, post, about, 404
- [x] Gallery visual treatment — dim-by-default tiles, masonry sheet, lightbox
- [x] **Mobile pass — done 2026-07-28.** From the **Mobile Site** and **Photos on Mobile**
      boards in Claude Design. Breakpoints at 1240 / 1100 / 900 / 720 / 560 plus
      `hover:none`; desktop above 900px is unchanged. Recorded in
      [UI-DESIGN §9 and §10](./UI-DESIGN.md).
- [ ] Accessibility pass — the basics are in (skip link, focus rings, `aria-current`,
      reduced-motion, alt text, keyboard lightbox), but nothing has been run through a
      real screen reader or a contrast audit. The dim-by-default photo tiles and the
      `--faint` metadata colour are the two things most likely to fail contrast.
- [ ] Light mode — not designed. The system is committed to a dark surface stack; a light
      variant would be a second design, not a token flip.
- [x] **Mockup 6g — the "Redraw" page transition** — done 2026-07-27 via
      `<ClientRouter />` and `src/scripts/redraw.ts`. Needs a real browser to judge; the
      380ms wipe cannot be seen headless.
      **Rebuilt 2026-07-29 for real-device iOS.** The View Transitions overlay
      composited unreliably on an actual iPhone (late-starting animations — a ~1s dim —
      then two independent desyncs), and none of it reproduces in the iOS simulators,
      so the overlay is now skipped outright and the wipe is a single live-DOM panel
      whose top edge is the scan line, starting below the nav, at 300ms. Same visual on
      every engine, View Transitions API or not. Full history in `src/scripts/redraw.ts`.
      The same session added `chaseCharge` to the rail (UI-DESIGN §5.3): phone flicks
      outrun the node ramp between frames, so the painted charge now rolls to its
      geometric target instead of teleporting with the scroll.

### Review pass, 2026-07-27

A full re-read of code, docs and mockups against the implementation found four things,
all now fixed:

- **The lightbox ambient bloom was missing**, then **stacked wrong**. The mockup drives it
  from a placeholder gradient, so with no real photo behind it the layer read as decoration
  and was dropped. Restored — and the first restoration put the bloom _under_ the dark
  wash, which drowned it completely. Order is wash → bloom → vignette.
- **The lightbox thumbnail strip was missing** (mockup 6b). Added, as a five-wide window
  around the current photo rather than all 30.
- **Home preview tiles linked to the raw `.webp`**, stranding visitors on a bare image file
  with no navigation. The mockup links them to the gallery; they now go to `/photos`.
- **122 of 133 images shipped with empty `alt`.** The date-fallback existed in
  `Photo.astro` but `PhotoThumb.astro` had its own copy that fell through to `''`, marking
  every photograph decorative. Both now share `src/lib/photoAlt.ts`.

**Exit criteria:** the site looks intentional and finished. — **Met on desktop.** The
remaining three items are scope the mockup never covered, not unfinished work against it.

**Design/data gaps** carried from the import are tabulated in
[UI-DESIGN §8](./UI-DESIGN.md) — most notably the album filter chips, which have no data
behind them and are omitted rather than invented. **M4 later concluded they are the wrong
affordance regardless**, not merely unpopulated; see "Shoots and albums".

---

## M4 — Gallery enhancements

Deferred because it is not on the critical path — not because it is hard. The decisions that
_would_ be expensive to change later (keys, manifest schema, captured metadata) are all
locked in during M1.

- [ ] Masonry via aspect-ratio bin-packing; `@supports` grid-lanes enhancement.
      **Partly done in M3**: the sheet is `column-count: 4` over real manifest aspect
      ratios, which is the documented no-JS fallback. Bin-packing would fix the
      down-the-column reading order; grid-lanes is still not interoperable.
- [x] ~~Infinite scroll (IntersectionObserver appending paginated blocks)~~ — done
      2026-07-27, **then removed 2026-07-28** along with pagination itself. The Photos
      Redesign needs the whole library at once to be truthful about coverage, so `/photos`
      is one static page. Reasoning in [ARCHITECTURE §6](./ARCHITECTURE.md) and
      [UI-DESIGN §8](./UI-DESIGN.md).
- [x] **The gallery redesign — done 2026-07-28.** Imported from the **Photos Redesign**
      board. Three views over the same frames (SHEET / RUNS / EDITORIAL), sticky run
      headers, the margin shoot rail, the stray-frame rule, tag filtering, and a viewer
      with a capture-data drawer. This is what the M4 metadata was captured _for_.
- [ ] Trimmed search/random index
- [x] ~~**Filtered routes** — `/photos/album/<slug>`~~ — **superseded 2026-07-28.** The
      redesign answered this differently and better: filtering is a query over the one
      page, driven by the search field or by clicking a tag in the viewer, with a header
      saying what is being shown. Shoot _detail pages_ are not needed once runs exist —
      they would split the library in half for no gain, and a route per album still implies
      a partition this library does not have. The `.chip` styles in `global.css` remain
      unused for the same reason.
- [ ] `Save-Data` handling

### Metadata extraction — **done 2026-07-27**

Built first, deliberately, and ahead of any UI: capture the metadata now, decide what to do
with it once the viewer is designed. Everything below writes only into authored fields, and
the manifest is in git, so **the diff is the review**.

Three commands, all idempotent by skipping:

| Command              | Does                                               | Model |
| -------------------- | -------------------------------------------------- | ----- |
| `photos:shoots`      | groups photos by capture time, seeds `shoots.json` | no    |
| `photos:describe`    | `tags`, `caption`, `title` per photo               | yes   |
| `photos:name-shoots` | proposes a name per shoot, from several frames     | yes   |

`photos:import` runs all three over **only what it just imported**, so each photo is
described exactly once, when it arrives. `--no-metadata` opts out. The standalone commands
are backfills.

**Results on the first 118:** 14 shoots, 118/118 described in 2m57s with zero failures,
14/14 shoots named in 32s. The naming step independently identified the tropical shoot as
"Caribbean Vacation … likely St. Croix", which is precisely the album that motivated the
design, and produced two separate "Air Show" shoots — the multi-shoot album case, arriving
on its own without being asked for.

#### What was measured rather than assumed

- **`--effort low`.** Byte-identical tags and caption to `medium` on the same frame, 5.2s
  against 8.4s. There is no reasoning to do here — the answer is in the pixels — so
  thinking budget buys latency and nothing else.
- **640px, the smallest derivative that already exists, sent as-is.** Descriptions at
  decreasing widths: 256px called a black-and-white ruffed lemur a "monkey/tamarin";
  384px recovered the species; 512px matched 640 in substance. **The failure mode below the
  floor is a confident wrong noun, not a vague one**, which is the reason to record the
  number rather than tune it later. No local downscaling — the variant is already small.
- **Capture settings help, exact dates hurt.** EXIF is passed as context because 600mm at
  1/2000s is a different photograph from 24mm at f/11. The date is passed as a **year
  only**: a precise day invites the model to guess an occasion it cannot see.
- **Tags beat titles, as predicted.** Titles are returned only for unmistakable subjects
  and are null far more often than not, which is the intended behaviour — a confidently
  wrong title is worse than none.

#### The unplanned win: alt text

122 of 133 images previously fell back to `Photograph taken 18 June 2017`. Every image now
carries a real description, because a caption written to describe a frame is exactly what
alt text is for. `photoAlt.ts` was reordered to prefer `caption` over `title` — alt text
must describe a picture, not name it. This closes most of M3's open accessibility item.

### The original plan, for reference

**1. Derived colour metadata** (mechanical, no model involved). **Still not built, and now
less likely to be needed** — see the note on the accent ramp under "Shoots and albums".

One thing is settled: the lightbox's ambient glow **is the photograph**, blurred and
saturated behind itself (Signal 4c; implemented 2026-07-27). It needs no metadata, and it
is the preferred treatment. Nothing below changes that.

What colour metadata would be for is the **per-photo accent** — the tile hover glow, the
lightbox brackets, the counter. This is **open**, not decided. It becomes more attractive
if albums happen (see below), since the five accents in the mockups are per-album.

If it is built, one rule holds regardless of how it is triggered:

> **A sampled colour must snap to one of the design's five photo accents.** Never apply a
> raw extracted colour.

| Accent               | Album in the mockups |
| -------------------- | -------------------- |
| `oklch(.82 .16 62)`  | REN FAIRE — amber    |
| `oklch(.80 .15 148)` | LANDSCAPE — green    |
| `oklch(.80 .15 200)` | CARIBBEAN — cyan     |
| `oklch(.80 .13 252)` | AVIATION — blue      |
| `oklch(.72 .22 332)` | NIGHT — magenta      |

The reasoning is §2's: a raw dominant colour off a photograph is usually desaturated, and a
grey-brown sky sampled literally gives a grey-brown glow that reads as a rendering bug.
Snapping to a fixed five keeps every accent on-palette by construction.

Implementation notes for whenever it happens:

- Dominant hue via `sharp`'s `.stats()` or a resize-to-tiny-and-quantise pass.
- Compare in **oklch hue space**, not RGB distance — the palette is defined in oklch and
  perceptual hue distance is what is being asked about.
- Store the chosen accent (or its index), not a raw hex. A stored hex invites someone to
  use it directly, which is the one thing the rule above forbids.
- **Backfillable without local originals**, from the archive bucket or the existing 640px
  derivative. `photos:rebuild` already re-derives from the archive.
- If albums exist, the accent can simply come _from the album_ and no extraction is needed
  at all — which is the cheapest version of this feature and worth checking first. Given the
  reframe below, that also means **most photos would have no accent**, since most belong to
  no album. That is fine, and arguably the point: an accent that only appears on album
  frames carries meaning, where one on every frame is decoration.

**2. AI-assisted titles, captions and tags** — **built, see above.** The notes below were
the plan and all of them held:

- Run `claude -p` headless over **downsampled** images — the existing 640px derivative is
  already in R2 and is more than enough, so nothing needs regenerating.
- Sonnet-class model; 118 small images is cheap and fast.
- Ships as its own command (`photos:describe`) rather than being buried in import, so it
  can be re-run, backfilled, and re-run again after a prompt change.
- Optionally wired into `photos:import` for new photos, behind a flag.
- **Writes only `title`, `caption`, `tags`** — the three fields the schema already marks as
  hand-authored. It must not touch anything derived.
- Idempotent: skip photos that already have the fields populated.

Two things to get right:

- **The manifest is in git, so the diff is the review.** Generated captions land as a
  reviewable change, not a silent mutation. Keep it that way — it is the whole safety
  mechanism.
- **Tags will be more useful than titles.** A model can reliably say _what is in_ a
  photograph; it cannot know that this was the third pass at the forge or which trip it
  was from. Expect to keep titles sparse and let tags carry the search index.

### Shoots and albums

Reframed 2026-07-27 after looking at the actual gap distribution and after Matthew
described what the library is going to become. **The earlier version of this section was
wrong in two ways, both recorded below**, because the corrections are the useful part.

#### The library is a stream, not a collection of albums

This is the governing fact and everything else follows from it. **Most photos belong to no
album and never will.** The plan is to keep importing interesting frames rather than only
portfolio work, so the misc fraction _grows_ over time. The named albums Matthew has in
mind today are roughly three: **aquarium, Disney (~2023), air show** — and note that
**none of them are in the manifest yet**, which currently runs 2017-06-18 → 2022-10-29.

So the mockup's album filter row, read as a partition of the library, is not just
unpopulated — it is the wrong shape. A chip row over this library is 90% "MISC". Albums are
a **sparse overlay on a flat stream**, and the UI has to treat them that way.

#### Threshold: 7 days, not 24 hours

The old 24-hour figure came from a plausible-sounding default, not from the data. The data
disagrees. Cluster count against threshold over the real 118:

| Threshold | 0.5d | 1d  | 2d  | 3d  | 5d  | 7d  | 14d | 21d |
| --------- | ---- | --- | --- | --- | --- | --- | --- | --- |
| Shoots    | 17   | 16  | 15  | 14  | 14  | 14  | 14  | 13  |

**The count is flat from 3 to 14 days.** That plateau is the signal: inside it the threshold
is not making the decision, the library's own structure is. Within a shoot the median gap
between consecutive frames is **10 minutes** (p75 = 1.3h); between shoots the gaps run 15,
37, 45, 52, 54 days. The band from 2.6 days to 15 days is nearly empty.

24 hours sits in the contested zone rather than the plateau, and three of fourteen groups
turn on noise there:

- **2021-08-16 → 08-18** (16 frames, iPhone 12 Pro + R6) — a multi-day trip whose largest
  internal gap is **14.4h**. It survives a 24h threshold by nine hours. That is luck, not
  margin, and it is exactly the "sparse import from a trip" case.
- **2017-06-18 → 06-19** — a gap of exactly **1.0 day**. A coin flip.
- **2019-09-24 → 09-27** — a **2.6-day** gap that 24h splits and 7d keeps together.

**The two failure modes are not symmetric, which is what settles the choice.** Splitting a
vacation across sparse days is fixed by a larger threshold. Conflating two subjects shot on
the same day is fixed by _no_ threshold at all — both are hours apart, so capture time
carries zero information about the distinction. Raising the threshold therefore costs
nothing on the case it cannot help and fixes the case it can. **Use 7 days, and treat
intra-day subject splits as a permanently manual operation.**

The one signal that would resolve same-day subjects is GPS, and it is off the table by
policy rather than difficulty: the EXIF allowlist drops it, and `photos.json` is in a public
repo, so storing coordinates would publish them.

Caveat to revisit: the 3–14d plateau is a property of a **sparse** library. As imports get
denser it will narrow. That is survivable because of the next point.

#### The real risk is recomputation, not accuracy

**Clustering must run once, over the new batch only, and never over the whole library
again.** If it re-derives on every import, a single new photo landing in a gap can merge two
shoots that were already named, group identity shifts underneath stored names, and manual
corrections are silently destroyed. _That_ is the failure that compounds over years; a wrong
split, fixed once, does not.

So the heuristic is a **labour-saver, not a rule** — a migration, not a runtime computation.
Two details make it hold:

- **Key a shoot by its earliest date** (`"2022-10-29"`), never an index, so nothing
  renumbers when a shoot is added, split or merged.
- **Keep the human-readable names in a separate small file** keyed by shoot id, so renaming
  touches one line rather than 32 photo rows.

Because the threshold only ever applies to unassigned new photos, it can differ per import
without disturbing anything already named — which is what makes the narrowing plateau a
non-problem.

#### Three layers, which is what working photographers already use

Settled 2026-07-27 against the prevailing convention rather than invented here, after the
question came up as "is an air show one album, or one per trip?"

| Layer       | Ours     | Equivalent                         |
| ----------- | -------- | ---------------------------------- |
| Instance    | `shoot`  | Lightroom folder; **IPTC `Event`** |
| Theme       | `series` | Lightroom Collection               |
| Descriptors | `tags`   | IPTC Keywords                      |

- **`shoot`** — automatic, one per photo, stable, never recomputed. Naming one is what makes
  it browsable. Unnamed shoots are misc: there is no MISC bucket to maintain and no taxonomy
  to invent, because misc is simply the absence of a name.
- **`series`** — optional, spans shoots, most are null.

**A recurring event gets one shoot per occurrence, not one shoot forever.** Two air shows
five years apart are two shoots both called "Thunder Over Dover" — the show is annual, at
Dover AFB — joined by `series: "air-shows"`.
[The IPTC standard asks for exactly this](https://www.iptc.org/std/photometadata/documentation/userguide/)
— name the specific occurrence, never the category ("Maui Classical Music Festival", not
"festival"). [Lightroom practice matches](https://www.lightroomqueen.com/organize-photos-folders/):
a photo lives in one dated folder and in any number of Collections.

The reasons are practical, not ceremonial:

1. **An album must be bounded to be browsable.** A merged "Thunder Over Dover" grows
   without end.
2. **Chronology inside it stops meaning anything** once occurrences are interleaved.
3. **You still get "every air show"** from the series, so merging buys nothing it does not
   also cost.
4. **It degrades gracefully.** The 2026 Disney trip and the 2028 air show each become their
   own shoot on import, with no taxonomy to maintain and nothing to decide in advance.

**The field is `series`, not `album`**, because colloquially the album _is_ the thing you
browse — which here is the shoot. Not `collection` either: that name is taken by Astro's
content collections and the clash would be actively confusing in code.

Economics: 118 photos → 14 shoots, so the human decision count is ~14 optional names rather
than 118 labels. Even a 50% error rate costs minutes to fix. Inaccuracy is cheap here;
silent re-derivation is not.

#### One viewer, many subsets

**Albums, tags and dates are not three features. They are one.** Each is a different way of
selecting a subset of the library; none of them is structurally special, and none of them
justifies its own viewer. Corrected 2026-07-27 — an earlier draft of this section treated
albums as their own thing and then asked whether the stream should be broken into
per-section masonry blocks. **Both were wrong.** The constraint is explicit:

> `/photos` and the lightbox stay exactly as they are today. One masonry sheet, one
> lightbox, no headers mid-flow, no sectioning.

So the model is a single viewer fed different item lists:

| Route                  | Subset     |
| ---------------------- | ---------- |
| `/photos`              | everything |
| `/photos/album/<slug>` | one album  |
| `/photos/tag/<slug>`   | one tag    |
| `/photos/<year>`       | one year   |

Identical component, identical lightbox, identical infinite scroll. Only the item list and
the header copy differ. This is **less** code than treating albums separately, not more.

The existing contact sheet already generalises, and the code makes it nearly free —
verified by reading it, not assumed:

- **The viewer derives its collection from the DOM.** `photos.ts` re-reads the visible
  tiles on every `show()` rather than snapshotting at open, so filtering scopes the viewer
  correctly with no parameterisation. This is what made the tag filter close to free, and
  it is the one prediction on this page that the redesign kept rather than replaced.
- A second view would mean a second masonry and a second lightbox kept in sync — precisely
  the class of bug that already left the gallery inert on `/photos/2` once.

**Consequence for the mockup's five accents:** they become implementable, but only named
albums get one and misc photos keep the default cyan. That is better than the mockup
intended — the accent then _means_ "this frame is part of something" instead of being
decoration.

**And it probably removes the need for colour extraction entirely.** The accent ramp in
`src/lib/ramp.ts` is a continuous hue function (66 → 200 → 286, lightness and chroma
locked), not a table of five colours. A shoot or album can simply be sampled along it by
index, which is deterministic, on-palette by construction, needs no `sharp` pass, and
stores nothing. The "snap a sampled colour to one of five accents" rule below is still
correct if extraction ever happens — it is just unlikely to be needed.

#### The actual gap is navigation, and it is undesigned

The viewer needs no redesign and should not get one. What has never been designed is
**how a person reaches a subset, and how they learn one exists.** The mockups' only answer
was the album chip row, and that assumes subsets partition the library — which is exactly
the assumption this section overturns. So there is nothing to implement against.

**This is worth a new mockup rather than an invented answer**, on the same grounds as the
rest of the design: `docs/design/` is the source of record, and UI invented here has a habit
of not matching. What to ask for, kept tight so the artifact is usable:

- **In scope:** the sheet header when it is showing a subset (what it is, how many, the way
  back to everything); how a subset is entered in the first place; how the lightbox reveals
  that the current photo has an album / tags / a date worth clicking; and whether an index
  of existing subsets exists at all, or discovery is purely contextual.
- **Explicitly out of scope:** the tile grid, the masonry, the lightbox chrome, the bloom,
  the thumbnail strip. Those are done and are not being revisited.
- **Constraints to hand over:** desktop only; existing tokens in `src/styles/global.css`;
  and the governing fact — **subsets are sparse.** Most photos have no album and never will,
  and the misc fraction grows over time. Any affordance implying a partition is wrong.

Drop the exported HTML into `docs/design/` alongside the existing mockups and it becomes
the spec, same as `Neon District Mockups.dc.html` did.

### Keeping this path open

The manifest writer used to rebuild every entry from a fixed field list, silently dropping
anything else on each write. Adding an `album` by hand would have survived until the next
`photos:import` and then vanished with no error. **Fixed 2026-07-27** — unknown fields are
now preserved, verified by round-tripping `album` and `accent` through a write.

What is still required to add a field later, none of it destructive:

- Add it to `FIELD_ORDER` in `scripts/photos/lib/manifest.mjs` so it sorts with the known
  fields rather than trailing them. Optional — it is preserved either way.
- Add it to the `photos` schema in `src/content.config.ts`. Zod strips undeclared keys at
  the collection layer, so a field will sit in the JSON but be invisible to templates until
  declared. Non-destructive, but it is the reason a new field appears to "not work".

**Exit criteria:** gallery stays fast and browsable at 1,000+ photos.

---

## Sequencing notes

- M1 → the AWS teardown is a hard dependency: photos had to be in R2 before the S3 bucket
  and API stack die. **That dependency is now discharged** — the manifest is committed and
  every S3 photo was verified against it, so the teardown is unblocked.
- ~~M2 and M4 are independent of each other. M2 is the higher priority of the two: until
  the redirect lands, `errorsignal.dev` is still the site people reach.~~ **Settled
  2026-07-27** — the redirect landed, so `memerson.com` is the site people reach and **M4
  is the next milestone.** What remains outside it is accessibility and light mode, plus the
  Workers Builds dashboard step. ~~Mobile~~ landed 2026-07-28.
- ~~M4 has an internal order that is easy to get wrong. **Backfilling captions and tags
  comes first** — search, filtering, and the album chips are all cheap once there is
  something to search, and all impossible before.~~ **Borne out.** The captions, tags,
  shoot names and summaries backfilled on 2026-07-27 are exactly what the 2026-07-28
  redesign is built out of; none of it would have been designable a day earlier.
- M1's "unstyled" constraint carries a real risk: designing last can force markup changes.
  Mitigated by keeping M1 markup semantic and free of presentational structure — not
  eliminated. Accepted deliberately so the new design isn't anchored to scaffolding
  decisions.
