# memerson-web — Context

New personal site for **memerson.com**, replacing `errorsignal.dev`. Hosted entirely on
Cloudflare, targeting $0/month.

This file is background and current-state facts. Technical design lives in
[ARCHITECTURE.md](./ARCHITECTURE.md); delivery plan in [MILESTONES.md](./MILESTONES.md).

## What this site is

A personal site, not a photo site. Roughly in order of importance:

- **Landing page / portfolio** — projects, the primary entry point.
- **About / CV** — who I am, what I do, skills, links.
- **Blog** — long-form technical writing.
- **Photos** — a personal photography gallery. Real, but not the primary use case.

## Visual design: deliberately undecided

**Nothing is carried over from the old site's visual design.** No Sonokai palette, no tmux
status bar, no terminal/TUI framing. The new design is a clean slate and will be developed
as its own phase, in its own doc (`docs/UI-DESIGN.md`), after the content architecture and
data layer are working.

> Reversal note: an earlier version of this file said to keep the Sonokai palette and tmux
> status bar. That decision was reversed — the new design must not be constrained by the
> old one. If you are reading this in a fresh session, ignore any suggestion to port the
> old look.

What _is_ carried over is **content**, not styling: blog posts (markdown), project entries
(YAML), and the photo library. The old repo stays in git as history.

Also dropped: the shell simulation (`TuiShell.astro`, `commands.ts`) — a hand-maintained
fake filesystem that had already drifted out of sync with real content, for a feature
almost nobody used.

## Current state (verified 2026-07-26)

### DNS

| Domain            | Nameservers                                     | Currently serves                   |
| ----------------- | ----------------------------------------------- | ---------------------------------- |
| `memerson.com`    | Cloudflare (`nicole`/`randy.ns.cloudflare.com`) | CF-proxied 404 page                |
| `errorsignal.dev` | Cloudflare                                      | GitHub Pages (the live Astro site) |
| `memerson.dev`    | **Route 53** (`ns-*.awsdns-*`)                  | Old CRA site via CloudFront        |

`memerson.com` is already on Cloudflare nameservers, so `custom_domain: true` binds
without any nameserver migration. `memerson.dev` is the only domain still on AWS DNS and
needs its own decision (redirect to `memerson.com`).

### The photos are a live AWS runtime dependency

The current gallery (`PhotoGallery.tsx` on `errorsignal.dev`) does a **runtime fetch** to
`https://knsfeilz9j.execute-api.us-east-1.amazonaws.com/dev/photos` → Lambda
`list_photos` → `s3:list_objects_v2` on `memerson-public-photos`.

**Tearing down the API stack breaks the photos page on the currently-live site.** Photo
data must be in R2 with a committed manifest before any AWS teardown.

Secondary problems with that Lambda: `list_objects_v2` is unpaginated (1000-object cap),
and it derives `srcSet` from filename sort order with `1x`/`2x` descriptors — which is why
the old `srcset` is broken.

### S3 bucket `memerson-public-photos`

- **472 objects, 956 MB** = 118 photos × 4 variants.
- Keys are `<upload-ms>-<uuid>/<W>x<H>.jpg`, e.g.
  `1647310592883-96e14da4-.../1280x853.jpg`, plus a `<W>x<H>_full.jpg` original.
- Variants present: 640w, 1280w, 1920w, and the full-size original (2.8–10 MB each).
- Originals are ~90% of total bytes.
- **Dimensions exist only in the key name.** The Lambda regexes them out.
- **No metadata of any kind** — no captions, titles, tags, or dates beyond the upload
  timestamp embedded in the key prefix. EXIF in the originals is the only real metadata
  that exists anywhere.

### AWS teardown scope

The CDK app (`~/workspace/memerson/infrastructure`) is larger than just photos:

`Route53Stack`, `CloudFrontStack`, `CognitoStack`, `S3Stack`, `ApiStack`,
`PipelineStack`, `AmplifyStack`, `BackupStack`, `PostHogReverseProxyStack`,
`MinecraftStack` (has its own DNS record).

Some of this is probably already dead. It needs an inventory before anything is deleted.
The PostHog reverse proxy implies analytics currently runs on the live site — decide
whether that carries over.

Note: local AWS CLI is authenticated as the account **root** user
(`arn:aws:iam::600879026835:root`).

## Related repos

| Repo                               | Status                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `~/workspace/emersonmde.github.io` | Current live site (`errorsignal.dev`, Astro + GitHub Pages). Source for **content** migration: blog posts, projects YAML, favicons. Archive once redirected. |
| `~/workspace/memerson`             | Old CRA site + the CDK stacks for the AWS infra being torn down. Keep until teardown is done.                                                                |
| `~/workspace/emersonmde`           | GitHub profile README, not a website. Leave alone.                                                                                                           |

`/add-dir ~/workspace/emersonmde.github.io` to read the old site from a session.

## Gotchas

- **Don't enable Cloudflare Images** — $5/month minimum once switched on. Pre-generating
  derivatives locally avoids it entirely.
- **The photos only exist in S3 right now.** They must be in R2 before any AWS teardown.
- **Don't port the old `srcset`** — it emits bare URLs with no `w`/`x` descriptors and no
  `sizes`, so the browser cannot pick a size. Emit real descriptors.
- **Public variants cap at 2560px.** Full-resolution originals are not exposed publicly.
- **Archived originals still contain GPS EXIF.** The originals archive bucket must be
  private. Only derivatives (metadata-stripped) are public.
- **No R2 binding is needed in `wrangler.jsonc`.** Photos are served from an R2 custom
  domain, not proxied through the Worker. An earlier note in this file said otherwise.
