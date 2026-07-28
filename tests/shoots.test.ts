import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SHOOT_GAP_DAYS,
  assignShoots,
  clusterByTime,
  mergeShoots,
  shootId,
  summariseShoots,
} from '../scripts/photos/lib/shoots.mjs';

/**
 * Invariants, not counts. The manifest grows every import, so a test asserting
 * "14 shoots" would be testing the library rather than the clustering — see
 * docs/TESTING.md.
 */

const DAY = 86_400_000;
const base = Date.UTC(2022, 0, 1);

/** Photos at the given day offsets, in the shape the manifest uses. */
function photos(...offsets: number[]) {
  return offsets.map((days, i) => ({
    id: `p${i}`,
    takenAt: new Date(base + days * DAY).toISOString().replace('.000', ''),
    shoot: null as string | null,
  }));
}

describe('clusterByTime', () => {
  test('splits exactly where the gap exceeds the threshold, and nowhere else', () => {
    const { clusters } = clusterByTime(photos(0, 1, 2, 20, 21), 7);
    assert.deepEqual(
      clusters.map((c) => c.length),
      [3, 2],
    );
  });

  test('a gap equal to the threshold does not split — only a larger one does', () => {
    assert.equal(clusterByTime(photos(0, 7), 7).clusters.length, 1);
    assert.equal(clusterByTime(photos(0, 7.001), 7).clusters.length, 2);
  });

  test('every photo lands in exactly one cluster, whatever the order in', () => {
    const shuffled = photos(30, 0, 2, 31, 1);
    const { clusters } = clusterByTime(shuffled, 7);
    const ids = clusters
      .flat()
      .map((p) => p.id)
      .sort();
    assert.deepEqual(ids, shuffled.map((p) => p.id).sort());
  });

  test('raising the threshold can only merge clusters, never create more', () => {
    const sample = photos(0, 1, 3, 9, 20, 21, 40);
    let previous = Infinity;
    for (const gap of [0.5, 1, 2, 3, 7, 14, 30]) {
      const count = clusterByTime(sample, gap).clusters.length;
      assert.ok(count <= previous, `${gap}d produced more clusters than a tighter gap`);
      previous = count;
    }
  });

  test('undated photos are reported, never guessed into a cluster', () => {
    const entries = [...photos(0, 1), { id: 'x', takenAt: null, shoot: null }];
    const { clusters, undated } = clusterByTime(entries, 7);
    assert.equal(undated.length, 1);
    assert.equal(clusters.flat().length, 2);
  });

  test('the default threshold sits on the plateau, not in the contested band', () => {
    // The finding that set it: 24h split multi-day trips, 7d does not.
    assert.equal(SHOOT_GAP_DAYS, 7);
    const trip = photos(0, 0.6, 1.0, 2.6);
    assert.equal(clusterByTime(trip, SHOOT_GAP_DAYS).clusters.length, 1);
    assert.ok(clusterByTime(trip, 1).clusters.length > 1, '24h would have split it');
  });
});

describe('shootId', () => {
  test('is the earliest date in the group, so it never renumbers', () => {
    const group = photos(5, 6, 7);
    assert.equal(shootId(group), group[0].takenAt.slice(0, 10));
  });
});

describe('assignShoots — the rule that protects hand-written names', () => {
  test('assigns every dated photo when nothing is assigned yet', () => {
    const entries = photos(0, 1, 30);
    const { assignments, created } = assignShoots(entries, 7);
    assert.equal(assignments.size, 3);
    assert.equal(created.length, 2);
  });

  test('never changes a shoot that is already set', () => {
    const entries = photos(0, 1, 2);
    entries[0].shoot = 'HAND-PICKED';
    const { assignments } = assignShoots(entries, 7);
    assert.equal(assignments.has('p0'), false, 'reassigned an existing shoot');
    assert.equal(assignments.get('p1'), 'HAND-PICKED', 'new photo should join it');
  });

  test('a new photo extends an existing shoot rather than starting a rival one', () => {
    const entries = photos(0, 1, 2);
    entries[0].shoot = '2022-01-01';
    entries[1].shoot = '2022-01-01';
    const { assignments, created, extended } = assignShoots(entries, 7);
    assert.equal(created.length, 0);
    assert.deepEqual(extended, [{ shoot: '2022-01-01', added: 1 }]);
    assert.equal(assignments.get('p2'), '2022-01-01');
  });

  test('a photo bridging two named shoots must not merge them', () => {
    // The failure this exists to prevent: one new frame lands between two
    // shoots that were already named, and re-clustering silently fuses them.
    const entries = photos(0, 10, 5);
    entries[0].shoot = 'TRIP-A';
    entries[1].shoot = 'TRIP-B';

    const { assignments, bridged } = assignShoots(entries, 7);

    assert.equal(assignments.has('p0'), false);
    assert.equal(assignments.has('p1'), false);
    assert.equal(bridged.length, 1, 'the bridge should be reported');
    assert.ok(['TRIP-A', 'TRIP-B'].includes(assignments.get('p2')));
  });

  test('is idempotent — a second run over its own output changes nothing', () => {
    const entries = photos(0, 1, 30, 31);
    const first = assignShoots(entries, 7);
    const applied = entries.map((e) => ({ ...e, shoot: first.assignments.get(e.id) }));
    const second = assignShoots(applied, 7);
    assert.equal(second.assignments.size, 0);
    assert.equal(second.created.length, 0);
  });
});

describe('summariseShoots', () => {
  test('reports the real span and count per shoot', () => {
    const entries = photos(0, 1, 2).map((e) => ({ ...e, shoot: 'S', camera: 'EOS R6' }));
    const summary = summariseShoots(entries);
    assert.equal(summary.S.count, 3);
    assert.equal(summary.S.from, '2022-01-01');
    assert.equal(summary.S.to, '2022-01-03');
    assert.deepEqual(summary.S.cameras, ['EOS R6']);
  });

  test('ignores photos with no shoot rather than inventing a bucket for them', () => {
    const entries = [...photos(0).map((e) => ({ ...e, shoot: 'S' })), ...photos(9)];
    assert.deepEqual(Object.keys(summariseShoots(entries)), ['S']);
  });
});

describe('mergeShoots', () => {
  test('an authored name survives a rewrite, and derived fields refresh', () => {
    const merged = mergeShoots(
      { S: { count: 9, from: '2022-01-01', to: '2022-01-02', cameras: [] } },
      { S: { count: 3, from: 'stale', to: 'stale', cameras: [], name: 'St Croix' } },
    );

    assert.equal(merged.S.name, 'St Croix', 'authored name was lost');
    assert.equal(merged.S.count, 9, 'derived field was not refreshed');
    assert.equal(merged.S.from, '2022-01-01');
  });

  test('a shoot that leaves the manifest keeps its record rather than vanishing', () => {
    const merged = mergeShoots({}, { GONE: { name: 'Iceland' } });
    assert.equal(merged.GONE.name, 'Iceland');
    assert.equal(merged.GONE.orphaned, true);
  });

  test('unknown authored fields are preserved, so the schema can grow', () => {
    const merged = mergeShoots(
      { S: { count: 1 } },
      { S: { album: 'caribbean', note: 'the good one' } },
    );
    assert.equal(merged.S.album, 'caribbean');
    assert.equal(merged.S.note, 'the good one');
  });

  test('a new shoot gets null name and album rather than missing keys', () => {
    const merged = mergeShoots({ S: { count: 1 } });
    assert.equal(merged.S.name, null);
    assert.equal(merged.S.album, null);
  });
});
