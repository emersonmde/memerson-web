# memerson-web — Technical Architecture

Scope: stack, hosting, content model, and photo infrastructure. **This document contains no
visual design decisions** — see [CONTEXT.md](./CONTEXT.md#visual-design-deliberately-undecided).
UI design is a later phase with its own doc (`docs/UI-DESIGN.md`).

Read [CONTEXT.md](./CONTEXT.md) first for current-state facts (DNS, the S3 bucket, the live
AWS dependency).

---

## 1. Goals and non-goals

**Goals**

- Personal site: portfolio landing, about/CV, blog, photo gallery.
- $0/month recurring cost.
- Entirely Cloudflare-native. No AWS remains when this is done.
- Adding photos later is one command, from any machine, with no remembered state.
- Photo library scales to thousands without degrading page load or build time.
- Photos are addressable — referenceable from blog posts, not just a gallery list.

**Non-goals**

- Server-side rendering. The site is fully static.
- Runtime APIs. No request-time data fetching for content.
- Carrying over anything from the old visual design.
- Full-resolution originals served publicly.

---

## 2. Stack

| Concern          | Choice                                                              |
| ---------------- | ------------------------------------------------------------------- |
| Runtime          | Node 24 LTS "Krypton" (pinned in `.nvmrc` and `engines`)            |
| Framework        | Astro 7, `output: 'static'`. No SSR adapter.                        |
| Hosting          | Cloudflare Workers Static Assets, configured by `wrangler.jsonc`    |
| CI/CD            | Cloudflare Workers Builds (builds on push to `main`)                |
| Photo storage    | Cloudflare R2, two buckets (public derivatives + private originals) |
| Image processing | `sharp`, run locally by an import script — never in CI              |
| EXIF reading     | `exifr`                                                             |
| Content          | Astro content collections (Content Layer)                           |

Astro 7 bundles **Zod 4**, so schemas use `z.url()` — `z.string().url()` is deprecated and
surfaces as an `astro check` hint.

### Why static + no runtime API

The old gallery's runtime fetch to API Gateway is the single thing blocking AWS teardown,
and it bought nothing — the photo library changes when I add photos, which is a build-time
event. All content becomes build-time data.

---

## 3. Hosting and deployment

### `wrangler.jsonc`

Assets-only Worker — no `main` script needed:

```jsonc
{
  "name": "memerson-web",
  "compatibility_date": "2026-07-26",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "404-page",
  },
  "routes": [{ "pattern": "memerson.com", "custom_domain": true }],
}
```

`custom_domain: true` creates the DNS record automatically. `memerson.com` is already on
Cloudflare nameservers, so this binds with no zone migration.

**No R2 binding.** Photos are served directly from an R2 custom domain (§5.2), not proxied
through the Worker. Binding R2 would require a Worker script and add a hop for no benefit.

### Astro config

`site: 'https://memerson.com'` — required for correct RSS and canonical URLs.

### Workers Builds

Connect the repo in the Cloudflare dashboard: build command `npm run build`, output
directory `dist`. GitHub Actions + `cloudflare/wrangler-action` is the fallback if granting
Cloudflare repo access is undesirable.

### One-time setup (not covered by `wrangler.jsonc`)

**Requires a human (interactive or dashboard-only):**

1. ~~`npx wrangler login`~~ — **done.** OAuth, authenticated as `emersonmde@protonmail.com`,
   account ID `1ca7a385680f6485380fca3f1f7d91a1`. Credentials live in
   `~/Library/Preferences/.wrangler/`, so they are machine-wide and persist across shells,
   sessions, and reboots.
2. ~~**Enable R2 on the account**~~ — **done.** (Before this, every R2 call failed with
   `code: 10042 "Please enable R2 through the Cloudflare Dashboard"`. R2 is gated because
   it is a billable storage product; Workers is not gated and needs no equivalent step.)
3. **Workers Builds**: push the repo to GitHub, then authorize Cloudflare's GitHub app in
   the dashboard. Local `npm run deploy` works without this.
4. Bulk Redirects for `errorsignal.dev` and `memerson.dev` (§8).
5. Decide `www.memerson.com` handling (redirect rule or second custom domain).

**No R2 API token is needed.** See below.

**Doable by wrangler once logged in** (no API token required):

```bash
wrangler r2 bucket create memerson-photos
wrangler r2 bucket create memerson-photos-archive
wrangler r2 bucket domain add memerson-photos --domain photos.memerson.com
```

### Uploads use wrangler, not the S3 API

**Decision: no S3 API token.** Uploads shell out to `wrangler r2 object put` with a small
concurrency pool.

The alternative was R2's S3-compatible endpoint via `@aws-sdk/client-s3`. That endpoint
authenticates with **AWS SigV4**, which needs a long-lived Access Key ID + Secret —
wrangler's OAuth token cannot sign SigV4, so it would mean a second credential, created by
hand in the dashboard, stored somewhere, and rotated eventually.

Measured cost of the wrangler path: process startup is **~0.61s**, and `r2 object put`
supports `--file`, `--content-type`, and `--cache-control`. There is no sync or bulk
command, so it is one process per object:

| Objects                 | Sequential | Concurrency 8 |
| ----------------------- | ---------- | ------------- |
| ~1,300 (full migration) | ~20 min    | **~3 min**    |
| ~11 (one new photo)     | ~7 s       | ~7 s          |

Three minutes, once, is not worth a permanent second credential. And the wrangler path
directly serves the "works from any machine years from now" goal (§5.7): OAuth refreshes
itself, so there is no access key to lose, and `wrangler login` is the only auth step for
the entire project.

Implementation notes: spawn `node_modules/.bin/wrangler` directly rather than through
`npx` to avoid resolution overhead, cap concurrency around 8, and retry a failed object
rather than restarting the run.

Revisit only if the library grows large enough that migration time actually matters — the
manifest and key layout are unaffected either way, so switching later is a local change to
one upload function.

### Static asset limits

Workers Static Assets on the **free plan**: 20,000 files per version, 25 MiB per file.
Source: [Cloudflare Workers platform limits](https://developers.cloudflare.com/workers/platform/limits/).

This constrains only files produced by the build (blog images, fonts, CSS/JS). Photo
derivatives live in R2 and do not count against it.

---

## 4. Content model

All content is an Astro content collection, so everything is schema-validated and
addressable via `getCollection()` / `getEntry()`.

```
src/content/blog/<slug>/index.md    + colocated images
src/content/projects/<name>.yaml
src/data/photos.json                  ← photo manifest, loaded as a collection
```

### `blog`

Glob loader over markdown, colocated images, same shape as the old site (`title`, `date`,
`description`). Content migrates verbatim from `~/workspace/emersonmde.github.io`.

### `projects`

Glob loader over YAML. Existing schema is good and carries over: `name`, `language`,
`shortDescription`, `description`, `tags`, `github`, `demo?`, `docs?`, `crate?`, `order`.

### `photos` — manifest as a collection, not a bare JSON blob

The manifest is stored as one JSON file but **loaded through a collection** using Astro's
`file()` loader:

```ts
import { file } from 'astro/loaders';

const photos = defineCollection({
  loader: file('src/data/photos.json'),
  schema: z.object({/* §5.4 */}),
});
```

This matters: a bare `photos.json` imported as an array gives you iteration and nothing
else. A collection gives Zod validation plus `getEntry('photos', slug)` — which is the
primitive needed to reference an individual photo from a blog post (§7). Same $0 build-time
cost, and it does not need to change when the second consumer appears.

**Decision: JSON stays the storage format.** One file is easier to diff, sort, and
bulk-edit than 118 sidecar files, and the collection layer supplies the structure that a
raw file would lack.

---

## 5. Photo infrastructure

### 5.1 Why not `astro:assets` for the gallery

`astro:assets` requires originals in the repo, which means ~1 GB of JPEGs in git **and**
Workers Builds re-encoding all of them on every push. Astro's image cache is local-only;
CI starts cold. Roughly 1,200 AVIF/WebP encodes from 3–10 MB sources is tens of minutes
per build, growing with every photo added — paid on every commit, including typo fixes.

So the split is **by kind of image, not by location**:

| Image kind                 | Where it lives                | How it's processed                |
| -------------------------- | ----------------------------- | --------------------------------- |
| Photography (the gallery)  | R2 only                       | `sharp`, locally, once, at import |
| Blog screenshots, diagrams | repo, colocated with the post | `astro:assets` at build           |

Photos are **not** duplicated between the repo and R2. Blog inline images are small,
few, and change when the post changes, so `astro:assets` is exactly right for them and
there is no reason to complicate it.

### 5.2 Can an Astro asset be built from a URL?

Technically yes — Astro can optimize remote images at build time if the host is allowed via
`image.domains` / `image.remotePatterns`. **We are not doing this.** It downloads and
re-encodes on every cold CI build (the same problem as §5.1), and it cannot know dimensions
without fetching, so it reintroduces build-time network dependence.

The manifest makes this unnecessary. Because every entry already carries width, height, and
the derivative URLs, rendering a photo anywhere is a plain `<img>` with a correct `srcset` —
no build-time fetch, no layout shift. That is strictly better than remote asset
optimization for our case. See §7 for the component.

### 5.3 Buckets and key layout

| Bucket                    | Access                               | Contents                                        |
| ------------------------- | ------------------------------------ | ----------------------------------------------- |
| `memerson-photos`         | **public** via `photos.memerson.com` | derivatives only, max 2560px, metadata stripped |
| `memerson-photos-archive` | **private**, no public access        | full-resolution originals                       |

```
memerson-photos:          photos/<slug>/<width>.<avif|webp>
memerson-photos-archive:  originals/<slug>.<ext>
```

Serving via an R2 custom domain (not `pub-*.r2.dev`) gets Cloudflare CDN caching and free
egress, and keeps URLs stable and clean.

The archive is what makes a new laptop a non-event: derivatives can always be regenerated
from it without needing a local originals folder.

**Originals are private because they retain GPS EXIF.** This is a hard requirement, not a
preference.

### 5.4 Manifest schema

```ts
{
  id: string,            // slug, e.g. "2022-03-14-a3f9c1b2" — also the collection key
  sourceHash: string,    // sha256 of the original bytes (12 hex chars) — idempotency key
  width: number,         // intrinsic dimensions of the original
  height: number,
  aspectRatio: number,   // precomputed; drives layout without loading any image
  variants: number[],    // widths actually generated, e.g. [640, 1024, 1536, 2048, 2560]
  formats: string[],     // ["avif", "webp"]
  lqip: string,          // ~16px WebP as a base64 data URI (~300–500 bytes)
  takenAt: string | null,// ISO 8601, from EXIF DateTimeOriginal
  camera: string | null,
  lens: string | null,
  focalLength: string | null,
  aperture: string | null,
  shutter: string | null,
  iso: number | null,
  title: string | null,  // manual, optional, backfilled over time
  caption: string | null,// manual, optional
  tags: string[],        // manual, starts empty
}
```

`title`, `caption`, and `tags` are the only hand-authored fields. They start empty and get
backfilled; the schema accepts them from day one so no migration is needed later.

### 5.5 Derivative ladder

- **Widths:** 640, 1024, 1536, 2048, 2560. Never upscale — a 1600px original produces
  640/1024/1536 only, and `variants` records what actually exists.
- **Formats:** AVIF + WebP. No JPEG fallback — AVIF is supported by all current browsers
  and WebP covers anything older, so a third format is ~600 wasted objects and a third more
  encode time.
- **Cap:** 2560px. Enforced in code, not by convention.
- **LQIP:** one 16px-wide WebP inlined as a data URI in the manifest. At ~30 photos per
  page that is ~12 KB total, and it costs zero extra requests.

118 photos × 5 widths × 2 formats ≈ 1,180 R2 objects. R2 free tier is 10 GB storage and
1M Class A ops/month; total footprint (derivatives + 956 MB of originals) stays under it.

### 5.6 EXIF: allowlist, never a denylist

**Keep:** date taken, camera body, lens, focal length, aperture, shutter, ISO, orientation.

**Drop everything else**, including but not limited to GPS. A denylist is the wrong shape
here — it would miss camera and lens serial numbers, owner/artist name fields, and
vendor-specific `MakerNote` blobs whose contents vary by manufacturer. Allowlisting is the
only version of this that stays correct as new fields appear.

`sharp` strips all metadata by default unless `.withMetadata()` is called. We rely on that
and additionally assert it, rather than trusting the default not to change.

### 5.7 The import CLI

**Requirement: no remembered state.** It must work years from now, on a different machine,
with no knowledge of any previously-used folder.

```bash
npm run photos:import ~/Desktop/new-photos     # a folder (recursive)
npm run photos:import ~/Downloads/DSC_0142.jpg # a single file
npm run photos:import ./a.jpg ./b.jpg ./c.jpg  # several paths
```

The path is **always an argument, never remembered.** There is no configured import
directory, no state file, no "last used folder." The manifest is the only state, and it
lives in git.

Behaviour:

1. Expand arguments into a file list (accepts files or directories, recurses, filters to
   supported image extensions).
2. For each file, sha256 the bytes. If `sourceHash` is already in the manifest, **skip** —
   this is what makes re-running safe and makes "did I already import this?" a
   non-question. Re-importing the same photo from a different folder, or a copy with a
   different filename, is correctly a no-op.
3. Read EXIF, apply the allowlist (§5.6).
4. Derive the slug: `<YYYY-MM-DD from EXIF>-<first 8 of sourceHash>`. Deterministic,
   collision-free, no manual naming. Falls back to file mtime if EXIF has no date.
5. Generate derivatives and the LQIP with `sharp`.
6. Upload derivatives to `memerson-photos`, the original to `memerson-photos-archive`, via
   `wrangler r2 object put` with a concurrency pool of ~8 (see §3 — no S3 token needed).
7. Append entries to `src/data/photos.json`, sorted by `takenAt`.
8. Print each new slug so it can be pasted into a blog post.

Idempotent, interruptible, and resumable: a crash halfway through leaves already-imported
photos recorded and re-running picks up the rest.

Companion commands:

- `npm run photos:verify` — check every manifest entry's objects actually exist in R2, and
  flag R2 objects with no manifest entry.
- `npm run photos:rebuild <slug>` — re-derive from the archived original (for changing the
  width ladder or adding a format later, without needing local files).

---

## 6. Gallery rendering

### Correct `srcset` is the whole story for resolution adaptation

The old gallery did not feel resolution-adaptive because its `srcset` was malformed, not
because the platform lacks the feature. `<img srcset sizes>` already selects on viewport
**and** device pixel ratio, before downloading anything. No custom logic, and specifically
**no low-res-then-upgrade ladder** — that downloads the same image twice for no visual
gain. The LQIP placeholder (§5.5) is the correct way to show something instantly.

Every `<img>` gets real `w` descriptors, a real `sizes`, explicit `width`/`height` (or
`aspect-ratio`) from the manifest, `loading="lazy"`, and `decoding="async"`.

### Connection-aware loading: mostly not available

`navigator.connection.effectiveType` is Chromium-only — Firefox and Safari never shipped
it. The portable signal is the `Save-Data` header / `prefers-reduced-data`, which only
fires on explicit user opt-in. Plan: honour `Save-Data` (a few lines, pick a smaller
`sizes`), and do not build `effectiveType` logic.

### Masonry: no dependency needed

Native CSS masonry is not yet viable. Verified July 2026:

- The CSSWG settled the long-running syntax debate on **`display: grid-lanes`** (reusing
  grid properties) rather than `grid-template-rows: masonry`.
- **Safari 26.4** ships Grid Lanes unflagged. **Chrome 140** has it behind a flag.
  **Firefox 155** implements the older `masonry` syntax.
- caniuse reports ~0% global usage — no interoperable unflagged support across major
  stable channels.

Sources: [caniuse](https://caniuse.com/mdn-css_properties_grid-template-rows_masonry),
[CSS Grid Lanes in Safari](https://blakecrosley.com/blog/css-grid-lanes-2026),
[Grid Lanes guide](https://dev.to/bean_bean/css-grid-lanes-masonry-layout-is-here-a-complete-guide-for-2026-4686).

So it is usable as a progressive enhancement inside `@supports`, but not as the primary
layout. **No layout library is required either way**, because the manifest carries every
aspect ratio at build time: greedy shortest-column bin-packing over known aspect ratios is
~30 lines, needs no images loaded, and produces zero layout shift since every slot's height
is known before the first byte arrives. Avoiding that unknown is the entire reason
image-layout libraries exist.

Packing runs client-side from a small aspect-ratio array so it responds to resize and
breakpoint changes. Build-time packing would require emitting a separate layout per
breakpoint.

CSS `column-count` is the no-JS fallback. Caveat: it orders items down each column, so
chronological ordering reads wrong — acceptable as degradation, not as the target.

### Progressive loading: paginated static pages

Astro `paginate()` emits `/photos/1`, `/photos/2`, … at ~30 photos each. An
IntersectionObserver on a sentinel fetches and appends the next block.

The point is that **initial HTML never carries metadata for photos not being shown.** This
is what does not scale in the current design, and it is the reason the manifest must not be
shipped wholesale to the client. Works identically at 118 photos and at 2,000.

### Search and random

Both read a **separate trimmed index** — slug, aspect ratio, date, tags; no URLs, no LQIP.
A few KB for hundreds of photos, loaded only on interaction, filtered client-side. Random
selection picks from the same index.

Honest constraint: **search is blocked on there being something to search.** No captions or
tags exist today. EXIF supplies dates and gear for free; anything semantic is manual entry,
backfilled over time. Design the schema for it (done, §5.4), do not block on populating it.

Note: truly per-request randomness would need SSR. With static output the pick happens
client-side, which is invisible to users.

---

## 7. Referencing photos from blog posts

This is why photos are a collection rather than an array. A component resolves a slug
against the same collection the gallery uses:

```astro
<Photo id="2022-03-14-a3f9c1b2" caption="..." />
```

It calls `getEntry('photos', id)` and emits an `<img>` with the correct `srcset`, `sizes`,
dimensions, and LQIP. A bad slug is a **build-time error**, not a runtime 404.

Workflow for a new post: `npm run photos:import ./that-photo.jpg`, copy the slug it prints,
paste it into the post. No URL juggling, no uploading twice.

---

## 8. Migration and cutover

### One-time S3 → R2

The migration deliberately reuses the normal import path rather than being a bespoke
script — which also validates that path against 118 real files:

1. `aws s3 sync` the `*_full.jpg` originals to a local scratch folder (~860 MB).
2. `npm run photos:import <that folder>`.
3. `npm run photos:verify`.
4. Commit `src/data/photos.json`.

The existing 640/1280/1920 derivatives in S3 are **not** migrated — they are JPEG-only and
their dimensions-in-filename convention is what broke the old `srcset`. Everything is
re-derived from originals.

### Re-keying

Old keys (`1647310592883-<uuid>/1280x853.jpg`) are opaque and encode dimensions in the
filename. New keys are `photos/<slug>/<width>.<ext>` (§5.3). Migration is the only cheap
moment to do this — changing keys later means rewriting every URL that was ever shared.

### Redirects

Cloudflare Bulk Redirects (zone-level, manual):

- `errorsignal.dev/*` → `memerson.com/*`, preserving blog post paths where slugs match.
- `memerson.dev/*` → `memerson.com/*`. Requires moving the zone off Route 53 or changing
  Route 53 records — this one is not free of AWS.

Blog slugs should be preserved exactly so existing links and any search ranking survive.

---

## 9. Cost model

| Item                                 | Cost                                        |
| ------------------------------------ | ------------------------------------------- |
| Workers Static Assets                | $0 (free plan; no charge for asset storage) |
| Workers Builds                       | $0 within free tier                         |
| R2 storage (~1.5 GB incl. originals) | $0 (10 GB free tier)                        |
| R2 egress                            | $0 (R2 has no egress fees)                  |
| R2 Class A ops (writes, import-time) | $0 (1M/month free)                          |
| DNS                                  | $0                                          |

**Do not enable Cloudflare Images** — $5/month minimum once switched on, and pre-generated
derivatives make it unnecessary.

---

## 10. Open decisions

| #   | Question                                       | Notes                                                                                                                          |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Analytics?                                     | Old site ran PostHog behind an AWS reverse proxy. Cloudflare Web Analytics is free and needs no proxy. Decide before teardown. |
| 2   | `memerson.dev` — redirect or drop?             | Currently linked from the live site. Needs a Route 53 change either way.                                                       |
| 3   | `www.memerson.com`                             | Redirect rule vs. second custom domain.                                                                                        |
| 4   | RSS scope                                      | Blog only, or blog + photos?                                                                                                   |
| 5   | Archive originals in R2, or keep offline only? | Recommendation: R2 private. ~$0.02/month and it removes any dependency on a specific local disk.                               |
| 6   | Minecraft stack                                | Has its own DNS record. Still wanted, or delete with the rest?                                                                 |

Items 1, 2, and 6 block AWS teardown. The rest do not.
