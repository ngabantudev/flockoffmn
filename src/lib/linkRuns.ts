import { haversineMeters, metersToMiles } from './geo.mjs';
import type { FeatureProperties } from '~/layers/types';

/**
 * Re-deriving corridors in the browser at a reader-chosen linking radius.
 *
 * The shipped file is not a list of corridors. It is a list of road stretches
 * carrying everything needed to cut corridors out of them: where each reader
 * location sits along the road, how many readers are at each, and where each
 * surveyed piece of road sits on the same scale. A corridor is what you get
 * when you pick a radius, and picking it is the reader's job.
 *
 * That split exists because the geometry cannot be recomputed here. Clipping a
 * road to a run of readers needs the road network, which lives in OpenStreetMap
 * and reaches this project through two Overpass queries at build time. So the
 * ingest does the surveying once, at the widest radius the control offers, and
 * the browser only ever narrows: every metre drawn at any slider position was
 * clipped from real road geometry by the ingest. Nothing is invented here, and
 * nothing can be — there is no road data in this file to invent it from.
 */

export interface LinkRadiusConfig {
  offsetsKey: string;
  countsKey: string;
  lngsKey: string;
  latsKey: string;
  pieceSpansKey: string;
  minSites: number;
  minSpanMiles: number;
}

export interface Run {
  /** Index of the source feature this run was cut from. */
  source: number;
  /** Indices into the source feature's site list. */
  from: number;
  to: number;
  startMiles: number;
  endMiles: number;
  sites: number;
  readers: number;
  points: Array<[number, number]>;
  offsets: number[];
  counts: number[];
  /** Filled in by assignColonies. */
  colony: number;
  colonySites: number;
}

/** Parse a ';'-separated numeric series, dropping anything unreadable. */
export function parseSeries(raw: unknown): number[] {
  if (raw === null || raw === undefined) return [];
  return String(raw)
    .split(';')
    .map((part) => Number(part))
    .filter((n) => Number.isFinite(n));
}

/** Parse the ';'-separated list of `start,end` pairs describing drawn pieces. */
export function parseSpans(raw: unknown): Array<[number, number]> {
  if (raw === null || raw === undefined) return [];
  const out: Array<[number, number]> = [];
  for (const part of String(raw).split(';')) {
    const [lo, hi] = part.split(',').map(Number);
    if (Number.isFinite(lo) && Number.isFinite(hi)) out.push([lo, hi]);
  }
  return out;
}

/**
 * Cut one road stretch into the runs that survive a given linking radius.
 *
 * Two reader locations belong to the same run when the gap between them is no
 * wider than the radius. Lowering the radius therefore breaks a long sparse
 * corridor into fragments and then removes them as they fall under the site and
 * span floors — which is the honest behaviour: at a quarter-mile radius, an
 * eleven-mile road with a reader every mile and a half is genuinely not a
 * continuous run of anything.
 */
export function runsFor(
  properties: FeatureProperties,
  config: LinkRadiusConfig,
  radiusMiles: number,
  sourceIndex: number,
): Run[] {
  const attrs = properties.attributes as Record<string, unknown>;
  const offsets = parseSeries(attrs[config.offsetsKey]);
  const counts = parseSeries(attrs[config.countsKey]);
  const lngs = parseSeries(attrs[config.lngsKey]);
  const lats = parseSeries(attrs[config.latsKey]);
  if (offsets.length < 2 || lngs.length !== offsets.length || lats.length !== offsets.length) {
    return [];
  }

  const runs: Run[] = [];
  let start = 0;
  for (let i = 1; i <= offsets.length; i++) {
    const broken = i === offsets.length || offsets[i] - offsets[i - 1] > radiusMiles;
    if (!broken) continue;
    const from = start;
    const to = i - 1;
    start = i;

    const sites = to - from + 1;
    const span = offsets[to] - offsets[from];
    if (sites < config.minSites || span < config.minSpanMiles) continue;

    runs.push({
      source: sourceIndex,
      from,
      to,
      startMiles: offsets[from],
      endMiles: offsets[to],
      sites,
      readers: counts.slice(from, to + 1).reduce((a, b) => a + (b || 0), 0),
      points: offsets.slice(from, to + 1).map((_, k) => [lngs[from + k], lats[from + k]]),
      // Re-based so the spacing diagram starts at zero for the run actually shown.
      offsets: offsets.slice(from, to + 1).map((o) => Number((o - offsets[from]).toFixed(2))),
      counts: counts.slice(from, to + 1),
      colony: -1,
      colonySites: 0,
    });
  }
  return runs;
}

/**
 * Group runs into colonies: sets of runs linked by readers within the radius.
 *
 * This is what the slider is really showing. Two streets are in one colony when
 * some reader on one stands within the radius of some reader on the other, so
 * raising it makes separate stretches fuse into a single connected thing — the
 * network's actual shape, rather than the shape of any one road.
 *
 * No line is drawn across the gap, because there is no road here to draw. The
 * membership is carried by colour: runs in one colony are shaded by how large
 * that colony is.
 */
export function assignColonies(runs: Run[], radiusMiles: number): void {
  const radiusM = radiusMiles * 1609.344;
  const parent = runs.map((_, i) => i);
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // Bucket every reader location so the pairwise test only looks at neighbours.
  // Without it this is 100k+ haversines on every drag of the slider.
  const cell = Math.max(radiusM, 1);
  const mPerLng = 111_320 * Math.cos((46 * Math.PI) / 180);
  const grid = new Map<string, Array<{ run: number; point: [number, number] }>>();
  runs.forEach((run, i) => {
    for (const point of run.points) {
      const gx = Math.floor((point[0] * mPerLng) / cell);
      const gy = Math.floor((point[1] * 110_574) / cell);
      const key = `${gx}|${gy}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key)!.push({ run: i, point });
    }
  });

  for (const [key, entries] of grid) {
    const [gx, gy] = key.split('|').map(Number);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of grid.get(`${gx + dx}|${gy + dy}`) ?? []) {
          for (const entry of entries) {
            if (entry.run === other.run) continue;
            if (haversineMeters(entry.point, other.point) <= radiusM) union(entry.run, other.run);
          }
        }
      }
    }
  }

  const size = new Map<number, number>();
  runs.forEach((run, i) => {
    const root = find(i);
    size.set(root, (size.get(root) ?? 0) + run.sites);
  });
  runs.forEach((run, i) => {
    run.colony = find(i);
    run.colonySites = size.get(run.colony) ?? run.sites;
  });
}

/** Straight-line miles between two points, for run statistics. */
export const milesBetween = (a: [number, number], b: [number, number]) =>
  metersToMiles(haversineMeters(a, b));
