// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Required for correct canonical URLs and RSS output.
  site: 'https://memerson.com',

  // Static output is the default; stated explicitly because it is a load-bearing
  // decision (no SSR adapter, no runtime data fetching). See docs/ARCHITECTURE.md.
  output: 'static',
});
