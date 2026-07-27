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
- [ ] Infinite scroll (IntersectionObserver appending paginated blocks)
- [ ] Trimmed search/random index
- [ ] **Tag and date filtering.** This is what unblocks the mockup's album filter chips —
      they are designed and styled (`.chip` in `global.css`) but omitted because no album
      or tag data exists. `takenAt` is populated for all 118, so year is the cheapest
      first real filter; it needs filtered routes.
- [ ] `Save-Data` handling

### Metadata extraction — the thing everything else waits on

Two independent pipelines, both writing into the manifest. Neither exists yet.

**1. Derived colour metadata** (mechanical, no model involved).

First, a correction to an earlier assumption in this file: **the lightbox's ambient glow
does not need this.** Signal 4c settles it — _"ambient bloom is a blurred copy of the photo
itself, so it works on real images."_ The glow is the photograph, blurred and saturated
behind itself. Nothing samples a palette, so it needs no metadata at all. That is
implemented as of 2026-07-27.

What colour metadata is actually for is the **per-photo accent** — the tile hover glow, the
lightbox brackets, the counter. And the rule there is a constraint, not a free choice:

> **The extracted colour must snap to the nearest of the design's existing neons.** Never
> apply a raw sampled colour.

Both design documents define the same five photo accents:

| Accent               | Album in the mockups |
| -------------------- | -------------------- |
| `oklch(.82 .16 62)`  | REN FAIRE — amber    |
| `oklch(.80 .15 148)` | LANDSCAPE — green    |
| `oklch(.80 .15 200)` | CARIBBEAN — cyan     |
| `oklch(.80 .13 252)` | AVIATION — blue      |
| `oklch(.72 .22 332)` | NIGHT — magenta      |

So the job is **classification, not extraction**: compute a dominant hue, then pick the
closest of these five and store _which one_, not an arbitrary hex.

This matters for the same reason §2's ramp locks lightness and chroma. A raw dominant
colour from a photograph is usually desaturated and muddy — a grey-brown sky sampled
literally produces a grey-brown glow, which reads as a rendering bug rather than a design.
Snapping to a fixed five keeps every accent on-palette by construction, no matter what the
photograph looks like.

Implementation notes:

- Dominant hue via `sharp`'s `.stats()` or a resize-to-tiny-and-quantise pass.
- Compare in **oklch hue space**, not RGB distance — the palette is defined in oklch and
  perceptual hue distance is the thing being asked about.
- Store the chosen accent (or its index). Storing a raw hex invites someone to use it
  directly later, which is exactly the failure mode this rule exists to prevent.
- Schema addition to `src/data/photos.json` + `content.config.ts`.
- **Backfillable without local originals** — this is exactly what the private archive
  bucket is for. `photos:rebuild` already re-derives from archived originals, so extending
  it, or adding a `photos:remeta` sibling, backfills all 118 with no downloads from
  anywhere but R2. It can equally run off the existing 640px derivative.
- Note this is the same five-way classification an album field would give, so it may
  overlap with, or be superseded by, the tagging work below.

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
