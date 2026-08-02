import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/*
 * Cross-checks between the two generated-and-hand-edited data files.
 *
 * `photos.json` assigns each photo a `shoot` key; `shoots.json` carries one
 * record per key with derived fields (`count`, `from`, `to`) rewritten on
 * every pipeline run. Nothing at build time re-verifies that the two agree —
 * a hand edit to either file, or a partial pipeline run, could desync them
 * silently. Invariants only, no shoot names: content churn must not break
 * these (docs/TESTING.md §1).
 */

type PhotoEntry = { id: string; shoot: string | null; takenAt: string | null };
type ShootRecord = {
  count?: number;
  from?: string | null;
  to?: string | null;
  orphaned?: boolean;
};

let photos: PhotoEntry[] = [];
let shoots: Record<string, ShootRecord> = {};

before(async () => {
  photos = JSON.parse(
    await readFile(new URL('../src/data/photos.json', import.meta.url), 'utf8'),
  );
  shoots = JSON.parse(
    await readFile(new URL('../src/data/shoots.json', import.meta.url), 'utf8'),
  );
  assert.ok(photos.length > 0, 'photos.json is empty');
  assert.ok(Object.keys(shoots).length > 0, 'shoots.json is empty');
});

const members = (shoot: string) => photos.filter((p) => p.shoot === shoot);

describe('photos.json and shoots.json stay in sync', () => {
  test('every photo.shoot key has a shoots.json record', () => {
    for (const photo of photos) {
      if (!photo.shoot) continue;
      assert.ok(
        photo.shoot in shoots,
        `${photo.id} points at unknown shoot ${photo.shoot}`,
      );
    }
  });

  test('every derived count matches the actual member count', () => {
    for (const [id, record] of Object.entries(shoots)) {
      if (record.orphaned) continue; // no members by definition; checked below
      assert.equal(
        record.count,
        members(id).length,
        `shoot ${id} claims ${record.count} photos`,
      );
    }
  });

  test('from/to bracket the members’ takenAt range exactly', () => {
    // Mirrors summariseShoots (scripts/photos/lib/shoots.mjs): from/to are the
    // UTC calendar days of the earliest and latest dated member frames.
    for (const [id, record] of Object.entries(shoots)) {
      if (record.orphaned) continue;
      const days = members(id)
        .map((p) => p.takenAt)
        .filter((t): t is string => Boolean(t))
        .sort();
      if (days.length === 0) {
        assert.equal(record.from, null, `shoot ${id} has a from but no dated frames`);
        assert.equal(record.to, null, `shoot ${id} has a to but no dated frames`);
        continue;
      }
      assert.equal(record.from, days[0]!.slice(0, 10), `shoot ${id} from`);
      assert.equal(record.to, days.at(-1)!.slice(0, 10), `shoot ${id} to`);
    }
  });

  test('an orphaned record has no members', () => {
    // `orphaned: true` means the shoot vanished from the manifest and the
    // record was kept only so its name survives. A member photo means the
    // mark is stale — the pipeline should have cleared it on the next run.
    for (const [id, record] of Object.entries(shoots)) {
      if (!record.orphaned) continue;
      assert.equal(
        members(id).length,
        0,
        `shoot ${id} is marked orphaned but still has member photos`,
      );
    }
  });
});
