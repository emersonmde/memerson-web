/**
 * Shoots — the automatic grouping that everything else in M4 hangs off.
 *
 * A shoot is a run of photographs taken close together in time. Deriving them
 * costs nothing (no new metadata, no model) and it turns "label 118 photos"
 * into "optionally name 14 groups", which is the whole point.
 *
 * Two rules govern this file, and both exist to protect hand-written names.
 * See docs/MILESTONES.md, M4 "Shoots and albums".
 */
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './r2.mjs';

export const SHOOTS_PATH = path.join(REPO_ROOT, 'src/data/shoots.json');

/**
 * The three-layer model, which is the one working photographers already use:
 *
 *   shoot   one per photo, automatic     ≡ Lightroom folder, ≡ IPTC "Event"
 *   series  optional, spans shoots        ≡ Lightroom Collection
 *   tags    many per photo                ≡ IPTC Keywords
 *
 * **A shoot is the browsing unit, and a recurring event gets one shoot per
 * occurrence — not one shoot forever.** Two visits to an air show five years
 * apart are two shoots called "Air Show", joined by `series: "air-shows"`. This
 * is what the IPTC standard asks for in as many words: name the specific
 * occurrence, not the category ("Maui Classical Music Festival", never
 * "festival").
 *
 * The reasons are practical. An album has to be bounded to be browsable, and a
 * merged "Air Show" grows without end; chronology inside it stops meaning
 * anything; and you still get "every air show" from the series, so merging buys
 * nothing it does not also cost. It also degrades well — the 2028 air show
 * becomes its own shoot with no taxonomy to maintain.
 *
 * The field is `series` and not `album` because colloquially the *album* is the
 * thing you browse, which here is the shoot. It is not `collection` either:
 * that name is already spoken for by Astro's content collections
 * (`getCollection('photos')`) and the clash would be genuinely confusing.
 */

/**
 * Seven days, not the twenty-four hours this started as.
 *
 * Cluster count against threshold over the first 118 photos was 17/16/15 at
 * 0.5/1/2 days and then **flat at 14 from 3 days all the way to 14 days**. That
 * plateau is the signal: inside it the library's own structure is deciding, not
 * the parameter. Within a shoot the median gap between frames is 10 minutes;
 * between shoots the gaps run 15, 37, 45, 52, 54 days. The band from 2.6 to 15
 * days is nearly empty, so anything parked in it is robust.
 *
 * 24h sat in the contested zone instead, where three of fourteen groups turned
 * on noise — including a multi-day trip whose largest internal gap was 14.4h,
 * i.e. it survived by nine hours.
 *
 * The asymmetry is what settles the value. A sparse import from a long trip is
 * fixed by a *larger* threshold; two subjects shot on the same day are fixed by
 * *no* threshold, because capture time carries nothing about the difference.
 * Raising it is therefore free where it cannot help and correct where it can.
 * Same-day subject splits are a permanently manual operation.
 */
export const SHOOT_GAP_DAYS = 7;

const DAY_MS = 86_400_000;

/**
 * A manifest entry, as far as this file cares. The index signature keeps it
 * honest: clustering reads capture time and nothing else, so it must not
 * develop opinions about the rest of the schema.
 *
 * @typedef {{
 *   id: string,
 *   takenAt: string | null,
 *   shoot?: string | null,
 *   camera?: string | null,
 *   [key: string]: unknown,
 * }} PhotoEntry
 */

/**
 * Single-linkage clustering in one dimension: start a new group whenever the
 * gap to the previous photo exceeds the threshold.
 *
 * Pure, and takes the threshold as an argument, so the plateau above can be
 * re-measured against a grown library without editing anything.
 *
 * Entries without `takenAt` cannot be placed and are returned separately rather
 * than silently dropped or lumped together.
 *
 * @param {PhotoEntry[]} entries
 * @param {number} [gapDays]
 * @returns {{ clusters: PhotoEntry[][], undated: PhotoEntry[] }}
 */
export function clusterByTime(entries, gapDays = SHOOT_GAP_DAYS) {
  const undated = entries.filter((entry) => !entry.takenAt);
  const dated = entries
    .filter((entry) => entry.takenAt)
    .sort((a, b) => (a.takenAt < b.takenAt ? -1 : a.takenAt > b.takenAt ? 1 : 0));

  /** @type {PhotoEntry[][]} */
  const clusters = [];
  const gapMs = gapDays * DAY_MS;

  for (const entry of dated) {
    const previous = clusters.at(-1)?.at(-1);
    const gap = previous
      ? new Date(entry.takenAt) - new Date(previous.takenAt)
      : Infinity;
    if (gap > gapMs) clusters.push([]);
    clusters.at(-1).push(entry);
  }

  return { clusters, undated };
}

/** A shoot's id is the calendar date of its earliest frame. */
export function shootId(cluster) {
  return cluster[0].takenAt.slice(0, 10);
}

/**
 * Assign `shoot` to entries that do not have one, and **never** change one that
 * does.
 *
 * This is the rule that makes the whole approach survivable over years. If
 * clustering re-derived the entire library on every import, one new photo
 * landing in a gap could merge two shoots that had already been named, and the
 * names would be silently attached to the wrong photographs. A wrong split that
 * gets fixed once is cheap; silent re-derivation compounds.
 *
 * So a cluster may *extend* an existing shoot but may never *merge* two. When a
 * new photo bridges two shoots that were already distinct, each unassigned
 * photo joins whichever existing shoot is nearest in time and the bridge is
 * reported — a human decides whether those two were always one thing.
 *
 * Returns the assignments plus everything a caller needs to report, and mutates
 * nothing.
 */
export function assignShoots(entries, gapDays = SHOOT_GAP_DAYS) {
  const { clusters, undated } = clusterByTime(entries, gapDays);

  const assignments = new Map(); // id -> shoot
  const created = [];
  const extended = [];
  const bridged = [];

  for (const cluster of clusters) {
    const existing = [...new Set(cluster.map((e) => e.shoot).filter(Boolean))];
    const pending = cluster.filter((e) => !e.shoot);

    if (existing.length === 0) {
      const id = shootId(cluster);
      for (const entry of cluster) assignments.set(entry.id, id);
      created.push({ shoot: id, count: cluster.length });
      continue;
    }

    if (existing.length === 1) {
      for (const entry of pending) assignments.set(entry.id, existing[0]);
      if (pending.length) extended.push({ shoot: existing[0], added: pending.length });
      continue;
    }

    // Several named shoots now sit inside one cluster. Keep them apart.
    for (const entry of pending) {
      const nearest = cluster
        .filter((other) => other.shoot)
        .reduce((best, other) =>
          Math.abs(new Date(other.takenAt) - new Date(entry.takenAt)) <
          Math.abs(new Date(best.takenAt) - new Date(entry.takenAt))
            ? other
            : best,
        );
      assignments.set(entry.id, nearest.shoot);
    }
    bridged.push({ shoots: existing, added: pending.length });
  }

  return { assignments, created, extended, bridged, undated };
}

/**
 * One record in `src/data/shoots.json`.
 *
 * The index signature is not laziness — it is the same "preserve what you do
 * not recognise" contract the manifest writer has. A field added by hand today
 * must survive every future write, whether or not this file has heard of it.
 *
 * @typedef {{
 *   count?: number,
 *   from?: string | null,
 *   to?: string | null,
 *   cameras?: string[],
 *   name?: string | null,
 *   series?: string | null,
 *   summary?: string | null,
 *   orphaned?: boolean,
 *   [key: string]: unknown,
 * }} ShootRecord
 */

/**
 * Summarise each shoot for the file a human actually reads while naming things.
 * Derived every run — `name` and `series` are the only fields anyone edits.
 *
 * @returns {Record<string, ShootRecord>}
 */
export function summariseShoots(entries) {
  const byShoot = new Map();
  for (const entry of entries) {
    if (!entry.shoot) continue;
    if (!byShoot.has(entry.shoot)) byShoot.set(entry.shoot, []);
    byShoot.get(entry.shoot).push(entry);
  }

  const summary = {};
  for (const [id, group] of [...byShoot].sort((a, b) => (a[0] < b[0] ? 1 : -1))) {
    const dates = group
      .map((e) => e.takenAt)
      .filter(Boolean)
      .sort();
    summary[id] = {
      count: group.length,
      from: dates[0]?.slice(0, 10) ?? null,
      to: dates.at(-1)?.slice(0, 10) ?? null,
      cameras: [...new Set(group.map((e) => e.camera).filter(Boolean))],
    };
  }
  return summary;
}

export async function readShoots() {
  try {
    return JSON.parse(await readFile(SHOOTS_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

/**
 * Merge derived summary over stored records, **keeping every authored field**.
 *
 * Same hazard as the manifest writer: rebuilding each record from a fixed field
 * list would silently delete a hand-written name on the next run. Derived keys
 * are overwritten; anything else the record carries survives untouched.
 *
 * Pure, and separate from the write, so the merge rule can be tested without
 * touching the filesystem.
 *
 * @param {Record<string, ShootRecord>} summary
 * @param {Record<string, ShootRecord>} [existing]
 * @returns {Record<string, ShootRecord>}
 */
export function mergeShoots(summary, existing = {}) {
  /** @type {Record<string, ShootRecord>} */
  const merged = {};
  for (const [id, derived] of Object.entries(summary)) {
    merged[id] = { ...existing[id], ...derived };
    if (!('name' in merged[id])) merged[id].name = null;
    if (!('series' in merged[id])) merged[id].series = null;
  }

  // A shoot that vanished from the manifest keeps its record rather than being
  // dropped — losing a name to a mis-typed import path would be unrecoverable.
  for (const [id, record] of Object.entries(existing)) {
    if (!(id in merged)) merged[id] = { ...record, orphaned: true };
  }

  return merged;
}

export async function writeShoots(summary, existing = {}) {
  const merged = mergeShoots(summary, existing);
  const temporary = `${SHOOTS_PATH}.tmp`;
  await writeFile(temporary, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  await rename(temporary, SHOOTS_PATH);
  return merged;
}
