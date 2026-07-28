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
npm test                 # build, then the full suite
npm run test:unit        # pure logic only, no build (~0.1s)
npm run format           # prettier
npm run deploy           # build, then wrangler deploy (needs `wrangler login` first)
npx wrangler deploy --dry-run   # validate wrangler.jsonc without deploying
```

Photos — all need `--` before their arguments, and all are idempotent by skipping:

```bash
npm run photos:import -- <path>…   # → R2 + manifest, then groups and describes what it added
npm run photos:shoots              # group by capture time (no model); --gap-days N, --dry-run
npm run photos:describe            # tags/caption/title for photos with none; --limit N, --force
npm run photos:name-shoots         # propose a name per shoot from several frames; --force
npm run photos:verify              # every manifest object really is in R2
npm run photos:rebuild             # re-derive from the archive bucket
```

`import` already runs the metadata pass over what it just imported, so `shoots`, `describe`
and `name-shoots` are **backfills** — in steady state they find nothing to do.

```bash
npm run design:bundle    # snapshot the built site for Claude Design → .design-bundle/
```

Start the dev server in background mode so it doesn't block: `npx astro dev --background`,
then `astro dev stop` / `status` / `logs [--follow]`.

**Verification gates: `npm run check` at 0 and `npm test` green.** The suite uses Node's
built-in runner — no framework, no dependencies — and `node --test` needs file paths or a
glob, not a bare directory.

Tests assert **invariants, not pixel values**, because content changes constantly: every
project lengthens the rail, every photo lengthens the gallery. A test that would break
when a plate gets taller is testing the wrong thing. See `docs/TESTING.md`.

Real-browser behaviour (infinite scroll, lightbox, transitions) is _not_ covered — it was
verified over the Chrome DevTools Protocol, and `docs/TESTING.md` records how.

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
**not connected yet.** The repo is now public at `github.com/emersonmde/memerson-web`, so
the remaining step is authorizing Cloudflare's GitHub app, which is dashboard-only. Until
then `npm run deploy` is the only thing that ships — a push to `main` deploys nothing.

One-time setup from `docs/ARCHITECTURE.md` §3 that **is** done: `wrangler login`, R2
enabled, both buckets created, `photos.memerson.com` attached, custom domain bound. No R2
API token was needed. Still outstanding: Workers Builds and mail hardening
(SPF/DKIM/DMARC/DNSSEC). The `errorsignal.dev` cutover is **done** (2026-07-27) and was
never Bulk Redirects — the redirects live in the old site's own repo, deliberately. See
`docs/ARCHITECTURE.md` §8.

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

**`src/data/photos.json` is generated.** Written by the import script. The hand-editable
fields are `title`, `caption`, and `tags` — which `photos:describe` also writes, so a hand
edit and a re-run can contend. It only fills in photos that have neither a caption nor
tags, so an edited photo is left alone unless you pass `--force`.

The writer preserves any other field it finds, so the schema can grow without the import
silently deleting it. Adding one means declaring it in `src/content.config.ts`, or the
collection layer strips it.

**`src/data/shoots.json` is generated the same way, and is also hand-edited.** Derived
fields (`count`, `from`, `to`, `cameras`) are rewritten every run; `name`, `series` and
anything else you add survive untouched. A **shoot** is one outing and is what you browse;
a **series** is the optional thread joining recurring ones (two "Air Show" shoots, one
`series: "air-shows"`). One occurrence per shoot — never one shoot for a recurring event.
This is the file where both get named — see
MILESTONES M4.

**Metadata generation runs once per photo, at import, and never sweeps the library.** This
is load-bearing, not an optimisation. Re-clustering shoots over the whole manifest could
merge two shoots that had already been named, silently reattaching those names to the wrong
photographs. `assignShoots` therefore only ever fills in photos with no shoot, may _extend_
an existing shoot, and refuses to _merge_ two — a bridge is reported for a human instead.

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
  `npm run photos:import -- ~/Desktop/photos`. Same for `photos:rebuild`, `photos:shoots`,
  `photos:describe` and `photos:name-shoots`.
- **The photo metadata commands are all idempotent by skipping, not by diffing.** A photo
  with a caption or any tags is "described"; a photo with a `shoot` is "grouped"; a shoot
  with a `name` is "named". Each has a `--force` to redo. That is why re-running any of
  them in steady state costs nothing — and why deleting a field is how you ask for a redo.
- **`photos:describe` is a backfill, not a routine.** `photos:import` describes each photo
  as it arrives, so the standalone command normally finds nothing to do. Reach for it after
  an import run with `--no-metadata`, or after changing the prompt.
- **Alt text prefers `caption` over `title`**, which reads backwards but is correct: alt
  text has to describe a picture, not name it. `src/lib/photoAlt.ts` spells out why.
- **640px is the floor for what the model can see, and it was measured.** At 256px a
  black-and-white ruffed lemur came back as a "monkey/tamarin" — the failure mode is a
  confident wrong noun, not a vague one. Don't point `photos:describe` at a smaller
  derivative without re-running that comparison.
- **Non-interactive shells get the wrong Node**, which breaks wrangler (it requires
  ≥22) and therefore every photo command. Source nvm first — see Toolchain above.
- **`sharp` output metadata is asserted, not assumed.** `derive.mjs` re-reads every
  derivative and throws if `exif`/`icc`/`iptc`/`xmp` survived. Don't remove that check to
  save time; publishing GPS is the failure it exists to prevent.
- **The archive key's extension isn't in the manifest.** Originals land at
  `originals/<slug>.<ext>` where `ext` follows the source format, so `verify` and `rebuild`
  match on the `originals/<slug>.` prefix instead of reconstructing a filename.
- **Put pure logic in `src/lib/` so it can be tested.** The rail geometry lives in
  `src/lib/rail.ts` for exactly this reason; `src/scripts/fx.ts` reads the DOM and calls it.
- **Astro fires `astro:page-load` on the first load too**, so anything listening to it must
  be safe to run twice — otherwise you get two observers and two lightboxes. And a router
  swap does _not_ re-execute a script the previous page already loaded, which is what once
  left the gallery inert on `/photos/2`.
- **`[hidden]` loses to any author `display` rule.** `global.css` has a global override;
  without it, hiding a flex container by setting the attribute silently does nothing.
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

- `~/workspace/emersonmde.github.io` — the old site (`errorsignal.dev`), **retired
  2026-07-27**. It now builds nothing but redirect pages to `memerson.com`; the TUI
  implementation was deleted and lives only in git history. `src/content/` was kept as the
  source of record for the content migration (blog posts, projects YAML). Use
  `/add-dir ~/workspace/emersonmde.github.io` to read it.
- `~/workspace/memerson` — old CRA site plus the CDK stacks being torn down.
- `~/workspace/emersonmde` — GitHub profile README, not a website. Leave alone.

## Astro reference

Full docs: https://docs.astro.build — in particular
[routing](https://docs.astro.build/en/guides/routing/),
[components](https://docs.astro.build/en/basics/astro-components/), and
[content collections](https://docs.astro.build/en/guides/content-collections/).
