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
  console.error('Usage: npm run photos:import -- <path> [<path> ...]');
  console.error('  <path> may be an image file or a directory (searched recursively).');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    usage();
    process.exit(1);
  }

  const files = await expandPaths(args);
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
        title: null,
        caption: null,
        tags: [],
      });

      imported++;
      // Printed so it can be pasted straight into a blog post as <Photo id="…" />.
      console.log(`  + ${slug}  (${derived.variants.length} widths)  ${label}`);
    } catch (error) {
      failures.push({ file, message: error.message });
      console.error(`  ! ${label}: ${error.message}`);
    }
  });

  await writeChain;

  console.log(`\nimported ${imported}, skipped ${skipped}, failed ${failures.length}`);
  if (failures.length > 0) {
    console.error('Re-run to retry the failures; imported photos will be skipped.');
    process.exit(1);
  }
}

await main();
