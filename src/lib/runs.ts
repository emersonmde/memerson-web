/**
 * Grouping the gallery into runs.
 *
 * A **run** is one stretch of the scroll: the frames of a single shoot, in
 * order, under one header. The redesign expresses a shoot two ways that cannot
 * lie about coverage — as a run in the scroll and as an entry in the margin
 * rail — rather than as an album page you navigate *out* to. Every frame is
 * always in the scroll; a shoot is a position in it.
 *
 * The only non-obvious rule is the stray merge. A single "Miscellaneous"
 * bucket is the obvious move and the wrong one: it grows without bound, it
 * rips one-off frames out of the timeline so a 2018 walk ends up next to a
 * 2022 faire, and it tells the viewer those photographs are leftovers.
 * Instead a run of `THIN_RUN` frames or fewer is not treated as an outing at
 * all — *consecutive* thin runs merge in place into one dated stretch headed
 * STRAY FRAMES. Chronology is never broken and nothing is hidden.
 *
 * The threshold is one number. Two is right for this library; if a lot of
 * deliberate two-frame outings turn up later, move it to one.
 */

/** A run of this many frames or fewer is a stray stretch, not an outing. */
export const THIN_RUN = 2;

/** The minimum a photo has to carry to be grouped. */
export interface RunnablePhoto {
  /** Shoot key — the calendar date of the group's earliest frame. */
  shoot: string | null;
}

/** What `src/data/shoots.json` holds for one shoot. */
export interface ShootRecord {
  name?: string | null;
  summary?: string | null;
  series?: string | null;
  cameras?: string[];
  from?: string;
  to?: string;
  count?: number;
}

export interface Run<T> {
  /** Stable id, used by the rail, the jump sheet and `data-shoot`. */
  key: string;
  /** True when this is a merged stretch of one-offs rather than an outing. */
  stray: boolean;
  /** Shoot name, or null for a stray stretch and for unnamed shoots. */
  name: string | null;
  /** Shoot key of the run's own shoot; null once strays have merged. */
  shoot: string | null;
  /** The thread joining recurring outings, e.g. "air-shows". */
  series: string | null;
  /** One sentence describing the outing — used by the editorial lead. */
  summary: string | null;
  cameras: string[];
  items: T[];
}

/**
 * Group `photos` — already sorted newest-first — into runs.
 *
 * `shoots` is `src/data/shoots.json`, keyed by shoot id. A photo with no shoot
 * is its own single-frame run, which the thin rule then folds into the
 * neighbouring stray stretch.
 */
export function groupIntoRuns<T extends RunnablePhoto>(
  photos: T[],
  shoots: Record<string, ShootRecord>,
): Run<T>[] {
  // Pass one: consecutive frames sharing a shoot.
  //
  // Keys become DOM ids and fragment anchors, so they must be unique even when
  // the same base recurs — two separated groups of shoot-less photos would both
  // be `undated`, and two shoots with interleaved date ranges can alternate in
  // the newest-first sort. A repeat gets a `-2`, `-3`… suffix; the first
  // occurrence keeps the bare key so existing anchors stay stable.
  const seen = new Map<string, number>();
  const raw: Run<T>[] = [];
  for (const photo of photos) {
    const base = photo.shoot ?? 'undated';
    const last = raw[raw.length - 1];

    if (last && last.shoot === photo.shoot) {
      last.items.push(photo);
      continue;
    }

    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const key = n === 1 ? base : `${base}-${n}`;

    const record = (photo.shoot ? shoots[photo.shoot] : undefined) ?? {};
    raw.push({
      key,
      stray: false,
      shoot: photo.shoot,
      name: record.name ?? null,
      series: record.series ?? null,
      summary: record.summary ?? null,
      cameras: record.cameras ?? [],
      items: [photo],
    });
  }

  // Pass two: fold thin runs into the stray stretch they are adjacent to.
  const out: Run<T>[] = [];
  for (const run of raw) {
    if (run.items.length > THIN_RUN) {
      out.push(run);
      continue;
    }

    const last = out[out.length - 1];
    if (last?.stray) {
      last.items.push(...run.items);
      // A stray stretch has no single camera roster; union what it does have.
      last.cameras = [...new Set([...last.cameras, ...run.cameras])];
      continue;
    }

    out.push({
      key: `stray-${run.key}`,
      stray: true,
      shoot: null,
      name: null,
      series: null,
      summary: null,
      cameras: [...run.cameras],
      items: [...run.items],
    });
  }

  return out;
}
