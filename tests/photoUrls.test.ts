import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  derivativeUrl,
  srcSetFor,
  widestUrl,
  smallestUrl,
} from '../src/lib/photoUrls.ts';
import { PHOTOS_BASE_URL } from '../src/consts.ts';

/*
 * Derivative URL building (src/lib/photoUrls.ts). URLs are only ever built
 * from widths the manifest says exist — and an *empty* ladder is a broken
 * manifest, which must fail the build loudly rather than ship
 * `/-Infinity.webp` as a silent 404 image.
 */

const ID = '2022-10-29-abcd1234';

describe('derivativeUrl', () => {
  test('builds photos/<slug>/<width>.<format> on the R2 domain', () => {
    assert.equal(
      derivativeUrl(ID, 1280),
      `${PHOTOS_BASE_URL}/photos/${ID}/1280.webp`,
    );
    assert.equal(
      derivativeUrl(ID, 640, 'avif'),
      `${PHOTOS_BASE_URL}/photos/${ID}/640.avif`,
    );
  });
});

describe('srcSetFor', () => {
  test('lists every rung with its width descriptor', () => {
    assert.equal(
      srcSetFor(ID, [640, 1280], 'avif'),
      `${PHOTOS_BASE_URL}/photos/${ID}/640.avif 640w, ` +
        `${PHOTOS_BASE_URL}/photos/${ID}/1280.avif 1280w`,
    );
  });

  test('is empty for an empty ladder rather than inventing a rung', () => {
    assert.equal(srcSetFor(ID, [], 'webp'), '');
  });
});

describe('widestUrl / smallestUrl', () => {
  test('pick the extreme rungs, whatever the order', () => {
    const variants = [1280, 640, 2048];
    assert.equal(widestUrl(ID, variants), derivativeUrl(ID, 2048));
    assert.equal(smallestUrl(ID, variants), derivativeUrl(ID, 640));
  });

  test('a single-rung ladder is both widest and smallest', () => {
    assert.equal(widestUrl(ID, [640]), smallestUrl(ID, [640]));
  });

  test('an empty ladder throws, naming the photo', () => {
    // Photo.astro's philosophy: broken manifest → failed build, not a 404.
    assert.throws(() => widestUrl(ID, []), new RegExp(ID));
    assert.throws(() => smallestUrl(ID, []), new RegExp(ID));
  });
});
