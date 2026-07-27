import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { hueAt, hueForIndex } from '../src/lib/ramp.ts';
import { readingTime } from '../src/lib/readingTime.ts';

const hueOf = (s: string) => Number(/oklch\(\.80 \.17 ([\d.]+)\)/.exec(s)![1]);

describe('the accent ramp', () => {
  /*
   * Lightness and chroma are locked and only hue moves. That is the property
   * that lets the rail be sampled at arbitrary points without any two adjacent
   * colours fighting — so it is worth asserting rather than assuming.
   */
  test('locks lightness and chroma at every sample point', () => {
    for (let t = 0; t <= 1; t += 0.02) {
      assert.match(hueAt(t), /^oklch\(\.80 \.17 [\d.]+\)$/, `t=${t} left the ramp`);
    }
  });

  test('runs sodium to cyan to violet', () => {
    assert.equal(hueOf(hueAt(0)), 66);
    assert.equal(hueOf(hueAt(0.5)), 200);
    assert.equal(hueOf(hueAt(1)), 286);
  });

  test('hue never goes backwards', () => {
    let previous = -1;
    for (let t = 0; t <= 1; t += 0.01) {
      const h = hueOf(hueAt(t));
      assert.ok(h >= previous, `hue reversed at t=${t}`);
      previous = h;
    }
  });

  test('clamps rather than extrapolating out of range', () => {
    assert.equal(hueOf(hueAt(-5)), 66);
    assert.equal(hueOf(hueAt(99)), 286);
  });

  test('spreads any project count across the whole ramp', () => {
    // Adding or removing a project must not leave the rail half-coloured.
    for (const count of [1, 2, 3, 9, 11, 40]) {
      assert.equal(hueOf(hueForIndex(0, count)), 66, `count=${count} start`);
      if (count > 1) {
        assert.equal(hueOf(hueForIndex(count - 1, count)), 286, `count=${count} end`);
      }
    }
  });
});

describe('readingTime', () => {
  test('never claims zero minutes', () => {
    assert.equal(readingTime(''), '1 MIN');
    assert.equal(readingTime(undefined), '1 MIN');
    assert.equal(readingTime('one two three'), '1 MIN');
  });

  test('scales with length', () => {
    const short = readingTime(Array(200).fill('word').join(' '));
    const long = readingTime(Array(2000).fill('word').join(' '));
    assert.equal(short, '1 MIN');
    assert.equal(long, '10 MIN');
  });

  test('does not count fenced code as prose', () => {
    const prose = Array(400).fill('word').join(' ');
    const withCode = `${prose}\n\`\`\`\n${Array(4000).fill('x').join(' ')}\n\`\`\`\n`;
    assert.equal(readingTime(withCode), readingTime(prose));
  });

  test('markdown punctuation does not fuse or split words', () => {
    assert.equal(readingTime('**bold** _em_ [link](u)'), '1 MIN');
  });
});
