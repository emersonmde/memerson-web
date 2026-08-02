import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { PHOTOS_BASE_URL, SITE_URL } from '../src/consts.ts';
// Module top level only defines constants and helpers — wrangler is spawned
// inside functions, so importing it here has no side effects.
import { PHOTOS_BASE_URL as PIPELINE_PHOTOS_BASE_URL } from '../scripts/photos/lib/r2.mjs';

/*
 * The same hostnames are declared in four places that cannot import each
 * other: the site's consts, the photo pipeline, astro.config.mjs, and
 * robots.txt. Nothing ties them together at build time, so a change to one
 * (a domain move, say) can silently leave the others behind. These pins make
 * the drift a test failure.
 */

describe('one photos domain', () => {
  test('site and pipeline agree on PHOTOS_BASE_URL', () => {
    assert.equal(PHOTOS_BASE_URL, PIPELINE_PHOTOS_BASE_URL);
  });
});

describe('one site host', () => {
  test('astro.config.mjs site matches SITE_URL', async () => {
    // Regexed rather than imported: importing the config would execute the
    // sitemap() integration factory at module load.
    const config = await readFile(
      new URL('../astro.config.mjs', import.meta.url),
      'utf8',
    );
    const site = /^\s*site:\s*'([^']+)'/m.exec(config)?.[1];
    assert.ok(site, 'astro.config.mjs declares no site');
    assert.equal(site, SITE_URL);
  });

  test('robots.txt points its sitemap at SITE_URL', async () => {
    const robots = await readFile(
      new URL('../public/robots.txt', import.meta.url),
      'utf8',
    );
    const sitemap = /^Sitemap:\s*(\S+)/m.exec(robots)?.[1];
    assert.ok(sitemap, 'robots.txt declares no sitemap');
    assert.equal(new URL(sitemap!).origin, new URL(SITE_URL).origin);
  });
});
