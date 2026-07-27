#!/usr/bin/env node
/**
 * npm run photos:rebuild -- <slug> [<slug> ...]
 * npm run photos:rebuild -- --all
 *
 * Re-derives a photo from its archived original. This is what makes changing
 * the width ladder or adding a format later a non-event: no local originals
 * folder is needed, only the private archive bucket.
 * See docs/ARCHITECTURE.md §5.7.
 *
 * Authored fields (title, caption, tags) and the EXIF block are preserved —
 * only geometry, variants, formats, and the LQIP are recomputed.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { deriveAll } from './lib/derive.mjs';
import { readManifest, writeManifest } from './lib/manifest.mjs';
import {
  ARCHIVE_BUCKET,
  PUBLIC_BUCKET,
  getObject,
  listObjects,
  pool,
  putObject,
} from './lib/r2.mjs';

const REBUILD_CONCURRENCY = 3;

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: npm run photos:rebuild -- <slug> [<slug> ...]');
    console.error('       npm run photos:rebuild -- --all');
    process.exit(1);
  }

  const manifest = await readManifest();
  const byId = new Map(manifest.map((entry) => [entry.id, entry]));

  const slugs = args.includes('--all') ? [...byId.keys()] : args;

  const unknown = slugs.filter((slug) => !byId.has(slug));
  if (unknown.length > 0) {
    console.error(`Not in the manifest: ${unknown.join(', ')}`);
    process.exit(1);
  }

  const archiveKeys = await listObjects(ARCHIVE_BUCKET, 'originals/');
  const archiveBySlug = new Map(
    archiveKeys.map((key) => [
      key.slice('originals/'.length).replace(/\.[^.]+$/, ''),
      key,
    ]),
  );

  const scratch = await mkdtemp(path.join(tmpdir(), 'photos-rebuild-'));
  let rebuilt = 0;
  const failures = [];

  try {
    await pool(slugs, REBUILD_CONCURRENCY, async (slug) => {
      try {
        const archiveKey = archiveBySlug.get(slug);
        if (!archiveKey)
          throw new Error(`no archived original (expected originals/${slug}.*)`);

        const local = path.join(scratch, path.basename(archiveKey));
        const buffer = await getObject(ARCHIVE_BUCKET, archiveKey, local);

        const derived = await deriveAll(slug, buffer);

        await Promise.all(
          derived.objects.map((object) =>
            putObject(PUBLIC_BUCKET, object.key, object.body, {
              contentType: object.contentType,
              cacheControl: object.cacheControl,
            }),
          ),
        );

        const entry = byId.get(slug);
        entry.width = derived.width;
        entry.height = derived.height;
        entry.aspectRatio = derived.aspectRatio;
        entry.variants = derived.variants;
        entry.formats = derived.formats;
        entry.lqip = derived.lqip;

        rebuilt++;
        console.log(`  ~ ${slug}  (${derived.variants.length} widths)`);
      } catch (error) {
        failures.push(slug);
        console.error(`  ! ${slug}: ${error.message}`);
      }
    });

    await writeManifest(manifest);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }

  console.log(`\nrebuilt ${rebuilt}, failed ${failures.length}`);
  if (failures.length > 0) process.exit(1);

  // Widths dropped from the ladder leave their old objects behind; verify is
  // what surfaces them, rather than this command guessing what to delete.
  console.log('Run `npm run photos:verify` to check for now-orphaned objects.');
}

await main();
