# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> `CLAUDE.md` is a symlink to this file (`AGENTS.md`) — one source of truth, both names work.

## Read the docs first

Design decisions and their rationale live in `docs/`. Read them before changing anything
structural — most of the non-obvious constraints below are explained there in full.

| Doc                    | Contents                                                       |
| ---------------------- | -------------------------------------------------------------- |
| `docs/CONTEXT.md`      | Background, current state, DNS, the AWS teardown situation     |
| `docs/ARCHITECTURE.md` | Technical design: hosting, content model, photo infrastructure |
| `docs/MILESTONES.md`   | Delivery plan M1–M4, with what is and isn't done               |

## Toolchain

**Node 24** (latest LTS, "Krypton"), pinned in `.nvmrc` and `engines`. This machine's nvm
`default` alias now resolves to 24, so a fresh terminal gets it without `nvm use`.

Caveat: Homebrew also has a `node` (23.9.0) at `/opt/homebrew/bin/node`. nvm wins in
interactive shells because `.zshrc` sources nvm after Homebrew's `shellenv`, but a
**non-interactive** shell skips `.zshrc` and falls through to the Homebrew one. If a script
reports an unexpected Node version, that's why — source nvm explicitly:

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24
```

Note also that nvm scopes `npm install -g` per Node version, so globals installed under one
version vanish when you switch.

## Commands

```bash
npm run dev              # dev server
npm run build            # build to ./dist
npm run preview          # serve the build
npm run check            # astro check — types + diagnostics; keep at 0 errors
npm run format           # prettier
npm run deploy           # build, then wrangler deploy (needs `wrangler login` first)
npx wrangler deploy --dry-run   # validate wrangler.jsonc without deploying
```

Start the dev server in background mode so it doesn't block: `npx astro dev --background`,
then `astro dev stop` / `status` / `logs [--follow]`.

There is no test suite. `npm run check` and a successful `npm run build` are the
verification gates.

## Architecture

**Static Astro site on Cloudflare Workers Static Assets. No SSR adapter, no runtime data
fetching.** This is load-bearing, not incidental: the old site's photo gallery fetched an
AWS API Gateway endpoint at runtime, and that dependency is the thing blocking AWS
teardown. Do not reintroduce request-time data fetching for content.

### Content is three collections

Defined in `src/content.config.ts`: `blog` (glob over markdown), `projects` (glob over
YAML), `photos` (`file()` loader over `src/data/photos.json`).

The photo manifest is a single JSON file but is **loaded as a collection** specifically so
individual photos are addressable via `getEntry('photos', slug)`. That is what lets a blog
post reference one photo through `src/components/Photo.astro`. Don't "simplify" it to a
plain JSON import — that breaks the blog-reference path.

### The image rule

Images are split **by kind, not by location**:

- **Photography (gallery)** → R2 only, served from `photos.memerson.com`. Derivatives are
  pre-generated locally by an import script. Never processed in CI.
- **Blog screenshots / diagrams** → in the repo, colocated with the post, via
  `astro:assets`.

Photos are never duplicated between repo and R2, and **`astro:assets` must not be used for
gallery photos**. Originals in the repo would mean ~1 GB in git plus Workers Builds
re-encoding everything on every push (Astro's image cache is local-only; CI starts cold).
Remote-image optimization via `image.remotePatterns` has the same problem and is also
rejected — see `docs/ARCHITECTURE.md` §5.1–5.2.

### Hosting

`wrangler.jsonc` is an assets-only Worker: no `main` script, `assets.directory: ./dist`,
`custom_domain: true` on `memerson.com`. **There is deliberately no R2 binding** — photos
are served from an R2 custom domain rather than proxied through the Worker.

Deployment normally happens via Cloudflare Workers Builds on push to `main`. One-time
manual setup (wrangler login, R2 buckets, the photos custom domain, an R2 API token, Bulk
Redirects) is listed in `docs/ARCHITECTURE.md` §3 and **none of it is done yet**.

## Hard constraints

**The site is deliberately unstyled.** There is no global stylesheet and no visual
identity. Do not add styling, colors, fonts, or a CSS framework unless the task is
explicitly milestone M3. Markup is structured by meaning so it can be restyled without
restructuring — keep it that way.

**Do not carry anything over from the old site's visual design.** No Sonokai palette, no
tmux status bar, no terminal/TUI framing. Only _content_ migrates. Older notes suggesting
otherwise were reversed; see the reversal note in `docs/CONTEXT.md`.

**`src/data/photos.json` is generated.** Written by the import script. The only
hand-editable fields are `title`, `caption`, and `tags`.

**Photo privacy is a hard requirement.** EXIF handling is an allowlist, never a denylist —
GPS plus camera/lens serials, owner fields, and vendor `MakerNote` blobs are all dropped.
Public derivatives cap at 2560px. Full-resolution originals go to a **private** archive
bucket and are never served publicly.

**Never enable Cloudflare Images** — $5/month minimum once switched on, and pre-generated
derivatives make it unnecessary.

## Gotchas

- **`paginate([])` emits zero routes.** With an empty manifest, `/photos` would not exist
  at all. `src/pages/photos/[...page].astro` returns an explicit empty first page to
  prevent this. Preserve that guard until real photos are in the manifest.
- **`Photo.astro` throws at build time on an unknown slug**, by design — a typo'd slug
  becomes a build failure rather than a broken image in production. Don't soften it to a
  silent fallback.
- **Astro 7 bundles Zod 4.** Use `z.url()`; `z.string().url()` is deprecated and shows up
  as an `astro check` hint.
- **The photo commands don't exist yet.** `photos:import`, `photos:verify`, and
  `photos:rebuild` are fully specified in `docs/ARCHITECTURE.md` §5.7 but unimplemented —
  M1 work. `sharp`, `exifr`, and `@aws-sdk/client-s3` are intentionally not installed yet.
- **Bulk R2 uploads use the S3-compatible API** (`@aws-sdk/client-s3` against the R2
  endpoint), not `wrangler r2 object put` — the latter is one process per object and far
  too slow for ~1,200 objects.

## Related repos

- `~/workspace/emersonmde.github.io` — the current live site (`errorsignal.dev`). Source
  for content migration: blog posts, projects YAML, favicons. Use
  `/add-dir ~/workspace/emersonmde.github.io` to read it.
- `~/workspace/memerson` — old CRA site plus the CDK stacks being torn down.
- `~/workspace/emersonmde` — GitHub profile README, not a website. Leave alone.

## Astro reference

Full docs: https://docs.astro.build — in particular
[routing](https://docs.astro.build/en/guides/routing/),
[components](https://docs.astro.build/en/basics/astro-components/), and
[content collections](https://docs.astro.build/en/guides/content-collections/).
