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
import { readFile, stat, writeFile, unlink } from 'node:fs/promises';
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

/**
 * Decide whether an existing lock is genuinely held or debris.
 *
 * A lock whose recorded pid is verifiably alive is NEVER stolen, however old
 * it is — a long run (a full-library re-describe) legitimately outlives any
 * age cut-off, and stealing a live holder's lock recreates exactly the
 * concurrent read-modify-write this file exists to prevent. The age check is
 * only the fallback for locks whose liveness cannot be determined (unreadable
 * file, no usable pid). Exported for tests; `alive` is injectable for them.
 */
export function lockDisposition(held, { now = Date.now(), alive = isAlive } = {}) {
  if (held && Number.isInteger(held.pid)) {
    return alive(held.pid) ? 'held' : 'stale';
  }
  const age = held?.startedAt ? now - Date.parse(held.startedAt) : Infinity;
  // An invalid or missing timestamp gives NaN/Infinity, which fails the
  // comparison — an unreadable lock is treated as debris, as before.
  return age < STALE_MS ? 'held' : 'stale';
}

/**
 * Remove a lock previously judged stale — but only if it is still the same
 * file that was judged. Between judging and unlinking, another process may
 * have cleared the debris and written its own live lock; unlinking blindly
 * would steal it. The inode + mtime pair identifies "the file I judged".
 * Returns whether the path is now clear. Exported for tests.
 */
export async function removeIfSame(lockPath, judged) {
  try {
    const current = await stat(lockPath);
    if (current.ino !== judged.ino || current.mtimeMs !== judged.mtimeMs) return false;
    await unlink(lockPath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return true; // someone else cleared the debris
    throw error;
  }
}

/**
 * Take the lock at `lockPath`, or throw if a live holder has it.
 * Exported (with an injectable path) for tests; production use is `withLock`.
 */
export async function acquire(lockPath = LOCK_PATH, { alive = isAlive } = {}) {
  const payload = JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });

  // Three attempts: a stale takeover and a lost takeover race each consume
  // one. A live holder throws instead of waiting — failing fast is the point.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await writeFile(lockPath, `${payload}\n`, { flag: 'wx' });
      // Confirm we actually won. `wx` succeeding means we created the file,
      // but the takeover path above has a residual window (stat → unlink), so
      // read our own pid back rather than assuming.
      const readBack = await readFile(lockPath, 'utf8')
        .then((raw) => JSON.parse(raw))
        .catch(() => null);
      if (readBack?.pid === process.pid) return;
      continue; // replaced under us — re-evaluate whoever holds it now
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;

      // Stat first, then read: if the file changes in between, the inode
      // guard in removeIfSame refuses and the loop re-evaluates.
      const judged = await stat(lockPath).catch(() => null);
      const held = await readFile(lockPath, 'utf8')
        .then((raw) => JSON.parse(raw))
        .catch(() => null);

      if (lockDisposition(held, { alive }) === 'held') {
        throw new Error(
          `Another photo command holds the lock (pid ${held?.pid ?? 'unknown'}, ` +
            `started ${held?.startedAt ?? 'unknown'}). Concurrent runs would lose ` +
            `writes — wait for it, or delete ${lockPath} if that process is truly gone.`,
        );
      }

      // Judged debris (owner dead, or unreadable and old). Take over — but
      // only this exact file; a third process may have already replaced it.
      if (judged) await removeIfSame(lockPath, judged);
    }
  }
  throw new Error(`Could not acquire ${lockPath} — another run keeps recreating it.`);
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
