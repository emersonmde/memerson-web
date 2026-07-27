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

## Visual design: settled

The site is designed. It is **"Neon District"**, produced separately in Claude Design and
imported 2026-07-26. The system is documented in [UI-DESIGN.md](./UI-DESIGN.md) and the
source mockups are kept in [`design/`](./design/).

**Nothing was carried over from the old site's visual design.** No Sonokai palette, no tmux
status bar, no terminal/TUI framing. Neon District is a new design that happens to share
the old one's darkness and fondness for monospace — that resemblance is not inheritance.

> Reversal note: an earlier version of this file said to keep the Sonokai palette and tmux
> status bar. That decision was reversed — the new design must not be constrained by the
> old one. If you are reading this in a fresh session, ignore any suggestion to port the
> old look.

Desktop only, deliberately; the mobile pass is separate future work.

What _is_ carried over is **content**, not styling: blog posts (markdown), project entries
(YAML), and the photo library. The old repo stays in git as history.

Also dropped: the shell simulation (`TuiShell.astro`, `commands.ts`) — a hand-maintained
fake filesystem that had already drifted out of sync with real content, for a feature
almost nobody used.

## Current state (verified 2026-07-26)

### DNS

| Domain            | Nameservers                                     | Currently serves                      |
| ----------------- | ----------------------------------------------- | ------------------------------------- |
| `memerson.com`    | Cloudflare (`nicole`/`randy.ns.cloudflare.com`) | **This site** — live since 2026-07-27 |
| `photos.…com`     | Cloudflare (R2 custom domain)                   | Photo derivatives from R2             |
| `errorsignal.dev` | Cloudflare                                      | GitHub Pages — redirects + 3 projects |
| `memerson.dev`    | **Route 53** (`ns-*.awsdns-*`)                  | Old CRA site via CloudFront           |
| `memerson.net`    | **Route 53**                                    | Nothing — ACM validation records only |

Binding `memerson.com` was not the no-op it looked like. A **proxied CNAME at the apex**
had to be deleted first, and it was invisible to `dig` because Cloudflare flattens an apex
CNAME into synthetic A/AAAA answers. Full account in
[ARCHITECTURE §3](./ARCHITECTURE.md#3-hosting-and-deployment).

**`errorsignal.dev` now redirects to `memerson.com`** — live 2026-07-27, so `memerson.com`
is the site people reach. **It is a shared host**, not just the old site: three other repos
publish to it through GitHub Pages — `coppermind` (the WASM demo), `daedalus` (the Rust
docs) and `vilya` — and all three were verified still serving after the cutover. That is
why the redirect lives in the old site's own repo rather than on the domain: nothing
domain-wide can reach them. See [ARCHITECTURE §8](./ARCHITECTURE.md).

`memerson.dev` and `memerson.net` are the two zones still on AWS DNS. Both need a decision;
`memerson.dev` blocks its half of the redirect work.

**Mail lives on this zone too.** `MX` points at `smtp.google.com` (Google Workspace) and
there is a Google site-verification `TXT` at the apex. Neither was touched by the apex
work, and both are unaffected by proxying — Cloudflare never proxies MX or TXT. SPF, DKIM,
DMARC and DNSSEC are **not** configured yet.

### Photo timestamps: the R6 clock is wrong

`takenAt` stores the camera's wall clock, tagged `Z`. That is deliberate — EXIF carries no
timezone, so interpreting it in the importing machine's zone would make slugs depend on
where the import ran. Displaying what the camera showed is also more meaningful than a UTC
instant.

**Every file does carry an `OffsetTime`** (−04:00, −05:00 …) which the EXIF allowlist
deliberately drops. Adding it later would let true instants be reconstructed, but it would
also shift dates for evening shots, and slugs embed the date — so it is a URL-breaking
change, not a free one.

Separately, and unrelated to that: **the Canon R6's clock is roughly twelve hours off** for
at least the 2022-10-29 shoot. Those frames are stamped 02:08–06:00 while shot at ISO 100,
1/250 — bright daylight. So the displayed dates for that shoot may be a day out, and any
claim about _what time of day_ these photos were taken is unsupportable. This was caught
while fact-checking a line of copy that said "mostly at unreasonable hours"; the line was
removed.

### The photos are a live AWS runtime dependency

> **Update (2026-07-26):** all 118 photos are now in R2 with the manifest committed, so
> the _data_ dependency is gone and the S3 bucket is safe to delete.
>
> **Update (2026-07-27): the API stack is now safe to tear down too.** What is described
> below no longer runs anywhere — `errorsignal.dev/photos` is a redirect page, and the
> gallery that called API Gateway was deleted along with the rest of the old site's
> implementation. Nothing reaches that endpoint now.

The old gallery (`PhotoGallery.tsx` on `errorsignal.dev`) did a **runtime fetch** to
`https://<api-id>.execute-api.us-east-1.amazonaws.com/dev/photos` → Lambda
`list_photos` → `s3:list_objects_v2` on `memerson-public-photos`.

**This is the dependency that blocked the AWS teardown, and it is fully discharged.** Photo
data had to be in R2 with a committed manifest first (done 2026-07-26), and the last caller
had to stop existing (done 2026-07-27, when the old site became redirects). Nothing now
reaches API Gateway. The whole reason this site forbids request-time data fetching for
content is to avoid recreating this situation — see `AGENTS.md`.

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

### AWS teardown scope — inventoried 2026-07-26

The CDK app (`~/workspace/memerson/infrastructure`) is larger than just photos. An earlier
version of this section listed the stacks from the CDK source; below is what is **actually
deployed**, which is not the same list.

**Stacks actually in CloudFormation (9):**

| Stack                              | Last updated | Notes                                  |
| ---------------------------------- | ------------ | -------------------------------------- |
| `MemersonApiStack`                 | 2024-05-04   | The photos API. Blocks nothing now.    |
| `MemersonS3Stack`                  | 2024-05-05   | Photo buckets.                         |
| `MemersonCloudFrontStack`          | 2024-05-04   | Serves `memerson.dev`.                 |
| `MemersonRoute53Stack`             | 2024-05-04   | `memerson.dev` zone.                   |
| `MemersonCognitoStack`             | 2024-03-15   | No known consumer.                     |
| `MemersonPostHogReverseProxyStack` | 2024-03-15   | **Nothing references it** — see below. |
| `MemersonReactPipelineStack`       | 2024-02-11   | CI for the dead CRA site.              |
| `MemersonBackupStack`              | 2022-08-06   | Glacier, $0.10/mo.                     |
| `CDKToolkit`                       | 2021-10-18   | CDK bootstrap. Delete last.            |

**`AmplifyStack` and `MinecraftStack` are not deployed** — they exist only in the CDK
source. Open decision #6 is therefore already answered for the _stack_; see the orphaned
resources below for the part that still costs money.

**Analytics (open decision #1) answered itself, then was decided:** `errorsignal.dev` served
**no analytics script at all** — no PostHog, no Plausible. The reverse-proxy stack is dead
weight, and the Plausible setup described in the `plausible-analytics` blog post was no
longer wired up. So it was never "migrate analytics", it was "decide whether to start". As
of 2026-07-27 the answer is **no** — see [MILESTONES M2](./MILESTONES.md). The proxy stack
has no future use.

**Orphaned resources with no owning stack** — this is where the non-S3 spend is:

- EC2 `<instance-id>` ("Minecraft", `t2.medium`) — **stopped since 2023-02-01**.
  Stopped instances are free, but its **30 GB EBS volume** is not (~$2.40/mo).
- **Unassociated Elastic IP `<elastic-ip>`** — ~$3.60/mo for an address attached to
  nothing. This plus the volume is the `VPC` + `EC2 - Other` line on the bill.
- Secret `github-access-token` in Secrets Manager (~$0.40/mo).
- KMS keys, ~$3.22 in July — several CMKs at $1/mo each.

**Photo buckets: there are four, not one.** Verified by sha256 against the committed
manifest — **every photo in all of them is already migrated**, so none block deletion:

| Bucket                       | Contents                                                           |
| ---------------------------- | ------------------------------------------------------------------ |
| `memerson-public-photos`     | 472 objects, 956 MB — the set that was migrated.                   |
| `memerson-photos`            | 118 objects, 893 MB — flat copies of the same originals.           |
| `memerson-api-photos`        | 120 objects, 560 MB — 24 photos × 5 tiers; all 24 in the manifest. |
| `memerson-cloudfront-photos` | **empty**.                                                         |

Plus `memerson-dev-client` (26 objects, the 2020 CRA build) and several CDK/pipeline
artifact buckets.

**Route 53 has two zones, not one:** `memerson.dev` _and_ `memerson.net` (undocumented
until now). `memerson.net` holds only NS/SOA and ACM validation CNAMEs — no site. Both
zones bill $0.50/mo.

**Current spend:** $18.97 month-to-date (July), $3.69 for the tail of June. S3 is the
largest line at $9.39, and the redundant photo buckets are most of it.

Note: local AWS CLI is authenticated as the account **root** user
(`arn:aws:iam::<aws-account-id>:root`).

## Related repos

| Repo                               | Status                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/workspace/emersonmde.github.io` | The old site, **retired 2026-07-27** — now nothing but redirect pages to `memerson.com`. Its TUI implementation was deleted in the same change (still in git history); `src/content/` was kept as the source of record for the **content** migration: blog posts, projects YAML. Archive it. |
| `~/workspace/memerson`             | Old CRA site + the CDK stacks for the AWS infra being torn down. Keep until teardown is done.                                                                                                                                                                                                |
| `~/workspace/emersonmde`           | GitHub profile README, not a website. Leave alone.                                                                                                                                                                                                                                           |

`/add-dir ~/workspace/emersonmde.github.io` to read the old site from a session.

## Gotchas

- **Don't enable Cloudflare Images** — $5/month minimum once switched on. Pre-generating
  derivatives locally avoids it entirely.
- ~~**The photos only exist in S3 right now.**~~ Migrated 2026-07-26: 118 photos, 1,160
  derivatives in `memerson-photos`, 118 originals in the private archive. Seven photos
  were narrower than 2560px so they carry fewer than five widths — hence 1,160 rather
  than the 1,180 §5.5 estimated.
- **Don't port the old `srcset`** — it emits bare URLs with no `w`/`x` descriptors and no
  `sizes`, so the browser cannot pick a size. Emit real descriptors.
- **Public variants cap at 2560px.** Full-resolution originals are not exposed publicly.
- **Archived originals still contain GPS EXIF.** The originals archive bucket must be
  private. Only derivatives (metadata-stripped) are public. Measured at import: none of
  these 118 files actually carried GPS, but they do carry camera/lens and serial-bearing
  `MakerNote` blobs, and the next import may well carry GPS — the rule stands regardless
  of what one batch happened to contain.
- **No R2 binding is needed in `wrangler.jsonc`.** Photos are served from an R2 custom
  domain, not proxied through the Worker. An earlier note in this file said otherwise.
