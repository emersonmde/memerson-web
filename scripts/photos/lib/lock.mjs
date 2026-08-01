/**
 * A cross-process lockfile around the pipeline's two writable files.
 *
 * The manifest and shoots.json are each written atomically (temp file plus
 * rename), but atomic writes only protect against a *torn* file — two CLIs
 * running at once would still each read, modify and write the whole file, and
 * the second write silently discards the first one's changes. One lock for the
 * whole pipeline is the honest shape: every writing command touches both files.
 *
 * Deliberately small: `O_EXCL` creation is the acquisition, the file records
 * who holds it, and a lock whose owner is dead or an hour gone is treated as
 * debris from a crashed run and taken over.
 */
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { unlinkSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './r2.mjs';

export const LOCK_PATH = path.join(REPO_ROOT, 'src/data/.photos.lock');

/** A crashed run leaves its lock behind; anything this old is debris. */
const STALE_MS = 60 * 60 * 1000;

/** Signal 0 delivers nothing — it only asks the OS whether the pid exists. */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists but belongs to someone else — still alive.
    return error.code === 'EPERM';
  }
}

async function acquire() {
  const payload = JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });

  // Two attempts: the second is for after clearing a stale lock. A live
  // holder throws instead of waiting — failing fast is the point.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeFile(LOCK_PATH, `${payload}\n`, { flag: 'wx' });
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;

      const held = await readFile(LOCK_PATH, 'utf8')
        .then((raw) => JSON.parse(raw))
        .catch(() => null);
      const age = held?.startedAt ? Date.now() - Date.parse(held.startedAt) : Infinity;

      if (held && Number.isInteger(held.pid) && isAlive(held.pid) && age < STALE_MS) {
        throw new Error(
          `Another photo command holds the lock (pid ${held.pid}, started ` +
            `${held.startedAt}). Concurrent runs would lose writes — wait for it, ` +
            `or delete ${LOCK_PATH} if that process is truly gone.`,
        );
      }

      // Owner dead, unreadable, or an hour old: a crashed run. Take over.
      await unlink(LOCK_PATH).catch(() => {});
    }
  }
  throw new Error(`Could not acquire ${LOCK_PATH} — another run keeps recreating it.`);
}

/**
 * Run `fn` holding the pipeline lock; release on every path out.
 *
 * `process.exit()` skips `finally` blocks (several CLIs exit early on usage
 * errors), so the release is also hooked on the process `exit` event. Both
 * paths are idempotent, so releasing twice is harmless.
 */
export async function withLock(fn) {
  await acquire();
  const releaseOnExit = () => {
    try {
      unlinkSync(LOCK_PATH);
    } catch {
      /* already released */
    }
  };
  process.once('exit', releaseOnExit);

  try {
    return await fn();
  } finally {
    process.removeListener('exit', releaseOnExit);
    releaseOnExit();
  }
}
