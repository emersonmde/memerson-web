# memerson-web — Technical Architecture

Scope: stack, hosting, content model, and photo infrastructure. **This document contains no
visual design decisions** — those live in [UI-DESIGN.md](./UI-DESIGN.md).

Read [CONTEXT.md](./CONTEXT.md) first for current-state facts (DNS, mail, the S3 bucket,
the live AWS dependency).

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

`custom_domain: true` creates the DNS record automatically, and `memerson.com` is already
on Cloudflare nameservers so no zone migration was needed. **Live since 2026-07-27.**

Two things about that first bind are worth keeping, because both cost hours:

**It will not bind over anything already at the apex.** Cloudflare returns
`100117 — Hostname 'memerson.com' already has externally managed DNS records`. What was
actually there was a single proxied **CNAME**, but `dig` reported **A and AAAA** records,
because Cloudflare flattens an apex CNAME into synthetic address answers — a CNAME cannot
legally coexist with the apex SOA and NS records, so it is resolved server-side at query
time. The stored record and the resolved answer are therefore allowed to differ, and only
the dashboard shows the truth. **Never infer the stored record type at an apex from what
resolves.** No wrangler OAuth scope grants `dns_records` write either, so clearing it is
always a human, dashboard-only step.

**The binding and its DNS record are provisioned separately.** The first successful deploy
created the binding — API reported `enabled: true` with an issued `cert_id` — and then no
address record appeared for 15+ minutes. A second, byte-identical `wrangler deploy`
created it in seconds. If `workers/domains` lists the hostname but the name does not
resolve, deploy again rather than detaching and re-attaching.

**No R2 binding.** Photos are served directly from an R2 custom domain (§5.2), not proxied
through the Worker. Binding R2 would require a Worker script and add a hop for no benefit.

### Astro config

`site: 'https://memerson.com'` — required for correct RSS and canonical URLs.

`build.inlineStylesheets: 'always'` — every page carries its CSS in a `<style>` rather than a
`<link>`. This is about `ClientRouter`, not about request count: a stylesheet inserted by a
swap is **not** render-blocking, so the incoming page paints, and gets snapshotted by the
view transition, before its own rules apply. The visible symptom was the home page's kicker
painting white at the top of the page and then dropping into place and turning grey. It never
happened on reload, because a parser-inserted stylesheet in `<head>` blocks the first paint —
that is exactly the guarantee the swap path loses. Inline `<style>` arrives _with_ the
swapped head, in the same task as the DOM, so the window does not exist.

The default is `auto`, which only inlines below Vite's 4kB `assetsInlineLimit`; every
stylesheet here is over it. The cost is the shared layout CSS (~3.7kB gzipped) repeating in
each of nine HTML files instead of being cached once — cheaper, at this size, than the round
trip it replaces. `tests/build.test.ts` asserts no page links a stylesheet.

### Workers Builds

Connect the repo in the Cloudflare dashboard: build command `npm run build`, output
directory `dist`. GitHub Actions + `cloudflare/wrangler-action` is the fallback if granting
Cloudflare repo access is undesirable.

### One-time setup (not covered by `wrangler.jsonc`)

**Requires a human (interactive or dashboard-only):**

1. ~~`npx wrangler login`~~ — **done.** OAuth, authenticated as `emersonmde@protonmail.com`,
   account ID `<cloudflare-account-id>`. Credentials live in
   `~/Library/Preferences/.wrangler/`, so they are machine-wide and persist across shells,
   sessions, and reboots.
2. ~~**Enable R2 on the account**~~ — **done.** (Before this, every R2 call failed with
   `code: 10042 "Please enable R2 through the Cloudflare Dashboard"`. R2 is gated because
   it is a billable storage product; Workers is not gated and needs no equivalent step.)
3. ~~**Clear the apex record** so `custom_domain` can bind~~ — **done 2026-07-27.** It was
   a proxied CNAME, not the A/AAAA that `dig` reported. See above.
4. ~~**Workers Builds**~~ — **done 2026-07-29.** Repo public at
   `github.com/emersonmde/memerson-web` (2026-07-27); the GitHub app was authorized and
   the repo connected in the dashboard, so a push to `main` builds and deploys. Local
   `npm run deploy` still works but can race a push-triggered build.
5. ~~Cutover redirects~~ — **live 2026-07-27**, in the **old site's repo** rather than this
   zone (§8), and verified. `memerson.dev` is separate and needs a Route 53 change first.
6. Decide `www.memerson.com` handling (redirect rule or second custom domain).
7. Mail hardening on the zone: SPF, DKIM, DMARC for Google Workspace, plus DNSSEC. The
   `MX` (`smtp.google.com`) and the Google site-verification `TXT` are already in place and
   were untouched by the apex work. Not started.

**No R2 API token is needed.** See below.

**Doable by wrangler once logged in** (no API token required) — ~~all three~~ **done**:

```bash
wrangler r2 bucket create memerson-photos
wrangler r2 bucket create memerson-photos-archive
wrangler r2 bucket domain add memerson-photos \
  --domain photos.memerson.com --zone-id <memerson.com zone> --min-tls 1.2
```

`domain add` requires `--zone-id`, which wrangler cannot look up itself; it comes from
`GET /client/v4/zones?name=memerson.com` using the same OAuth token
(`<memerson.com-zone-id>`). Verified after the fact: `memerson-photos-archive`
has no custom domain and its `r2.dev` URL is disabled, so the originals are unreachable
publicly — which is what makes it safe for them to retain GPS EXIF.

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
rather than restarting the run. Buffers are piped to `--pipe` over stdin, so derivatives
never touch the local disk.

One gap: **wrangler has no object-listing command**, which `photos:verify` needs in order
to find orphans. It uses the REST endpoint
`/accounts/{account}/r2/buckets/{bucket}/objects` with the OAuth token wrangler already
stored at login — so the "one credential for the whole project" property still holds.

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

`title`, `caption`, and `tags` are the hand-authored fields today. They start empty and get
backfilled; the schema accepts them from day one so no migration is needed later.

**The schema is expected to grow.** `writeManifest` preserves any field it does not
recognise, so a new one — an `album`, a derived accent colour — can be added without the
import silently erasing it. Two follow-ups when that happens: add it to `FIELD_ORDER` in
`scripts/photos/lib/manifest.mjs` so it sorts with the known fields, and declare it in
`src/content.config.ts`, because Zod strips undeclared keys and the field will otherwise be
invisible to templates. Neither is destructive. See MILESTONES M4.

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

### 5.8 The metadata pipeline

Added 2026-07-27. Turns a pile of frames into something searchable without hundreds of rows
of manual entry. Three commands, each idempotent by skipping, each writing only fields the
schema marks as authored.

```bash
npm run photos:shoots        # group by capture time. No model, no network.
npm run photos:describe      # tags, caption, title per photo
npm run photos:name-shoots   # propose a name per shoot, from several frames at once
```

**`photos:import` runs all three over only what it just imported**, so every photo is
described exactly once, on arrival. The standalone commands are backfills. `--no-metadata`
opts out.

**Shoots** cluster `takenAt` on gaps over **7 days** — a value taken from the data, not a
default. Cluster count is flat from 3 to 14 days and unstable below it; within a shoot the
median gap between frames is 10 minutes, between shoots it is 15+ days. Full derivation in
[MILESTONES M4](./MILESTONES.md).

**The rule that matters is that clustering never recomputes.** It may fill in a photo with
no shoot and may _extend_ an existing shoot, but it will never _merge_ two — a photo landing
between two already-named shoots is assigned to the nearest and the bridge is reported for a
human. Re-deriving the whole library on each import would silently reattach hand-written
names to the wrong photographs, which is the one failure here that compounds over years.

**Shoot names live in `src/data/shoots.json`**, keyed by shoot id, alongside an optional
`series` that joins recurring events. See "three layers" in MILESTONES M4 — `shoot` is the
instance (≡ IPTC `Event`, ≡ a Lightroom folder), `series` is the theme (≡ a Collection),
`tags` are keywords. Derived fields in that file are rewritten every run; `name`, `series`
and anything else authored survive, same contract as the manifest writer.

**The model side** runs `claude -p` headless against the **640px derivative already in R2** —
public, so no credentials, and nothing is regenerated. Sonnet-class at `--effort low`, which
measured byte-identical to `medium` at 5.2s against 8.4s; there is no reasoning to do, the
answer is in the pixels. 640px is the floor: at 256px a black-and-white ruffed lemur came
back as a "monkey/tamarin", and the failure mode below the floor is a confident wrong noun
rather than a vague one.

**The safety mechanism is git.** Generated text lands as a reviewable diff, never a silent
mutation. Keep it that way.

### 5.9 Design handoff — `npm run design:bundle`

Snapshots the built site into `.design-bundle/` as self-contained cards for a Claude Design
**design-system project**: tokens as swatches, the contact sheet and lightbox as built with
real photographs, the metadata with real shoots, and every page.

Two things it must keep doing, both learned by getting them wrong:

- **CSS is read per page.** Astro emits a bundle per route plus scoped styles, so there is
  no single "site CSS" — reusing one page's stylesheet renders every other page as unstyled
  HTML.
- **The reduced-motion state is forced on.** Cards carry no JavaScript, so
  `[data-fx='resolve']` would sit at its resting `opacity: .15` under a 13px blur and every
  page title would be invisible.

Neither is catchable by a diff or a type check — only by rasterising the output and looking
at it. Render the cards before uploading:

```bash
npm run design:bundle
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless \
  --window-size=1440,1000 --virtual-time-budget=9000 \
  --screenshot=shot.png "file://$PWD/.design-bundle/pages-current/home.html"
```

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

**Implemented 2026-07-30** for the flat SHEET view: `packColumns` in `src/lib/sheet.ts`
(pure, unit-tested) assigns tiles in time order to the currently shortest column, from the
`--ar` each tile already carries — no layout reads, no library. Row-major order is what
makes "jump to a shoot" meaningful in SHEET: the jump lands on the shoot's first visible
tile, which the packing guarantees is where the shoot starts on the page. The script only
repacks when the breakpoint changes the column count (it reads `--sheet-cols` off the
stylesheet, so JS and CSS cannot disagree).

CSS `column-count` is the no-JS fallback, and still lays out the per-run grids in SHOOTS
and EDITORIAL, where a run is small enough that column order doesn't mislead. Caveat: it
orders items down each column, so chronological ordering reads wrong — acceptable as
degradation, not as the target.

### One page, not pagination (changed 2026-07-28)

`/photos` used to be `paginate()`d at ~30 photos a page with an IntersectionObserver
appending the next block. The Photos Redesign removed that, and the reason is not
aesthetic. Run headers, the margin shoot rail, the stray-frame rule and the tag filter all
answer _questions about the whole library_ — "where am I", "what else is here", "how much
is left". A rail that lists only the shoots fetched so far does not answer those questions
partially; it answers them **wrongly**, and then silently changes its answer as you
scroll. There is no version of the redesign that is correct on a partial set.

So every frame is rendered into one static page, with `loading="lazy"` on all but the
first screenful. Measured on the current 118-frame library:

|                           | `/photos`, all 118 frames |
| ------------------------- | ------------------------- |
| HTML, raw                 | 330 KB                    |
| HTML, gzipped             | 40 KB                     |
| Images fetched on arrival | 8, as before              |

One change kept that from being much worse: the `srcset` pairs are no longer duplicated
into `data-avif` / `data-webp` attributes. The viewer reads the tile's own `<source>`
elements instead, which was by far the largest single item in the document at this tile
count. Gzip then crushes 118 near-identical tiles hard — the raw:wire ratio is ~8:1.

**Where this stops being free.** It is linear in the frame count from here: ~340 bytes
gzipped per frame. At ~500 frames the page is ~170 KB gzipped and should be revisited; at
~1,000 it is not defensible. The fix at that point is _not_ to bring pagination back — it
is to keep one page and render tiles for the runs above the fold, with the remaining runs
as headers only, hydrated as they approach. The rail stays complete and truthful either
way, because it is built from `shoots.json`, which is small.

The old constraint still holds and is the important one: **no runtime data fetching.** The
page is static, the manifest is never shipped as a JSON payload, and nothing calls an API.
That is what the AWS teardown depends on.

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

**The redirect lives in the old Astro repo, not on the domain.** Decided 2026-07-27, and
it is the non-obvious part of the cutover.

`errorsignal.dev` is a **shared host**. Several independent repos publish to it through
GitHub Pages — the `coppermind` WASM demo, Rust documentation, other static assets — and
they all use it as their base domain. Only the Astro site moves.

So the redirect is implemented **in `emersonmde.github.io`**, the old site's own repo. Its
pages redirect themselves to `memerson.com`; every other repo publishing to that domain is
untouched **by construction**.

This is better than the zone-level alternative (Cloudflare Bulk Redirects scoped to an
allowlist of paths). Both work, but the repo-level version _cannot_ over-reach: there is no
rule sitting in front of the whole domain that a future project could accidentally match.
The allowlist would have had to stay correct forever; this needs nothing to stay correct.

Scope — the Astro site's own routes, which are the only ones that repo serves:

| Old (`errorsignal.dev`) | New (`memerson.com`) |
| ----------------------- | -------------------- |
| `/`                     | `/`                  |
| `/about`                | `/about`             |
| `/blog`, `/blog/<slug>` | same path            |
| `/photos`               | `/photos`            |
| `/rss.xml`              | `/rss.xml`           |

Blog slugs are preserved exactly, so `/blog/<slug>` is 1:1. The one shape change is that
the old single `/photos` page is now paginated, so it maps to the new first page.

**The honest caveat: these are meta-refresh redirects, not 301s.** GitHub Pages serves
static files and cannot emit a status-code redirect, so the mechanism is an HTML page
carrying `<meta http-equiv="refresh">` plus `<link rel="canonical">`. Consequences:

- Users get sent to the right place, reliably. That part is fine.
- Google is better than the caveat suggests: it documents that an **instant** (0-second)
  meta refresh is interpreted as a _permanent_ redirect, so the delay is 0 everywhere and
  never the 2s Astro uses for temporary ones. Other crawlers are less clearly specified.
- The old URL keeps returning `200`, so naive link checkers will not see a redirect.

**Implemented 2026-07-27, and not the way this section originally planned.** The pages are
hand-written (`src/layouts/Moved.astro` in the old repo) rather than generated by Astro's
`redirects:` config. That config emits the same instant meta refresh but also adds
`<meta name="robots" content="noindex">`, which blocks the old URL from Search entirely
instead of consolidating its signals onto the new URL — the opposite of what a site move
wants, and something Google's canonicalization guidance warns against directly. The
hand-written version drops the robots directive and keeps everything else.

`/rss.xml` could not use the mechanism at all: GitHub Pages serves `.xml` as XML, so an
HTML redirect document there reaches the client as a parse error. It stays a valid feed
whose channel points at `memerson.com` with a single item announcing the move.

If ranking transfer turns out to matter, the fallback is a Cloudflare Redirect Rule scoped
to exactly the table above — real 301s, at the cost of a domain-level rule that has to be
kept from over-matching. Not worth it up front.

`memerson.dev/*` → `memerson.com/*` is a separate job and requires moving the zone off
Route 53 or changing Route 53 records — that one is not free of AWS.

**Post-cutover check — done 2026-07-27, and it held.** `errorsignal.dev/coppermind/` still
returns 200 and is still the demo. The check was widened while it was being run: three
repos publish to the domain, not one, and `/daedalus/` (Rust docs) and `/vilya/` are intact
too. With the repo-level approach this holds automatically, which is the point — but it was
verified anyway, because "should hold automatically" is how outages start.

The redirects themselves were verified against the live site rather than the build: all
nine pages return 200 with a 0-second refresh, a matching `rel="canonical"` and no
`noindex`, and every target returns 200 on `memerson.com`. `/rss.xml` serves as
`application/xml` and parses. An unknown path returns a real 404 carrying the moved notice,
not a redirect.

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

| #     | Question                                       | Notes                                                                                                                                                                                                                                           |
| ----- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Analytics?                                     | **Reframed 2026-07-26:** the live site runs _no_ analytics script. Nothing to migrate — this is a decision to start or not. Cloudflare Web Analytics is free and needs no proxy.                                                                |
| 2     | `memerson.dev` — redirect or drop?             | Currently linked from the live site. Needs a Route 53 change either way.                                                                                                                                                                        |
| 3     | `www.memerson.com`                             | Redirect rule vs. second custom domain.                                                                                                                                                                                                         |
| 4     | RSS scope                                      | Blog only, or blog + photos?                                                                                                                                                                                                                    |
| 5     | Archive originals in R2, or keep offline only? | **Settled:** done, private archive bucket, 118 originals. Cost is negligible as predicted.                                                                                                                                                      |
| ~~6~~ | ~~Minecraft stack~~                            | **Closed:** never deployed as a stack. What exists is an instance stopped since 2023-02 plus an orphaned EBS volume and Elastic IP (~$6/mo) — a deletion task, not a decision.                                                                  |
| 7     | `memerson.net`                                 | **New:** a second Route 53 zone found during the 2026-07-26 AWS inventory. ACM validation records only, no site. Drop it?                                                                                                                       |
| ~~8~~ | ~~The `coppermind` WASM demo~~                 | **Settled 2026-07-27:** the demo stays on `errorsignal.dev`, along with the other GitHub Pages projects sharing that domain. The redirect lives in the old Astro repo rather than on the zone, so nothing domain-wide can reach these — see §8. |

Items 1 and 2 block the AWS teardown (tracked outside the milestones — see
CONTEXT.md). The rest do not block anything.
