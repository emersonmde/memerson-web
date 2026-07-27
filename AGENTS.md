# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> `CLAUDE.md` is a symlink to this file (`AGENTS.md`) — one source of truth, both names work.

## Read the docs first

Design decisions and their rationale live in `docs/`. Read them before changing anything
structural — most of the non-obvious constraints below are explained there in full.

| Doc                    | Contents                                                           |
| ---------------------- | ------------------------------------------------------------------ |
| `docs/CONTEXT.md`      | Background, current state, DNS, mail, the AWS situation            |
| `docs/ARCHITECTURE.md` | Technical design: hosting, content model, photo infrastructure     |
| `docs/UI-DESIGN.md`    | The "Neon District" design system — tokens, motion, scroll effects |
| `docs/MILESTONES.md`   | Delivery plan, with what is and isn't done                         |
| `docs/design/`         | The imported mockups, kept as the design source of record          |

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

**`memerson.com` is live** (2026-07-27). Deploy with `npm run deploy`.

Deployment is intended to run via Cloudflare Workers Builds on push to `main`, but that is
**not connected yet** — this repo has no GitHub remote, and authorizing Cloudflare's GitHub
app is dashboard-only.

One-time setup from `docs/ARCHITECTURE.md` §3 that **is** done: `wrangler login`, R2
enabled, both buckets created, `photos.memerson.com` attached, custom domain bound. No R2
API token was needed. Still outstanding: Workers Builds, the `errorsignal.dev` Bulk
Redirects (M2), and mail hardening (SPF/DKIM/DMARC/DNSSEC).

## Hard constraints

**The site is styled, and the design is imported — not invented here.** It is
"Neon District", designed separately in Claude Design. **Read `docs/UI-DESIGN.md` before
touching anything visual**, and treat `docs/design/` as the source of record. Do not
introduce new colours, fonts, or spacing values ad hoc: everything is a token in
`src/styles/global.css`, and the accent ramp in particular locks lightness and chroma and
moves only hue, which is what stops sampled colours fighting each other.

**Desktop only, deliberately.** The mockups specify desktop layouts and the mobile pass is
separate future work. Do not add breakpoints piecemeal — `docs/UI-DESIGN.md` §9 lists what
a real mobile pass has to deal with.

**Do not carry anything over from the old site's visual design.** No Sonokai palette, no
tmux status bar, no terminal/TUI framing. Only _content_ migrated. Older notes suggesting
otherwise were reversed; see the reversal note in `docs/CONTEXT.md`. (Neon District is a
new design, not the old one — the resemblance is that both are dark and monospace-heavy.)

**`src/data/photos.json` is generated.** Written by the import script. The only
hand-editable fields _today_ are `title`, `caption`, and `tags`.

The writer preserves any other field it finds, so the schema can grow (an `album` is a live
possibility — see MILESTONES M4) without the import silently deleting it. Adding one means
declaring it in `src/content.config.ts`, or the collection layer strips it.

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
- **`npm run photos:import` needs `--` before its arguments**, or npm swallows them:
  `npm run photos:import -- ~/Desktop/photos`. Same for `photos:rebuild`.
- **Non-interactive shells get the wrong Node**, which breaks wrangler (it requires
  ≥22) and therefore every photo command. Source nvm first — see Toolchain above.
- **`sharp` output metadata is asserted, not assumed.** `derive.mjs` re-reads every
  derivative and throws if `exif`/`icc`/`iptc`/`xmp` survived. Don't remove that check to
  save time; publishing GPS is the failure it exists to prevent.
- **The archive key's extension isn't in the manifest.** Originals land at
  `originals/<slug>.<ext>` where `ext` follows the source format, so `verify` and `rebuild`
  match on the `originals/<slug>.` prefix instead of reconstructing a filename.
- **Never infer a DNS record's type at an apex from what `dig` returns.** Cloudflare
  flattens an apex CNAME into synthetic A/AAAA answers, so the resolver and the dashboard
  legitimately disagree. This cost hours once already. MX and TXT are never proxied, so
  for mail records `dig` _is_ ground truth.
- **A Worker custom domain and its DNS record are provisioned separately.** If
  `workers/domains` lists the hostname but it does not resolve, run `wrangler deploy`
  again rather than detaching the binding.
- **R2 uploads shell out to `wrangler r2 object put`** with a concurrency pool of ~8 — no
  S3 API token, no `@aws-sdk/client-s3`. wrangler starts in ~0.61s, so ~1,300 objects take
  ~3 min at concurrency 8, which isn't worth a second long-lived credential. Rationale in
  `docs/ARCHITECTURE.md` §3.

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
