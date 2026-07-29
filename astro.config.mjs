// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Required for correct canonical URLs and RSS output.
  site: 'https://memerson.com',

  // Static output is the default; stated explicitly because it is a load-bearing
  // decision (no SSR adapter, no runtime data fetching). See docs/ARCHITECTURE.md.
  output: 'static',

  build: {
    /*
     * Every page carries its CSS inline, rather than linking it.
     *
     * This is about the router, not about request count. `ClientRouter` swaps
     * the document and *then* the incoming page's `<link rel=stylesheet>` has to
     * load and apply — and a dynamically inserted stylesheet is not
     * render-blocking, so there is a window where the new DOM is on screen
     * under the old page's styles. On a cross-page navigation that window is
     * long enough to see: the home page's kicker paints white at the top of the
     * page, then drops into place and turns grey as the page's own rules land.
     * Worse, the view transition snapshots the incoming page inside that
     * window, so the unstyled frame is what gets held for the length of the
     * wipe. It never happens on reload, because a parser-inserted stylesheet in
     * `<head>` blocks the first paint — which is exactly the guarantee the swap
     * path loses.
     *
     * Inline `<style>` arrives *with* the swapped `<head>`, in the same task as
     * the DOM, so there is no window at all. The default is `auto`, which only
     * inlines below Vite's 4kB `assetsInlineLimit`; every stylesheet here is
     * over it. The cost is the shared layout CSS (~3.7kB gzipped) repeating in
     * each of nine HTML files instead of being cached once, which at this size
     * is cheaper than the round trip it replaces.
     */
    inlineStylesheets: 'always',
  },
});
