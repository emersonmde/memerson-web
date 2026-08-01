import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

/*
 * The feed, checked from `dist/` like build.test.ts — run `npm run build`
 * first; `npm test` does. A feed reader is the one consumer of this site that
 * never renders the HTML, so nothing else in the suite would notice the feed
 * breaking: an item pointing at a post that was renamed, or markup mangled
 * enough that parsers reject it.
 *
 * Structural checks with a light hand — no XML parser dependency for one
 * file (the layer-1/2 no-framework rule, docs/TESTING.md). And invariants,
 * not values: nothing here counts items or names a post, so publishing never
 * touches this file.
 */

const DIST = new URL('../dist/', import.meta.url);

let xml = '';

before(async () => {
  try {
    xml = await readFile(new URL('rss.xml', DIST), 'utf8');
  } catch {
    throw new Error('dist/rss.xml is missing — run `npm run build` before the tests');
  }
});

describe('the feed', () => {
  test('is well-formed enough for a feed reader', () => {
    assert.match(xml, /^<\?xml version="1\.0"/, 'no XML declaration');
    assert.match(xml, /<rss[\s>]/, 'no <rss> root');
    assert.ok(xml.trimEnd().endsWith('</rss>'), 'the root element never closes');
    assert.match(xml, /<channel>[\s\S]*<\/channel>/, 'no channel');
    assert.match(xml, /<channel>\s*<title>[^<]+<\/title>/, 'the channel is untitled');
    // A dangling item is exactly the mangling a regex feed writer can produce.
    const opens = (xml.match(/<item>/g) ?? []).length;
    const closes = (xml.match(/<\/item>/g) ?? []).length;
    assert.equal(opens, closes, 'unbalanced <item> tags');
    // No raw ampersand outside an entity — the classic feed-breaking byte.
    // CDATA is stripped first: raw markup is legal there, and @astrojs/rss
    // uses it for embedded content.
    assert.doesNotMatch(
      xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, ''),
      /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/,
      'unescaped & in the feed',
    );
  });

  test('has at least one item, and every item is complete', () => {
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    assert.ok(items.length > 0, 'the feed is empty');
    for (const item of items) {
      assert.match(item, /<title>[\s\S]*?\S[\s\S]*?<\/title>/, `item lacks a title`);
      assert.match(item, /<link>[^<]+<\/link>/, `item lacks a link`);
      assert.match(item, /<pubDate>[^<]+<\/pubDate>/, `item lacks a date`);
    }
  });

  test('every item link resolves to a built page', async () => {
    /*
     * The failure this pins: a post renamed or unpublished while the feed
     * still points at it — every subscriber gets a 404 the HTML link checker
     * cannot see, because the feed is not HTML.
     */
    const links = [...xml.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/g)].map(
      (m) => m[1],
    );
    assert.ok(links.length > 0, 'no item links to check');
    for (const link of links) {
      const url = new URL(link);
      assert.equal(url.origin, 'https://memerson.com', `foreign item link: ${link}`);
      const page = new URL('.' + url.pathname.replace(/\/?$/, '/') + 'index.html', DIST);
      await stat(page).catch(() => {
        assert.fail(`feed links to a page the build lacks: ${link}`);
      });
    }
  });
});
