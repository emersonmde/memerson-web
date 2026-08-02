import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { acquire, lockDisposition, removeIfSame } from '../scripts/photos/lib/lock.mjs';

/** A pid that is genuinely dead: spawn a child, let it exit, use its pid. */
async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', '']);
  await new Promise((resolve) => child.on('exit', resolve));
  return child.pid!;
}

const HOURS_2 = 2 * 60 * 60 * 1000;

describe('lockDisposition', () => {
  test('a live pid is never stolen, regardless of age', () => {
    const held = {
      pid: 12345,
      startedAt: new Date(Date.now() - HOURS_2).toISOString(),
    };
    assert.equal(lockDisposition(held, { alive: () => true }), 'held');
  });

  test('a dead pid is debris, even when the lock is fresh', () => {
    const held = { pid: 12345, startedAt: new Date().toISOString() };
    assert.equal(lockDisposition(held, { alive: () => false }), 'stale');
  });

  test('without a usable pid, age is the fallback', () => {
    const explode = () => {
      throw new Error('liveness must not be consulted without a pid');
    };
    const fresh = { startedAt: new Date().toISOString() };
    assert.equal(lockDisposition(fresh, { alive: explode }), 'held');

    const old = { startedAt: new Date(Date.now() - HOURS_2).toISOString() };
    assert.equal(lockDisposition(old, { alive: explode }), 'stale');
  });

  test('an unreadable lock is debris', () => {
    assert.equal(lockDisposition(null, { alive: () => true }), 'stale');
  });
});

describe('acquire', () => {
  const dirs: string[] = [];
  const lockPath = async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lock-test-'));
    dirs.push(dir);
    return path.join(dir, '.photos.lock');
  };

  after(async () => {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  });

  test('acquires when no lock exists, and records our pid', async () => {
    const lock = await lockPath();
    await acquire(lock);
    const held = JSON.parse(await readFile(lock, 'utf8'));
    assert.equal(held.pid, process.pid);
  });

  test('refuses to steal a live holder even with an ancient timestamp', async () => {
    const lock = await lockPath();
    // process.pid is certainly alive; the timestamp is far past any cut-off.
    await writeFile(
      lock,
      JSON.stringify({
        pid: process.pid,
        startedAt: new Date(Date.now() - HOURS_2).toISOString(),
      }),
    );
    await assert.rejects(acquire(lock), /holds the lock/);
    // And the live holder's lock is untouched.
    const held = JSON.parse(await readFile(lock, 'utf8'));
    assert.equal(held.pid, process.pid);
  });

  test('takes over a dead holder and confirms it won', async () => {
    const lock = await lockPath();
    await writeFile(
      lock,
      JSON.stringify({ pid: await deadPid(), startedAt: new Date().toISOString() }),
    );
    await acquire(lock);
    const held = JSON.parse(await readFile(lock, 'utf8'));
    assert.equal(held.pid, process.pid, 'takeover must end with our own pid on file');
  });
});

describe('removeIfSame (the takeover TOCTOU guard)', () => {
  test('removes the exact file that was judged stale', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lock-test-'));
    const lock = path.join(dir, '.photos.lock');
    try {
      await writeFile(lock, '{"pid":1}');
      const judged = await stat(lock);
      assert.equal(await removeIfSame(lock, judged), true);
      await assert.rejects(stat(lock), { code: 'ENOENT' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('refuses when the lock was replaced after being judged', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lock-test-'));
    const lock = path.join(dir, '.photos.lock');
    try {
      await writeFile(lock, '{"pid":1}');
      const judged = await stat(lock);
      // A third process replaces the debris with its own live lock. The sleep
      // guarantees a distinct mtime even at coarse filesystem resolution.
      await new Promise((resolve) => setTimeout(resolve, 20));
      await writeFile(lock, '{"pid":2}');
      assert.equal(await removeIfSame(lock, judged), false);
      // The newcomer's lock survives.
      assert.equal(JSON.parse(await readFile(lock, 'utf8')).pid, 2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('an already-vanished lock counts as cleared', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lock-test-'));
    const lock = path.join(dir, '.photos.lock');
    try {
      await writeFile(lock, '{"pid":1}');
      const judged = await stat(lock);
      await rm(lock);
      assert.equal(await removeIfSame(lock, judged), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
