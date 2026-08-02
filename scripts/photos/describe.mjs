#!/usr/bin/env node
/**
 * npm run photos:describe [-- --limit N] [--force] [--dry-run]
 *
 * Fills in `tags`, `caption` and `title` for photographs that have none, by
 * showing a downscaled derivative to a model. Replaces what would otherwise be
 * hundreds of rows of manual data entry.
 *
 * **This is a backfill, not a routine.** `photos:import` already describes each
 * photo once, as it arrives, so in steady state this command finds nothing to
 * do. It exists for the initial library, for anything imported with
 * `--no-metadata`, and for re-running after a prompt change (`--force`).
 *
 * Idempotent: a photo with a caption or tags is skipped unless --force, so it
 * never re-reads the whole library.
 * Resumable: the manifest is written after every photo, so a kill halfway
 * through keeps everything done so far.
 *
 * The manifest is in git, so the diff is the review. Read it before committing.
 */
import { readManifest, writeManifest } from './lib/manifest.mjs';
import { DESCRIBE_EFFORT, DESCRIBE_MODEL, READ_WIDTH } from './lib/claude.mjs';
import { describePending, mergeDescription, needsDescription } from './lib/describe.mjs';
import { withLock } from './lib/lock.mjs';
import { serialWriter } from './lib/serial.mjs';

/** Separate `claude` processes, so this bounds process count, not any API limit. */
const CONCURRENCY = 4;

function parseArgs(argv) {
  const options = { limit: Infinity, force: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--force') options.force = true;
    else if (argv[i] === '--dry-run') options.dryRun = true;
    else if (argv[i] === '--limit') options.limit = Number(argv[++i]);
    else {
      console.error(`Unknown argument: ${argv[i]}`);
      console.error(
        'Usage: npm run photos:describe -- [--limit N] [--force] [--dry-run]',
      );
      process.exit(1);
    }
  }
  // Infinity (the default) passes; NaN from `--limit banana` and zero do not.
  if (!(options.limit > 0)) {
    console.error('--limit must be a positive number.');
    process.exit(1);
  }
  return options;
}

async function main() {
  const { limit, force, dryRun } = parseArgs(process.argv.slice(2));
  const manifest = await readManifest();

  const pending = manifest
    .filter((entry) => (force ? true : needsDescription(entry)))
    .slice(0, limit === Infinity ? undefined : limit);

  if (pending.length === 0) {
    console.log(
      `Nothing to describe — all ${manifest.length} photo(s) already have text. ` +
        'Use --force to redo them.',
    );
    return;
  }

  console.log(
    `Describing ${pending.length} of ${manifest.length} photo(s) — ` +
      `${DESCRIBE_MODEL}, effort ${DESCRIBE_EFFORT}, ${READ_WIDTH}px` +
      `${dryRun ? ' (dry run)' : ''}.`,
  );

  const byId = new Map(manifest.map((entry) => [entry.id, entry]));

  // Serialised so concurrent photos cannot interleave a read-modify-write; a
  // failed write is recorded once and does not poison later commits.
  const writer = serialWriter();

  const { described, failed } = await describePending(pending, {
    concurrency: CONCURRENCY,
    dryRun,
    apply: (entry, description) => {
      // mergeDescription keeps a hand-written title; the model only fills gaps.
      byId.set(entry.id, mergeDescription(byId.get(entry.id), description));
      return writer.write(() => writeManifest([...byId.values()]));
    },
  });

  const writeErrors = await writer.done();
  console.log(
    `\n${described} described, ${failed} failed.` +
      (dryRun ? ' Dry run — manifest untouched.' : ' Review the diff before committing.'),
  );
  if (failed || writeErrors.length > 0) process.exitCode = 1;
}

withLock(main).catch((error) => {
  console.error(error);
  process.exit(1);
});
