# memerson-web

Personal site for **memerson.com**. Astro, static output, hosted on Cloudflare Workers
Static Assets.

## Docs — read these first

| Doc                                          | Contents                                                       |
| -------------------------------------------- | -------------------------------------------------------------- |
| [docs/CONTEXT.md](docs/CONTEXT.md)           | Background, current state, DNS, the AWS teardown situation     |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Technical design: hosting, content model, photo infrastructure |
| [docs/MILESTONES.md](docs/MILESTONES.md)     | Delivery plan, M1–M4                                           |

**The site is deliberately unstyled.** There is no global stylesheet and no visual
identity — that is milestone M3, and nothing is carried over from the old site's design.
Markup is structured by meaning so it can be restyled without restructuring.

## Requirements

Node 24 LTS (pinned in `.nvmrc` and `engines`). nvm's `default` alias resolves to 24, so a
fresh terminal should already have it.

```bash
nvm use          # only needed if your shell isn't already on 24
npm install
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

Photo import commands (`photos:import`, `photos:verify`, `photos:rebuild`) are specified in
[ARCHITECTURE.md §5.7](docs/ARCHITECTURE.md) but **not yet implemented** — M1 work.

## Deployment

`wrangler.jsonc` configures an assets-only Worker (no `main` script) with
`custom_domain: true` on `memerson.com`. Deployment normally happens via Cloudflare
Workers Builds on push to `main`.

One-time manual setup is listed in
[ARCHITECTURE.md §3](docs/ARCHITECTURE.md#3-hosting-and-deployment) — `wrangler login`, R2
bucket creation, the `photos.memerson.com` custom domain, an R2 API token, and Bulk
Redirects. None of it has been done yet.

## Layout

```
src/
  consts.ts              site metadata, PHOTOS_BASE_URL, page size
  content.config.ts      blog / projects / photos collections
  data/photos.json       photo manifest (empty; written by photos:import)
  content/blog/          markdown posts + colocated images
  content/projects/      one YAML per project
  layouts/BaseLayout.astro
  components/Photo.astro renders a manifest photo by slug
  pages/
    index.astro          portfolio landing
    about.astro
    blog/index.astro, blog/[...slug].astro
    photos/[...page].astro  paginated gallery
    404.astro, rss.xml.ts
```
