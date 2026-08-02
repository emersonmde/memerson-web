import { defineConfig, devices } from '@playwright/test';

/*
 * The real-browser layer. See docs/TESTING.md §3–§4.
 *
 * The suite runs against `astro preview` serving `dist/` — the same artifact
 * that deploys. The webServer builds first, so `npx playwright test` is
 * self-sufficient from a clean checkout; set `reuseExistingServer` free rein
 * locally by keeping `npm run preview` running to skip the rebuild.
 *
 * Breakpoints map to projects. Functional specs run at 1440 and 390 (the two
 * ends `photos.ts` branches between); hit-testing runs everywhere, because the
 * stacking-context class of bug is per-layout; visual baselines run wherever
 * the layout genuinely differs; perf traces are desktop Chromium only.
 *
 * Baselines are macOS-only by policy (docs/TESTING.md §3.1 rule 7): the
 * snapshot path template deliberately omits the platform suffix. If a CI stage
 * is ever added it must regenerate its own baselines inside Playwright's
 * Docker image, not reuse these.
 */

/** Everything the phone layout must re-prove: the functional suite plus the
 * visual baselines (visual.spec.ts pins pixels — the phone layout genuinely
 * differs, so it gets its own). Perf is excluded: traces are desktop-only. */
const FUNCTIONAL = [
  '**/smoke.spec.ts',
  '**/gallery.spec.ts',
  '**/navigation.spec.ts',
  '**/hittest.spec.ts',
  '**/motion.spec.ts',
  '**/a11y.spec.ts',
  '**/visual.spec.ts',
];

/** Middle breakpoints only re-check what varies with layout. */
const PER_LAYOUT = ['**/smoke.spec.ts', '**/hittest.spec.ts', '**/visual.spec.ts'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  /* Flake is a bug in the test (§3.1 rule 3); retries would paper over it. */
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list']],
  timeout: 30_000,
  expect: {
    toHaveScreenshot: {
      /* Font antialiasing wobbles a hair even on one machine; 2% of a small
         element shot is a few px, far below any real regression. */
      maxDiffPixelRatio: 0.02,
    },
  },
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{testFileName}/{arg}-{projectName}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321',
    /* Locally, a running `npm run preview` skips the rebuild. In CI a leftover
       server would silently test a stale dist — fail instead. */
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      /* Perf runs in its own dependent project below, alone at the end. */
      testIgnore: ['**/perf.spec.ts'],
    },
    {
      name: 'w1240',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1240, height: 800 } },
      testMatch: PER_LAYOUT,
    },
    {
      name: 'w1100',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1100, height: 800 } },
      testMatch: PER_LAYOUT,
    },
    {
      name: 'w900',
      use: { ...devices['Desktop Chrome'], viewport: { width: 900, height: 800 } },
      testMatch: PER_LAYOUT,
    },
    {
      name: 'w834',
      use: { ...devices['Desktop Chrome'], viewport: { width: 834, height: 1112 } },
      testMatch: PER_LAYOUT,
    },
    {
      name: 'w720',
      use: { ...devices['Desktop Chrome'], viewport: { width: 720, height: 900 } },
      testMatch: PER_LAYOUT,
    },
    {
      name: 'w560',
      use: { ...devices['Desktop Chrome'], viewport: { width: 560, height: 800 } },
      testMatch: PER_LAYOUT,
    },
    {
      /* The touch project: 390px, `hover: none`, touch events — the branch
         `photos.ts` takes on a phone. Engine only; the real-device compositor
         gap is named in docs/TESTING.md §3.6 and stays a manual pass. */
      name: 'phone',
      use: { ...devices['iPhone 14'], defaultBrowserType: 'chromium' },
      testMatch: FUNCTIONAL,
    },
    {
      /* Performance traces measure the page, so nothing else may share the
         machine while they run. `dependencies` makes Playwright finish every
         other project before this one starts — the perf specs then have the
         box to themselves, serialized further by the file's own
         `mode: 'default'`. (A `--project perf` run pulls the dependencies in
         first; that is the price of a measurement that means something.) */
      name: 'perf',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testMatch: ['**/perf.spec.ts'],
      dependencies: ['desktop', 'w1240', 'w1100', 'w900', 'w834', 'w720', 'w560', 'phone'],
    },
  ],
});
