#!/usr/bin/env node
/**
 * npm run photos:verify
 *
 * Checks that every object the manifest promises actually exists in R2, and
 * flags R2 objects with no manifest entry. See docs/ARCHITECTURE.md §5.7.
 *
 * Also spot-checks the public custom domain, because "the object is in the
 * bucket" and "the browser can fetch it" are different claims and only the
 * second one matters to a visitor.
 */
import { readManifest } from './lib/manifest.mjs';
import { pool } from './lib/pool.mjs';
import {
  ARCHIVE_BUCKET,
  PHOTOS_BASE_URL,
  PUBLIC_BUCKET,
  derivativeKey,
  listObjects,
} from './lib/r2.mjs';

const SPOT_CHECK_COUNT = 5;

function expectedDerivativeKeys(entry) {
  const keys = [];
  for (const width of entry.variants) {
    for (const format of entry.formats) keys.push(derivativeKey(entry.id, width, format));
  }
  return keys;
}

async function spotCheckPublicUrls(keys) {
  // Evenly spaced rather than the first N, so a systematic failure late in the
  // upload is as visible as one at the start.
  const step = Math.max(1, Math.floor(keys.length / SPOT_CHECK_COUNT));
  const sample = keys.filter((_, index) => index % step === 0).slice(0, SPOT_CHECK_COUNT);

  return pool(sample, 5, async (key) => {
    const url = `${PHOTOS_BASE_URL}/${key}`;
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return { url, ok: response.ok, status: response.status };
    } catch (error) {
      return { url, ok: false, status: error.message };
    }
  });
}

async function main() {
  const manifest = await readManifest();
  if (manifest.length === 0) {
    console.log('Manifest is empty — nothing to verify.');
    return;
  }

  console.log(`Manifest: ${manifest.length} photo(s). Listing R2…`);

  const [publicKeys, archiveKeys] = await Promise.all([
    listObjects(PUBLIC_BUCKET, 'photos/'),
    listObjects(ARCHIVE_BUCKET, 'originals/'),
  ]);

  const publicSet = new Set(publicKeys);
  const expectedSet = new Set();

  const missingDerivatives = [];
  const missingOriginals = [];

  // The archive extension depends on the source format, which the manifest does
  // not record, so match on the `originals/<slug>.` prefix instead.
  const archivedSlugs = new Set(
    archiveKeys.map((key) => key.slice('originals/'.length).replace(/\.[^.]+$/, '')),
  );

  for (const entry of manifest) {
    for (const key of expectedDerivativeKeys(entry)) {
      expectedSet.add(key);
      if (!publicSet.has(key)) missingDerivatives.push(key);
    }
    if (!archivedSlugs.has(entry.id)) missingOriginals.push(entry.id);
  }

  const orphanedDerivatives = publicKeys.filter((key) => !expectedSet.has(key));

  const manifestSlugs = new Set(manifest.map((entry) => entry.id));
  const orphanedOriginals = [...archivedSlugs].filter((slug) => !manifestSlugs.has(slug));

  console.log(
    `\npublic bucket   : ${publicKeys.length} object(s), ${expectedSet.size} expected`,
  );
  console.log(
    `archive bucket  : ${archiveKeys.length} object(s), ${manifest.length} expected`,
  );

  const report = (label, items) => {
    if (items.length === 0) return false;
    console.error(`\n${label} (${items.length}):`);
    for (const item of items.slice(0, 20)) console.error(`  ${item}`);
    if (items.length > 20) console.error(`  … and ${items.length - 20} more`);
    return true;
  };

  let failed = false;
  failed = report('MISSING derivatives', missingDerivatives) || failed;
  failed = report('MISSING originals in archive', missingOriginals) || failed;
  failed =
    report('ORPHANED derivatives (no manifest entry)', orphanedDerivatives) || failed;
  failed = report('ORPHANED originals (no manifest entry)', orphanedOriginals) || failed;

  console.log(`\nSpot-checking ${SPOT_CHECK_COUNT} public URL(s)…`);
  for (const result of await spotCheckPublicUrls([...expectedSet])) {
    console.log(`  ${result.ok ? 'ok ' : 'FAIL'} ${result.status}  ${result.url}`);
    if (!result.ok) failed = true;
  }

  if (failed) {
    console.error('\nVerification FAILED.');
    process.exit(1);
  }
  console.log('\nVerification passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
