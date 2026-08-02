import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { serialWriter } from '../scripts/photos/lib/serial.mjs';

describe('serialWriter', () => {
  test('writes run strictly in order', async () => {
    const writer = serialWriter();
    const order: number[] = [];
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // The first write is the slowest; ordering only holds if it is serialised.
    void writer.write(async () => {
      await sleep(30);
      order.push(1);
    });
    void writer.write(async () => {
      await sleep(5);
      order.push(2);
    });
    void writer.write(() => {
      order.push(3);
    });

    assert.deepEqual(await writer.done(), []);
    assert.deepEqual(order, [1, 2, 3]);
  });

  test('a mid-chain failure does not skip later writes', async () => {
    const writer = serialWriter();
    const written: string[] = [];

    await writer.write(() => {
      written.push('a');
    });
    await writer
      .write(() => {
        throw new Error('disk full');
      })
      .catch(() => {});
    await writer.write(() => {
      written.push('c');
    });

    // The write after the failure still persisted — the chain was not poisoned.
    assert.deepEqual(written, ['a', 'c']);
    // And the failure is recorded exactly once, with its own error.
    const errors = await writer.done();
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /disk full/);
  });

  test('a failure rejects only its own caller, not later ones', async () => {
    const writer = serialWriter();

    const failing = writer.write(() => {
      throw new Error('boom');
    });
    const following = writer.write(() => 'ok');

    await assert.rejects(failing, /boom/);
    // The next caller sees its own success, not the predecessor's error —
    // the old chain misattributed the first failure to every later commit.
    assert.equal(await following, 'ok');
    assert.equal((await writer.done()).length, 1);
  });
});
