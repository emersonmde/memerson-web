# memerson-web

Personal site for **[memerson.com](https://memerson.com)** — live. Astro, static output,
hosted on Cloudflare Workers Static Assets. No SSR adapter, no runtime data fetching.

## Docs — read these first

| Doc                                          | Contents                                                           |
| -------------------------------------------- | ------------------------------------------------------------------ |
| [docs/CONTEXT.md](docs/CONTEXT.md)           | Background, current state, DNS, mail, the AWS situation            |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Technical design: hosting, content model, photo infrastructure     |
| [docs/UI-DESIGN.md](docs/UI-DESIGN.md)       | The "Neon District" design system — tokens, motion, scroll effects |
| [docs/MILESTONES.md](docs/MILESTONES.md)     | Delivery plan and what is actually done                            |
| [docs/design/](docs/design/)                 | The imported mockups, kept as the design source of record          |

## Requirements

Node 24 LTS (pinned in `.nvmrc` and `engines`). nvm's `default` alias resolves to 24, so a
fresh terminal should already have it.

```bash
nvm use          # only needed if your shell isn't already on 24
npm install
```

**Non-interactive shells fall through to Homebrew's older Node**, which breaks wrangler
(it needs ≥22) and therefore every photo command. If a script reports an unexpected
version, source nvm explicitly:

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24
```

## Commands

| Command           | Does                                  |
| ----------------- | ------------------------------------- |
| `npm run dev`     | Dev server                            |
| `npm run build`   | Build to `./dist`                     |
| `npm run preview` | Serve the build locally               |
| `npm run check`   | `astro check` — types and diagnostics |
| `npm run format`  | Prettier                              |
| `npm run deploy`  | Build, then `wrangler deploy`         |

There is no test suite. `npm run check` at zero and a successful `npm run build` are the
verification gates. Start the dev server detached with `npx astro dev --background`, then
`astro dev stop` / `status` / `logs`.

### Photos

```bash
npm run photos:import -- ~/Desktop/new-photos   # a folder (recursive)
npm run photos:import -- ~/Downloads/DSC_0142.jpg
npm run photos:verify                           # manifest vs. R2, both directions
npm run photos:rebuild -- <slug>                # re-derive from the archived original
```

Note the `--`; without it npm swallows the arguments.

The path is always an argument — there is no configured import directory and no state
file. The manifest (`src/data/photos.json`, in git) is the only state, and the sha256 of
the original bytes is the idempotency key, so re-importing a photo is a no-op and an
interrupted run resumes by re-running it. Design in
[ARCHITECTURE.md §5.7](docs/ARCHITECTURE.md).

Each import prints the new slug; paste it into a post as `<Photo id="…" />`.

Currently **118 photos**, 1,160 derivatives in R2, originals in a private archive bucket.

## Design

The site is **styled** as of M3 — "Neon District", designed separately in Claude Design
and imported. Tokens and materials live in `src/styles/global.css`; the system is
documented in [UI-DESIGN.md](docs/UI-DESIGN.md) and the source mockups are in
[docs/design/](docs/design/).

**Desktop only, deliberately.** The mockups specify desktop layouts; the mobile pass is
separate future work and [UI-DESIGN §9](docs/UI-DESIGN.md) records what it will hit.

Fonts are self-hosted in `public/fonts/` rather than loaded from Google — the footer
claims "no trackers" and a third-party font request would quietly make that false.

## Deployment

`wrangler.jsonc` configures an assets-only Worker (no `main` script) with
`custom_domain: true` on `memerson.com`. `npm run deploy` builds and ships it.

Done: `wrangler login`, R2 enabled, both buckets created, `photos.memerson.com` attached,
and the custom domain bound — **live since 2026-07-27**. No R2 API token is needed;
uploads go through wrangler
([ARCHITECTURE.md §3](docs/ARCHITECTURE.md#3-hosting-and-deployment)).

Two traps from the first bind, both written up in ARCHITECTURE §3:

- **`custom_domain` will not bind over an existing apex record**, and an apex CNAME is
  invisible to `dig` because Cloudflare flattens it into synthetic A/AAAA answers. Trust
  the dashboard, not the resolver.
- **The binding and its DNS record are provisioned separately.** If `workers/domains`
  lists the hostname but it doesn't resolve, just deploy again.

Still outstanding: **Workers Builds** (needs a GitHub remote — this repo has none yet —
plus authorizing Cloudflare's GitHub app), the **Bulk Redirects** from `errorsignal.dev`,
and **mail hardening** (SPF/DKIM/DMARC/DNSSEC — MX for Google Workspace is already live).

## Layout

```
src/
  consts.ts              site metadata, PHOTOS_BASE_URL, page size
  content.config.ts      blog / projects / photos collections
  data/photos.json       photo manifest (generated by photos:import)
  content/blog/          markdown posts + colocated images
  content/projects/      one YAML per project
  styles/global.css      design tokens, materials, motion — the whole system
  scripts/
    fx.ts                the four scroll effects (rail, resolve, parallax, progress)
    lightbox.ts          contact-sheet lightbox
  lib/
    ramp.ts              build-time accent-ramp sampling
    readingTime.ts       word-count reading estimate
  layouts/BaseLayout.astro
  components/
    Photo.astro          renders a manifest photo by slug (build error on a bad slug)
    PhotoThumb.astro     gallery tile, dim by default
    Sky.astro, SiteHeader.astro, SiteFooter.astro
  pages/
    index.astro          the sign, the rail, project plates, previews
    about.astro
    blog/index.astro, blog/[...slug].astro
    photos/[...page].astro  paginated contact sheet
    404.astro, rss.xml.ts
scripts/photos/
  import.mjs             import / verify / rebuild — the photo CLI
  lib/files.mjs          argument expansion (files or recursive directories)
  lib/exif.mjs           EXIF allowlist
  lib/derive.mjs         sharp derivative ladder, LQIP, metadata assertions
  lib/manifest.mjs       manifest read/write, hashing, slugs
  lib/r2.mjs             wrangler uploads with a concurrency pool; REST listing
```
