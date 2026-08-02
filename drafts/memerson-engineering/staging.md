# Staging: memerson.com — the engineering post

The artifact post (separate from the process post): the design decisions that make the
site fast and the ones that make it look right. May split into two posts (performance
forensics / photo pipeline) if staging gets rich enough.

## Material

- Architecture: static Astro on Workers Static Assets, no SSR, no runtime data fetching —
  and why that's load-bearing (the old site's runtime API dependency blocked AWS teardown).
- Performance forensics (comments in index.astro and docs/PERFORMANCE.md are half the
  post): the page-tall filter re-rasterization bug (glow moved from drop-shadow filters
  to painted pre-blurred gradients under a mask); iOS tile invalidation ghosting; parking
  hero animations via IntersectionObserver; the compositor distrust doctrine — real
  iPhone WebKit bugs no simulator reproduces.
- Photo pipeline: privacy as an EXIF allowlist (never a denylist), GPS/serials/MakerNote
  dropped, sharp output re-read and asserted clean; pre-generated derivatives vs
  Cloudflare Images ($5/mo) vs CI re-encoding (rejected — cold cache, ~1GB in git);
  R2 custom domain, no Worker proxy, no S3 credential (uploads shell out to wrangler).
- LLM metadata: captions/tags via vision model; the 640px floor finding — at 256px a
  ruffed lemur came back confidently as a "monkey/tamarin"; the failure mode is a
  confident wrong noun. Idempotent-by-skipping metadata passes.
- Testing philosophy: invariants, not pixel values — content churn (every photo import,
  every post) must cause zero visual failures; baselines only for what churn can't touch.
- Design system: imported from Claude Design as source of record; token discipline (the
  accent ramp locks lightness/chroma, moves only hue); responsive rules live with the
  component that owns the desktop rule (Astro scoping gotcha).

## Open questions

- One post or two? Lead candidate for a split: "the compositor owes you nothing"
  (perf/device forensics) + "a photo pipeline with a privacy invariant".
