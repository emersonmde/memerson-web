#!/usr/bin/env node
/**
 * npm run photos:shoots [-- --gap-days 7] [--dry-run]
 *
 * Groups photographs into shoots by capture time and records the grouping in
 * the manifest (`shoot`) and in `src/data/shoots.json`.
 *
 * Mechanical: no model, no network, no originals. Deterministic given the same
 * manifest, and safe to run any number of times — it only ever fills in photos
 * that have no shoot yet. See `lib/shoots.mjs` for why that restriction is the
 * whole design, and docs/MILESTONES.md M4 for the threshold's derivation.
 */
import { withLock } from './lib/lock.mjs';
import { readManifest, writeManifest } from './lib/manifest.mjs';
import {
  SHOOT_GAP_DAYS,
  assignShoots,
  readShoots,
  summariseShoots,
  writeShoots,
} from './lib/shoots.mjs';

function parseArgs(argv) {
  const options = { gapDays: SHOOT_GAP_DAYS, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') options.dryRun = true;
    else if (argv[i] === '--gap-days') options.gapDays = Number(argv[++i]);
    else {
      console.error(`Unknown argument: ${argv[i]}`);
      console.error('Usage: npm run photos:shoots -- [--gap-days N] [--dry-run]');
      process.exit(1);
    }
  }
  if (!Number.isFinite(options.gapDays) || options.gapDays <= 0) {
    console.error('--gap-days must be a positive number.');
    process.exit(1);
  }
  return options;
}

async function main() {
  const { gapDays, dryRun } = parseArgs(process.argv.slice(2));
  const manifest = await readManifest();

  if (manifest.length === 0) {
    console.log('Manifest is empty; nothing to group.');
    return;
  }

  const { assignments, created, extended, bridged, collided, undated } = assignShoots(
    manifest,
    gapDays,
  );

  console.log(
    `${manifest.length} photo(s), gap threshold ${gapDays}d — ` +
      `${assignments.size} assignment(s).`,
  );

  for (const { shoot, count } of created) {
    console.log(`  new shoot ${shoot} (${count} photo${count === 1 ? '' : 's'})`);
  }
  for (const { shoot, added } of extended) {
    console.log(`  extended shoot ${shoot} (+${added})`);
  }

  // Two clusters started the same calendar day (a sub-day --gap-days). The
  // second got a suffixed id rather than silently joining the first.
  for (const { shoot, base } of collided) {
    console.warn(`  ! shoot id ${base} was taken by another cluster — used ${shoot}`);
  }

  /*
   * A bridge means new photos fell between two shoots that were already
   * distinct. Merging them would destroy whatever names those shoots carry, so
   * the tool refuses to and says so instead — this is the one case that wants a
   * human.
   */
  for (const { shoots, added } of bridged) {
    console.warn(
      `  ! ${added} photo(s) bridge existing shoots ${shoots.join(' and ')}. ` +
        `Kept apart; assigned to the nearest. Merge by hand if they are one thing.`,
    );
  }

  if (undated.length) {
    console.warn(
      `  ! ${undated.length} photo(s) have no takenAt and cannot be grouped: ` +
        undated
          .slice(0, 5)
          .map((entry) => entry.id)
          .join(', ') +
        (undated.length > 5 ? ', …' : ''),
    );
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  const updated = manifest.map((entry) =>
    assignments.has(entry.id) ? { ...entry, shoot: assignments.get(entry.id) } : entry,
  );

  await writeManifest(updated);
  const shoots = await writeShoots(summariseShoots(updated), await readShoots());

  const unnamed = Object.values(shoots).filter((s) => !s.name).length;
  console.log(
    `\nWrote ${Object.keys(shoots).length} shoot(s) to src/data/shoots.json` +
      (unnamed ? ` — ${unnamed} unnamed.` : '.'),
  );
  if (unnamed) console.log('Name them by hand, or run: npm run photos:name-shoots');
}

withLock(main).catch((error) => {
  console.error(error);
  process.exit(1);
});
