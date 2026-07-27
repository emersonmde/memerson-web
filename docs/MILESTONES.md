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
- [ ] Workers Builds connected (needs GitHub remote + dashboard auth); push to `main` deploys
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
      (22 KB across the whole manifest). The `paginate([])` guard is now dormant but kept.

**One item left:** **Workers Builds**, which needs a GitHub remote (this repo has none)
plus authorizing Cloudflare's GitHub app in the dashboard. `npm run deploy` covers
deployment until then, so nothing depends on it.

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
- [ ] **Decide analytics.** Not a migration: `errorsignal.dev` serves no analytics script
      at all today, so this is a decision to _start_, not to port. Cloudflare Web Analytics
      is free and needs no proxy. Note the footer currently claims "NO TRACKERS, NO
      ANALYTICS" — adding any would mean changing that line.
- [ ] **Add self-redirects to `emersonmde.github.io`** for `/`, `/about`, `/blog`,
      `/blog/<slug>`, `/photos`, `/rss.xml`. Astro's `redirects` config emits these as
      static meta-refresh pages, which is the only mechanism GitHub Pages supports.
- [ ] Verify old blog URLs land correctly — path structure is unchanged and all five slugs
      are preserved, so this is 1:1. The one shape change is `/photos` → now paginated
      `/photos/2..4`, and the old single `/photos` maps to the new first page.
- [ ] Verify the **fall-through** still works after the redirect lands —
      `errorsignal.dev/coppermind/` must still return 200. This is the check that catches
      an over-broad rule.
- [ ] Archive `emersonmde.github.io` **only** once the redirect is confirmed — and note
      that archiving the Astro site's repo does not affect the other repos publishing to
      the same domain.

**Exit criteria:** old URLs resolve to their new equivalents and `errorsignal.dev` is
retired.

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
- [ ] **Mobile pass.** Desktop only by decision; the mockup specifies desktop layouts.
      What it will have to deal with is recorded in [UI-DESIGN §9](./UI-DESIGN.md).
- [ ] Accessibility pass — the basics are in (skip link, focus rings, `aria-current`,
      reduced-motion, alt text, keyboard lightbox), but nothing has been run through a
      real screen reader or a contrast audit. The dim-by-default photo tiles and the
      `--faint` metadata colour are the two things most likely to fail contrast.
- [ ] Light mode — not designed. The system is committed to a dark surface stack; a light
      variant would be a second design, not a token flip.
- [x] **Mockup 6g — the "Redraw" page transition** — done 2026-07-27 via
      `<ClientRouter />` and `src/scripts/redraw.ts`. Needs a real browser to judge; the
      380ms wipe cannot be seen headless.

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
behind them and are omitted rather than invented.

---

## M4 — Gallery enhancements

Deferred because it is not on the critical path — not because it is hard. The decisions that
_would_ be expensive to change later (keys, manifest schema, captured metadata) are all
locked in during M1.

- [ ] Masonry via aspect-ratio bin-packing; `@supports` grid-lanes enhancement.
      **Partly done in M3**: the sheet is `column-count: 4` over real manifest aspect
      ratios, which is the documented no-JS fallback. Bin-packing would fix the
      down-the-column reading order; grid-lanes is still not interoperable.
- [x] Infinite scroll (IntersectionObserver appending paginated blocks) — **done
      2026-07-27**, together with a lightbox that runs across page boundaries.
- [ ] Trimmed search/random index
- [ ] **Tag and date filtering.** This is what unblocks the mockup's album filter chips —
      they are designed and styled (`.chip` in `global.css`) but omitted because no album
      or tag data exists. `takenAt` is populated for all 118, so year is the cheapest
      first real filter; it needs filtered routes.
- [ ] `Save-Data` handling

### Metadata extraction — the thing everything else waits on

Two independent pipelines, both writing into the manifest. Neither exists yet.

**1. Derived colour metadata** (mechanical, no model involved).

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
  at all — which is the cheapest version of this feature and worth checking first.

**2. AI-assisted titles, captions and tags** (Matthew's proposal). Replaces what would
otherwise be 118 rows of manual data entry:

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

### Albums, via shoots

**Open, and a likely direction.** The mockups show five invented albums. Today there are at
most two real ones — a Dover trip and the PA Ren Faire — with the rest miscellaneous, so a
five-album filter row over the current 118 photos would mostly say "MISC". That is an
argument about _the current collection_, not about albums, and it changes the moment more
photos are uploaded.

**The useful observation is that the library already has structure: shoots.** Clustering
`takenAt` on gaps over 24 hours yields 16 of them, with no new metadata and no model:

| Photos | Date       | Camera                 |
| ------ | ---------- | ---------------------- |
| 32     | 2022-10-29 | Canon EOS R6           |
| 16     | 2021-08-16 | iPhone 12 Pro + EOS R6 |
| 14     | 2022-09-04 | Canon EOS R6           |
| 10     | 2021-11-27 | EOS R6 + iPhone 13 Pro |
| 10     | 2022-04-15 | Canon EOS R6           |
| 9      | 2022-05-22 | Canon EOS R6           |
| 8      | 2017-07-04 | Canon EOS 6D           |
| 7      | 2022-02-21 | iPhone 13 Pro          |

Eight further shoots are 1–3 photos each. The top eight hold 106 of 118, and the 32-photo
shoot on 2022-10-29 is visibly the Ren Faire.

**The path Matthew has in mind:** derive shoots automatically, then name them — by category
and date, e.g. "Ren Faire · Oct 2022". That is a good shape, because the expensive part
(deciding which photos belong together) is free and automatic, and the part that needs a
human is one short string per shoot rather than a label on all 118 photos. It also scales:
a new upload becomes a new shoot without anyone maintaining a taxonomy, and it degrades
gracefully — an unnamed shoot is still a valid group, just displayed by date.

If that lands, the mockups' album filter row and the five per-album accents both become
implementable as designed, and the accent needs no colour extraction at all.

Nothing is committed to yet, and nothing in the code prevents any of it — see below.

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
- M2 and M4 are independent of each other. M2 is the higher priority of the two: until the
  redirect lands, `errorsignal.dev` is still the site people reach.
- M4 has an internal order that is easy to get wrong. **Backfilling captions and tags comes
  first** — search, filtering, and the album chips are all cheap once there is something to
  search, and all impossible before.
- M1's "unstyled" constraint carries a real risk: designing last can force markup changes.
  Mitigated by keeping M1 markup semantic and free of presentational structure — not
  eliminated. Accepted deliberately so the new design isn't anchored to scaffolding
  decisions.
