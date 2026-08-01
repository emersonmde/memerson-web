import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { hashOriginal, makeSlug } from '../scripts/photos/lib/manifest.mjs';

describe('slugs and hashing', () => {
  test('the hash is content-addressed, so identical bytes give identical slugs', () => {
    const a = Buffer.from('a photograph');
    const b = Buffer.from('a photograph');
    assert.equal(hashOriginal(a), hashOriginal(b));
    assert.notEqual(hashOriginal(a), hashOriginal(Buffer.from('a different one')));
  });

  test('slug is date plus the first 8 hash chars, and is stable', () => {
    const hash = hashOriginal(Buffer.from('x'));
    const slug = makeSlug('2022-10-29T14:08:50Z', hash);
    assert.equal(slug, `2022-10-29-${hash.slice(0, 8)}`);
    assert.equal(makeSlug('2022-10-29T14:08:50Z', hash), slug, 'not deterministic');
  });

  test('slugs are URL-safe', () => {
    const slug = makeSlug('2017-06-18T00:00:00Z', hashOriginal(Buffer.from('y')));
    assert.match(slug, /^[a-z0-9-]+$/);
  });
});

describe('the committed manifest', () => {
  /*
   * These guard the data itself. `photos.json` is generated, but it is also
   * hand-edited (title, caption, tags) and will grow fields — so it is worth
   * asserting that the shape the site renders from is still intact.
   */
  const load = async () =>
    JSON.parse(
      await readFile(new URL('../src/data/photos.json', import.meta.url), 'utf8'),
    );

  test('every entry has the geometry the gallery needs to avoid layout shift', async () => {
    for (const photo of await load()) {
      assert.ok(photo.width > 0 && photo.height > 0, `${photo.id} has no dimensions`);
      assert.ok(photo.aspectRatio > 0, `${photo.id} has no aspect ratio`);
      assert.ok(
        Math.abs(photo.aspectRatio - photo.width / photo.height) < 0.01,
        `${photo.id} aspect ratio disagrees with its dimensions`,
      );
    }
  });

  test('every entry has at least one derivative width and both formats', async () => {
    for (const photo of await load()) {
      assert.ok(photo.variants.length > 0, `${photo.id} has no variants`);
      assert.deepEqual(photo.formats, ['avif', 'webp'], `${photo.id} formats`);
    }
  });

  test('derivatives never exceed the 5120px cap', async () => {
    // 5120 fills a 5K display; raised from 2560 on 2026-07-31 — the site exists
    // to show the photographs. Originals still live only in the private archive.
    // See ARCHITECTURE §5.5.
    for (const photo of await load()) {
      assert.ok(Math.max(...photo.variants) <= 5120, `${photo.id} exceeds the cap`);
    }
  });

  test('no variant is upscaled past the original', async () => {
    for (const photo of await load()) {
      assert.ok(
        Math.max(...photo.variants) <= photo.width,
        `${photo.id} upscales beyond its source`,
      );
    }
  });

  test('carries no location field, ever', async () => {
    /*
     * Privacy is a hard requirement, not a preference. ARCHITECTURE §5.6.
     * The scan is over *field names*, recursively, not the raw text: location
     * data leaks as a field (`gps`, `GPSLatitude`, `location.longitude`), and
     * a raw-text scan would instead fail the day a caption honestly mentions
     * "GPS" or a photograph of a latitude marker — churn tripping a privacy
     * alarm, which is how alarms get ignored.
     */
    const banned = /gps|latitude|longitude|location/i;
    const walk = (value: unknown, at: string) => {
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${at}[${i}]`));
      } else if (value && typeof value === 'object') {
        for (const [key, v] of Object.entries(value)) {
          assert.ok(!banned.test(key), `manifest has location field ${at}.${key}`);
          walk(v, `${at}.${key}`);
        }
      }
    };
    walk(await load(), 'manifest');
  });

  test('slugs are unique and match their own hash', async () => {
    const seen = new Set<string>();
    for (const photo of await load()) {
      assert.ok(!seen.has(photo.id), `duplicate slug ${photo.id}`);
      seen.add(photo.id);
      assert.ok(
        photo.id.endsWith(photo.sourceHash.slice(0, 8)),
        `${photo.id} does not match its sourceHash`,
      );
    }
  });

  test('every LQIP is an inline data URI, so it costs no request', async () => {
    for (const photo of await load()) {
      assert.match(photo.lqip, /^data:image\/webp;base64,/, `${photo.id} lqip`);
      assert.ok(photo.lqip.length < 2000, `${photo.id} lqip is too heavy to inline`);
    }
  });
});
