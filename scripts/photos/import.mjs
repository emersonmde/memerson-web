#!/usr/bin/env node
/**
 * npm run photos:import <path> [<path> ...]
 *
 * Imports photos into R2 and appends them to the manifest. Paths are always
 * arguments — a folder (recursive), a single file, or several of each. There is
 * no configured import directory and no state file; the manifest in git is the
 * only state. See docs/ARCHITECTURE.md §5.7.
 *
 * Idempotent, interruptible, resumable: the sha256 of the original bytes is the
 * idempotency key, so re-importing the same photo from a different folder or
 * under a different filename is correctly a no-op, and a crash halfway through
 * leaves everything already imported recorded.
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

import { expandPaths } from './lib/files.mjs';
import { readAllowedExif } from './lib/exif.mjs';
import { deriveAll } from './lib/derive.mjs';
import { hashOriginal, makeSlug, readManifest, writeManifest } from './lib/manifest.mjs';
import { ARCHIVE_BUCKET, PUBLIC_BUCKET, pool, putObject } from './lib/r2.mjs';
import { DESCRIBE_EFFORT, DESCRIBE_MODEL, READ_WIDTH, mapPool } from './lib/claude.mjs';
import { describeEntry, needsDescription } from './lib/describe.mjs';
import { assignShoots, readShoots, summariseShoots, writeShoots } from './lib/shoots.mjs';

/** Concurrent `claude` processes during the description pass. */
const DESCRIBE_CONCURRENCY = 4;

/**
 * Group and describe **only what this run brought in**.
 *
 * The expensive step is deliberately scoped to new photos rather than run over
 * the library: every photo is described exactly once, when it arrives, and
 * never looked at again. Shoot assignment obeys the same rule for a stronger
 * reason — re-clustering the whole library could merge two shoots that had
 * already been named. See lib/shoots.mjs.
 *
 * Failures here are warnings, never fatal. The photos are already in R2 and in
 * the manifest by this point; text can be backfilled later with
 * `photos:describe`, and losing an import to a model hiccup would be absurd.
 */
async function metadataPass(importedIds) {
  const manifest = await readManifest();

  const { assignments, created, extended, bridged } = assignShoots(manifest);
  if (assignments.size > 0) {
    const grouped = manifest.map((entry) =>
      assignments.has(entry.id) ? { ...entry, shoot: assignments.get(entry.id) } : entry,
    );
    await writeManifest(grouped);
    await writeShoots(summariseShoots(grouped), await readShoots());
    console.log(
      `\ngrouped ${assignments.size} photo(s): ` +
        `${created.length} new shoot(s), ${extended.length} extended.`,
    );
    for (const { shoots } of bridged) {
      console.warn(
        `  ! new photos fall between existing shoots ${shoots.join(' and ')} — ` +
          'kept apart. Merge by hand if they are one thing.',
      );
    }
  }

  const current = await readManifest();
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  const pending = importedIds
    .map((id) => byId.get(id))
    .filter((entry) => entry && needsDescription(entry));

  if (pending.length === 0) return;

  console.log(
    `\ndescribing ${pending.length} new photo(s) — ` +
      `${DESCRIBE_MODEL}, effort ${DESCRIBE_EFFORT}, ${READ_WIDTH}px`,
  );

  let writeChain = Promise.resolve();
  let described = 0;
  let failed = 0;

  await mapPool(pending, DESCRIBE_CONCURRENCY, async (entry) => {
    try {
      const { tags, caption, title } = await describeEntry(entry);
      byId.set(entry.id, { ...byId.get(entry.id), tags, caption, title });
      described += 1;
      console.log(`  ~ ${entry.id}${title ? ` — "${title}"` : ''}: ${caption ?? ''}`);
      writeChain = writeChain.then(() => writeManifest([...byId.values()]));
      await writeChain;
    } catch (error) {
      failed += 1;
      console.error(`  ! ${entry.id}: ${error.message}`);
    }
  });

  await writeChain;
  console.log(`described ${described}, failed ${failed}`);
  if (failed) console.error('Backfill the rest with: npm run photos:describe');
}

/**
 * Photos processed at once. Uploads share a global pool of 8 regardless, so
 * this only overlaps sharp encoding with waiting on wrangler.
 */
const PHOTO_CONCURRENCY = 3;

const ORIGINAL_CONTENT_TYPES = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  tiff: 'image/tiff',
  webp: 'image/webp',
  heif: 'image/heic',
};

const ORIGINAL_EXTENSIONS = {
  jpeg: 'jpg',
  png: 'png',
  tiff: 'tif',
  webp: 'webp',
  heif: 'heic',
};

function usage() {
  console.error('Usage: npm run photos:import -- <path> [<path> ...] [--no-metadata]');
  console.error('  <path> may be an image file or a directory (searched recursively).');
  console.error('  --no-metadata  skip the shoot grouping and description pass.');
}

async function main() {
  const args = process.argv.slice(2);
  const withMetadata = !args.includes('--no-metadata');
  const paths = args.filter((argument) => argument !== '--no-metadata');

  if (paths.length === 0) {
    usage();
    process.exit(1);
  }

  const files = await expandPaths(paths);
  if (files.length === 0) {
    console.error('No supported images found in the given paths.');
    process.exit(1);
  }

  const manifest = await readManifest();
  const seen = new Set(manifest.map((entry) => entry.sourceHash));

  console.log(
    `${files.length} candidate file(s); manifest has ${manifest.length} photo(s).`,
  );

  // Manifest writes are serialised through one promise chain so concurrent
  // photos can never interleave a read-modify-write and lose an entry.
  let writeChain = Promise.resolve();
  const commit = (entry) => {
    writeChain = writeChain.then(async () => {
      manifest.push(entry);
      await writeManifest(manifest);
    });
    return writeChain;
  };

  let imported = 0;
  let skipped = 0;
  const failures = [];
  const importedIds = [];

  await pool(files, PHOTO_CONCURRENCY, async (file) => {
    const label = path.basename(file);

    try {
      const buffer = await readFile(file);
      const sourceHash = hashOriginal(buffer);

      // The idempotency check. Makes "did I already import this?" a non-question.
      if (seen.has(sourceHash)) {
        skipped++;
        return;
      }
      seen.add(sourceHash);

      const exif = await readAllowedExif(buffer);

      // EXIF date if the camera recorded one, file mtime otherwise. Only the
      // slug falls back — takenAt stays null rather than inventing a date.
      const slugDate = exif.takenAt ?? (await stat(file)).mtime.toISOString();
      const slug = makeSlug(slugDate, sourceHash);

      const derived = await deriveAll(slug, buffer);

      const format = (await sharp(buffer).metadata()).format;
      const originalKey = `originals/${slug}.${ORIGINAL_EXTENSIONS[format] ?? 'bin'}`;

      // Derivatives are public and metadata-stripped; the original keeps its
      // EXIF and goes to the private archive, which is never served publicly.
      await Promise.all([
        ...derived.objects.map((object) =>
          putObject(PUBLIC_BUCKET, object.key, object.body, {
            contentType: object.contentType,
            cacheControl: object.cacheControl,
          }),
        ),
        putObject(
          ARCHIVE_BUCKET,
          originalKey,
          { file },
          {
            contentType: ORIGINAL_CONTENT_TYPES[format] ?? 'application/octet-stream',
          },
        ),
      ]);

      await commit({
        id: slug,
        sourceHash,
        width: derived.width,
        height: derived.height,
        aspectRatio: derived.aspectRatio,
        variants: derived.variants,
        formats: derived.formats,
        lqip: derived.lqip,
        takenAt: exif.takenAt,
        camera: exif.camera,
        lens: exif.lens,
        focalLength: exif.focalLength,
        aperture: exif.aperture,
        shutter: exif.shutter,
        iso: exif.iso,
        shoot: null,
        title: null,
        caption: null,
        tags: [],
      });

      imported++;
      importedIds.push(slug);
      // Printed so it can be pasted straight into a blog post as <Photo id="…" />.
      console.log(`  + ${slug}  (${derived.variants.length} widths)  ${label}`);
    } catch (error) {
      failures.push({ file, message: error.message });
      console.error(`  ! ${label}: ${error.message}`);
    }
  });

  await writeChain;

  console.log(`\nimported ${imported}, skipped ${skipped}, failed ${failures.length}`);

  if (withMetadata && imported > 0) {
    try {
      await metadataPass(importedIds);
    } catch (error) {
      console.error(`\nmetadata pass failed: ${error.message}`);
      console.error('Photos are imported. Run photos:shoots and photos:describe.');
    }
  }

  if (failures.length > 0) {
    console.error('Re-run to retry the failures; imported photos will be skipped.');
    process.exit(1);
  }
}

await main();
