/**
 * The photo manifest — the pipeline's only state, and it lives in git.
 *
 * There is no config file, no cache, no "last used folder". Everything the
 * import needs to answer "have I seen this photo before?" is in here, which is
 * what makes the CLI work years from now on a different machine.
 * See docs/ARCHITECTURE.md §5.7.
 */
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { REPO_ROOT } from './r2.mjs';

export const MANIFEST_PATH = path.join(REPO_ROOT, 'src/data/photos.json');

/** First 12 hex chars of the sha256 of the original bytes. */
export function hashOriginal(buffer) {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 12);
}

/**
 * `<YYYY-MM-DD>-<first 8 of sourceHash>`. Deterministic and collision-free
 * without any manual naming step.
 */
export function makeSlug(takenAtIso, sourceHash) {
  return `${takenAtIso.slice(0, 10)}-${sourceHash.slice(0, 8)}`;
}

/** Field order matches docs/ARCHITECTURE.md §5.4 so diffs stay readable. */
const FIELD_ORDER = [
  'id',
  'sourceHash',
  'width',
  'height',
  'aspectRatio',
  'variants',
  'formats',
  'lqip',
  'takenAt',
  'camera',
  'lens',
  'focalLength',
  'aperture',
  'shutter',
  'iso',
  'title',
  'caption',
  'tags',
];

function normalise(entry) {
  const ordered = {};
  for (const field of FIELD_ORDER) ordered[field] = entry[field] ?? null;
  ordered.variants = entry.variants ?? [];
  ordered.formats = entry.formats ?? [];
  ordered.tags = entry.tags ?? [];
  return ordered;
}

/** Chronological, undated last, id as a stable tiebreak. */
function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.takenAt && b.takenAt && a.takenAt !== b.takenAt) {
      return a.takenAt < b.takenAt ? -1 : 1;
    }
    if (a.takenAt && !b.takenAt) return -1;
    if (!a.takenAt && b.takenAt) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export async function readManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * Written via a temp file and rename so an interrupted run can never leave a
 * half-written manifest behind — the import is resumable only if its one piece
 * of state survives a kill at any moment.
 */
export async function writeManifest(entries) {
  const sorted = sortEntries(entries).map(normalise);
  const temporary = `${MANIFEST_PATH}.tmp`;
  await writeFile(temporary, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
  await rename(temporary, MANIFEST_PATH);
  return sorted;
}
