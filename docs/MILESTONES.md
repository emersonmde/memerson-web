# memerson-web — Milestones

Few, large milestones. Each is a **real stopping point** — the site works and nothing is
half-finished, even if later milestones never happen. M1 is by far the largest.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the technical design and
[CONTEXT.md](./CONTEXT.md) for current-state facts.

---

## M1 — Functional site live on memerson.com

The bulk of the work. Everything works; nothing is visually designed yet.

**Deliberately unstyled.** Markup is semantic and minimal — no visual identity, no colour
system, no committed layout language. Design is M3. The discipline here is to keep components
structured by _meaning_ rather than appearance, so M3 can restyle without restructuring.

- [x] Astro scaffold (Astro 7, Node 24 pinned in `.nvmrc`), `output: 'static'`, `site` set
- [x] `wrangler.jsonc` with assets config + `custom_domain: true` on `memerson.com`
- [x] Content collections: `blog`, `projects`, `photos`
- [x] Routes exist and build: landing, about, blog index, blog post, photos, 404, RSS
- [x] `<Photo>` component for blog-post photo references
- [x] `wrangler login` (OAuth, `emersonmde@protonmail.com`)
- [x] R2 enabled on the Cloudflare account (dashboard)
- [ ] Workers Builds connected (needs GitHub remote + dashboard auth); push to `main` deploys
- [ ] First deploy to `memerson.com`
- [ ] Blog posts migrated from `emersonmde.github.io` (slugs preserved exactly)
- [ ] Projects migrated from YAML
- [ ] About/CV written (currently a placeholder)
- [ ] Favicons / site manifest (still Astro defaults)
- [ ] R2 buckets created; `photos.memerson.com` custom domain attached
- [ ] Photo import CLI (`photos:import`, `photos:verify`, `photos:rebuild`)
- [ ] All 118 photos migrated S3 → R2, manifest committed
- [ ] Gallery verified with real photos: `srcset`/`sizes`, LQIP, no CLS
      (pagination route is scaffolded and emits an empty first page)

**Exit criteria:** `memerson.com` serves the real site with all content and all photos. The
API Gateway photo dependency is gone. Ugly, but complete and honest.

**Why photos are in M1:** the photo _data migration_ is what unblocks AWS teardown, so it
cannot be deferred. Only the _fancy gallery presentation_ (M4) can be.

---

## M2 — AWS teardown

Resolves open decisions 1, 2, and 6 in [ARCHITECTURE.md §10](./ARCHITECTURE.md#10-open-decisions).

- [ ] Inventory which CDK stacks are actually still deployed
- [ ] Decide analytics (Cloudflare Web Analytics vs. keeping PostHog)
- [ ] Decide `memerson.dev` fate; move zone off Route 53 or repoint records
- [ ] Decide Minecraft stack fate
- [ ] Bulk Redirects: `errorsignal.dev` → `memerson.com`, `memerson.dev` → `memerson.com`
- [ ] Verify old blog URLs redirect to their new equivalents
- [ ] Delete stacks in dependency order; confirm S3 photo bucket is safe to delete
- [ ] Archive `emersonmde.github.io`

**Exit criteria:** Cloudflare only. AWS bill is $0. Old URLs redirect correctly.

---

## M3 — UI design

The visual identity, from scratch. **Nothing carried over from the old site.** Gets its own
doc (`docs/UI-DESIGN.md`) before implementation starts.

- [ ] Design direction: typography, colour, spacing, layout language
- [ ] `docs/UI-DESIGN.md` written and agreed
- [ ] Implement across all pages
- [ ] Responsive, light/dark handling, accessibility pass
- [ ] Gallery visual treatment

**Exit criteria:** the site looks intentional and finished.

---

## M4 — Gallery enhancements

Deferred because it is not on the critical path — not because it is hard. The decisions that
_would_ be expensive to change later (keys, manifest schema, captured metadata) are all
locked in during M1.

- [ ] Masonry via build-time aspect-ratio bin-packing; `@supports` grid-lanes enhancement
- [ ] Infinite scroll (IntersectionObserver appending paginated blocks)
- [ ] Trimmed search/random index
- [ ] Tag and date filtering
- [ ] Backfill titles, captions, tags
- [ ] `Save-Data` handling

**Exit criteria:** gallery stays fast and browsable at 1,000+ photos.

---

## Sequencing notes

- M1 → M2 is a hard dependency: photos must be in R2 before the S3 bucket and API stack die.
- M3 and M4 are independent of each other and of M2. Either could run first after M1, but M2
  should be prioritised because it stops an ongoing AWS bill.
- M1's "unstyled" constraint carries a real risk: designing last can force markup changes.
  Mitigated by keeping M1 markup semantic and free of presentational structure — not
  eliminated. Accepted deliberately so the new design isn't anchored to scaffolding
  decisions.
