#!/usr/bin/env node
/**
 * npm run photos:name-shoots [-- --force] [--dry-run]
 *
 * Proposes a name for each unnamed shoot by showing the model several frames
 * from it **at once**.
 *
 * This is the step that actually earns its keep. A per-photo question can only
 * ever answer "what is in this picture"; shown a whole shoot together, a model
 * can usually recognise the place or the occasion — which is what a person
 * actually wants an album called. Palm fronds plus a small aircraft plus a
 * beach is a trip, and only the group says so.
 *
 * Names land in `src/data/shoots.json` and are proposals: the file is in git,
 * so the diff is the review, and anything wrong is one string to fix. Existing
 * names are never overwritten without --force.
 *
 * Run `photos:describe` first if you can — per-photo tags are handed to the
 * model as context here and measurably sharpen the answer.
 */
import { readManifest } from './lib/manifest.mjs';
import { readShoots, summariseShoots, writeShoots } from './lib/shoots.mjs';
import { DESCRIBE_MODEL, askAboutImages, derivativeUrl } from './lib/claude.mjs';
import { withLock } from './lib/lock.mjs';
import { pool } from './lib/pool.mjs';

/** Frames shown per shoot. Enough to establish a place; cheap enough to run often. */
const SAMPLE_SIZE = 6;
const CONCURRENCY = 3;

function parseArgs(argv) {
  const options = { force: false, dryRun: false };
  for (const argument of argv) {
    if (argument === '--force') options.force = true;
    else if (argument === '--dry-run') options.dryRun = true;
    else {
      console.error(`Unknown argument: ${argument}`);
      console.error('Usage: npm run photos:name-shoots -- [--force] [--dry-run]');
      process.exit(1);
    }
  }
  return options;
}

/** Evenly spaced across the shoot rather than the first N, which would only ever
 * show the beginning of a trip. */
function sample(entries, count) {
  if (entries.length <= count) return entries;
  const step = (entries.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => entries[Math.round(i * step)]);
}

const buildPrompt = (context) => (names) =>
  `These ${names.length} photographs (${names.map((n) => `./${n}`).join(', ')}) are all
from one shoot — taken in the same short window, probably the same place or occasion.
Read all of them, then propose what to call the group.

${context}

Reply with ONLY a JSON object. No markdown fence, no prose:
{"name": string|null, "summary": string|null}

name — a short label a person would recognise: a place, an event, or a subject.
"St Croix", "PA Renaissance Faire", "Washington DC", "Air Show". No date — the
date is already known and will be shown alongside. Return null if the frames have
nothing in common beyond being close in time; a wrong name is worse than none,
and an unnamed shoot is still perfectly usable.

summary — one short sentence on what the shoot is, or null.`;

async function main() {
  const { force, dryRun } = parseArgs(process.argv.slice(2));

  const manifest = await readManifest();
  const stored = await readShoots();
  const summary = summariseShoots(manifest);

  if (Object.keys(summary).length === 0) {
    console.log('No shoots yet. Run: npm run photos:shoots');
    return;
  }

  const byShoot = new Map();
  for (const entry of manifest) {
    if (!entry.shoot) continue;
    if (!byShoot.has(entry.shoot)) byShoot.set(entry.shoot, []);
    byShoot.get(entry.shoot).push(entry);
  }

  const pending = Object.keys(summary).filter((id) => force || !stored[id]?.name);
  if (pending.length === 0) {
    console.log(
      `All ${Object.keys(summary).length} shoot(s) already named. Use --force to redo.`,
    );
    return;
  }

  console.log(
    `Naming ${pending.length} of ${Object.keys(summary).length} shoot(s) ` +
      `with ${DESCRIBE_MODEL}${dryRun ? ' (dry run)' : ''}.`,
  );

  const proposals = new Map();
  let failed = 0;

  await pool(pending, CONCURRENCY, async (id) => {
    const group = byShoot
      .get(id)
      .slice()
      .sort((a, b) => (a.takenAt < b.takenAt ? -1 : 1));
    const chosen = sample(group, SAMPLE_SIZE);

    const meta = summary[id];
    const tags = [...new Set(group.flatMap((entry) => entry.tags ?? []))];
    const context = [
      `The shoot has ${meta.count} photograph(s), ${
        meta.from === meta.to ? `taken ${meta.from}` : `from ${meta.from} to ${meta.to}`
      }.`,
      meta.cameras.length ? `Cameras: ${meta.cameras.join(', ')}.` : '',
      tags.length ? `Tags across the whole shoot: ${tags.slice(0, 40).join(', ')}.` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const result = await askAboutImages(
        chosen.map((entry) => derivativeUrl(entry)),
        buildPrompt(context),
      );
      const name =
        typeof result.name === 'string' && result.name.trim() ? result.name.trim() : null;
      const summaryText =
        typeof result.summary === 'string' && result.summary.trim()
          ? result.summary.trim()
          : null;

      proposals.set(id, { name, summary: summaryText });
      console.log(
        `  ${id} (${meta.count}) → ${name ? `"${name}"` : 'no name proposed'}` +
          (summaryText ? `\n      ${summaryText}` : ''),
      );
    } catch (error) {
      failed += 1;
      console.error(`  ! ${id}: ${error.message}`);
    }
  });

  if (dryRun) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  const merged = { ...stored };
  for (const [id, proposal] of proposals) {
    merged[id] = { ...merged[id], ...proposal };
  }

  await writeShoots(summary, merged);
  console.log(
    `\n${proposals.size} named, ${failed} failed. ` +
      'These are proposals — read the diff in src/data/shoots.json.',
  );
  if (failed) process.exitCode = 1;
}

withLock(main).catch((error) => {
  console.error(error);
  process.exit(1);
});
