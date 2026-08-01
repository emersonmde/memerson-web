import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { photoAlt } from '../src/lib/photoAlt.ts';

/*
 * Alt-text priority: caption > title > date > 'Photograph'.
 *
 * The ordering is the point — caption beating title reads backwards and is
 * deliberate (alt text describes the picture; a title names it; see the
 * comment in src/lib/photoAlt.ts). These tests pin that order, and the edges
 * where a field is present but empty: an empty string must *fall through* to
 * the next rung, never ship as `alt=""` — the 122-of-133-decorative-images
 * regression build.test.ts guards from the other end.
 */

type Entry = Parameters<typeof photoAlt>[0];

const entry = (data: {
  caption?: string | null;
  title?: string | null;
  takenAt?: Date | null;
}): Entry => ({ data }) as unknown as Entry;

const TAKEN = new Date('2017-08-27T14:08:50Z');

describe('the priority order', () => {
  test('caption beats title — describe, not name', () => {
    const photo = entry({
      caption: 'Six jets in delta formation over the flight line',
      title: 'USAF Thunderbirds',
      takenAt: TAKEN,
    });
    assert.equal(photoAlt(photo), 'Six jets in delta formation over the flight line');
  });

  test('title beats the date when there is no caption', () => {
    const photo = entry({ title: 'USAF Thunderbirds', takenAt: TAKEN });
    assert.equal(photoAlt(photo), 'USAF Thunderbirds');
  });

  test('the date carries an untitled photo, spelled out and in UTC', () => {
    // UTC, so the same manifest builds the same alt text in any timezone.
    const photo = entry({ takenAt: TAKEN });
    assert.equal(photoAlt(photo), 'Photograph taken August 27, 2017');
  });

  test("a photo with nothing at all still gets 'Photograph'", () => {
    assert.equal(photoAlt(entry({})), 'Photograph');
  });
});

describe('the empty-string edges', () => {
  test('an empty caption falls through to the title', () => {
    const photo = entry({ caption: '', title: 'USAF Thunderbirds' });
    assert.equal(photoAlt(photo), 'USAF Thunderbirds');
  });

  test('empty caption and empty title fall through to the date', () => {
    const photo = entry({ caption: '', title: '', takenAt: TAKEN });
    assert.equal(photoAlt(photo), 'Photograph taken August 27, 2017');
  });

  test('null and empty fields never produce an empty alt', () => {
    // The whole-function property: whatever the data, alt text is never ''.
    for (const data of [
      {},
      { caption: '' },
      { caption: null },
      { title: '' },
      { caption: '', title: '', takenAt: null },
    ]) {
      assert.ok(photoAlt(entry(data)).length > 0, JSON.stringify(data));
    }
  });
});

describe('the override', () => {
  test('a caller-supplied override beats the caption', () => {
    const photo = entry({ caption: 'The manifest caption', title: 'A title' });
    assert.equal(photoAlt(photo, 'A hand-written alt'), 'A hand-written alt');
  });

  test('a null override defers to the caption (?? semantics)', () => {
    const photo = entry({ caption: 'The manifest caption' });
    assert.equal(photoAlt(photo, null), 'The manifest caption');
  });

  test('an empty-string override cannot force alt="" — it falls through', () => {
    /*
     * '' is not nullish, so it *replaces* the caption — but it is falsy, so
     * the chain continues to the title rather than shipping a decorative
     * image. A caller cannot silence a photograph by passing ''.
     */
    const photo = entry({ caption: 'The manifest caption', title: 'A title' });
    assert.equal(photoAlt(photo, ''), 'A title');
  });
});
